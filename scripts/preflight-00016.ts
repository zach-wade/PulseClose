// Read-only pre-flight for migration 00016_p0_corrections.sql.
// Run before applying the migration so we know whether the cleanup script
// is needed and whether snapshot orphans require manual attribution.
//
// Usage:
//   set -a; source .env.local; set +a; npx tsx scripts/preflight-00016.ts

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const SNAPSHOT_TABLES = [
  "entity_checks",
  "track_record_entries",
  "gc_validations",
  "litigation_checks",
];

const SIGNAL_TABLES: Array<{ table: string; key: string[] }> = [
  { table: "borrower_signals", key: ["borrower_id", "signal_key"] },
  { table: "property_signals", key: ["property_id", "signal_key"] },
  { table: "borrower_property_signals", key: ["borrower_id", "property_id", "signal_key"] },
  { table: "entity_signals", key: ["entity_id", "signal_key"] },
  { table: "borrower_entities", key: ["borrower_id", "entity_id"] },
];

async function countTotal(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function countOrphans(table: string): Promise<number> {
  // Approach: pull all distinct validation_ids from the snapshot, pull all
  // borrower_validations.id, set-diff. Faster than a NOT IN subquery for
  // small tables and avoids RLS surprises.
  const { data: snapshotRows, error: sErr } = await supabase
    .from(table)
    .select("validation_id")
    .limit(50000);
  if (sErr) throw new Error(`${table} read failed: ${sErr.message}`);
  const snapshotIds = new Set(
    (snapshotRows ?? []).map((r) => (r as { validation_id: string }).validation_id),
  );
  if (snapshotIds.size === 0) return 0;

  const { data: validRows, error: vErr } = await supabase
    .from("borrower_validations")
    .select("id")
    .limit(50000);
  if (vErr) throw new Error(`borrower_validations read failed: ${vErr.message}`);
  const validIds = new Set((validRows ?? []).map((r) => (r as { id: string }).id));

  let orphans = 0;
  for (const id of snapshotIds) {
    if (!validIds.has(id)) orphans++;
  }
  return orphans;
}

async function countSignalDups(table: string, key: string[]): Promise<number> {
  const cols = ["id", "created_at", ...key].join(", ");
  const { data, error } = await supabase
    .from(table)
    .select(cols)
    .is("superseded_at", null)
    .limit(50000);
  if (error) throw new Error(`${table} read failed: ${error.message}`);

  const groups = new Map<string, number>();
  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const k = key.map((c) => String(row[c] ?? "<null>")).join("::");
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  let dupRows = 0;
  for (const count of groups.values()) {
    if (count > 1) dupRows += count - 1;
  }
  return dupRows;
}

async function main() {
  console.log("=== Snapshot orphans (rows whose validation_id is not in borrower_validations) ===");
  for (const table of SNAPSHOT_TABLES) {
    const total = await countTotal(table);
    const orphans = await countOrphans(table);
    console.log(`  ${table}: total=${total} orphans=${orphans}`);
  }

  console.log("\n=== Signal duplicates (rows that violate the planned UNIQUE partial index) ===");
  for (const { table, key } of SIGNAL_TABLES) {
    const total = await countTotal(table);
    const dups = await countSignalDups(table, key);
    console.log(`  ${table}: total=${total} duplicate_rows_to_supersede=${dups} key=(${key.join(", ")})`);
  }

  console.log("\nIf orphans < 50 per table: attribute to dev org in migration §1.");
  console.log("If duplicates > 0: run scripts/cleanup-active-duplicates.ts before applying migration.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
