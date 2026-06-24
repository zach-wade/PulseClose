// Seed synthetic, fully-rendered data for live pixel-driving the app per persona.
//
// This inserts directly via the service-role admin client (bypasses RLS) so the
// dashboard, validation detail, evaluate, and mandate screens all render with
// realistic content WITHOUT calling any paid vendor adapter. Numbers are
// internally consistent enough for a UX review; they are NOT engine-accurate.
//
// Idempotent: deletes any previously-seeded rows for this org (matched by the
// known borrower names / "Seed —" markers) before re-inserting.
//
// Run (after creating the org via create-test-user.ts):
//   # Underwriter org — investors first, then the rich deal data:
//   ORG_ID=<uw_org> npx tsx scripts/seed-sample-investors.ts
//   ORG_ID=<uw_org> PERSONA=underwriter npx tsx scripts/seed-persona-data.ts
//
//   # Spreadsheet-refugee org — one bare validation, no investors:
//   ORG_ID=<solo_org> PERSONA=solo npx tsx scripts/seed-persona-data.ts

import { createClient } from "@supabase/supabase-js";
import { underwrite, type SizingInputs } from "../src/lib/underwriting/sizing";
import { sizeTakeout } from "../src/lib/underwriting/exit";
import { stabilizationPath } from "../src/lib/underwriting/stabilization";
import { sizeInterestReserve } from "../src/lib/underwriting/reserve";
import { sizeAllInvestors } from "../src/lib/underwriting/per-investor";
import {
  assembleRulesFromCriteria,
  evaluateDealForInvestor,
  type DealParams,
  type InvestorRules,
} from "../src/lib/evaluate/engine";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const ORG_ID = process.env.ORG_ID;
if (!ORG_ID) {
  console.error("Missing ORG_ID");
  process.exit(1);
}
const PERSONA = (process.env.PERSONA ?? "underwriter") as "underwriter" | "solo";

// Stable IDs so re-seeding keeps the same URLs (the driver hardcodes these).
const VID = {
  clean: "11111111-1111-4111-8111-111111111111",
  flagged: "22222222-2222-4222-8222-222222222222",
  solo: "33333333-3333-4333-8333-333333333333",
  westbrook: "44444444-4444-4444-8444-444444444444", // Damon-shaped MFR value-add centerpiece
};

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── helpers ───────────────────────────────────────────────────────────────
// Snapshot/pillar tables carry org_id NOT NULL (00016 backfill) for RLS perf.
// Auto-inject it so callers don't repeat it on every pillar row.
const NEEDS_ORG_ID = new Set([
  "entity_checks", "track_record_entries", "gc_validations",
]);
async function ins(table: string, row: Record<string, unknown>): Promise<string> {
  let payload = NEEDS_ORG_ID.has(table) && row.org_id == null ? { ...row, org_id: ORG_ID } : row;
  // risk_factors.contributing_data has a versioned CHECK (schema_version required).
  const cd = payload.contributing_data as Record<string, unknown> | undefined;
  if (table === "risk_factors" && cd && typeof cd === "object" && cd.schema_version == null) {
    payload = { ...payload, contributing_data: { schema_version: 1, ...cd } };
  }
  const { data, error } = await db.from(table).insert(payload).select("id").single();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data.id as string;
}

async function cleanup(borrowerNames: string[]) {
  // Children cascade off borrower_validations; eval/uw/mandates are org-scoped.
  const { data: vids } = await db
    .from("borrower_validations")
    .select("id")
    .eq("org_id", ORG_ID)
    .in("borrower_name", borrowerNames);
  const ids = (vids ?? []).map((v) => v.id);
  if (ids.length) {
    // uw_models / deal_evaluations / mandate_assessments reference validations
    // with ON DELETE SET NULL or CASCADE; clear the org-scoped ones explicitly.
    await db.from("mandate_assessments").delete().eq("org_id", ORG_ID).in("validation_id", ids);
    await db.from("borrower_validations").delete().in("id", ids);
  }
  await db.from("uw_models").delete().eq("org_id", ORG_ID).is("validation_id", null);
  await db.from("deal_evaluations").delete().eq("org_id", ORG_ID).ilike("location", "Seed%");
  await db.from("investor_mandates").delete().eq("org_id", ORG_ID).ilike("name", "Seed —%");
}

// ── pillar seeders (shared) ─────────────────────────────────────────────────
async function seedCleanPillars(vid: string) {
  await ins("entity_checks", {
    validation_id: vid, entity_name: "Maple Ridge Capital LLC", state: "CA",
    entity_type: "LLC", sos_status: "active", formation_date: "2019-03-12",
    last_filing_date: "2025-02-01", registered_agent: "Jane Holloway",
    source_url: "https://bizfileonline.sos.ca.gov/", confidence: "high", flags: [],
  });
  const props = [
    { property_address: "418 Oak Street, Sacramento, CA 95814", acquisition_date: "2022-04-10", disposition_date: "2022-11-22", acquisition_price: 410000, disposition_price: 589000, rehab_cost: 72000, project_type: "flip", outcome: "completed", hold_months: 7, profit: 107000, confidence: "high", verified: true },
    { property_address: "1290 Birch Ave, Roseville, CA 95661", acquisition_date: "2023-01-18", disposition_date: "2023-09-05", acquisition_price: 525000, disposition_price: 712000, rehab_cost: 95000, project_type: "flip", outcome: "completed", hold_months: 8, profit: 92000, confidence: "high", verified: true },
    { property_address: "77 Cedar Ct, Folsom, CA 95630", acquisition_date: "2024-06-02", disposition_date: null, acquisition_price: 640000, disposition_price: null, rehab_cost: 110000, project_type: "rehab", outcome: "in_progress", hold_months: 12, profit: null, confidence: "medium", verified: true },
  ];
  for (const p of props) await ins("track_record_entries", { validation_id: vid, source: "attom", ...p });
  await ins("gc_validations", {
    validation_id: vid, gc_name: "Holloway Build Co", license_number: "1024558",
    license_state: "CA", license_status: "active", license_classification: "B - General Building",
    expiration_date: "2026-08-31", insurance_verified: true, confidence: "high",
    source_url: "https://www.cslb.ca.gov/", disciplinary_actions: [],
  });
  await ins("sanctions_checks", {
    validation_id: vid, borrower_name: "Maple Ridge Capital LLC", result: "clear",
    match_count: 0, matches: [], sources_searched: ["OFAC SDN", "OpenSanctions Consolidated"],
    source: "OpenSanctions",
  });
  // Risk factors — all benign → LOW tier.
  await ins("risk_factors", { validation_id: vid, factor_key: "entity_status", severity: "none", explanation: "Entity is active and in good standing with CA SOS.", contributing_data: { sos_status: "active" } });
  await ins("risk_factors", { validation_id: vid, factor_key: "lender_concentration", severity: "minor", explanation: "Two of three financed properties used the same private lender.", contributing_data: { count: 2 } });
}

async function seedFlaggedPillars(vid: string) {
  await ins("entity_checks", {
    validation_id: vid, entity_name: "Cardinal Holdings LLC", state: "TX",
    entity_type: "LLC", sos_status: "active", formation_date: "2021-07-30",
    last_filing_date: "2024-09-15", registered_agent: "Cardinal Holdings LLC (self)",
    source_url: "https://mycpa.cpa.state.tx.us/", confidence: "high",
    flags: ["Registered agent is the entity itself — no third-party agent of record."],
  });
  await ins("track_record_entries", { validation_id: vid, source: "attom", property_address: "904 Pine Hill Rd, Austin, TX 78701", acquisition_date: "2023-03-01", disposition_date: "2024-10-10", acquisition_price: 880000, disposition_price: 905000, rehab_cost: 180000, project_type: "flip", outcome: "distressed", hold_months: 19, profit: -155000, confidence: "high", verified: true });
  await ins("gc_validations", {
    validation_id: vid, gc_name: "Lone Star Renovations", license_number: "—",
    license_state: "TX", license_status: "expired", license_classification: null,
    expiration_date: "2024-12-31", insurance_verified: false, confidence: "medium",
    disciplinary_actions: ["2024-03-01 — License lapsed; renewal not on file."],
  });
  await ins("litigation_cases", {
    validation_id: vid, org_id: ORG_ID, case_name: "Greystone Lending LLC v. Cardinal Holdings LLC",
    case_number: "1:25-cv-00412", court: "U.S. District Court, W.D. Texas", court_id: "txwd",
    filed_at: "2025-02-14", terminated_at: null, nature_of_suit: "Contract: Other",
    category: "civil", status: "pending", dollar_amount_estimated: 420000,
    raw: { schema_version: 1, search_type: "lawsuit" }, schema_version: 1,
  });
  await ins("sanctions_checks", {
    validation_id: vid, borrower_name: "Cardinal Holdings LLC", result: "clear",
    match_count: 0, matches: [], sources_searched: ["OFAC SDN", "OpenSanctions Consolidated"],
    source: "OpenSanctions",
  });
  // Risk factors — one critical (active fed litigation) → HIGH tier, plus moderate GC.
  await ins("risk_factors", { validation_id: vid, factor_key: "active_fed_litigation", severity: "critical", explanation: "Active federal civil suit by a prior lender alleging breach, ~$420k at issue.", contributing_data: { count: 1, cases: [{ case_number: "1:25-cv-00412" }] } });
  await ins("risk_factors", { validation_id: vid, factor_key: "gc_license_issue", severity: "moderate", explanation: "Named GC's TX license is expired.", contributing_data: { license_status: "expired" } });
  await ins("risk_factors", { validation_id: vid, factor_key: "extended_hold", severity: "moderate", excluded: false, explanation: "One flip held 19 months and closed at a loss.", contributing_data: { threshold_months: 18 } });
  await ins("risk_factors", { validation_id: vid, factor_key: "address_consistency", severity: "informational", explanation: "Entity serves as its own registered agent.", contributing_data: {} });
}

const AI_CLEAN = {
  schema_version: 2, summary: "Experienced California flipper with a clean entity, three verified projects, and no litigation or sanctions exposure. Track record is short but profitable.",
  risk_rating: "low",
  pillar_assessments: { entity: "Active CA LLC since 2019, current filings.", track_record: "Three ATTOM-verified projects; two completed flips averaging ~$100k profit, one in progress.", litigation: "No federal cases found.", gc: "Named GC holds an active CA B license with verified insurance.", sanctions: "No OFAC or OpenSanctions matches." },
  strengths: [ { title: "Profitable, recent track record", narrative: "Two completed flips in 2022–2023 each cleared roughly $100k with sub-9-month holds." }, { title: "Clean compliance profile", narrative: "Active entity, licensed GC, no litigation, no sanctions hits." } ],
  risks: [ { factor_key: "lender_concentration", severity: "minor", narrative: "Reliance on a single private lender across most projects." } ],
  recommendations: [ { priority: "should", narrative: "Confirm liquidity/reserves given the one in-progress project tying up capital." } ],
};
const AI_FLAGGED = {
  schema_version: 2, summary: "Texas sponsor carrying an active federal lawsuit from a prior lender, an expired GC license, and a recent loss-making flip held well past plan. Proceed only with material conditions.",
  risk_rating: "high",
  pillar_assessments: { entity: "Active TX LLC but acts as its own registered agent.", track_record: "Single verified project closed distressed at a ~$155k loss after a 19-month hold.", litigation: "Active federal civil suit by a prior lender, ~$420k at issue.", gc: "Named GC's TX license is expired and insurance is unverified.", sanctions: "No sanctions matches." },
  strengths: [ { title: "Entity in good standing", narrative: "TX SOS shows the LLC active with current-enough filings." } ],
  risks: [ { factor_key: "active_fed_litigation", severity: "critical", narrative: "Pending lender suit signals potential prior-deal failure and contingent liability." }, { factor_key: "gc_license_issue", severity: "moderate", narrative: "Expired GC license undermines the renovation plan." }, { factor_key: "extended_hold", severity: "moderate", narrative: "A 19-month flip closing at a loss suggests execution risk." } ],
  recommendations: [ { priority: "must", narrative: "Obtain the full complaint and counsel's status before any term sheet." }, { priority: "must", narrative: "Require a currently-licensed, insured GC of record." } ],
};

// ── Westbrook — the Damon-shaped MFR value-add centerpiece ──────────────────
// An 8-unit Sacramento value-add by a highly-experienced sponsor with a
// VERIFIABLE (deed-chain) track record. Weak in-place NOI -> the bridge is
// LTV-bound and carries an interest reserve; the EXIT (perm takeout at
// stabilization) is what underwrites repayment — exactly Noah's "does the exit
// make sense?" judgment. Sizing + takeout + per-investor best-execution are
// computed by the REAL engine against the seeded Colchis/Oakhurst buy-boxes, so
// the demo is engine-accurate, not hand-faked.
const AI_WESTBROOK = {
  schema_version: 2,
  summary:
    "Highly-experienced Sacramento multifamily operator with four deed-verified value-add exits, a clean entity, and no litigation or sanctions exposure. In-place coverage is thin (value-add basis) so the bridge sizes to as-is LTV and carries an interest reserve; the stabilized exit supports a permanent takeout that repays the bridge with cushion.",
  risk_rating: "low",
  pillar_assessments: {
    entity: "Active CA LLC since 2017; current filings; third-party registered agent.",
    track_record: "Four ATTOM/deed-verified multifamily value-add exits, 2019–2025, each a completed reposition held 18–26 months.",
    litigation: "No federal cases found.",
    gc: "Owner-managed reposition; licensed GC of record with verified insurance.",
    sanctions: "No OFAC or OpenSanctions matches.",
  },
  strengths: [
    { title: "Verified, on-thesis track record", narrative: "Four prior 5–12-unit value-add repositions, all deed-verified, all stabilized and exited or refinanced." },
    { title: "Exit underwrites the loan", narrative: "Stabilized NOI supports a permanent takeout above the bridge balance — the bridge is collateralized by a credible refinance, not just as-is value." },
  ],
  risks: [
    { factor_key: "interest_reserve", severity: "minor", narrative: "Thin in-place coverage requires an interest reserve through stabilization; confirm the reserve is sized to the 18-month plan." },
  ],
  recommendations: [
    { priority: "should", narrative: "Confirm the rent-growth assumption behind the $228k stabilized NOI against current submarket comps." },
    { priority: "should", narrative: "Verify the interest reserve covers debt service to the modeled 18-month stabilization." },
  ],
};

async function seedWestbrook(): Promise<string> {
  const v = await ins("borrower_validations", {
    id: VID.westbrook,
    org_id: ORG_ID, borrower_name: "Westbrook Capital Partners LLC", borrower_entity_name: "Westbrook Capital Partners LLC",
    guarantor_name: "Alana Westbrook", overall_status: "verified", confidence_score: 94,
    experience_tier: 1, validation_date: "2026-06-23T16:00:00Z", property_count: 4, flag_count: 0,
    ai_analysis: AI_WESTBROOK, ai_analysis_version: 2,
  });

  await ins("entity_checks", {
    validation_id: v, entity_name: "Westbrook Capital Partners LLC", state: "CA",
    entity_type: "LLC", sos_status: "active", formation_date: "2017-05-22",
    last_filing_date: "2025-04-10", registered_agent: "CT Corporation System",
    source_url: "https://bizfileonline.sos.ca.gov/", confidence: "high", flags: [],
  });
  const mfExits = [
    { property_address: "1820 T Street, Sacramento, CA 95811", acquisition_date: "2019-02-15", disposition_date: "2021-04-30", acquisition_price: 1450000, disposition_price: 2180000, rehab_cost: 360000, project_type: "rehab", outcome: "completed", hold_months: 26, profit: 370000, confidence: "high", verified: true },
    { property_address: "3344 5th Ave, Sacramento, CA 95817", acquisition_date: "2020-09-01", disposition_date: "2022-06-15", acquisition_price: 1720000, disposition_price: 2510000, rehab_cost: 420000, project_type: "rehab", outcome: "completed", hold_months: 21, profit: 370000, confidence: "high", verified: true },
    { property_address: "915 Broadway, Sacramento, CA 95818", acquisition_date: "2022-01-20", disposition_date: "2023-08-10", acquisition_price: 2050000, disposition_price: 2890000, rehab_cost: 510000, project_type: "rehab", outcome: "completed", hold_months: 18, profit: 330000, confidence: "high", verified: true },
    { property_address: "2210 P Street, Sacramento, CA 95816", acquisition_date: "2023-05-05", disposition_date: "2025-03-28", acquisition_price: 2380000, disposition_price: 3360000, rehab_cost: 560000, project_type: "rehab", outcome: "completed", hold_months: 22, profit: 420000, confidence: "high", verified: true },
  ];
  for (const p of mfExits) await ins("track_record_entries", { validation_id: v, source: "attom", ...p });
  await ins("gc_validations", {
    validation_id: v, gc_name: "Westbrook Build (in-house)", license_number: "1041220",
    license_state: "CA", license_status: "active", license_classification: "B - General Building",
    expiration_date: "2027-02-28", insurance_verified: true, confidence: "high",
    source_url: "https://www.cslb.ca.gov/", disciplinary_actions: [],
  });
  await ins("sanctions_checks", {
    validation_id: v, borrower_name: "Westbrook Capital Partners LLC", result: "clear",
    match_count: 0, matches: [], sources_searched: ["OFAC SDN", "OpenSanctions Consolidated"], source: "OpenSanctions",
  });
  await ins("risk_factors", { validation_id: v, factor_key: "entity_status", severity: "none", explanation: "Entity is active and in good standing with CA SOS since 2017.", contributing_data: { sos_status: "active" } });
  await ins("risk_factors", { validation_id: v, factor_key: "interest_reserve", severity: "minor", explanation: "Value-add basis: in-place coverage below 1.0x through stabilization; deal carries an interest reserve.", contributing_data: { months_to_stabilize: 18 } });

  // ── Engine-computed sizing + exit + best execution ────────────────────────
  const base: SizingInputs = {
    name: "1820 R Street — 8-unit value-add",
    purchasePrice: 2_400_000, rehabBudget: 600_000, closingCosts: 90_000,
    currentNOI: 138_000, stabilizedNOI: 228_000,
    goingInCapRate: 0.0575, exitCapRate: 0.055,
    rate: 0.095, termMonths: 24,
    maxLTV: 0.75, maxLTC: 0.70, maxLoanToARV: 0.70, minDebtYield: 0.05,
    coverageBasis: "current",
  };
  const sizing = underwrite(base);
  const takeout = sizeTakeout({
    stabilizedValue: sizing.stabilizedValue!, stabilizedNOI: base.stabilizedNOI!,
    bridgeBalanceAtExit: sizing.maxLoan,
    takeoutMaxLTV: 0.70, takeoutMinDSCR: 1.25, takeoutMinDebtYield: 0.05,
    takeoutRate: Math.max(0.06, base.rate - 0.025), takeoutAmortizationMonths: 360,
    bridgeTermMonths: 24, monthsToStabilize: 18,
  });
  const stabilization = stabilizationPath({
    currentNOI: base.currentNOI, stabilizedNOI: base.stabilizedNOI!, monthsToStabilize: 18,
    loanAmount: sizing.maxLoan, rate: base.rate, targetDSCR: 1.25,
  });
  const interestReserve = sizeInterestReserve({
    loanAmount: sizing.maxLoan, rate: base.rate, reserveMonths: 18,
    currentNOI: base.currentNOI, stabilizedNOI: base.stabilizedNOI!,
  });
  const sizingWithExit = { schema_version: 1, ...sizing, takeout, stabilization, interestReserve };

  const deal: DealParams = {
    loan_type: "bridge", property_type: "small_multifamily", property_state: "CA",
    purchase_price: 2_400_000, loan_amount: Math.round(sizing.maxLoan), arv: sizing.stabilizedValue,
    rehab_budget: 600_000, construction_budget: null, borrower_fico: 745, borrower_experience: 12,
    occupancy: "non_owner_occupied", unit_count: 8, is_rural: false, loan_purpose: "purchase",
    borrower_name: "Westbrook Capital Partners LLC", property_address: "1820 R Street, Sacramento, CA 95811",
  };

  const { data: investors } = await db.from("investors").select("id, display_name").eq("org_id", ORG_ID);
  const investorList = investors ?? [];
  let perInvestor: ReturnType<typeof sizeAllInvestors> = [];
  if (investorList.length > 0) {
    const { data: criteria } = await db
      .from("investor_criteria")
      .select("investor_id, criteria_key, criteria_value")
      .in("investor_id", investorList.map((i) => i.id))
      .is("effective_to", null);
    const byInvestor: Record<string, { criteria_key: string; criteria_value: unknown }[]> = {};
    for (const row of criteria ?? []) (byInvestor[row.investor_id] ??= []).push({ criteria_key: row.criteria_key, criteria_value: row.criteria_value });
    const rulesById: Record<string, InvestorRules> = {};
    const results = investorList.map((inv) => {
      const rules = assembleRulesFromCriteria(byInvestor[inv.id] ?? []);
      rulesById[inv.id] = rules;
      return evaluateDealForInvestor(deal, { id: inv.id, display_name: inv.display_name, rules });
    });
    perInvestor = sizeAllInvestors(base, results, rulesById);

    const evalId = await ins("deal_evaluations", {
      org_id: ORG_ID, validation_id: v, purchase_price: 2_400_000, arv: Math.round(sizing.stabilizedValue!),
      rehab_budget: 600_000, loan_amount: Math.round(sizing.maxLoan), loan_type: "bridge", property_type: "small_multifamily",
      location: "Seed — Sacramento, CA", sponsor_experience_tier: 1, fico: 745,
      additional_params: { occupancy: "non_owner_occupied", unit_count: 8, is_rural: false, loan_purpose: "purchase", borrower_name: "Westbrook Capital Partners LLC", property_address: "1820 R Street, Sacramento, CA 95811" },
    });
    for (const r of results) {
      await ins("deal_eligibility_results", {
        deal_evaluation_id: evalId, investor_id: r.investor_id, result: r.result, reasoning: r.reasoning,
        computed_terms: {
          max_ltv: r.max_ltv, max_ltc: r.max_ltc, max_ltarv: r.max_ltarv,
          estimated_rate_pct: r.estimated_rate_pct, estimated_points: r.estimated_points,
          matched_tier_index: r.matched_tier_index, applied_adjusters: r.applied_adjusters,
          boundary_warnings: r.boundary_warnings, failure_reasons: r.failure_reasons,
        },
      });
    }

    const best = perInvestor.find((p) => p.sizing != null);
    const judgment = {
      schema_version: 1,
      headline: `Pursue — exit clears the bridge at ${takeout.takeoutCoverage.toFixed(2)}x; best execution via ${best?.investor_name ?? "—"}.`,
      framework: [
        { dimension: "sponsor", severity: "strength", read: "Four deed-verified Sacramento value-add exits; in-house GC.", flags: [] },
        { dimension: "economics", severity: "neutral", read: `Value-add basis: in-place coverage thin, but stabilized NOI of $${base.stabilizedNOI!.toLocaleString()} supports the plan.`, flags: [] },
        { dimension: "market", severity: "neutral", read: "Sacramento midtown multifamily; established rent-growth submarket.", flags: [] },
        { dimension: "structure", severity: "neutral", read: `Bridge sizes to ${sizing.bindingConstraint} at $${Math.round(sizing.maxLoan).toLocaleString()}; carries an interest reserve to stabilization.`, flags: [] },
        { dimension: "exit", severity: "strength", read: `Permanent takeout of $${Math.round(takeout.maxTakeout).toLocaleString()} (${takeout.bindingConstraint}-bound) repays the bridge with a $${Math.round(takeout.cushion).toLocaleString()} cushion.`, flags: [] },
      ],
      dealKillers: [],
      fiveConcept: "Borrow/buy clean; the governing question is the EXIT — modeled takeout exceeds the bridge balance, so the refinance underwrites repayment.",
      recommendation: { stance: "pursue", rationale: "Verified sponsor, credible exit above the bridge balance, in-box best-execution at the as-is-LTV-bound amount." },
      memo: `Engine sizes the bridge at $${Math.round(sizing.maxLoan).toLocaleString()} (${sizing.bindingConstraint}-bound on as-is value). In-place coverage is below 1.0x on a value-add basis, so the loan carries an interest reserve. The exit underwrites repayment: at stabilization ($${Math.round(takeout.stabilizedValue).toLocaleString()} value, $${base.stabilizedNOI!.toLocaleString()} NOI) the permanent takeout sizes to $${Math.round(takeout.maxTakeout).toLocaleString()} (${takeout.bindingConstraint}-bound), ${takeout.takeoutCoverage.toFixed(2)}x the bridge balance — repaying it with a $${Math.round(takeout.cushion).toLocaleString()} cushion in ${takeout.termSufficient ? "under" : "beyond"} the 24-month term. Best execution: ${best ? `${best.investor_name} at $${Math.round(best.sizing!.maxLoan).toLocaleString()} @ ${best.rate_used_pct?.toFixed(2)}%` : "no investor in box"}.`,
      model: "claude-opus-4-8",
    };
    await ins("uw_models", {
      org_id: ORG_ID, deal_evaluation_id: evalId, validation_id: v, template: "bridge_value_add",
      inputs: { schema_version: 1, ...base },
      sizing: sizingWithExit, per_investor: perInvestor,
      judgment, judgment_version: 1, judgment_model: "claude-opus-4-8",
    });
  }

  console.log(
    `  Westbrook: bridge sized $${Math.round(sizing.maxLoan).toLocaleString()} (${sizing.bindingConstraint}); ` +
    `takeout $${Math.round(takeout.maxTakeout).toLocaleString()} @ ${takeout.takeoutCoverage.toFixed(2)}x (${takeout.refinanceable ? "clears" : "shorts"}); ` +
    `best-exec ${perInvestor.find((p) => p.sizing)?.investor_name ?? "n/a"}.`,
  );
  return v;
}

async function seedUnderwriter() {
  const names = ["Maple Ridge Capital LLC", "Cardinal Holdings LLC", "Westbrook Capital Partners LLC"];
  await cleanup(names);
  const westbrookVid = await seedWestbrook();

  // ── Validation 1: clean / verified / LOW
  const v1 = await ins("borrower_validations", {
    id: VID.clean,
    org_id: ORG_ID, borrower_name: "Maple Ridge Capital LLC", borrower_entity_name: "Maple Ridge Capital LLC",
    guarantor_name: "Daniel R. Holloway", overall_status: "verified", confidence_score: 92,
    experience_tier: 2, validation_date: "2026-06-18T17:00:00Z", property_count: 3, flag_count: 0,
    ai_analysis: AI_CLEAN, ai_analysis_version: 2,
  });
  await seedCleanPillars(v1);

  // ── Validation 2: flagged / HIGH
  const v2 = await ins("borrower_validations", {
    id: VID.flagged,
    org_id: ORG_ID, borrower_name: "Cardinal Holdings LLC", borrower_entity_name: "Cardinal Holdings LLC",
    guarantor_name: "Marcus T. Vale", overall_status: "flagged", confidence_score: 78,
    experience_tier: 3, validation_date: "2026-06-20T15:30:00Z", property_count: 1, flag_count: 3,
    ai_analysis: AI_FLAGGED, ai_analysis_version: 2,
  });
  await seedFlaggedPillars(v2);

  // ── Investors (seeded separately) → eligibility + mandate
  const { data: investors } = await db.from("investors").select("id, display_name").eq("org_id", ORG_ID);
  if (!investors?.length) {
    console.warn("⚠ No investors for this org — run seed-sample-investors.ts first for full evaluate/mandate render.");
  }

  // ── Deal evaluation tied to validation 1 + per-investor eligibility
  const evalId = await ins("deal_evaluations", {
    org_id: ORG_ID, validation_id: v1, purchase_price: 640000, arv: 905000, rehab_budget: 110000,
    loan_amount: 560000, loan_type: "fix_flip", property_type: "sfr", location: "Seed — Folsom, CA",
    sponsor_experience_tier: 2, fico: 728,
    additional_params: { occupancy: "non_owner_occupied", unit_count: 1, is_rural: false, loan_purpose: "purchase", borrower_name: "Maple Ridge Capital LLC", property_address: "77 Cedar Ct, Folsom, CA 95630" },
  });
  const verdicts: Array<"pass" | "conditional" | "fail"> = ["pass", "conditional", "fail"];
  (investors ?? []).slice(0, 3).forEach(() => {}); // keep lint quiet
  for (let i = 0; i < (investors ?? []).length && i < 3; i++) {
    const inv = investors![i];
    const v = verdicts[i] ?? "pass";
    await ins("deal_eligibility_results", {
      deal_evaluation_id: evalId, investor_id: inv.id, result: v,
      reasoning: v === "pass" ? "Within box on all gates." : v === "conditional" ? "Eligible with LTV haircut and rate adjuster applied." : "Loan amount below this investor's minimum / FICO under tier floor.",
      computed_terms: v === "fail"
        ? { failure_reasons: [{ field: "min_loan_amount", rule: "gte", expected: 250000, actual: 560000 }, { field: "min_fico", rule: "gte", expected: 740, actual: 728 }] }
        : { max_ltv: 0.78, max_ltc: 0.88, max_ltarv: 0.74, estimated_rate_pct: v === "conditional" ? 10.25 : 9.5, estimated_points: 2, matched_tier_index: 1, applied_adjusters: v === "conditional" ? [{ name: "LTV ≥ 75%", rate_bps: 25, points_bps: 0 }] : [], boundary_warnings: v === "conditional" ? [{ field: "ltv", message: "Near max LTV for this tier." }] : [] },
    });
  }

  // ── UW model tied to validation 1
  await ins("uw_models", {
    org_id: ORG_ID, deal_evaluation_id: evalId, validation_id: v1, template: "bridge_value_add",
    inputs: { schema_version: 1, name: "77 Cedar Ct — value-add", purchasePrice: 640000, rehabBudget: 110000, closingCosts: 18000, currentNOI: 0, stabilizedNOI: 0, goingInCapRate: 0, exitCapRate: 0, rate: 9.5, termMonths: 12, maxLTV: 0.8, maxLTC: 0.85, maxLoanToARV: 0.74 },
    sizing: { schema_version: 1, asIsValue: 640000, stabilizedValue: 905000, totalProjectCost: 768000, constraints: [ { key: "LTV", label: "Loan-to-Value", maxLoan: 512000, binding: false, basis: "80% of as-is $640k" }, { key: "LTC", label: "Loan-to-Cost", maxLoan: 652800, binding: false, basis: "85% of cost $768k" }, { key: "LoanToARV", label: "Loan-to-ARV", maxLoan: 669700, binding: false, basis: "74% of ARV $905k" } ], maxLoan: 512000, bindingConstraint: "LTV", equityRequired: 256000, annualDebtService: 48640, mortgageConstant: 0.095, ltv: 0.8, ltc: 0.667, dscrCurrent: 0, debtYieldCurrent: 0, projectProfit: 119000, equityMultiple: 1.46, returnOnCost: 0.178 },
    judgment: { schema_version: 1, headline: "Solid value-add flip; LTV-bound at $512k leaves a financeable equity gap.", framework: [ { dimension: "sponsor", severity: "strength", read: "Repeat CA flipper with profitable comps.", flags: [] }, { dimension: "economics", severity: "neutral", read: "~$119k projected profit at a 1.46x equity multiple — adequate, not exceptional.", flags: [] }, { dimension: "market", severity: "neutral", read: "Folsom SFR; liquid resale market.", flags: [] }, { dimension: "structure", severity: "neutral", read: "LTV is the binding constraint; sponsor funds $256k equity.", flags: [] }, { dimension: "exit", severity: "strength", read: "Sale exit with comp support at ARV.", flags: [] } ], dealKillers: [], fiveConcept: "Clean on borrow/buy; exit hinges on holding the ARV through resale.", recommendation: { stance: "pursue", rationale: "In-box, profitable, well-collateralized at the LTV-bound amount." }, memo: "Engine sizes max loan at $512,000 (LTV-bound). Sponsor equity of $256k is consistent with a repeat operator. Projected profit ~$119k / 1.46x. Pursue at the sized amount.", model: "claude-opus-4-8" },
    judgment_version: 1, judgment_model: "claude-opus-4-8",
  });

  // ── Mandate (capital provider) + assessments
  if (investors?.length) {
    const inv = investors[0];
    const mandateId = await ins("investor_mandates", {
      org_id: ORG_ID, investor_id: inv.id, name: `Seed — ${inv.display_name} buy-box`,
      gates: { schema_version: 1, max_risk_tier: "MEDIUM", require_sos_active: true, disallow_active_litigation: true, disallow_sanctions_hit: true, max_experience_tier: 3, min_confidence_score: 80, require_gc_active: true, require_eligibility_pass: false },
      enabled: true,
    });
    await ins("mandate_assessments", { org_id: ORG_ID, validation_id: v1, mandate_id: mandateId, investor_id: inv.id, result: "pass", failures: [] });
    await ins("mandate_assessments", { org_id: ORG_ID, validation_id: westbrookVid, mandate_id: mandateId, investor_id: inv.id, result: "pass", failures: [] });
    await ins("mandate_assessments", {
      org_id: ORG_ID, validation_id: v2, mandate_id: mandateId, investor_id: inv.id, result: "fail",
      failures: [ { gate: "disallow_active_litigation", message: "Active federal civil suit on record." }, { gate: "max_risk_tier", message: "Risk tier HIGH exceeds mandate max of MEDIUM." }, { gate: "require_gc_active", message: "Named GC license is expired." } ],
    });
  }

  console.log(`Underwriter org seeded: v1=${v1} (verified/LOW), v2=${v2} (flagged/HIGH), eval=${evalId}.`);
}

async function seedSolo() {
  const names = ["Riverside Property Group LLC"];
  await cleanup(names);
  const v = await ins("borrower_validations", {
    id: VID.solo,
    org_id: ORG_ID, borrower_name: "Riverside Property Group LLC", borrower_entity_name: "Riverside Property Group LLC",
    guarantor_name: "Ellen Park", overall_status: "partial", confidence_score: 64,
    experience_tier: 4, validation_date: "2026-06-21T19:00:00Z", property_count: 1, flag_count: 0,
  });
  await ins("entity_checks", { validation_id: v, entity_name: "Riverside Property Group LLC", state: "AZ", entity_type: "LLC", sos_status: "active", formation_date: "2024-11-05", registered_agent: "Park Registered Agents LLC", confidence: "medium", flags: [] });
  await ins("track_record_entries", { validation_id: v, source: "manual", property_address: "210 Mill St, Tempe, AZ 85281", acquisition_date: "2025-05-01", project_type: "flip", outcome: "in_progress", confidence: "low", verified: false });
  await ins("sanctions_checks", { validation_id: v, borrower_name: "Riverside Property Group LLC", result: "clear", match_count: 0, matches: [], sources_searched: ["OFAC SDN"], source: "OFAC SDN (direct)" });
  await ins("risk_factors", { validation_id: v, factor_key: "entity_status", severity: "minor", explanation: "Entity formed recently (Nov 2024); limited operating history.", contributing_data: { sos_status: "active" } });
  console.log(`Solo org seeded: v=${v} (partial), single new-entity borrower.`);
}

async function main() {
  console.log(`Seeding ${PERSONA} data for org ${ORG_ID}…`);
  if (PERSONA === "solo") await seedSolo();
  else await seedUnderwriter();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
