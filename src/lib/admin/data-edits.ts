// Data-edit audit log helpers.
//
// Every lender edit to vendor-returned data goes through logEdit() so
// the receiving investor can see exactly what was changed and why.
// Append-only — nothing here gets mutated, only inserted.
//
// Loading helpers fetch the trail per-validation for the handoff
// renderer + the methodology PDF.

import type { SupabaseClient } from "@supabase/supabase-js";

export type EditableTable =
  | "track_record_entries"
  | "litigation_cases"
  | "entity_checks"
  | "sanctions_checks"
  | "gc_validations";

export type EditKind = "update" | "add" | "delete";

export interface LogEditInput {
  orgId: string;
  validationId: string;
  tableName: EditableTable;
  rowId: string;
  fieldName: string;
  valueBefore: unknown;
  valueAfter: unknown;
  editKind?: EditKind;
  reason?: string | null;
  editedByUserId: string;
}

export async function logEdit(
  supabase: SupabaseClient,
  input: LogEditInput,
): Promise<void> {
  const { error } = await supabase.from("data_edits").insert({
    org_id: input.orgId,
    validation_id: input.validationId,
    table_name: input.tableName,
    row_id: input.rowId,
    field_name: input.fieldName,
    value_before: input.valueBefore ?? null,
    value_after: input.valueAfter ?? null,
    edit_kind: input.editKind ?? "update",
    reason: input.reason ?? null,
    edited_by_user_id: input.editedByUserId,
  });
  if (error) {
    // The handoff renders aggregated counts from data_edits — silent loss
    // means the receiving investor sees under-reported edits. Throw so the
    // route returns 500 and Sentry captures via @sentry/nextjs auto-
    // instrumentation. Callers must `await logEdit(...)` (no `void`).
    throw new Error(`data_edits insert failed: ${error.message}`);
  }
}

export interface DataEditRow {
  id: string;
  table_name: EditableTable;
  row_id: string;
  field_name: string;
  value_before: unknown;
  value_after: unknown;
  edit_kind: EditKind;
  reason: string | null;
  edited_at: string;
  edited_by_user_id: string;
}

export async function listEditsForValidation(
  supabase: SupabaseClient,
  validationId: string,
): Promise<DataEditRow[]> {
  const { data } = await supabase
    .from("data_edits")
    .select(
      "id, table_name, row_id, field_name, value_before, value_after, edit_kind, reason, edited_at, edited_by_user_id",
    )
    .eq("validation_id", validationId)
    .order("edited_at", { ascending: false });
  return (data ?? []) as DataEditRow[];
}

// Factor overrides — manual exclusion of a derived risk factor.
// Read by the factors engine at recompute time alongside signal-driven
// exclusions.
export interface FactorOverrideRow {
  factor_key: string;
  excluded: boolean;
  exclusion_reason: string;
}

export async function loadFactorOverrides(
  supabase: SupabaseClient,
  validationId: string,
  orgId: string,
): Promise<Map<string, FactorOverrideRow>> {
  // Defense in depth: org_id filter beyond RLS so an admin client misuse
  // can't leak overrides cross-org.
  const { data } = await supabase
    .from("factor_overrides")
    .select("factor_key, excluded, exclusion_reason")
    .eq("validation_id", validationId)
    .eq("org_id", orgId);
  const out = new Map<string, FactorOverrideRow>();
  for (const r of (data ?? []) as FactorOverrideRow[]) {
    out.set(r.factor_key, r);
  }
  return out;
}

/**
 * Apply manual factor overrides on top of engine-computed factors.
 * If the engine already excluded a factor (e.g., extended_hold via
 * primary-residence signal), the manual override augments the reason
 * but doesn't un-exclude. If the engine left it active, the override
 * flips it to excluded with the lender's reason.
 */
export function applyFactorOverrides<F extends { factor_key: string; excluded: boolean; exclusion_reason: string | null }>(
  factors: F[],
  overrides: Map<string, FactorOverrideRow>,
): F[] {
  if (overrides.size === 0) return factors;
  return factors.map((f) => {
    const o = overrides.get(f.factor_key);
    if (!o) return f;
    if (o.excluded && !f.excluded) {
      return { ...f, excluded: true, exclusion_reason: `Lender override: ${o.exclusion_reason}` };
    }
    return f;
  });
}
