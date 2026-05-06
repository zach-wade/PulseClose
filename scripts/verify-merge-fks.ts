// Verify merge_records_atomic FK list completeness.
//
// C1 follow-up — the audit found that 00035 inherited an incomplete FK
// list from the JS-side merge. 00036 added the missing rows but the
// list is still hard-coded in the SQL function; future schema additions
// (a new on-delete-set-null FK to borrowers/entities/lenders) won't
// auto-update the function and would silently destroy data on merge.
//
// This script queries information_schema.referential_constraints for
// every FK that points at borrowers / entities / lenders and prints
// any that are NOT in the function's hard-coded list. Run it manually
// after schema changes; consider wiring into CI later.
//
// Usage: npx tsx scripts/verify-merge-fks.ts

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// Mirror of the FK list inside merge_records_atomic (00036). Keep in
// sync with supabase/migrations/00036_merge_atomic_complete_fks.sql.
const HARD_CODED_FKS: Record<"borrower" | "entity" | "lender", Array<[string, string]>> = {
  borrower: [
    ["borrower_validations", "primary_borrower_id"],
    ["borrower_validations", "guarantor_borrower_id"],
    ["borrower_entities", "borrower_id"],
    ["borrower_signals", "borrower_id"],
    ["borrower_property_signals", "borrower_id"],
    ["monitor_subscriptions", "borrower_id"],
    ["deal_evaluations", "borrower_id"],
    ["property_ownership", "owning_borrower_id"],
    ["track_record_entries", "owning_borrower_id"],
    ["verified_flips", "owning_borrower_id"],
    ["litigation_checks", "target_borrower_id"],
    ["sanctions_checks", "primary_borrower_id"],
    // borrower_public_profiles is special-cased in the function
    ["borrower_public_profiles", "borrower_id"],
  ],
  entity: [
    ["borrower_validations", "primary_entity_id"],
    ["entity_checks", "entity_id"],
    ["borrower_entities", "entity_id"],
    ["entity_signals", "entity_id"],
    ["property_ownership", "owning_entity_id"],
    ["track_record_entries", "owning_entity_id"],
    ["verified_flips", "owning_entity_id"],
    ["litigation_checks", "target_entity_id"],
    ["sanctions_checks", "primary_entity_id"],
  ],
  lender: [
    ["property_ownership", "lender_id"],
    ["track_record_entries", "lender_id"],
  ],
};

interface FkRow {
  source_table: string;
  source_column: string;
  target_table: string;
}

async function fetchActualFks(): Promise<FkRow[]> {
  // Query via the supabase rpc shim: there's no built-in
  // information_schema accessor in supabase-js, so we use a one-off
  // SECURITY DEFINER function. To avoid creating one, run the query
  // through pg directly. Easiest path: a single-use Postgres function
  // call via supabase.rpc. Since we don't have one, fall back to a raw
  // SQL via the supabase REST `rpc` or simulate it via a quick
  // explanation: query each `target_table` separately.
  //
  // Pragmatic shortcut — this script needs SUPABASE_SERVICE_ROLE_KEY
  // which has direct DB access, so we dispatch through an RPC named
  // `_introspect_merge_target_fks` if it exists, otherwise we surface
  // a clear error telling the user to add it (a tiny one-time
  // migration). Cleanest setup: see the inline SQL at the bottom of
  // this file for what to add.
  const { data, error } = await supabase.rpc("_introspect_merge_target_fks");
  if (error) {
    throw new Error(
      `_introspect_merge_target_fks RPC not available — see SQL block at the bottom of this file. (${error.message})`,
    );
  }
  return (data ?? []) as FkRow[];
}

function keyOf(table: string, column: string): string {
  return `${table}.${column}`;
}

async function main() {
  console.log("Verifying merge_records_atomic FK completeness…\n");

  const actual = await fetchActualFks();

  for (const target of ["borrowers", "entities", "lenders"] as const) {
    const targetType =
      target === "borrowers" ? "borrower" : target === "entities" ? "entity" : "lender";
    const expected = new Set(
      HARD_CODED_FKS[targetType].map(([t, c]) => keyOf(t, c)),
    );
    const observed = actual
      .filter((r) => r.target_table === target)
      .map((r) => keyOf(r.source_table, r.source_column));
    const observedSet = new Set(observed);

    const missing = [...observedSet].filter((k) => !expected.has(k));
    const stale = [...expected].filter((k) => !observedSet.has(k));

    console.log(`── ${target} (${observed.length} FKs in schema)`);
    if (missing.length === 0 && stale.length === 0) {
      console.log("   ✓ FK list matches schema");
    }
    for (const k of missing) {
      console.log(`   ✗ MISSING from merge function: ${k}`);
    }
    for (const k of stale) {
      console.log(`   ! STALE in merge function (no longer in schema): ${k}`);
    }
    console.log();
  }

  console.log("Done.\n");
}

main().catch((err) => {
  console.error(err);
  console.error("\nIf the RPC is missing, run this SQL once:\n");
  console.error(`
create or replace function public._introspect_merge_target_fks()
returns table (source_table text, source_column text, target_table text)
language sql
security definer
as $$
  select
    tc.table_name::text as source_table,
    kcu.column_name::text as source_column,
    ccu.table_name::text as target_table
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name
    and tc.table_schema = ccu.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and ccu.table_name in ('borrowers', 'entities', 'lenders')
$$;
`);
  process.exit(1);
});
