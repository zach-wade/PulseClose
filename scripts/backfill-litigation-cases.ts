// One-shot backfill of litigation_cases from existing litigation_checks
// rows. Run after migration 00018 deploys.
//
// Usage:
//   set -a; source .env.local; set +a; npx tsx scripts/backfill-litigation-cases.ts
//
// Idempotent — re-runs upsert into the same rows. Safe to run repeatedly.

import { createClient } from "@supabase/supabase-js";
import { materializeLitigationCases } from "../src/lib/litigation/materialize";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

interface ValidationRow {
  id: string;
  org_id: string;
}

async function main() {
  // Find every validation that has at least one "found" litigation_check.
  const { data: validations, error } = await supabase
    .from("borrower_validations")
    .select("id, org_id")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = (validations ?? []) as ValidationRow[];
  console.log(`Scanning ${rows.length} validations for litigation_checks…`);

  let totalCases = 0;
  let totalUpserted = 0;
  let totalErrors = 0;
  let processed = 0;

  for (const v of rows) {
    const result = await materializeLitigationCases(supabase, v.id, v.org_id);
    processed++;
    totalCases += result.cases_extracted;
    totalUpserted += result.cases_upserted;
    totalErrors += result.errors;
    if (result.cases_extracted > 0) {
      console.log(
        `  ${v.id}: extracted=${result.cases_extracted} upserted=${result.cases_upserted} errors=${result.errors}`,
      );
    }
  }

  console.log(
    `\nDone. processed=${processed} cases_extracted=${totalCases} upserted=${totalUpserted} errors=${totalErrors}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
