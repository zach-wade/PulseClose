// End-to-end coverage proof: run the REAL validation pipeline for a Florida
// loan, where the entity resolves from the free FL Sunbiz cache (not Cobalt
// 429) and the GC resolves from the FL DBPR bulk. Confirms full FL coverage +
// the verdict-first verdict on genuinely-pulled data.
//
// Run: set -a; source .env.local; set +a; npx tsx scripts/e2e-fl-loan.ts
import { createClient } from "@supabase/supabase-js";
import { runValidationPipeline } from "../src/lib/validations/pipeline";
import { computeVerdictsForValidations } from "../src/lib/validation/verdict-batch";

const UW_ORG = "27296b6b-87f2-4b71-9e84-2c71f652449c"; // uw@test.pulseclose.com

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Pick a real, active FL entity that's actually in the Sunbiz cache, with a
  // borrower-plausible name (capital / holdings / properties / construction).
  const { data: ents } = await supabase
    .from("sos_entities")
    .select("entity_name")
    .eq("state", "FL")
    .eq("source", "fl_sunbiz")
    .eq("status", "active")
    .or("entity_name.ilike.%PROPERT%,entity_name.ilike.%CAPITAL%,entity_name.ilike.%HOLDING%,entity_name.ilike.%HOMES%,entity_name.ilike.%CONSTRUCT%,entity_name.ilike.%BUILD%,entity_name.ilike.%GROUP%")
    .limit(1);
  const entityName = ents?.[0]?.entity_name ?? "KEYS EMERGENCY GROUP, LLC";

  // Pick a real, active FL GC license from the DBPR bulk.
  const { data: gcs, error: gcErr } = await supabase
    .from("contractor_licenses")
    .select("business_name, license_number")
    .eq("state", "FL")
    .eq("status", "active")
    .ilike("license_number", "CGC%")
    .order("license_number", { ascending: true })
    .limit(1);
  if (gcErr) console.log("GC query error:", gcErr.message);
  const gc = gcs?.[0];

  console.log(`Entity (SOS, FL Sunbiz cache): ${entityName}`);
  console.log(`GC (FL DBPR bulk): ${gc?.business_name} #${gc?.license_number}\n`);

  const result = await runValidationPipeline({
    supabase,
    orgId: UW_ORG,
    actorUserId: null,
    checksUsed: 0,
    background: true, // await enrichment (memo) inline
    input: {
      borrower_name: "Marcus Delgado", // guarantor/principal (individual)
      borrower_entity_name: entityName,
      entity_state: "FL",
      guarantor_name: "Marcus Delgado",
      gc_name: gc?.business_name ?? null,
      gc_license_number: gc?.license_number ?? null,
      gc_state: "FL",
    },
  });

  console.log("Pipeline result:");
  console.log(`  validation_id : ${result.validation_id}`);
  console.log(`  overall_status: ${result.overall_status}`);
  console.log(`  tier          : ${result.tier}`);
  console.log(`  confidence    : ${result.confidence_score}%`);

  // Verdict via the SAME computeVerdict() the UI uses.
  const vmap = await computeVerdictsForValidations(supabase, [
    { id: result.validation_id, primary_borrower_id: null, created_at: new Date().toISOString() },
  ]);
  const v = vmap.get(result.validation_id);
  console.log(`\nVerdict (computeVerdict): ${v?.state}  "${v?.headline}"`);

  // Inspect the entity check — did it resolve from the cache (not a 429)?
  const { data: ec } = await supabase
    .from("entity_checks")
    .select("sos_status, source_url, raw_response")
    .eq("validation_id", result.validation_id)
    .maybeSingle();
  const err = (ec?.raw_response as { _error?: boolean } | null)?._error;
  const src = (ec?.raw_response as { _source?: string; source?: string } | null);
  console.log(`Entity check: sos_status=${ec?.sos_status} _error=${err ?? false} source=${src?._source ?? src?.source ?? "?"}`);

  // GC check
  const { data: gcv } = await supabase
    .from("gc_validations")
    .select("gc_name, license_status, license_number")
    .eq("validation_id", result.validation_id)
    .maybeSingle();
  console.log(`GC check: ${gcv?.gc_name} #${gcv?.license_number} status=${gcv?.license_status}`);

  console.log(`\nDetail: https://app.pulseclose.com/dashboard/validations/${result.validation_id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
