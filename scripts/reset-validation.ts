// Hard-reset a single validation: deletes the borrower_validations row
// so all dependent snapshot tables cascade away (entity_checks,
// track_record_entries, litigation_checks, litigation_cases, gc_validations,
// sanctions_checks, verified_flips, risk_factors, data_edits,
// factor_overrides, monitor_subscriptions, monitor_runs, deal_evaluations).
//
// Persistent domain rows (borrowers / entities / properties / lenders /
// borrower_signals / property_signals) are NOT deleted by default — they
// are keyed by org_id and survive validation re-runs. Re-running on the
// same borrower will reuse them via dedup. Pass --hard to also delete the
// borrower record (cascades signals + entity links).
//
// Usage:
//   set -a; source .env.local; set +a
//   npx tsx scripts/reset-validation.ts <validation_id>           # dry-run
//   npx tsx scripts/reset-validation.ts <validation_id> --delete  # mutate
//   npx tsx scripts/reset-validation.ts <validation_id> --delete --hard
//     # also delete the borrower (wipes signals + cross-validation history)
//
// Prints a row-count summary before and after so you see what got wiped.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const validationId = process.argv[2];
const DELETE = process.argv.includes("--delete");
const HARD = process.argv.includes("--hard");

if (!validationId || validationId.startsWith("--")) {
  console.error("Usage: npx tsx scripts/reset-validation.ts <validation_id> [--delete] [--hard]");
  process.exit(1);
}

async function countRows(table: string, validationId: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("validation_id", validationId);
  return count ?? 0;
}

const TABLES = [
  "entity_checks",
  "track_record_entries",
  "verified_flips",
  "litigation_checks",
  "litigation_cases",
  "gc_validations",
  "sanctions_checks",
  "risk_factors",
  "data_edits",
  "factor_overrides",
  "monitor_subscriptions",
  "monitor_runs",
  "deal_evaluations",
] as const;

async function main() {
  const { data: v, error: vErr } = await supabase
    .from("borrower_validations")
    .select("id, org_id, borrower_name, borrower_entity_name, primary_borrower_id, created_at")
    .eq("id", validationId)
    .maybeSingle();

  if (vErr || !v) {
    console.error(`Validation ${validationId} not found.`);
    if (vErr) console.error(vErr.message);
    process.exit(1);
  }

  console.log(
    `Validation: ${v.id}\n` +
      `  borrower:        ${v.borrower_name}\n` +
      `  entity:          ${v.borrower_entity_name ?? "—"}\n` +
      `  borrower_id:     ${v.primary_borrower_id ?? "—"}\n` +
      `  created:         ${v.created_at}\n` +
      `  org_id:          ${v.org_id}\n`,
  );

  console.log("Dependent row counts (cascade on validation delete):");
  for (const t of TABLES) {
    const n = await countRows(t, validationId);
    console.log(`  ${t.padEnd(28)} ${n}`);
  }

  if (HARD && v.primary_borrower_id) {
    const { count: sigCount } = await supabase
      .from("borrower_signals")
      .select("id", { count: "exact", head: true })
      .eq("borrower_id", v.primary_borrower_id);
    const { count: bpsCount } = await supabase
      .from("borrower_property_signals")
      .select("id", { count: "exact", head: true })
      .eq("borrower_id", v.primary_borrower_id);
    const { count: otherValidations } = await supabase
      .from("borrower_validations")
      .select("id", { count: "exact", head: true })
      .eq("primary_borrower_id", v.primary_borrower_id)
      .neq("id", validationId);
    console.log("\n--hard: also delete borrower (cascades signals):");
    console.log(`  borrower_signals             ${sigCount ?? 0}`);
    console.log(`  borrower_property_signals    ${bpsCount ?? 0}`);
    console.log(`  other validations on borrower ${otherValidations ?? 0} (will be orphaned by FK; refusing if > 0)`);
    if ((otherValidations ?? 0) > 0) {
      console.error("\nABORT: borrower has other validations. Pass them through reset first or drop --hard.");
      process.exit(1);
    }
  }

  if (!DELETE) {
    console.log(`\nDry-run only. Pass --delete to actually wipe.${HARD ? " --hard set: borrower will also be deleted." : ""}`);
    return;
  }

  // 1. Delete validation. Cascades handle the dependent rows.
  console.log("\nDeleting validation row …");
  const { error: delErr } = await supabase
    .from("borrower_validations")
    .delete()
    .eq("id", validationId);
  if (delErr) {
    console.error(`Delete failed: ${delErr.message}`);
    process.exit(1);
  }
  console.log("  ok — cascades fired");

  // 2. If --hard, also delete the borrower (wipes signals + entity links).
  if (HARD && v.primary_borrower_id) {
    console.log("Deleting borrower …");
    const { error: bErr } = await supabase
      .from("borrowers")
      .delete()
      .eq("id", v.primary_borrower_id);
    if (bErr) {
      console.error(`Borrower delete failed: ${bErr.message}`);
      console.error("  (validation already gone; borrower row + signals remain)");
      process.exit(1);
    }
    console.log("  ok");
  }

  console.log("\nDone. Re-create from /dashboard/new to start fresh.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
