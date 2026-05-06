// POST /api/evaluate — run a deal scenario against all active investors
// in the org and persist the deal_evaluation + per-investor results.
//
// GET /api/evaluate — list recent deal evaluations for the org.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  assembleRulesFromCriteria,
  evaluateDealForInvestor,
  suggestCounterOffers,
  type DealParams,
} from "@/lib/evaluate/engine";
import { emitActivity } from "@/lib/events/emit";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("deal_evaluations")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("evaluated_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`evaluate:${profile.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  const supabase = createAdminClient();
  const body = (await request.json()) as Partial<DealParams> & {
    validation_id?: string | null;
    borrower_id?: string | null;
    property_id?: string | null;
  };

  if (!body.loan_type || !body.property_type || !body.property_state || !body.loan_amount) {
    return NextResponse.json(
      { error: "loan_type, property_type, property_state, and loan_amount are required" },
      { status: 400 },
    );
  }

  const deal: DealParams = {
    loan_type: body.loan_type,
    property_type: body.property_type,
    property_state: body.property_state,
    purchase_price: body.purchase_price ?? null,
    loan_amount: Number(body.loan_amount),
    arv: body.arv ?? null,
    rehab_budget: body.rehab_budget ?? null,
    construction_budget: body.construction_budget ?? null,
    borrower_fico: body.borrower_fico ?? null,
    borrower_experience: body.borrower_experience ?? 0,
    occupancy: body.occupancy ?? "non_owner_occupied",
    unit_count: body.unit_count ?? 1,
    is_rural: body.is_rural ?? false,
    loan_purpose: body.loan_purpose ?? "purchase",
    borrower_name: body.borrower_name ?? null,
    property_address: body.property_address ?? null,
    notes: body.notes ?? null,
  };

  // Persist the deal evaluation row first so per-investor results have
  // a stable FK target.
  const { data: evaluation, error: evalErr } = await supabase
    .from("deal_evaluations")
    .insert({
      org_id: profile.org_id,
      validation_id: body.validation_id ?? null,
      borrower_id: body.borrower_id ?? null,
      property_id: body.property_id ?? null,
      purchase_price: deal.purchase_price,
      arv: deal.arv,
      rehab_budget: deal.rehab_budget,
      loan_amount: deal.loan_amount,
      loan_type: deal.loan_type,
      property_type: deal.property_type,
      location: deal.property_state,
      sponsor_experience_tier:
        deal.borrower_experience >= 10 ? 1 :
        deal.borrower_experience >= 5 ? 2 :
        deal.borrower_experience >= 1 ? 3 : 4,
      fico: deal.borrower_fico,
      additional_params: {
        construction_budget: deal.construction_budget,
        occupancy: deal.occupancy,
        unit_count: deal.unit_count,
        is_rural: deal.is_rural,
        loan_purpose: deal.loan_purpose,
        borrower_name: deal.borrower_name,
        property_address: deal.property_address,
        notes: deal.notes,
      },
      evaluated_by_user_id: profile.id,
    })
    .select("id")
    .single();

  if (evalErr || !evaluation) {
    return NextResponse.json(
      { error: evalErr?.message ?? "Failed to create evaluation" },
      { status: 500 },
    );
  }

  // Fetch all org investors and their active criteria in two queries.
  const { data: investors } = await supabase
    .from("investors")
    .select("id, display_name, type")
    .eq("org_id", profile.org_id);

  const investorList = investors ?? [];
  if (investorList.length === 0) {
    return NextResponse.json({
      evaluation_id: evaluation.id,
      results: [],
      message: "No investors configured. Add investors via /dashboard/evaluate/investors.",
    });
  }

  const investorIds = investorList.map((i) => i.id);
  const { data: criteria } = await supabase
    .from("investor_criteria")
    .select("investor_id, criteria_key, criteria_value")
    .in("investor_id", investorIds)
    .is("effective_to", null);

  const byInvestor: Record<string, { criteria_key: string; criteria_value: unknown }[]> = {};
  for (const row of criteria ?? []) {
    if (!byInvestor[row.investor_id]) byInvestor[row.investor_id] = [];
    byInvestor[row.investor_id].push({ criteria_key: row.criteria_key, criteria_value: row.criteria_value });
  }

  const results = investorList.map((inv) => {
    const rules = assembleRulesFromCriteria(byInvestor[inv.id] ?? []);
    const investorWithRules = { id: inv.id, display_name: inv.display_name, rules };
    const result = evaluateDealForInvestor(deal, investorWithRules);
    const counter_offers = suggestCounterOffers(deal, investorWithRules, result);
    return { ...result, counter_offers };
  });

  // Persist per-investor results
  await insertOrThrow(
    supabase.from("deal_eligibility_results").insert(
      results.map((r) => ({
        deal_evaluation_id: evaluation.id,
        investor_id: r.investor_id,
        result: r.result,
        computed_terms: {
          max_ltv: r.max_ltv,
          max_ltc: r.max_ltc,
          max_ltarv: r.max_ltarv,
          estimated_rate_pct: r.estimated_rate_pct,
          estimated_points: r.estimated_points,
          applied_adjusters: r.applied_adjusters,
          matched_tier_index: r.matched_tier_index,
          boundary_warnings: r.boundary_warnings,
          failure_reasons: r.failure_reasons,
          counter_offers: r.counter_offers,
        },
        reasoning: r.reasoning,
      })),
    ),
    `deal_eligibility_results insert (deal_evaluation_id=${evaluation.id}, count=${results.length})`,
  );

  const passCount = results.filter((r) => r.result === "pass").length;
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "evaluated_deal",
    subjectType: "deal_evaluation",
    subjectId: evaluation.id,
    metadata: {
      deal_evaluation_id: evaluation.id,
      investors_evaluated: investorList.length,
      pass_count: passCount,
    },
  });

  return NextResponse.json({
    evaluation_id: evaluation.id,
    deal,
    results,
  });
}
