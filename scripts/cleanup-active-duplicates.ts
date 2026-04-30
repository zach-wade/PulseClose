// Pre-flight for migration 00016_p0_corrections.sql.
//
// 00010 created plain partial indexes (WHERE superseded_at IS NULL) on the
// signal/link tables. The migration in 00016 converts those to UNIQUE
// partial indexes — which will fail if any duplicate active rows exist.
//
// This script finds groups where multiple rows share the same logical key
// AND have superseded_at IS NULL, keeps the most recently-created one, and
// supersedes the rest. Idempotent.
//
// Usage:
//   npx tsx scripts/cleanup-active-duplicates.ts --dry-run     # report only
//   npx tsx scripts/cleanup-active-duplicates.ts               # mutate
//
// Tables and their would-be-unique keys (matches migration 00016 §4):
//   borrower_signals          → (borrower_id, signal_key)
//   property_signals          → (property_id, signal_key)
//   borrower_property_signals → (borrower_id, property_id, signal_key)
//   entity_signals            → (entity_id, signal_key)
//   borrower_entities         → (borrower_id, entity_id)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const DRY_RUN = process.argv.includes("--dry-run");

interface TableSpec {
  table: string;
  keyColumns: string[];      // logical-unique columns
  selectColumns: string;     // SELECT list (must include id, created_at, key cols)
}

const TABLES: TableSpec[] = [
  {
    table: "borrower_signals",
    keyColumns: ["borrower_id", "signal_key"],
    selectColumns: "id, borrower_id, signal_key, created_at",
  },
  {
    table: "property_signals",
    keyColumns: ["property_id", "signal_key"],
    selectColumns: "id, property_id, signal_key, created_at",
  },
  {
    table: "borrower_property_signals",
    keyColumns: ["borrower_id", "property_id", "signal_key"],
    selectColumns: "id, borrower_id, property_id, signal_key, created_at",
  },
  {
    table: "entity_signals",
    keyColumns: ["entity_id", "signal_key"],
    selectColumns: "id, entity_id, signal_key, created_at",
  },
  {
    table: "borrower_entities",
    keyColumns: ["borrower_id", "entity_id"],
    selectColumns: "id, borrower_id, entity_id, created_at",
  },
];

interface Report {
  table: string;
  active_rows_total: number;
  duplicate_groups: number;
  rows_to_supersede: number;
  rows_superseded: number;
  examples: Array<{ key: Record<string, unknown>; count: number }>;
}

async function processTable(spec: TableSpec): Promise<Report> {
  const report: Report = {
    table: spec.table,
    active_rows_total: 0,
    duplicate_groups: 0,
    rows_to_supersede: 0,
    rows_superseded: 0,
    examples: [],
  };

  // Page through active rows. Supabase caps each query — for 5 small tables
  // this is fine in one shot, but loop defensively.
  const PAGE = 1000;
  const allRows: Array<Record<string, unknown>> = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(spec.table)
      .select(spec.selectColumns)
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`${spec.table} read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...(data as unknown as Array<Record<string, unknown>>));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  report.active_rows_total = allRows.length;

  // Group by composite key. Iteration order is descending created_at, so the
  // FIRST occurrence per key is the one we keep.
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of allRows) {
    const key = spec.keyColumns.map((c) => String(row[c] ?? "<null>")).join("::");
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const dupGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  report.duplicate_groups = dupGroups.length;

  for (const [key, rows] of dupGroups.slice(0, 5)) {
    const keyObj: Record<string, unknown> = {};
    spec.keyColumns.forEach((c, i) => {
      keyObj[c] = key.split("::")[i];
    });
    report.examples.push({ key: keyObj, count: rows.length });
  }

  const idsToSupersede = dupGroups.flatMap(([, rows]) => rows.slice(1).map((r) => r.id as string));
  report.rows_to_supersede = idsToSupersede.length;

  if (idsToSupersede.length === 0) return report;

  if (DRY_RUN) {
    console.error(`[${spec.table}] would supersede ${idsToSupersede.length} rows (dry-run)`);
    return report;
  }

  const { error: updateError } = await supabase
    .from(spec.table)
    .update({ superseded_at: new Date().toISOString() })
    .in("id", idsToSupersede);
  if (updateError) throw new Error(`${spec.table} update failed: ${updateError.message}`);

  report.rows_superseded = idsToSupersede.length;
  return report;
}

async function main() {
  const reports: Report[] = [];
  for (const spec of TABLES) {
    const report = await processTable(spec);
    reports.push(report);
    console.error(
      `[${spec.table}] active=${report.active_rows_total} ` +
        `dup_groups=${report.duplicate_groups} ` +
        `to_supersede=${report.rows_to_supersede} ` +
        `superseded=${report.rows_superseded}`,
    );
  }

  const summary = {
    dry_run: DRY_RUN,
    timestamp: new Date().toISOString(),
    reports,
    total_rows_to_supersede: reports.reduce((sum, r) => sum + r.rows_to_supersede, 0),
    total_rows_superseded: reports.reduce((sum, r) => sum + r.rows_superseded, 0),
  };
  console.log(JSON.stringify(summary, null, 2));

  const remaining = reports.reduce((sum, r) => sum + r.rows_to_supersede, 0);
  if (DRY_RUN && remaining > 0) {
    console.error(`\nDry run found ${remaining} duplicate rows. Re-run without --dry-run to clean up.`);
    process.exit(0);
  }
  if (!DRY_RUN && remaining !== summary.total_rows_superseded) {
    console.error(`\nMismatch: planned ${remaining} but superseded ${summary.total_rows_superseded}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
