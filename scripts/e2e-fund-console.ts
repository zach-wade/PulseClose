// Fund persona E2E — stand up the Mandate Console with REAL assessed runs under
// the fund org (Keystone, org_type=fund). Creates the fund's investor + a
// published mandate, runs real ICC loans under the fund org (auto-assessed by
// the pipeline), then prints the console rollup the /api/mandates/console page
// renders — so we verify the fund's "set the standard, watch the roster" view +
// the thread-1 MandateChip status tokens on genuine data.
//
// Run: set -a; source .env.local; set +a; npx tsx scripts/e2e-fund-console.ts
import { createClient } from "@supabase/supabase-js";
import { runValidationPipeline } from "../src/lib/validations/pipeline";

const FUND = "0aada23e-56f5-47ce-b400-a872be3daaf1";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Real ICC loans (Nexys export) that resolve free today. A NY-entity borrower
// (resolves via live DOS) and an individual borrower (no entity) give the
// console a mix of standings against the same mandate.
const LOANS = [
  { borrower_name: "Sharon Nachman", borrower_entity_name: "L Y I LLC", entity_state: "NY", guarantor_name: "Sharon Nachman", property_addresses: ["7 Spencer Pl, Scarsdale, NY 10583"] },
  { borrower_name: "Theodore Pappas", borrower_entity_name: "", entity_state: "FL", guarantor_name: "Theodore Pappas", property_addresses: ["3300 S Ocean Blvd 104 S, Palm Beach, FL 33480"] },
];

async function ins(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data!.id as string;
}

async function main() {
  // Clean prior seed so re-runs are idempotent.
  const { data: priorVals } = await supabase.from("borrower_validations").select("id").eq("org_id", FUND);
  const vids = (priorVals ?? []).map((v) => v.id);
  if (vids.length) await supabase.from("mandate_assessments").delete().eq("org_id", FUND).in("validation_id", vids);
  await supabase.from("investor_mandates").delete().eq("org_id", FUND).ilike("name", "Keystone —%");

  // The fund's investor + published mandate (achievable gates so we get a mix).
  let investorId: string;
  const { data: existingInv } = await supabase.from("investors").select("id").eq("org_id", FUND).limit(1).maybeSingle();
  investorId = existingInv?.id ?? (await ins("investors", { org_id: FUND, display_name: "Keystone Capital Partners", type: "balance_sheet" }));

  const mandateId = await ins("investor_mandates", {
    org_id: FUND,
    investor_id: investorId,
    name: "Keystone — Bridge diligence standard",
    gates: {
      schema_version: 1,
      max_risk_tier: "MEDIUM",
      require_sos_active: true,
      disallow_active_litigation: true,
      disallow_sanctions_hit: true,
      min_confidence_score: 60,
      require_gc_active: false,
      require_eligibility_pass: false,
    },
    enabled: true,
  });
  console.log(`Mandate published: "Keystone — Bridge diligence standard" (${mandateId})\n`);

  // Run the real loans under the fund org → pipeline auto-assesses each.
  for (const loan of LOANS) {
    const r = await runValidationPipeline({
      supabase, orgId: FUND, actorUserId: null, checksUsed: 0, background: true, input: loan,
    });
    console.log(`  ran ${loan.borrower_name.padEnd(18)} → ${r.validation_id} (tier ${r.tier})`);
  }

  // Print the console rollup the fund persona sees.
  const { data: assessments } = await supabase
    .from("mandate_assessments")
    .select("result, validation_id, borrower_validations(borrower_name)")
    .eq("org_id", FUND);
  const rows = assessments ?? [];
  const counts = rows.reduce((o: Record<string, number>, x) => ((o[x.result] = (o[x.result] || 0) + 1), o), {});
  console.log(`\n=== Mandate Console (fund persona) ===`);
  console.log(`Keystone — Bridge diligence standard · ${rows.length} assessed`);
  console.log(`  meets ${counts.pass ?? 0} · conditional ${counts.conditional ?? 0} · fails ${counts.fail ?? 0}`);
  for (const a of rows) {
    const bn = (a.borrower_validations as { borrower_name?: string } | null)?.borrower_name ?? "?";
    console.log(`  · ${bn.padEnd(18)} ${a.result}`);
  }
  console.log(`\nLive: https://app.pulseclose.com/dashboard/capital/mandates  (login fund@test.pulseclose.com)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
