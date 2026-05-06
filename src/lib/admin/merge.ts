// Cross-borrower / cross-entity merge — productized version of
// scripts/cleanup-canonical-duplicates.ts. Same primitives, scoped to
// a single org, callable from the API.
//
// All work happens inside the merge_records_atomic RPC (00035) so two
// admins clicking "Keep this" on the same dupe pair simultaneously
// can't leave the data in a half-merged state. The FK list lives in
// the SQL function — keep it in sync there if a new FK is added.

import type { SupabaseClient } from "@supabase/supabase-js";

export type MergeEntityType = "borrower" | "entity" | "lender";

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

  const { data, error } = await supabase.rpc("merge_records_atomic", {
    p_entity_type: entityType,
    p_org_id: orgId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  if (error) {
    throw new Error(`merge ${entityType}: ${error.message}`);
  }
  return data as MergeResult;
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
