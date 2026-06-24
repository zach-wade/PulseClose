// Seed the REAL Insignia investor buy-boxes (Colchis + Oakhurst) so the
// Evaluate / best-execution demo runs against the actual published grids, not
// approximations. Source-of-truth + fidelity caveats: docs/BUYBOX-COLCHIS-OAKHURST.md
// (extracted from the lender guideline PDFs in consulting/.../insignia-capital/data).
//
// These two are the only Insignia investors with an encodable buy-box (Mandalay
// shares Oakhurst's doc; Ellington has none — DEPTH-AND-VALUE-DIRECTION §Open).
//
// Mapping onto the eligibility engine (src/lib/evaluate/engine.ts):
//   - FICO × experience cells   -> leverage_matrix tiers (first match by sort_order)
//   - per-tier rate / points    -> base_rate_bps / base_points_bps
//   - +bps adjusters & haircuts  -> rate_adjusters
//   - hard gates                 -> loan_types / property_types / excluded_states / etc.
//   - stabilized debt-yield floor -> min_debt_yield (feeds per-investor loan sizing)
//
// Idempotent — re-runs supersede active criteria.
// Run with:  ORG_ID=<uuid> npx tsx scripts/seed-sample-investors.ts
// (If ORG_ID isn't set, picks the first organization — single-tenant dev only.)

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

// ── COLCHIS — RTL Purchase Guidelines (2026-01) ─────────────────────────────
// SF (1-4) Heavy Rehab grid -> fix_flip; SF Purchase Bridge grid -> bridge.
// Lower-FICO / 0-3-experience Heavy-Rehab cells are blank in the source = not
// lent (no tier matches -> conditional/manual review). Rates are REPRESENTATIVE
// (Colchis publishes no rate sheet in the purchase-guidelines doc).
// Colchis grids are SF (1-4) and MF (5-10) separate tables. The SF Heavy-Rehab
// and SF Purchase-Bridge grids are encoded (property_type "sfr"). MF Heavy Rehab
// renders BLANK in the source = not lent, so there is NO MF fix_flip tier — an
// MF value-add fix_flip deal correctly finds no Colchis tier (conditional /
// manual). MF Purchase-Bridge IS lent (70/65 LTV) and is encoded for small MF.
const COLCHIS_MATRIX = [
  // — SF (1-4) Heavy Rehab -> fix_flip: LTP-LTV / LTC / LTARV —
  { loan_type: "fix_flip", property_type: "sfr", min_fico: 720, max_fico: null, min_experience: 4, max_experience: null, max_ltv: 0.80, max_ltc: 0.85, max_ltarv: 0.70, base_rate_bps: 925, base_points_bps: 200, sort_order: 1 },
  { loan_type: "fix_flip", property_type: "sfr", min_fico: 700, max_fico: 719, min_experience: 8, max_experience: null, max_ltv: 0.80, max_ltc: 0.85, max_ltarv: 0.70, base_rate_bps: 950, base_points_bps: 200, sort_order: 2 },
  { loan_type: "fix_flip", property_type: "sfr", min_fico: 700, max_fico: 719, min_experience: 4, max_experience: 7, max_ltv: 0.80, max_ltc: 0.825, max_ltarv: 0.70, base_rate_bps: 975, base_points_bps: 200, sort_order: 3 },
  { loan_type: "fix_flip", property_type: "sfr", min_fico: 680, max_fico: 699, min_experience: 8, max_experience: null, max_ltv: 0.75, max_ltc: 0.825, max_ltarv: 0.65, base_rate_bps: 1000, base_points_bps: 250, sort_order: 4 },
  { loan_type: "fix_flip", property_type: "sfr", min_fico: 680, max_fico: 699, min_experience: 4, max_experience: 7, max_ltv: 0.75, max_ltc: 0.80, max_ltarv: 0.65, base_rate_bps: 1025, base_points_bps: 250, sort_order: 5 },
  // — SF (1-4) Purchase Bridge -> bridge: LTV only —
  { loan_type: "bridge", property_type: "sfr", min_fico: 720, max_fico: null, min_experience: 0, max_experience: null, max_ltv: 0.75, max_ltc: null, max_ltarv: null, base_rate_bps: 900, base_points_bps: 200, sort_order: 6 },
  { loan_type: "bridge", property_type: "sfr", min_fico: 700, max_fico: 719, min_experience: 4, max_experience: null, max_ltv: 0.75, max_ltc: null, max_ltarv: null, base_rate_bps: 925, base_points_bps: 200, sort_order: 7 },
  { loan_type: "bridge", property_type: "sfr", min_fico: 680, max_fico: 699, min_experience: 4, max_experience: null, max_ltv: 0.70, max_ltc: null, max_ltarv: null, base_rate_bps: 975, base_points_bps: 250, sort_order: 8 },
  // — MF (5-10) Purchase Bridge -> bridge: LTV only (MF grid: lower leverage) —
  { loan_type: "bridge", property_type: "small_multifamily", min_fico: 720, max_fico: null, min_experience: 4, max_experience: null, max_ltv: 0.70, max_ltc: null, max_ltarv: null, base_rate_bps: 950, base_points_bps: 200, sort_order: 9 },
  { loan_type: "bridge", property_type: "small_multifamily", min_fico: 700, max_fico: 719, min_experience: 8, max_experience: null, max_ltv: 0.70, max_ltc: null, max_ltarv: null, base_rate_bps: 975, base_points_bps: 200, sort_order: 10 },
  { loan_type: "bridge", property_type: "small_multifamily", min_fico: 680, max_fico: 699, min_experience: 4, max_experience: null, max_ltv: 0.65, max_ltc: null, max_ltarv: null, base_rate_bps: 1000, base_points_bps: 250, sort_order: 11 },
];

// ── OAKHURST / MANDALAY — Eligibility v1.2 (06.25) ──────────────────────────
// Flat product × experience grid (Exhibit A) + explicit rate sheet (Exhibit B).
// MF-specific tiers carry the MF LTC cap (80%) and MF rate. Highly-Experienced =
// ≥10 deals; Experienced = 3-9. property_type-specific tiers sort before the
// 1-4-residential (null) tiers so MF deals match the MF cell first.
const OAKHURST_MATRIX = [
  // — fix_flip (Heavy Reno) —
  { loan_type: "fix_flip", property_type: "small_multifamily", min_fico: 660, max_fico: null, min_experience: 10, max_experience: null, max_ltv: 0.85, max_ltc: 0.80, max_ltarv: 0.75, base_rate_bps: 1050, base_points_bps: 200, sort_order: 1 },
  { loan_type: "fix_flip", property_type: "small_multifamily", min_fico: 660, max_fico: null, min_experience: 3, max_experience: 9, max_ltv: 0.85, max_ltc: 0.80, max_ltarv: 0.70, base_rate_bps: 1050, base_points_bps: 200, sort_order: 2 },
  { loan_type: "fix_flip", property_type: null, min_fico: 660, max_fico: null, min_experience: 10, max_experience: null, max_ltv: 0.85, max_ltc: 0.90, max_ltarv: 0.75, base_rate_bps: 950, base_points_bps: 200, sort_order: 3 },
  { loan_type: "fix_flip", property_type: null, min_fico: 660, max_fico: null, min_experience: 3, max_experience: 9, max_ltv: 0.85, max_ltc: 0.85, max_ltarv: 0.70, base_rate_bps: 950, base_points_bps: 200, sort_order: 4 },
  // — bridge —
  { loan_type: "bridge", property_type: "small_multifamily", min_fico: 660, max_fico: null, min_experience: 10, max_experience: null, max_ltv: 0.80, max_ltc: null, max_ltarv: null, base_rate_bps: 950, base_points_bps: 200, sort_order: 5 },
  { loan_type: "bridge", property_type: "small_multifamily", min_fico: 660, max_fico: null, min_experience: 3, max_experience: 9, max_ltv: 0.75, max_ltc: null, max_ltarv: null, base_rate_bps: 950, base_points_bps: 200, sort_order: 6 },
  { loan_type: "bridge", property_type: null, min_fico: 660, max_fico: null, min_experience: 10, max_experience: null, max_ltv: 0.80, max_ltc: null, max_ltarv: null, base_rate_bps: 925, base_points_bps: 200, sort_order: 7 },
  { loan_type: "bridge", property_type: null, min_fico: 660, max_fico: null, min_experience: 3, max_experience: 9, max_ltv: 0.75, max_ltc: null, max_ltarv: null, base_rate_bps: 925, base_points_bps: 200, sort_order: 8 },
  // — ground_up —
  { loan_type: "ground_up", property_type: null, min_fico: 660, max_fico: null, min_experience: 10, max_experience: null, max_ltv: 0.85, max_ltc: 0.85, max_ltarv: 0.75, base_rate_bps: 950, base_points_bps: 250, sort_order: 9 },
  { loan_type: "ground_up", property_type: null, min_fico: 660, max_fico: null, min_experience: 3, max_experience: 9, max_ltv: 0.85, max_ltc: 0.85, max_ltarv: 0.70, base_rate_bps: 950, base_points_bps: 250, sort_order: 10 },
];

const SAMPLES: SampleInvestor[] = [
  {
    display_name: "Colchis Capital — RTL purchase grid (2026-01)",
    type: "table_funded",
    notes:
      "Real Colchis RTL purchase guidelines (SF 1-4 Heavy-Rehab + Purchase-Bridge grids). Tighter, cheaper, institutional. Base rates REPRESENTATIVE — Colchis's rate sheet isn't in the purchase-guidelines doc. ZHVI value haircut (>200% -5%, >300% -10%) captured in value_haircuts but not yet engine-wired. Source: docs/BUYBOX-COLCHIS-OAKHURST.md.",
    criteria: [
      { criteria_key: "loan_types", criteria_value: ["bridge", "fix_flip"] },
      { criteria_key: "property_types", criteria_value: ["sfr", "2_4_unit", "condo", "townhouse", "small_multifamily"] },
      { criteria_key: "excluded_states", criteria_value: ["IL"] },
      { criteria_key: "min_loan_amount", criteria_value: 100000 },
      { criteria_key: "max_loan_amount", criteria_value: 3500000 },
      { criteria_key: "min_fico", criteria_value: 680 },
      { criteria_key: "min_experience", criteria_value: 0 },
      { criteria_key: "rural_allowed", criteria_value: false },
      { criteria_key: "allowed_occupancy", criteria_value: ["non_owner_occupied"] },
      { criteria_key: "leverage_matrix", criteria_value: COLCHIS_MATRIX },
      // Documented but not engine-wired (needs a property-value-vs-ZHVI input).
      {
        criteria_key: "value_haircuts",
        criteria_value: [
          { basis: "zhvi_aiv_or_arv", threshold_pct: 200, leverage_reduction_pct: -5 },
          { basis: "zhvi_aiv_or_arv", threshold_pct: 300, leverage_reduction_pct: -10 },
        ],
      },
    ],
  },
  {
    display_name: "Oakhurst / Mandalay — eligibility v1.2 (06.25)",
    type: "balance_sheet",
    notes:
      "Real Oakhurst/Mandalay eligibility (Exhibit A leverage + Exhibit B rate sheet). Product × experience grid with MF LTC cap (80%). Min 5% stabilized debt yield (rental-hold exit) feeds per-investor sizing. >$3M -> 80 LTC / 65 LTARV cap captured but not yet engine-wired. Source: docs/BUYBOX-COLCHIS-OAKHURST.md.",
    criteria: [
      { criteria_key: "loan_types", criteria_value: ["bridge", "fix_flip", "ground_up"] },
      { criteria_key: "property_types", criteria_value: ["sfr", "2_4_unit", "small_multifamily", "condo", "townhouse"] },
      { criteria_key: "excluded_states", criteria_value: ["AK", "HI", "ND", "SD"] },
      { criteria_key: "min_loan_amount", criteria_value: 750000 },
      { criteria_key: "max_loan_amount", criteria_value: 7000000 },
      { criteria_key: "min_fico", criteria_value: 660 },
      { criteria_key: "min_experience", criteria_value: 3 },
      { criteria_key: "min_debt_yield", criteria_value: 0.05 },
      { criteria_key: "rural_allowed", criteria_value: false },
      { criteria_key: "allowed_occupancy", criteria_value: ["non_owner_occupied"] },
      { criteria_key: "leverage_matrix", criteria_value: OAKHURST_MATRIX },
      {
        criteria_key: "rate_adjusters",
        criteria_value: [
          { name: "LTC > 85% (+50bps)", condition: { field: "ltc", op: "gt", value: 85 }, rate_bps: 50, points_bps: 0, ltv_adjustment_pct: 0, ltc_adjustment_pct: 0, stackable: true },
          { name: "Cash-out (+50bps)", condition: { field: "loan_purpose", op: "eq", value: "cash_out_refi" }, rate_bps: 50, points_bps: 0, ltv_adjustment_pct: 0, ltc_adjustment_pct: 0, stackable: true },
          { name: "FICO < 700 (+50bps)", condition: { field: "borrower_fico", op: "lt", value: 700 }, rate_bps: 50, points_bps: 0, ltv_adjustment_pct: 0, ltc_adjustment_pct: 0, stackable: true },
          { name: "FICO < 680 (−10% leverage)", condition: { field: "borrower_fico", op: "lt", value: 680 }, rate_bps: 0, points_bps: 0, ltv_adjustment_pct: -10, ltc_adjustment_pct: -10, stackable: true },
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
  console.log(`Seeding real Insignia buy-boxes for org ${orgId}…`);
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
