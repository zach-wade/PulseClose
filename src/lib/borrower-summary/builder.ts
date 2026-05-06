// A3 — Borrower capital-availability summary builder.
//
// Pulls a deal_evaluation + its per-investor results + investor display
// names + the org name, returns a flat BorrowerSummaryDoc the printable
// page renders. Org-scoped fetch — caller is responsible for verifying
// the user's org_id.
//
// Pure data shaping (no rendering, no I/O beyond the supabase queries).

import type { SupabaseClient } from "@supabase/supabase-js";

export type BorrowerSummaryInvestor = {
  investor_id: string;
  investor_name: string;
  result: "pass" | "conditional";
  estimated_rate_pct: number | null;
  estimated_points: number | null;
  max_ltv: number | null;
  max_ltc: number | null;
  max_ltarv: number | null;
  reasoning: string;
  boundary_warnings: string[];
};

export type BorrowerSummaryDoc = {
  evaluation_id: string;
  org_name: string;
  generated_at: string;
  borrower_name: string | null;
  property_address: string | null;
  property_state: string;
  loan_type: string;
  property_type: string;
  loan_amount: number;
  purchase_price: number | null;
  arv: number | null;
  rehab_budget: number | null;
  pass_count: number;
  conditional_count: number;
  fail_count: number;
  // Sorted: pass first, then conditional, each by best (lowest) rate.
  eligible: BorrowerSummaryInvestor[];
};

type ComputedTerms = {
  max_ltv: number | null;
  max_ltc: number | null;
  max_ltarv: number | null;
  estimated_rate_pct: number | null;
  estimated_points: number | null;
  boundary_warnings?: { field: string; message: string }[];
};

export async function buildBorrowerSummaryDoc(
  supabase: SupabaseClient,
  evaluationId: string,
  orgId: string,
): Promise<BorrowerSummaryDoc | null> {
  const [evalRes, resultsRes, orgRes] = await Promise.all([
    supabase
      .from("deal_evaluations")
      .select("*")
      .eq("id", evaluationId)
      .eq("org_id", orgId)
      .single(),
    supabase
      .from("deal_eligibility_results")
      .select("*, investors ( display_name )")
      .eq("deal_evaluation_id", evaluationId),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single(),
  ]);

  if (evalRes.error || !evalRes.data) return null;
  const evaluation = evalRes.data;
  const results = resultsRes.data ?? [];

  const additional = (evaluation.additional_params ?? {}) as Record<string, unknown>;

  const eligible: BorrowerSummaryInvestor[] = results
    .filter((r) => r.result === "pass" || r.result === "conditional")
    .map((r) => {
      const ct = (r.computed_terms ?? {}) as ComputedTerms;
      const inv = r.investors as { display_name: string | null } | null;
      return {
        investor_id: r.investor_id,
        investor_name: inv?.display_name ?? r.investor_id.slice(0, 8),
        result: r.result as "pass" | "conditional",
        estimated_rate_pct: ct.estimated_rate_pct ?? null,
        estimated_points: ct.estimated_points ?? null,
        max_ltv: ct.max_ltv ?? null,
        max_ltc: ct.max_ltc ?? null,
        max_ltarv: ct.max_ltarv ?? null,
        reasoning: r.reasoning ?? "",
        boundary_warnings: (ct.boundary_warnings ?? []).map((w) => w.message),
      };
    })
    .sort((a, b) => {
      const order: Record<string, number> = { pass: 0, conditional: 1 };
      if (order[a.result] !== order[b.result]) return order[a.result] - order[b.result];
      const ra = a.estimated_rate_pct ?? Infinity;
      const rb = b.estimated_rate_pct ?? Infinity;
      return ra - rb;
    });

  const passCount = results.filter((r) => r.result === "pass").length;
  const conditionalCount = results.filter((r) => r.result === "conditional").length;
  const failCount = results.filter((r) => r.result === "fail").length;

  return {
    evaluation_id: evaluation.id,
    org_name: orgRes.data?.name ?? "PulseClose",
    generated_at: new Date().toISOString(),
    borrower_name: (additional.borrower_name as string | null | undefined) ?? null,
    property_address: (additional.property_address as string | null | undefined) ?? null,
    property_state: evaluation.location ?? "",
    loan_type: evaluation.loan_type ?? "",
    property_type: evaluation.property_type ?? "",
    loan_amount: Number(evaluation.loan_amount ?? 0),
    purchase_price: evaluation.purchase_price ?? null,
    arv: evaluation.arv ?? null,
    rehab_budget: evaluation.rehab_budget ?? null,
    pass_count: passCount,
    conditional_count: conditionalCount,
    fail_count: failCount,
    eligible,
  };
}
