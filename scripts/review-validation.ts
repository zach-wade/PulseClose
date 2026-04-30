// Pull a complete validation snapshot for review.
// Usage: VALIDATION_ID=<uuid> npx tsx scripts/review-validation.ts

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const id = process.env.VALIDATION_ID!;
if (!id) { console.error("VALIDATION_ID required"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function main() {
  const [v, e, tr, lc, lcase, gc, sn, vf, rf, prop, ent, bor, bps] = await Promise.all([
    supabase.from("borrower_validations").select("*").eq("id", id).maybeSingle(),
    supabase.from("entity_checks").select("*").eq("validation_id", id),
    supabase.from("track_record_entries").select("*, lenders(display_name, classification)").eq("validation_id", id),
    supabase.from("litigation_checks").select("*").eq("validation_id", id),
    supabase.from("litigation_cases").select("*").eq("validation_id", id),
    supabase.from("gc_validations").select("*").eq("validation_id", id),
    supabase.from("sanctions_checks").select("*").eq("validation_id", id),
    supabase.from("verified_flips").select("*").eq("validation_id", id),
    supabase.from("risk_factors").select("*").eq("validation_id", id),
    supabase.from("properties").select("id, address_display, city, state, zip, latest_avm").limit(50),
    supabase.from("entities").select("id, display_name, normalized_name, state, latest_sos_status").limit(20),
    supabase.from("borrowers").select("id, display_name, normalized_name").limit(20),
    supabase.from("borrower_property_signals").select("*").is("superseded_at", null),
  ]);

  console.log("=== validation ===");
  console.log(JSON.stringify(v.data, null, 2));
  console.log("\n=== entity_checks ===");
  console.log(JSON.stringify(e.data, null, 2));
  console.log("\n=== track_record_entries ===");
  console.log(JSON.stringify(tr.data, null, 2));
  console.log("\n=== litigation_checks ===");
  console.log(JSON.stringify(lc.data, null, 2));
  console.log("\n=== litigation_cases ===");
  console.log(JSON.stringify(lcase.data, null, 2));
  console.log("\n=== gc_validations ===");
  console.log(JSON.stringify(gc.data, null, 2));
  console.log("\n=== sanctions_checks ===");
  console.log(JSON.stringify(sn.data, null, 2));
  console.log("\n=== verified_flips ===");
  console.log(JSON.stringify(vf.data, null, 2));
  console.log("\n=== risk_factors ===");
  console.log(JSON.stringify(rf.data, null, 2));
  console.log("\n=== properties (up to 50) ===");
  console.log(JSON.stringify(prop.data, null, 2));
  console.log("\n=== entities (up to 20) ===");
  console.log(JSON.stringify(ent.data, null, 2));
  console.log("\n=== borrowers (up to 20) ===");
  console.log(JSON.stringify(bor.data, null, 2));
  console.log("\n=== active borrower_property_signals ===");
  console.log(JSON.stringify(bps.data, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
