// Quick review of a validation: pillar counts + ai_analysis status + verified_flips status.
// Usage: VALIDATION_ID=<uuid> npx tsx scripts/review-validation-quick.ts

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const id = process.env.VALIDATION_ID!;
if (!id) { console.error("VALIDATION_ID required"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function main() {
  const [v, e, tr, lc, lcase, gc, sn, vf, rf] = await Promise.all([
    supabase.from("borrower_validations").select("id, borrower_name, borrower_entity_name, overall_status, confidence_score, experience_tier, property_count, flag_count, ai_analysis, created_at, validation_date").eq("id", id).maybeSingle(),
    supabase.from("entity_checks").select("id, sos_status, state, entity_type, formation_date, registered_agent, flags").eq("validation_id", id),
    supabase.from("track_record_entries").select("id, property_address, project_type, outcome, hold_months").eq("validation_id", id),
    supabase.from("litigation_checks").select("id, search_type, result").eq("validation_id", id),
    supabase.from("litigation_cases").select("id, case_name, court, status, category").eq("validation_id", id),
    supabase.from("gc_validations").select("id, gc_name, license_status").eq("validation_id", id),
    supabase.from("sanctions_checks").select("id, result, match_count, sources_searched").eq("validation_id", id),
    supabase.from("verified_flips").select("id, submitted_address, resolved_address, match_status, hold_months, profit").eq("validation_id", id),
    supabase.from("risk_factors").select("factor_key, severity, excluded, exclusion_reason").eq("validation_id", id).order("factor_key"),
  ]);

  const val = v.data;
  if (!val) { console.error("validation not found"); process.exit(1); }

  console.log("=== validation ===");
  console.log("id:", val.id);
  console.log("borrower:", val.borrower_name);
  console.log("entity:", val.borrower_entity_name);
  console.log("status:", val.overall_status, "| confidence:", val.confidence_score, "| tier:", val.experience_tier);
  console.log("property_count cache:", val.property_count, "| flag_count cache:", val.flag_count);
  console.log("created_at:", val.created_at, "| validation_date:", val.validation_date);
  console.log("ai_analysis:", val.ai_analysis ? `schema_version=${(val.ai_analysis as Record<string, unknown>).schema_version} (present)` : "NULL");
  if (val.ai_analysis) {
    const ai = val.ai_analysis as Record<string, unknown>;
    const risks = ai.risks as Array<{ factor_key: string; severity: string }> | undefined;
    const strengths = ai.strengths as Array<{ title: string }> | undefined;
    const recs = ai.recommendations as unknown[] | undefined;
    console.log(`  risks: ${risks?.length ?? 0}, strengths: ${strengths?.length ?? 0}, recommendations: ${recs?.length ?? 0}`);
    if (risks) {
      for (const r of risks) console.log(`    risk: ${r.factor_key} (${r.severity})`);
    }
  }

  console.log("\n=== pillar counts ===");
  console.log(`  entity_checks:           ${e.data?.length ?? 0}`);
  console.log(`  track_record_entries:    ${tr.data?.length ?? 0}`);
  console.log(`  litigation_checks:       ${lc.data?.length ?? 0}`);
  console.log(`  litigation_cases:        ${lcase.data?.length ?? 0}`);
  console.log(`  gc_validations:          ${gc.data?.length ?? 0}`);
  console.log(`  sanctions_checks:        ${sn.data?.length ?? 0}`);
  console.log(`  verified_flips:          ${vf.data?.length ?? 0}`);
  console.log(`  risk_factors:            ${rf.data?.length ?? 0}`);

  if (e.data?.[0]) {
    const ent = e.data[0];
    console.log(`\nentity: ${ent.sos_status} | ${ent.state} | ${ent.entity_type ?? "?"} | formed ${ent.formation_date ?? "?"} | agent ${ent.registered_agent ?? "?"} | flags=[${(ent.flags as string[] ?? []).join(", ")}]`);
  }

  if (vf.data && vf.data.length > 0) {
    console.log("\n=== verified_flips ===");
    const summary = {
      owned_and_sold: vf.data.filter((v) => v.match_status === "owned_and_sold").length,
      owned_and_held: vf.data.filter((v) => v.match_status === "owned_and_held").length,
      never_owned: vf.data.filter((v) => v.match_status === "never_owned").length,
      not_found: vf.data.filter((v) => v.match_status === "not_found").length,
      pending: vf.data.filter((v) => v.match_status === "pending").length,
    };
    console.log(`  ${vf.data.length} rows total: ${JSON.stringify(summary)}`);
    const realizedProfit = vf.data
      .filter((v) => v.match_status === "owned_and_sold" && v.profit != null)
      .reduce((sum, v) => sum + (v.profit ?? 0), 0);
    console.log(`  realized_profit_on_sold: $${realizedProfit.toLocaleString()}`);
    for (const f of vf.data.slice(0, 8)) {
      console.log(`    ${f.match_status} | submitted='${f.submitted_address}' | resolved='${f.resolved_address ?? "—"}' | hold=${f.hold_months ?? "?"}m | profit=${f.profit ?? "—"}`);
    }
    if (vf.data.length > 8) console.log(`    … +${vf.data.length - 8} more`);
  }

  if (rf.data && rf.data.length > 0) {
    console.log("\n=== risk_factors ===");
    for (const f of rf.data) {
      console.log(`  ${f.factor_key}: ${f.severity}${f.excluded ? " [excluded: " + (f.exclusion_reason ?? "?") + "]" : ""}`);
    }
  }

  if (sn.data?.[0]) {
    console.log(`\nsanctions: ${sn.data[0].result} | matches=${sn.data[0].match_count} | sources=${(sn.data[0].sources_searched as string[] ?? []).join(", ")}`);
  }

  if (lcase.data && lcase.data.length > 0) {
    console.log("\n=== litigation_cases ===");
    for (const c of lcase.data) {
      console.log(`  [${c.category}] ${c.case_name} | ${c.court} | ${c.status}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
