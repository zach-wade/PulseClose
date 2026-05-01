// Find + optionally delete validations whose snapshot tables are empty
// because of the 00016 silent-insert bug (fixed in PR 13). A validation
// is flagged as "broken" if any pillar that *should* have run produced
// zero rows. Cascading FKs handle the cleanup — borrower_validations.id
// cascades to entity_checks / track_record_entries / litigation_checks /
// gc_validations / sanctions_checks / verified_flips / risk_factors /
// litigation_cases / monitor_subscriptions / monitor_runs / deal_evaluations
// that reference it.
//
// Persistent domain rows (borrowers / entities / properties / lenders /
// signals) are intentionally NOT deleted — they're keyed by org_id and
// survive validation re-runs. Re-running on the same borrower will reuse
// the existing domain rows via upsert.
//
// Usage:
//   set -a; source .env.local; set +a;
//   npx tsx scripts/cleanup-broken-validations.ts                # dry-run
//   ORG_ID=<uuid> npx tsx scripts/cleanup-broken-validations.ts  # different org
//   npx tsx scripts/cleanup-broken-validations.ts --delete       # actually delete

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const TEST_CO_ORG_ID = "9e580f59-b01d-4cbd-a950-76dd4f32ee6c";
const orgId = process.env.ORG_ID ?? TEST_CO_ORG_ID;
const DELETE = process.argv.includes("--delete");

interface ValidationRow {
  id: string;
  borrower_name: string;
  borrower_entity_name: string | null;
  overall_status: string;
  property_count: number | null;
  flag_count: number | null;
  ai_analysis: unknown;
  created_at: string;
}

interface PillarCounts {
  entity_checks: number;
  track_record_entries: number;
  litigation_checks: number;
  gc_validations: number;
  sanctions_checks: number;
}

interface Diagnosis {
  validation: ValidationRow;
  counts: PillarCounts;
  reasons: string[];
  broken: boolean;
}

async function countRows(table: string, validationId: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("validation_id", validationId);
  return count ?? 0;
}

async function diagnose(v: ValidationRow): Promise<Diagnosis> {
  const [ec, tre, lc, gc, sn] = await Promise.all([
    countRows("entity_checks", v.id),
    countRows("track_record_entries", v.id),
    countRows("litigation_checks", v.id),
    countRows("gc_validations", v.id),
    countRows("sanctions_checks", v.id),
  ]);
  const counts: PillarCounts = {
    entity_checks: ec,
    track_record_entries: tre,
    litigation_checks: lc,
    gc_validations: gc,
    sanctions_checks: sn,
  };

  const reasons: string[] = [];

  // Entity check should run for every validation that has an entity name.
  if (v.borrower_entity_name && ec === 0) {
    reasons.push("entity_checks empty despite borrower_entity_name set");
  }

  // Track-record runs whenever property_count > 0 or status indicates
  // pillar finished. property_count is cached; if > 0 then the pipeline
  // did find properties but the snapshot rows are missing.
  if ((v.property_count ?? 0) > 0 && tre === 0) {
    reasons.push(
      `track_record_entries empty despite property_count=${v.property_count}`,
    );
  }

  // Litigation runs on every validation. Always expect at least one row
  // (even "clear" results write a row per search_type).
  if (lc === 0) {
    reasons.push("litigation_checks empty (always expected ≥1 row)");
  }

  // AI memo claims findings but pillar tables are empty — strongest signal
  // that the silent-insert bug bit this row.
  const memo = v.ai_analysis as
    | {
        flags?: string[];
        risks?: { factor_key: string }[];
        pillar_assessments?: {
          entity?: string;
          track_record?: string;
          litigation?: string;
        };
      }
    | null;
  if (memo) {
    const flagCount = memo.flags?.length ?? memo.risks?.length ?? 0;
    if (flagCount > 0 && tre + lc + ec === 0) {
      reasons.push(
        `ai_analysis cites ${flagCount} flags but all 3 main pillar tables are empty`,
      );
    }
  }

  return { validation: v, counts, reasons, broken: reasons.length > 0 };
}

function fmtCounts(c: PillarCounts): string {
  return `entity=${c.entity_checks} track=${c.track_record_entries} lit=${c.litigation_checks} gc=${c.gc_validations} sanc=${c.sanctions_checks}`;
}

async function main() {
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single();
  if (!orgRow) {
    console.error(`Org ${orgId} not found.`);
    process.exit(1);
  }

  const { data: validations, error } = await supabase
    .from("borrower_validations")
    .select(
      "id, borrower_name, borrower_entity_name, overall_status, property_count, flag_count, ai_analysis, created_at",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = (validations ?? []) as ValidationRow[];
  if (rows.length === 0) {
    console.log(`Org ${orgRow.name} (${orgId}) has 0 validations. Nothing to do.`);
    return;
  }

  console.log(
    `Org ${orgRow.name} (${orgId}): ${rows.length} validations\n` +
      `Mode: ${DELETE ? "DELETE" : "dry-run (pass --delete to mutate)"}\n`,
  );

  const diagnoses = await Promise.all(rows.map(diagnose));
  const broken = diagnoses.filter((d) => d.broken);
  const healthy = diagnoses.filter((d) => !d.broken);

  console.log(`Healthy: ${healthy.length}`);
  for (const d of healthy.slice(0, 10)) {
    console.log(
      `  ✓ ${d.validation.id} ${d.validation.borrower_name}  [${fmtCounts(d.counts)}]`,
    );
  }
  if (healthy.length > 10) console.log(`  … +${healthy.length - 10} more`);

  console.log(`\nBroken: ${broken.length}`);
  for (const d of broken) {
    console.log(
      `  ✗ ${d.validation.id} ${d.validation.borrower_name} (${d.validation.created_at.slice(0, 10)})`,
    );
    console.log(`      counts: ${fmtCounts(d.counts)}`);
    for (const r of d.reasons) console.log(`      reason: ${r}`);
  }

  if (broken.length === 0) {
    console.log("\nNothing to clean up.");
    return;
  }

  if (!DELETE) {
    console.log(
      `\nDry-run only. Re-run with --delete to remove ${broken.length} broken validation${broken.length === 1 ? "" : "s"}.`,
    );
    console.log(
      "Domain rows (borrowers / entities / properties / lenders / signals) " +
        "will be preserved; only the validation snapshots are deleted.",
    );
    return;
  }

  // Cascading delete via FK on borrower_validations.id. Wrapped per-row so
  // a single hung row doesn't block the rest.
  let deleted = 0;
  let failed = 0;
  for (const d of broken) {
    const { error: delErr } = await supabase
      .from("borrower_validations")
      .delete()
      .eq("id", d.validation.id);
    if (delErr) {
      console.error(`  failed: ${d.validation.id} — ${delErr.message}`);
      failed++;
    } else {
      console.log(`  deleted: ${d.validation.id}`);
      deleted++;
    }
  }

  console.log(`\nDone. deleted=${deleted} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
