// Seed example investor configs for the org so the Evaluate Deal demo has
// something to compare against. Idempotent — re-runs replace active
// criteria via supersession.
//
// Run with:
//   ORG_ID=<uuid> npx tsx scripts/seed-sample-investors.ts
//
// If ORG_ID isn't set, picks the first organization in the database
// (single-tenant dev convenience). Pass explicit ORG_ID for prod.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

interface SampleInvestor {
  display_name: string;
  type: "balance_sheet" | "table_funded" | "securitizer";
  notes: string;
  criteria: Array<{ criteria_key: string; criteria_value: unknown }>;
}

const SAMPLES: SampleInvestor[] = [
  {
    display_name: "Sample — Colchis-style (institutional)",
    type: "table_funded",
    notes: "Tight box, lower rate, FICO/experience gates. Approximate of public profile; replace with real PDF-driven configs.",
    criteria: [
      { criteria_key: "loan_types", criteria_value: ["bridge", "fix_flip"] },
      { criteria_key: "property_types", criteria_value: ["sfr", "2_4_unit", "condo", "townhouse"] },
      { criteria_key: "excluded_states", criteria_value: ["ND", "SD", "VT"] },
      { criteria_key: "min_loan_amount", criteria_value: 250000 },
      { criteria_key: "max_loan_amount", criteria_value: 3000000 },
      { criteria_key: "min_fico", criteria_value: 680 },
      { criteria_key: "min_experience", criteria_value: 3 },
      { criteria_key: "max_ltv", criteria_value: 0.80 },
      { criteria_key: "max_ltc", criteria_value: 0.90 },
      { criteria_key: "max_ltarv", criteria_value: 0.75 },
      { criteria_key: "rural_allowed", criteria_value: false },
      { criteria_key: "allowed_occupancy", criteria_value: ["non_owner_occupied"] },
      {
        criteria_key: "leverage_matrix",
        criteria_value: [
          { loan_type: null, property_type: null, min_fico: 740, max_fico: null, min_experience: 5, max_experience: null, max_ltv: 0.80, max_ltc: 0.90, max_ltarv: 0.75, base_rate_bps: 925, base_points_bps: 200, sort_order: 1 },
          { loan_type: null, property_type: null, min_fico: 700, max_fico: 739, min_experience: 3, max_experience: null, max_ltv: 0.75, max_ltc: 0.85, max_ltarv: 0.72, base_rate_bps: 1000, base_points_bps: 200, sort_order: 2 },
          { loan_type: null, property_type: null, min_fico: 680, max_fico: 699, min_experience: 3, max_experience: null, max_ltv: 0.70, max_ltc: 0.80, max_ltarv: 0.68, base_rate_bps: 1075, base_points_bps: 250, sort_order: 3 },
        ],
      },
      {
        criteria_key: "rate_adjusters",
        criteria_value: [
          { name: "Cash-out refinance", condition: { field: "loan_purpose", op: "eq", value: "cash_out_refi" }, rate_bps: 50, points_bps: 0, ltv_adjustment_pct: 0, ltc_adjustment_pct: 0, stackable: true },
          { name: "Rural property", condition: { field: "is_rural", op: "is_true" }, rate_bps: 25, points_bps: 0, ltv_adjustment_pct: -2.5, ltc_adjustment_pct: 0, stackable: true },
          { name: "LTV ≥ 75%", condition: { field: "ltv", op: "gte", value: 75 }, rate_bps: 25, points_bps: 0, ltv_adjustment_pct: 0, ltc_adjustment_pct: 0, stackable: true },
        ],
      },
    ],
  },
  {
    display_name: "Sample — Oakhurst-style (flexible)",
    type: "balance_sheet",
    notes: "Wider box, higher rate, accepts lower FICO/experience. Approximate.",
    criteria: [
      { criteria_key: "loan_types", criteria_value: ["bridge", "fix_flip", "ground_up"] },
      { criteria_key: "property_types", criteria_value: ["sfr", "2_4_unit", "small_multifamily", "condo", "townhouse", "mixed_use"] },
      { criteria_key: "min_loan_amount", criteria_value: 100000 },
      { criteria_key: "max_loan_amount", criteria_value: 5000000 },
      { criteria_key: "min_fico", criteria_value: 640 },
      { criteria_key: "min_experience", criteria_value: 0 },
      { criteria_key: "max_ltv", criteria_value: 0.85 },
      { criteria_key: "max_ltc", criteria_value: 0.92 },
      { criteria_key: "max_ltarv", criteria_value: 0.78 },
      { criteria_key: "rural_allowed", criteria_value: true },
      { criteria_key: "allowed_occupancy", criteria_value: ["non_owner_occupied", "owner_occupied"] },
      {
        criteria_key: "leverage_matrix",
        criteria_value: [
          { loan_type: null, property_type: null, min_fico: 720, max_fico: null, min_experience: 3, max_experience: null, max_ltv: 0.85, max_ltc: 0.92, max_ltarv: 0.78, base_rate_bps: 950, base_points_bps: 200, sort_order: 1 },
          { loan_type: null, property_type: null, min_fico: 680, max_fico: 719, min_experience: 1, max_experience: null, max_ltv: 0.80, max_ltc: 0.88, max_ltarv: 0.75, base_rate_bps: 1025, base_points_bps: 250, sort_order: 2 },
          { loan_type: null, property_type: null, min_fico: 640, max_fico: 679, min_experience: 0, max_experience: null, max_ltv: 0.75, max_ltc: 0.85, max_ltarv: 0.70, base_rate_bps: 1125, base_points_bps: 300, sort_order: 3 },
        ],
      },
      {
        criteria_key: "rate_adjusters",
        criteria_value: [
          { name: "First-time investor", condition: { field: "borrower_experience", op: "lt", value: 1 }, rate_bps: 50, points_bps: 50, ltv_adjustment_pct: -2.5, ltc_adjustment_pct: 0, stackable: true },
          { name: "Ground-up construction", condition: { field: "loan_type", op: "eq", value: "ground_up" }, rate_bps: 75, points_bps: 25, ltv_adjustment_pct: 0, ltc_adjustment_pct: -2, stackable: true },
        ],
      },
    ],
  },
  {
    display_name: "Sample — Mandalay-style (small loans)",
    type: "balance_sheet",
    notes: "Small-loan-friendly profile. Approximate.",
    criteria: [
      { criteria_key: "loan_types", criteria_value: ["bridge", "fix_flip"] },
      { criteria_key: "property_types", criteria_value: ["sfr", "2_4_unit"] },
      { criteria_key: "min_loan_amount", criteria_value: 75000 },
      { criteria_key: "max_loan_amount", criteria_value: 1500000 },
      { criteria_key: "min_fico", criteria_value: 660 },
      { criteria_key: "min_experience", criteria_value: 1 },
      { criteria_key: "max_ltv", criteria_value: 0.80 },
      { criteria_key: "max_ltc", criteria_value: 0.88 },
      { criteria_key: "max_ltarv", criteria_value: 0.72 },
      { criteria_key: "allowed_occupancy", criteria_value: ["non_owner_occupied"] },
      {
        criteria_key: "leverage_matrix",
        criteria_value: [
          { loan_type: null, property_type: null, min_fico: 700, max_fico: null, min_experience: 1, max_experience: null, max_ltv: 0.80, max_ltc: 0.88, max_ltarv: 0.72, base_rate_bps: 1075, base_points_bps: 250, sort_order: 1 },
          { loan_type: null, property_type: null, min_fico: 660, max_fico: 699, min_experience: 1, max_experience: null, max_ltv: 0.75, max_ltc: 0.83, max_ltarv: 0.70, base_rate_bps: 1175, base_points_bps: 300, sort_order: 2 },
        ],
      },
    ],
  },
];

async function resolveOrgId(): Promise<string | null> {
  if (process.env.ORG_ID) return process.env.ORG_ID;
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

async function upsertInvestor(orgId: string, sample: SampleInvestor) {
  const { data: existing } = await supabase
    .from("investors")
    .select("id")
    .eq("org_id", orgId)
    .eq("display_name", sample.display_name)
    .maybeSingle();

  let investorId: string;
  if (existing) {
    investorId = existing.id;
    await supabase
      .from("investors")
      .update({ type: sample.type, notes: sample.notes })
      .eq("id", investorId);
  } else {
    const { data: created } = await supabase
      .from("investors")
      .insert({
        org_id: orgId,
        display_name: sample.display_name,
        type: sample.type,
        notes: sample.notes,
      })
      .select("id")
      .single();
    if (!created) throw new Error(`Failed to insert investor ${sample.display_name}`);
    investorId = created.id;
  }

  // Supersede existing active criteria + insert the new set
  await supabase
    .from("investor_criteria")
    .update({ effective_to: new Date().toISOString().slice(0, 10) })
    .eq("investor_id", investorId)
    .is("effective_to", null);

  await supabase.from("investor_criteria").insert(
    sample.criteria.map((c) => ({
      investor_id: investorId,
      criteria_key: c.criteria_key,
      criteria_value: c.criteria_value,
      source: "user_input",
    })),
  );

  return investorId;
}

async function main() {
  const orgId = await resolveOrgId();
  if (!orgId) {
    console.error("No organization found. Pass ORG_ID env var or ensure at least one org exists.");
    process.exit(1);
  }
  console.log(`Seeding sample investors for org ${orgId}…`);
  for (const sample of SAMPLES) {
    const id = await upsertInvestor(orgId, sample);
    console.log(`  ${sample.display_name} → ${id} (${sample.criteria.length} criteria)`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
