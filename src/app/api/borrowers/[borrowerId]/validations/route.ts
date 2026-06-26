// GET /api/borrowers/[borrowerId]/validations — list all validations
// for a borrower in the current org, with derived tier + outcome status
// for the roll-up page. Org-scoped via RLS.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { deriveTier, type RiskFactor } from "@/lib/risk/factors";
import { computeVerdictsForValidations } from "@/lib/validation/verdict-batch";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ borrowerId: string }> },
) {
  const { borrowerId } = await params;
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: borrower } = await supabase
    .from("borrowers")
    .select("id, display_name")
    .eq("id", borrowerId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!borrower) {
    return NextResponse.json({ error: "Borrower not found" }, { status: 404 });
  }

  // Cap at 500 — at >500 validations per borrower the JS aggregation +
  // factor join below would slow the page. Single-borrower roll-up
  // prioritizes the latest history; older runs accessible via search.
  const VALIDATIONS_LIMIT = 500;
  const { data: validations } = await supabase
    .from("borrower_validations")
    .select(
      "id, borrower_name, borrower_entity_name, overall_status, confidence_score, experience_tier, validation_date, created_at",
    )
    .eq("primary_borrower_id", borrowerId)
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(VALIDATIONS_LIMIT);

  const validationIds = (validations ?? []).map((v) => v.id);

  // Pull factors and outcomes in parallel — same shape as reputation.ts.
  const [factorsRes, outcomesRes] = validationIds.length
    ? await Promise.all([
        supabase
          .from("risk_factors")
          .select(
            "validation_id, factor_key, severity, excluded, exclusion_reason, contributing_data, explanation",
          )
          .in("validation_id", validationIds),
        supabase
          .from("deal_outcomes")
          .select("validation_id, status, outcome_data, updated_at")
          .in("validation_id", validationIds),
      ])
    : [{ data: [] }, { data: [] }];

  const factorsByValidation = new Map<string, RiskFactor[]>();
  for (const f of factorsRes.data ?? []) {
    const list = factorsByValidation.get(f.validation_id) ?? [];
    list.push(f as RiskFactor);
    factorsByValidation.set(f.validation_id, list);
  }
  const outcomeByValidation = new Map<string, { status: string; updated_at: string }>();
  for (const o of outcomesRes.data ?? []) {
    outcomeByValidation.set(o.validation_id, {
      status: o.status,
      updated_at: o.updated_at,
    });
  }

  // Per-run verdict (same computeVerdict() as the detail hero) + prior-run delta.
  const verdicts = await computeVerdictsForValidations(
    supabase,
    (validations ?? []).map((v) => ({ id: v.id, primary_borrower_id: borrowerId, created_at: v.created_at })),
  );

  const enriched = (validations ?? []).map((v) => {
    const factors = factorsByValidation.get(v.id) ?? [];
    const tier = factors.length > 0 ? deriveTier(factors) : null;
    const outcome = outcomeByValidation.get(v.id) ?? null;
    return { ...v, tier, outcome, verdict: verdicts.get(v.id) ?? null };
  });

  return NextResponse.json({
    borrower,
    validations: enriched,
  });
}
