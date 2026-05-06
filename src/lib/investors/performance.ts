// A4 — Investor performance computation.
//
// Per-investor stats from deal_evaluations + deal_eligibility_results +
// deal_outcomes. Org-scoped through deal_evaluations.org_id (RLS) plus
// the investors row itself; the join from eligibility → evaluation →
// outcome chains through validation_id.
//
// Components per ROADMAP Stage 8:
//   - deals evaluated
//   - pass / conditional / fail rates
//   - funded / repaid / extended / defaulted counts
//   - average loan size when evaluated
//   - default rate (defaulted / funded+repaid+extended+defaulted)
//   - latest evaluation timestamp
//
// A5 — adds rate-history aggregation pulled from deal_eligibility_results.computed_terms
// (rate, points). Returns time-ordered samples for sparklines.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface InvestorPerformance {
  investor_id: string;
  display_name: string;
  evaluations: number;
  pass: number;
  conditional: number;
  fail: number;
  pass_rate: number | null;
  conditional_rate: number | null;
  fail_rate: number | null;
  funded: number;
  repaid: number;
  extended: number;
  defaulted: number;
  withdrawn: number;
  funded_total_cents: number | null;
  avg_loan_amount_cents: number | null;
  default_rate: number | null;
  // Rate / points history per A5 — array of {rate, points, evaluated_at}
  // for evaluations that produced computed_terms with numeric rate/points.
  rate_history: Array<{
    evaluated_at: string;
    rate: number | null;
    points: number | null;
    loan_amount_cents: number | null;
    result: "pass" | "conditional" | "fail";
  }>;
  latest_evaluated_at: string | null;
}

interface ComputedTerms {
  rate?: number | string;
  points?: number | string;
  [k: string]: unknown;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[%,$\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function getInvestorPerformance(
  supabase: SupabaseClient,
  investorId: string,
  orgId: string,
): Promise<InvestorPerformance | null> {
  const { data: investor } = await supabase
    .from("investors")
    .select("id, display_name")
    .eq("id", investorId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!investor) return null;

  // Pull eligibility rows for this investor; join evaluation rows to get
  // loan amount, evaluated_at, validation_id. Two queries — keep it simple.
  const { data: results } = await supabase
    .from("deal_eligibility_results")
    .select("id, deal_evaluation_id, result, computed_terms, computed_at")
    .eq("investor_id", investorId);

  const evalIds = [...new Set((results ?? []).map((r) => r.deal_evaluation_id))];
  if (evalIds.length === 0) {
    return {
      investor_id: investor.id,
      display_name: investor.display_name,
      evaluations: 0,
      pass: 0,
      conditional: 0,
      fail: 0,
      pass_rate: null,
      conditional_rate: null,
      fail_rate: null,
      funded: 0,
      repaid: 0,
      extended: 0,
      defaulted: 0,
      withdrawn: 0,
      funded_total_cents: null,
      avg_loan_amount_cents: null,
      default_rate: null,
      rate_history: [],
      latest_evaluated_at: null,
    };
  }

  const { data: evaluations } = await supabase
    .from("deal_evaluations")
    .select("id, validation_id, loan_amount, evaluated_at")
    .eq("org_id", orgId)
    .in("id", evalIds);

  const evalById = new Map(
    (evaluations ?? []).map((e) => [
      e.id,
      e as { id: string; validation_id: string | null; loan_amount: number | null; evaluated_at: string },
    ]),
  );

  // Outcomes joined via validation_id from the evaluations.
  const validationIds = (evaluations ?? [])
    .map((e) => e.validation_id)
    .filter((v): v is string => Boolean(v));
  const { data: outcomes } = validationIds.length
    ? await supabase
        .from("deal_outcomes")
        .select("validation_id, status, outcome_data")
        .in("validation_id", validationIds)
    : { data: [] };

  const outcomeByValidation = new Map<string, { status: string; outcome_data: { funded_amount?: number } }>();
  for (const o of outcomes ?? []) {
    outcomeByValidation.set(o.validation_id, {
      status: o.status,
      outcome_data: (o.outcome_data ?? {}) as { funded_amount?: number },
    });
  }

  // Aggregate over results — each row is one investor's verdict on one evaluation.
  let pass = 0;
  let conditional = 0;
  let fail = 0;
  let funded = 0;
  let repaid = 0;
  let extended = 0;
  let defaulted = 0;
  let withdrawn = 0;
  let fundedTotalCents = 0;
  let loanSum = 0;
  let loanCount = 0;
  let latest: string | null = null;
  const rateHistory: InvestorPerformance["rate_history"] = [];

  for (const r of results ?? []) {
    if (r.result === "pass") pass++;
    else if (r.result === "conditional") conditional++;
    else if (r.result === "fail") fail++;

    const ev = evalById.get(r.deal_evaluation_id);
    if (!ev) continue;

    if (!latest || ev.evaluated_at > latest) latest = ev.evaluated_at;

    const loanAmt = ev.loan_amount;
    if (loanAmt != null && Number.isFinite(loanAmt)) {
      loanSum += Number(loanAmt);
      loanCount++;
    }

    // Hook to outcome via validation_id (only when this eval is tied to one).
    if (ev.validation_id) {
      const outcome = outcomeByValidation.get(ev.validation_id);
      if (outcome) {
        // Only count this outcome once per investor per validation —
        // multiple eligibility rows could reference the same evaluation
        // if the engine ever re-runs. The set-based outcomeByValidation
        // is already 1:1 (deal_outcomes UPSERT on validation_id).
        // To dedupe across multiple results pointing at same validation,
        // we'd need a Set; simpler approach: tally outcome ONCE per
        // (validation_id, investor_id) pair, which deal_eligibility_results
        // already enforces by being 1:1 per (deal_evaluation_id, investor_id).
        // So just count it.
        if (outcome.status === "funded") {
          funded++;
          const amt = outcome.outcome_data?.funded_amount;
          if (typeof amt === "number" && Number.isFinite(amt)) {
            fundedTotalCents += Math.round(amt * 100);
          }
        } else if (outcome.status === "repaid") repaid++;
        else if (outcome.status === "extended") extended++;
        else if (outcome.status === "defaulted") defaulted++;
        else if (outcome.status === "withdrawn") withdrawn++;
      }
    }

    // Rate history sample — only when computed_terms has a usable rate.
    const terms = (r.computed_terms ?? {}) as ComputedTerms;
    const rate = asNumber(terms.rate);
    const points = asNumber(terms.points);
    if (rate !== null || points !== null) {
      rateHistory.push({
        evaluated_at: ev.evaluated_at,
        rate,
        points,
        loan_amount_cents: loanAmt != null ? Math.round(Number(loanAmt) * 100) : null,
        result: r.result as "pass" | "conditional" | "fail",
      });
    }
  }

  rateHistory.sort((a, b) => a.evaluated_at.localeCompare(b.evaluated_at));

  const evaluations_total = evalIds.length;
  const totalVerdicts = pass + conditional + fail;
  const fundedAndExtended = funded + repaid + extended + defaulted;

  return {
    investor_id: investor.id,
    display_name: investor.display_name,
    evaluations: evaluations_total,
    pass,
    conditional,
    fail,
    pass_rate: totalVerdicts > 0 ? pass / totalVerdicts : null,
    conditional_rate: totalVerdicts > 0 ? conditional / totalVerdicts : null,
    fail_rate: totalVerdicts > 0 ? fail / totalVerdicts : null,
    funded,
    repaid,
    extended,
    defaulted,
    withdrawn,
    funded_total_cents: fundedTotalCents > 0 ? fundedTotalCents : null,
    avg_loan_amount_cents: loanCount > 0 ? Math.round((loanSum / loanCount) * 100) : null,
    default_rate: fundedAndExtended > 0 ? defaulted / fundedAndExtended : null,
    rate_history: rateHistory,
    latest_evaluated_at: latest,
  };
}
