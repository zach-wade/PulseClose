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
import { sizeAllInvestors } from "@/lib/underwriting/per-investor";
import {
  parseUwSizingInputsV1Strict,
  parseUwSizingResultV1Strict,
} from "@/lib/schemas/jsonb";
import { emitActivity } from "@/lib/events/emit";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
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
  max_ltv?: number | null; // decimal or percent
  max_ltc?: number | null;
  max_ltarv?: number | null;
  min_dscr?: number | null;
  min_debt_yield?: number | null; // decimal or percent
  coverage_basis?: "current" | "stabilized" | null;
  selling_cost_pct?: number | null;
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

  const supabase = createAdminClient();

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
      validation_id: body.validation_id ?? null,
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
