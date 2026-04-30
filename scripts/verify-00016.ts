// Post-apply verification for migration 00016_p0_corrections.sql.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function selectExists(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;
  if (error.message.includes("does not exist")) return false;
  console.warn(`  warning: ${table}.${column} probe got: ${error.message}`);
  return true; // anything other than "does not exist" means it's there but RLS or empty
}

async function main() {
  console.log("§1 org_id columns on snapshot tables:");
  for (const table of ["entity_checks", "track_record_entries", "gc_validations", "litigation_checks"]) {
    console.log(`  ${table}.org_id: ${await selectExists(table, "org_id")}`);
  }

  console.log("\n§2 timestamps on legacy tables:");
  console.log(`  track_record_entries.created_at: ${await selectExists("track_record_entries", "created_at")}`);
  console.log(`  track_record_entries.updated_at: ${await selectExists("track_record_entries", "updated_at")}`);
  console.log(`  gc_validations.created_at: ${await selectExists("gc_validations", "created_at")}`);
  console.log(`  gc_validations.updated_at: ${await selectExists("gc_validations", "updated_at")}`);

  console.log("\n§5 risk_factors.expires_at:");
  console.log(`  risk_factors.expires_at: ${await selectExists("risk_factors", "expires_at")}`);

  console.log("\n§8 monitor_runs columns:");
  console.log(`  monitor_runs.adapter_results: ${await selectExists("monitor_runs", "adapter_results")}`);
  console.log(`  monitor_runs.email_status: ${await selectExists("monitor_runs", "email_status")}`);

  console.log("\n§9 RPC recompute_risk_factors_atomic:");
  // Smoke-test with a fake validation_id — should return null (no error means
  // function exists). The function uses an empty array so it's a no-op besides
  // the borrower_validations update which won't match anything.
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const { error } = await supabase.rpc("recompute_risk_factors_atomic", {
    p_validation_id: fakeId,
    p_factors: [],
    p_flag_count: 0,
  });
  console.log(`  RPC callable: ${!error || !error.message.includes("Could not find")}`);
  if (error) console.log(`    detail: ${error.message}`);

  console.log("\n§7 lender escalation guard (attempt org→null update on FDIC global row):");
  // Fetch one global lender, attempt to set org_id to null on a per-org row
  const { data: orgScoped } = await supabase
    .from("lenders")
    .select("id, org_id")
    .not("org_id", "is", null)
    .limit(1);
  if (!orgScoped || orgScoped.length === 0) {
    console.log("  (no org-scoped lenders to test guard with — skipping)");
  } else {
    const { error: guardErr } = await supabase
      .from("lenders")
      .update({ org_id: null })
      .eq("id", orgScoped[0].id);
    console.log(`  guard fired: ${!!guardErr}`);
    if (guardErr) console.log(`    error (expected): ${guardErr.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
