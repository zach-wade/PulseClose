// Cross-borrower / cross-entity merge — productized version of
// scripts/cleanup-canonical-duplicates.ts. Same primitives, scoped to
// a single org, callable from the API.
//
// Each merge re-points every FK reference from `source_id` to
// `target_id`, then deletes the source row. Idempotent — running it
// twice on the same pair is a no-op the second time.

import type { SupabaseClient } from "@supabase/supabase-js";

export type MergeEntityType = "borrower" | "entity" | "lender";

interface RePointSpec {
  table: string;
  fk: string;
}

const FK_REPOINTS: Record<MergeEntityType, RePointSpec[]> = {
  borrower: [
    { table: "borrower_validations", fk: "primary_borrower_id" },
    { table: "borrower_validations", fk: "guarantor_borrower_id" },
    { table: "borrower_entities", fk: "borrower_id" },
    { table: "borrower_signals", fk: "borrower_id" },
    { table: "borrower_property_signals", fk: "borrower_id" },
    { table: "monitor_subscriptions", fk: "borrower_id" },
    { table: "deal_evaluations", fk: "borrower_id" },
  ],
  entity: [
    { table: "borrower_validations", fk: "primary_entity_id" },
    { table: "entity_checks", fk: "entity_id" },
    { table: "borrower_entities", fk: "entity_id" },
    { table: "entity_signals", fk: "entity_id" },
  ],
  lender: [
    { table: "property_ownership", fk: "lender_id" },
    { table: "track_record_entries", fk: "lender_id" },
  ],
};

const TABLE_BY_TYPE: Record<MergeEntityType, string> = {
  borrower: "borrowers",
  entity: "entities",
  lender: "lenders",
};

export interface MergeResult {
  re_pointed: Array<{ table: string; column: string; rows: number }>;
  deleted_source: boolean;
}

export async function mergeRecords(
  supabase: SupabaseClient,
  entityType: MergeEntityType,
  orgId: string,
  sourceId: string,
  targetId: string,
): Promise<MergeResult> {
  if (sourceId === targetId) {
    throw new Error("source_id and target_id must differ");
  }

  // Both rows must exist + belong to caller's org. Without this check a
  // misconfigured admin client could re-point cross-org rows.
  const table = TABLE_BY_TYPE[entityType];
  const { data: rows } = await supabase
    .from(table)
    .select("id, org_id")
    .in("id", [sourceId, targetId]);
  const found = new Map((rows ?? []).map((r) => [r.id, r.org_id]));
  if (found.size !== 2 || found.get(sourceId) !== orgId || found.get(targetId) !== orgId) {
    throw new Error("Both records must exist and belong to your org");
  }

  const re_pointed: MergeResult["re_pointed"] = [];
  for (const spec of FK_REPOINTS[entityType]) {
    // Count first (so we can report rows-touched), then update.
    const { count } = await supabase
      .from(spec.table)
      .select("*", { count: "exact", head: true })
      .eq(spec.fk, sourceId);
    if ((count ?? 0) === 0) continue;
    const { error } = await supabase
      .from(spec.table)
      .update({ [spec.fk]: targetId })
      .eq(spec.fk, sourceId);
    if (error) {
      throw new Error(`re-point ${spec.table}.${spec.fk}: ${error.message}`);
    }
    re_pointed.push({ table: spec.table, column: spec.fk, rows: count ?? 0 });
  }

  // Delete the source row last so a mid-merge failure leaves the source
  // intact + retryable.
  const { error: delError } = await supabase
    .from(table)
    .delete()
    .eq("id", sourceId)
    .eq("org_id", orgId);
  if (delError) {
    throw new Error(`delete ${table}: ${delError.message}`);
  }

  return { re_pointed, deleted_source: true };
}

export interface DuplicateGroup {
  entity_type: MergeEntityType;
  canonical_key: string;
  rows: Array<{
    id: string;
    display_name: string;
    state: string | null;
    created_at: string;
  }>;
}

export async function findDuplicates(
  supabase: SupabaseClient,
  orgId: string,
): Promise<DuplicateGroup[]> {
  const out: DuplicateGroup[] = [];
  type Row = {
    id: string;
    display_name: string;
    normalized_canonical: string | null;
    state?: string | null;
    created_at: string;
  };
  for (const entityType of ["borrower", "entity", "lender"] as const) {
    const table = TABLE_BY_TYPE[entityType];
    const { data } =
      entityType === "entity"
        ? await supabase
            .from(table)
            .select("id, display_name, normalized_canonical, state, created_at")
            .eq("org_id", orgId)
            .order("created_at", { ascending: true })
        : await supabase
            .from(table)
            .select("id, display_name, normalized_canonical, created_at")
            .eq("org_id", orgId)
            .order("created_at", { ascending: true });

    const groups = new Map<string, Row[]>();
    for (const r of (data ?? []) as unknown as Row[]) {
      if (!r.normalized_canonical) continue;
      // Entities canonicalize within state; borrowers + lenders within org.
      const key = entityType === "entity"
        ? `${r.normalized_canonical}|${r.state ?? ""}`
        : r.normalized_canonical;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    for (const [key, rows] of groups.entries()) {
      if (rows.length < 2) continue;
      out.push({
        entity_type: entityType,
        canonical_key: key,
        rows: rows.map((r) => ({
          id: r.id,
          display_name: r.display_name,
          state: (r as Row).state ?? null,
          created_at: r.created_at,
        })),
      });
    }
  }
  return out;
}
