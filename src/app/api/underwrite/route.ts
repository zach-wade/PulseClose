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
import { underwrite, type SizingInputs } from "@/lib/underwriting/sizing";
import { sizeTakeout } from "@/lib/underwriting/exit";
import { stabilizationPath } from "@/lib/underwriting/stabilization";
import { sizeInterestReserve } from "@/lib/underwriting/reserve";
import { sizeAllInvestors } from "@/lib/underwriting/per-investor";
import {
  parseUwSizingInputsV1Strict,
  parseUwSizingResultV1Strict,
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
      .select("id, template, sizing, judgment, created_at")
      .eq("org_id", profile.org_id)
      .or(orParts.join(","))
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const summaries = (data ?? []).map((m) => {
      const sizing = m.sizing as { maxLoan?: number; bindingConstraint?: string } | null;
      const judgment = m.judgment as { recommendation?: { stance?: string } } | null;
      return {
        id: m.id,
        template: m.template,
        created_at: m.created_at,
        max_loan: sizing?.maxLoan ?? null,
        binding_constraint: sizing?.bindingConstraint ?? null,
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

  // Build the sizing inputs. Engine requires purchase price + in-place NOI +
  // going-in cap + rate, plus at least one constraint.
  const purchasePrice = num(body.purchase_price);
  const currentNOI = num(body.current_noi);
  const goingInCapRate = asRatio(body.going_in_cap_rate);
  const rate = asRatio(body.rate);

  if (!purchasePrice || !currentNOI || !goingInCapRate || !rate) {
    return NextResponse.json(
      {
        error:
          "purchase_price, current_noi, going_in_cap_rate, and rate are required to size a deal.",
      },
      { status: 400 },
    );
  }

  const sizingInputs: SizingInputs = {
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
    maxLTV: asRatio(body.max_ltv),
    maxLTC: asRatio(body.max_ltc),
    maxLoanToARV: asRatio(body.max_ltarv),
    minDSCR: num(body.min_dscr),
    minDebtYield: asRatio(body.min_debt_yield),
    coverageBasis: body.coverage_basis ?? undefined,
    sellingCostPct: asRatio(body.selling_cost_pct),
  };

  const hasConstraint =
    sizingInputs.maxLTV != null ||
    sizingInputs.maxLTC != null ||
    sizingInputs.maxLoanToARV != null ||
    sizingInputs.minDSCR != null ||
    sizingInputs.minDebtYield != null;
  if (!hasConstraint) {
    return NextResponse.json(
      {
        error:
          "Provide at least one sizing constraint (max LTV, max LTC, max LTARV, min DSCR, or min debt yield).",
      },
      { status: 400 },
    );
  }

  let sizing;
  try {
    sizing = underwrite(sizingInputs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not size the deal." },
      { status: 400 },
    );
  }

  // Exit / takeout sizing — "does the exit make sense?" Size the permanent
  // takeout at stabilization and test whether it repays the bridge balance.
  // Only when the deal carries stabilized economics (stabilizedNOI + exit cap).
  // Perm terms come from the lender's takeout assumptions, with documented
  // defaults (70% LTV / 1.25x DSCR / 30yr amort, perm rate ~250bps inside the
  // bridge rate floored at 6%) so the exit story always surfaces.
  if (sizing.stabilizedValue != null && sizingInputs.stabilizedNOI != null) {
    try {
      const takeout = sizeTakeout({
        stabilizedValue: sizing.stabilizedValue,
        stabilizedNOI: sizingInputs.stabilizedNOI,
        bridgeBalanceAtExit: sizing.maxLoan, // interest-only bridge => balance = loan
        takeoutMaxLTV: asRatio(body.takeout_max_ltv) ?? 0.7,
        takeoutMinDSCR: num(body.takeout_min_dscr) ?? 1.25,
        takeoutMinDebtYield:
          asRatio(body.takeout_min_debt_yield) ?? sizingInputs.minDebtYield,
        takeoutRate: asRatio(body.takeout_rate) ?? Math.max(0.06, rate - 0.025),
        takeoutAmortizationMonths: num(body.takeout_amort_months) ?? 360,
        bridgeTermMonths: sizingInputs.termMonths,
        monthsToStabilize: num(body.months_to_stabilize),
      });
      sizing = { ...sizing, takeout };
    } catch {
      // Takeout is additive depth — never block sizing if it can't resolve.
    }
  }

  // Stabilization-path coverage + interest-reserve sizing — the temporal +
  // carry depth (Damon's "years to 1.20–1.25x" and "some investors want an
  // interest reserve"). Both need a stabilization horizon; default 18 mo.
  if (sizingInputs.stabilizedNOI != null) {
    const monthsToStabilize = num(body.months_to_stabilize) ?? 18;
    try {
      const stabilization = stabilizationPath({
        currentNOI: sizingInputs.currentNOI,
        stabilizedNOI: sizingInputs.stabilizedNOI,
        monthsToStabilize,
        loanAmount: sizing.maxLoan,
        rate: sizingInputs.rate,
        amortizationMonths: sizingInputs.amortizationMonths,
        targetDSCR: num(body.target_dscr) ?? 1.25,
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

  const supabase = createAdminClient();

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
  // eligibility engine — needs the structural deal fields).
  let per_investor: ReturnType<typeof sizeAllInvestors> = [];
  if (body.loan_type && body.property_type && body.property_state && body.loan_amount) {
    const deal: DealParams = {
      loan_type: body.loan_type,
      property_type: body.property_type,
      property_state: body.property_state,
      purchase_price: purchasePrice,
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

  // Persist (strict-parse the JSONB so schema_version is stamped + validated).
  const { data: model, error: insertErr } = await supabase
    .from("uw_models")
    .insert({
      org_id: profile.org_id,
      deal_evaluation_id: body.deal_evaluation_id ?? null,
      validation_id: validationId,
      template: "bridge_value_add",
      inputs: parseUwSizingInputsV1Strict({ ...sizingInputs, schema_version: 1 }),
      sizing: parseUwSizingResultV1Strict({ ...sizing, schema_version: 1 }),
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
      max_loan: Math.round(sizing.maxLoan),
      binding_constraint: sizing.bindingConstraint,
      investors_sized: per_investor.length,
    },
  });

  return NextResponse.json({ uw_model_id: model.id, sizing, per_investor });
}
