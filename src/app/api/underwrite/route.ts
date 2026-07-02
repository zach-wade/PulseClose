// POST /api/underwrite — size a bridge/CRE deal and persist a uw_model.
//
// Computes (a) the deal-level loan sizing (max loan = MIN across the lender's
// LTV/LTC/LTARV/DSCR/debt-yield) and (b) per-investor best-execution sizing
// (each investor's caps + the rate the eligibility engine prices them at), then
// persists a uw_models row. The AI judgment is a separate, explicit step
// (POST /api/underwrite/[id]/judge) so token spend is deliberate and gated.
//
// GET /api/underwrite — list recent uw_models for the org.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  assembleRulesFromCriteria,
  evaluateDealForInvestor,
  type DealParams,
  type InvestorRules,
} from "@/lib/evaluate/engine";
import { underwrite, type SizingInputs, type SizingResult } from "@/lib/underwriting/sizing";
import { sizeTakeout, stressTakeout } from "@/lib/underwriting/exit";
import { resolveUwAssumptions } from "@/lib/underwriting/org-assumptions";
import { stabilizationPath } from "@/lib/underwriting/stabilization";
import { sizeInterestReserve } from "@/lib/underwriting/reserve";
import { sizeAllInvestors } from "@/lib/underwriting/per-investor";
import { sizingModeForLoanType, sizeDeal, type SizeDealResult } from "@/lib/underwriting/dispatch";
import { buildStructuredInput, summarizeStructured } from "@/lib/underwriting/structured-request";
import {
  parseUwSizingInputsV1Strict,
  parseUwSizingResultV1Strict,
  parseUwStructuredResultV1Strict,
} from "@/lib/schemas/jsonb";
import { emitActivity } from "@/lib/events/emit";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";

export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const validationId = new URL(request.url).searchParams.get("validation_id");

  // Validation-scoped listing for the handoff model picker. Matches models
  // linked directly to the validation OR via one of its deal evaluations
  // (covers models sized from the evaluate page before the validation_id
  // backfill landed). Returns lightweight summaries for the dropdown.
  if (validationId) {
    const { data: evals } = await supabase
      .from("deal_evaluations")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("validation_id", validationId);
    const evalIds = (evals ?? []).map((e) => e.id);

    const orParts = [`validation_id.eq.${validationId}`];
    if (evalIds.length > 0) orParts.push(`deal_evaluation_id.in.(${evalIds.join(",")})`);

    const { data, error } = await supabase
      .from("uw_models")
      .select("id, template, sizing, structured, judgment, created_at")
      .eq("org_id", profile.org_id)
      .or(orParts.join(","))
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const summaries = (data ?? []).map((m) => {
      const sizing = m.sizing as { maxLoan?: number; bindingConstraint?: string } | null;
      const structured = m.structured as { mode?: string; result?: Record<string, unknown> } | null;
      const judgment = m.judgment as { recommendation?: { stance?: string } } | null;
      // Structured-only models carry their max loan in the mode-specific result.
      const sr = structured?.result as
        | { recommendedMaxLoan?: number; totalLoan?: number; maxLoan?: number; bindingConstraint?: string; targetDSCR?: number }
        | undefined;
      const structuredMax = sr ? sr.recommendedMaxLoan ?? sr.maxLoan ?? sr.totalLoan ?? null : null;
      return {
        id: m.id,
        template: m.template,
        mode: structured?.mode ?? "bridge",
        created_at: m.created_at,
        max_loan: sizing?.maxLoan ?? structuredMax ?? null,
        binding_constraint:
          sizing?.bindingConstraint ?? sr?.bindingConstraint ?? (structured?.mode ? structured.mode : null),
        stance: judgment?.recommendation?.stance ?? null,
      };
    });
    return NextResponse.json(summaries);
  }

  const { data, error } = await supabase
    .from("uw_models")
    .select("id, template, inputs, sizing, judgment_version, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

type UnderwriteBody = Partial<DealParams> & {
  // sizing inputs (snake_case from the form)
  deal_name?: string | null;
  current_noi?: number | null;
  stabilized_noi?: number | null;
  going_in_cap_rate?: number | null; // decimal (0.06) or percent (6) — normalized below
  exit_cap_rate?: number | null;
  rate?: number | null; // decimal or percent — normalized below
  term_months?: number | null;
  amortization_months?: number | null;
  closing_costs?: number | null;
  cost_spent_to_date?: number | null; // capital already sunk (in-progress refi) — finding #16
  max_ltv?: number | null; // decimal or percent
  max_ltc?: number | null;
  max_ltarv?: number | null;
  min_dscr?: number | null;
  min_debt_yield?: number | null; // decimal or percent
  coverage_basis?: "current" | "stabilized" | null;
  selling_cost_pct?: number | null;
  // exit / takeout sizing assumptions (the permanent loan that repays the
  // bridge). Optional — sensible defaults applied when the deal has stabilized
  // economics so the exit story always surfaces.
  takeout_max_ltv?: number | null;
  takeout_min_dscr?: number | null;
  takeout_min_debt_yield?: number | null;
  takeout_rate?: number | null;
  takeout_amort_months?: number | null;
  months_to_stabilize?: number | null;
  target_dscr?: number | null;
  // ── structured-mode inputs (RTL / construction / DSCR) — UX-2 ──
  as_is_value?: number | null;
  purchase_advance_pct?: number | null; // RTL/construction initial advance ÷ purchase
  rehab_funding_pct?: number | null;
  prepaid_interest_months?: number | null;
  closing_costs_pct?: number | null;
  tier?: number | null; // borrower tier 1|2|3 (RTL buy-box row)
  rehab_type?: string | null; // Light|Moderate|Heavy
  reserve_months?: number | null; // construction capitalized interest reserve
  reserve_discount?: number | null;
  construction_holdback_pct?: number | null;
  origination_fee_pct?: number | null;
  fixed_closing_costs?: number | null;
  monthly_rent?: number | null; // DSCR
  monthly_taxes?: number | null;
  monthly_insurance?: number | null;
  monthly_hoa?: number | null;
  property_value?: number | null;
  // links
  deal_evaluation_id?: string | null;
  validation_id?: string | null;
};

// A user may type "75" or "0.75" for an LTV, "9.5" or "0.095" for a rate.
// Normalize ratio-style fields to decimals: anything > 1 is treated as a percent.
function asRatio(v: number | null | undefined): number | undefined {
  if (v == null || Number.isNaN(v)) return undefined;
  return v > 1 ? v / 100 : v;
}
function num(v: number | null | undefined): number | undefined {
  return v == null || Number.isNaN(v) ? undefined : v;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`underwrite:${profile.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  const body = (await request.json()) as UnderwriteBody;

  const rate = asRatio(body.rate);

  // Per-org underwriting assumptions (principle 14) — the house sizing caps,
  // exit/takeout terms, and DSCR target as CONFIG, used as fallbacks below when
  // the deal doesn't override them. Absent/invalid → app defaults (fails safe).
  const supabase = createAdminClient();
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("underwriting_assumptions")
    .eq("id", profile.org_id)
    .maybeSingle();
  const assumptions = resolveUwAssumptions(orgRow?.underwriting_assumptions);

  // Resolve the sizing mode from loan_type, letting the economics override a
  // mislabeled deal (CALIBRATION #14): heavy build cost vs. as-is ⇒ construction.
  const mode = sizingModeForLoanType(body.loan_type, {
    rehabBudget: num(body.rehab_budget),
    asIsValue: num(body.as_is_value),
    constructionBudget: num(body.construction_budget),
  });

  // ── Structured modes (RTL / ground-up construction / DSCR): the deal-type
  //    engine produces a structured deal (proceeds waterfall / Sources+Uses /
  //    DSCR sizing) rather than the bridge income model. ──
  let structured: SizeDealResult | null = null;
  const structuredInput = mode === "bridge" ? null : buildStructuredInput(mode, { ...body, rate });
  if (structuredInput) {
    try {
      structured = sizeDeal(structuredInput);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not size the deal." },
        { status: 400 },
      );
    }
  }

  // ── Bridge (income / value-add): the original path. Runs when the mode is
  //    bridge, or when bridge economics are present and we haven't already sized
  //    a structured deal. Requires purchase price + in-place NOI + going-in cap +
  //    rate, plus at least one constraint. ──
  const purchasePrice = num(body.purchase_price);
  const currentNOI = num(body.current_noi);
  const goingInCapRate = asRatio(body.going_in_cap_rate);
  const bridgeInputsPresent = !!(purchasePrice && currentNOI && goingInCapRate && rate);

  // Depth fields (takeout/stabilization/interestReserve) are spread onto the
  // sizing result below; type the augment explicitly (the persist parser validates).
  let sizing:
    | (SizingResult & { takeout?: unknown; stabilization?: unknown; interestReserve?: unknown })
    | null = null;
  let sizingInputs: SizingInputs | null = null;

  if (mode === "bridge" || (bridgeInputsPresent && !structured)) {
    if (!purchasePrice || !currentNOI || !goingInCapRate || !rate) {
      return NextResponse.json(
        { error: "purchase_price, current_noi, going_in_cap_rate, and rate are required to size a bridge deal." },
        { status: 400 },
      );
    }
    sizingInputs = {
      name: body.deal_name ?? body.borrower_name ?? undefined,
      purchasePrice,
      rehabBudget: num(body.rehab_budget),
      closingCosts: num(body.closing_costs),
      costSpentToDate: num(body.cost_spent_to_date),
      currentNOI,
      stabilizedNOI: num(body.stabilized_noi),
      goingInCapRate,
      exitCapRate: asRatio(body.exit_cap_rate),
      rate,
      termMonths: num(body.term_months),
      amortizationMonths: num(body.amortization_months),
      // House caps/floors fall back to the org's assumptions (principle 14) when
      // the deal doesn't send them — so a bridge deal always sizes on house policy.
      maxLTV: asRatio(body.max_ltv) ?? assumptions.house_max_ltv,
      maxLTC: asRatio(body.max_ltc) ?? assumptions.house_max_ltc,
      maxLoanToARV: asRatio(body.max_ltarv) ?? assumptions.house_max_ltarv,
      minDSCR: num(body.min_dscr) ?? assumptions.house_min_dscr,
      minDebtYield: asRatio(body.min_debt_yield) ?? assumptions.house_min_debt_yield,
      coverageBasis: body.coverage_basis ?? undefined,
      sellingCostPct: asRatio(body.selling_cost_pct),
    };
    const hasConstraint =
      sizingInputs.maxLTV != null || sizingInputs.maxLTC != null ||
      sizingInputs.maxLoanToARV != null || sizingInputs.minDSCR != null ||
      sizingInputs.minDebtYield != null;
    if (!hasConstraint) {
      return NextResponse.json(
        { error: "Provide at least one sizing constraint (max LTV, max LTC, max LTARV, min DSCR, or min debt yield)." },
        { status: 400 },
      );
    }
    try {
      sizing = underwrite(sizingInputs);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not size the deal." },
        { status: 400 },
      );
    }
  }

  if (!structured && !sizing) {
    return NextResponse.json(
      {
        error:
          "Provide the structured inputs for this loan type, or full bridge economics (purchase_price + current_noi + going_in_cap_rate + rate + one constraint).",
      },
      { status: 400 },
    );
  }

  // Exit / takeout sizing — "does the exit make sense?" Size the permanent
  // takeout at stabilization and test whether it repays the bridge balance.
  // Only when the deal carries stabilized economics (stabilizedNOI + exit cap).
  // Perm terms come from the lender's takeout assumptions, with documented
  // defaults (70% LTV / 1.25x DSCR / 30yr amort, perm rate ~250bps inside the
  // bridge rate floored at 6%) so the exit story always surfaces.
  if (sizing && sizingInputs && sizing.stabilizedValue != null && sizingInputs.stabilizedNOI != null) {
    try {
      const takeoutInputs = {
        stabilizedValue: sizing.stabilizedValue,
        stabilizedNOI: sizingInputs.stabilizedNOI,
        bridgeBalanceAtExit: sizing.maxLoan, // interest-only bridge => balance = loan
        takeoutMaxLTV: asRatio(body.takeout_max_ltv) ?? assumptions.takeout_max_ltv,
        takeoutMinDSCR: num(body.takeout_min_dscr) ?? assumptions.takeout_min_dscr,
        takeoutMinDebtYield:
          asRatio(body.takeout_min_debt_yield) ?? sizingInputs.minDebtYield,
        takeoutRate:
          asRatio(body.takeout_rate) ??
          Math.max(assumptions.takeout_rate_floor, sizingInputs.rate - assumptions.takeout_rate_spread_bps / 10_000),
        takeoutAmortizationMonths: num(body.takeout_amort_months) ?? assumptions.takeout_amort_months,
        bridgeTermMonths: sizingInputs.termMonths,
        monthsToStabilize: num(body.months_to_stabilize),
      };
      // Base takeout + the NOI-stress grid ("does the bridge STILL exit if NOI
      // comes in light?" — CALIBRATION #26). The grid reuses the same engine.
      const takeout = { ...sizeTakeout(takeoutInputs), stressGrid: stressTakeout(takeoutInputs) };
      sizing = { ...sizing, takeout };
    } catch {
      // Takeout is additive depth — never block sizing if it can't resolve.
    }
  }

  // Stabilization-path coverage + interest-reserve sizing — the temporal +
  // carry depth (Damon's "years to 1.20–1.25x" and "some investors want an
  // interest reserve"). Both need a stabilization horizon; default 18 mo.
  if (sizing && sizingInputs && sizingInputs.stabilizedNOI != null) {
    const monthsToStabilize = num(body.months_to_stabilize) ?? 18;
    try {
      const stabilization = stabilizationPath({
        currentNOI: sizingInputs.currentNOI,
        stabilizedNOI: sizingInputs.stabilizedNOI,
        monthsToStabilize,
        loanAmount: sizing.maxLoan,
        rate: sizingInputs.rate,
        amortizationMonths: sizingInputs.amortizationMonths,
        targetDSCR: num(body.target_dscr) ?? assumptions.dscr_target,
      });
      const interestReserve = sizeInterestReserve({
        loanAmount: sizing.maxLoan,
        rate: sizingInputs.rate,
        amortizationMonths: sizingInputs.amortizationMonths,
        reserveMonths: monthsToStabilize,
        currentNOI: sizingInputs.currentNOI,
        stabilizedNOI: sizingInputs.stabilizedNOI,
      });
      sizing = { ...sizing, stabilization, interestReserve };
    } catch {
      // Additive depth — never block sizing.
    }
  }

  // Resolve validation linkage. When the model is sized from a deal
  // evaluation (the usual evaluate-page path) but no validation_id was
  // passed, inherit it from the evaluation so the handoff builder can find
  // this model by validation. Keeps uw_models.validation_id populated going
  // forward — the clean forward-fix for the handoff artifact.
  let validationId = body.validation_id ?? null;
  if (!validationId && body.deal_evaluation_id) {
    const { data: evalRow } = await supabase
      .from("deal_evaluations")
      .select("validation_id")
      .eq("id", body.deal_evaluation_id)
      .eq("org_id", profile.org_id)
      .maybeSingle();
    validationId = (evalRow?.validation_id as string | null) ?? null;
  }

  // Per-investor best-execution overlay (only when we can build a deal for the
  // eligibility engine — needs the structural deal fields). The sizing overlay
  // (sizeAllInvestors) is bridge-based, so it runs only when a bridge sizing was
  // produced; structured-mode per-investor pricing is A1+ (Phase 3).
  let per_investor: ReturnType<typeof sizeAllInvestors> = [];
  if (sizing && sizingInputs && body.loan_type && body.property_type && body.property_state && body.loan_amount) {
    const deal: DealParams = {
      loan_type: body.loan_type,
      property_type: body.property_type,
      property_state: body.property_state,
      purchase_price: purchasePrice ?? null,
      loan_amount: Number(body.loan_amount),
      arv: sizing.stabilizedValue ?? body.arv ?? null,
      rehab_budget: num(body.rehab_budget) ?? null,
      construction_budget: body.construction_budget ?? null,
      borrower_fico: body.borrower_fico ?? null,
      borrower_experience: body.borrower_experience ?? 0,
      occupancy: body.occupancy ?? "non_owner_occupied",
      unit_count: body.unit_count ?? 1,
      is_rural: body.is_rural ?? false,
      loan_purpose: body.loan_purpose ?? "purchase",
      borrower_name: body.borrower_name ?? null,
      property_address: body.property_address ?? null,
    };

    const { data: investors } = await supabase
      .from("investors")
      .select("id, display_name")
      .eq("org_id", profile.org_id);

    const investorList = investors ?? [];
    if (investorList.length > 0) {
      const investorIds = investorList.map((i) => i.id);
      const { data: criteria } = await supabase
        .from("investor_criteria")
        .select("investor_id, criteria_key, criteria_value")
        .in("investor_id", investorIds)
        .is("effective_to", null);

      const byInvestor: Record<string, { criteria_key: string; criteria_value: unknown }[]> = {};
      for (const row of criteria ?? []) {
        (byInvestor[row.investor_id] ??= []).push({
          criteria_key: row.criteria_key,
          criteria_value: row.criteria_value,
        });
      }

      const rulesById: Record<string, InvestorRules> = {};
      const results = investorList.map((inv) => {
        const rules = assembleRulesFromCriteria(byInvestor[inv.id] ?? []);
        rulesById[inv.id] = rules;
        return evaluateDealForInvestor(deal, { id: inv.id, display_name: inv.display_name, rules });
      });
      per_investor = sizeAllInvestors(sizingInputs, results, rulesById);
    }
  }

  // A mode-agnostic {maxLoan, bindingConstraint} summary for activity + response.
  const summary = structured
    ? summarizeStructured(structured)
    : { maxLoan: sizing!.maxLoan, bindingConstraint: sizing!.bindingConstraint };

  // The structured envelope (uw_models.structured). structured is only set for a
  // non-bridge mode, so the mode is always rtl|construction|dscr here.
  const structuredEnvelope =
    structured && structuredInput
      ? parseUwStructuredResultV1Strict({
          schema_version: 1,
          mode: structured.mode as "rtl" | "construction" | "dscr",
          loanType: body.loan_type ?? null,
          inputs: { ...structuredInput },
          result: { ...structured.result },
        })
      : null;

  // Persist (strict-parse the JSONB so schema_version is stamped + validated). A
  // row is either a bridge model (inputs + sizing) or a structured model
  // (structured) — the 00052 CHECK guarantees at least one is present.
  const { data: model, error: insertErr } = await supabase
    .from("uw_models")
    .insert({
      org_id: profile.org_id,
      deal_evaluation_id: body.deal_evaluation_id ?? null,
      validation_id: validationId,
      template: structured ? structured.mode : "bridge_value_add",
      inputs: sizing && sizingInputs ? parseUwSizingInputsV1Strict({ ...sizingInputs, schema_version: 1 }) : null,
      sizing: sizing ? parseUwSizingResultV1Strict({ ...sizing, schema_version: 1 }) : null,
      structured: structuredEnvelope,
      per_investor,
      created_by_user_id: profile.id,
    })
    .select("id")
    .single();

  if (insertErr || !model) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to persist underwriting model" },
      { status: 500 },
    );
  }

  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "sized_deal",
    subjectType: "uw_model",
    subjectId: model.id,
    metadata: {
      uw_model_id: model.id,
      mode,
      max_loan: Math.round(summary.maxLoan),
      binding_constraint: summary.bindingConstraint,
      investors_sized: per_investor.length,
    },
  });

  return NextResponse.json({ uw_model_id: model.id, mode, sizing, structured, per_investor });
}
