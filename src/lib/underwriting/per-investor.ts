// Per-investor best-execution sizing — the composition the standalone
// evaluator couldn't do.
//
// The eligibility engine (src/lib/evaluate) answers "will investor X do this
// deal, and at what rate / leverage caps". The sizing engine (sizing.ts)
// answers "how big a loan does the deal's income + value + cost support". This
// module feeds each investor's effective caps + the rate that investor would
// actually charge into the sizing engine, so the lender sees:
//
//   Colchis   → $6,315,789  (DSCR-bound)  @ 9.50%
//   Oakhurst  → $7,500,000  (LTV-bound)   @ 10.25%
//
// i.e. best execution = which investor lets the borrower size the largest /
// best-priced loan, and WHY (the binding constraint). Pure, no I/O.

import { underwrite, type SizingInputs, type SizingResult } from "./sizing";
import type { EligibilityResult, InvestorRules } from "@/lib/evaluate/engine";

export interface PerInvestorSizing {
  investor_id: string;
  investor_name: string;
  eligibility: "pass" | "conditional" | "fail";
  // Sized using THIS investor's leverage caps + DSCR/debt-yield floors + the
  // rate the eligibility engine computed for them. Null when not sizable
  // (ineligible, or no constraint resolvable).
  sizing: SizingResult | null;
  rate_used_pct: number | null;
  note: string;
}

// Build the sizing inputs for a single investor: start from the deal-level
// inputs the lender entered, then override constraints with the investor's
// effective caps (post-tier, post-adjuster) and the investor's priced rate.
function inputsForInvestor(
  base: SizingInputs,
  result: EligibilityResult,
  rules: InvestorRules,
): SizingInputs {
  return {
    ...base,
    maxLTV: result.max_ltv ?? base.maxLTV,
    maxLTC: result.max_ltc ?? base.maxLTC,
    maxLoanToARV: result.max_ltarv ?? base.maxLoanToARV,
    // DSCR / debt-yield floors are investor credit policy. Fall back to the
    // deal-level value the lender typed when the investor hasn't configured one.
    minDSCR: rules.min_dscr ?? base.minDSCR,
    minDebtYield: rules.min_debt_yield ?? base.minDebtYield,
    // The rate the investor would charge drives the DSCR-bound sizing — a
    // higher rate raises the mortgage constant and shrinks the DSCR-permitted
    // loan. This is what makes per-investor sizing genuinely differ.
    rate: result.estimated_rate_pct != null ? result.estimated_rate_pct / 100 : base.rate,
  };
}

function hasAnyConstraint(s: SizingInputs): boolean {
  return (
    s.maxLTV != null ||
    s.maxLTC != null ||
    s.maxLoanToARV != null ||
    s.minDSCR != null ||
    s.minDebtYield != null
  );
}

export function sizeForInvestor(
  base: SizingInputs,
  result: EligibilityResult,
  rules: InvestorRules,
): PerInvestorSizing {
  const common = {
    investor_id: result.investor_id,
    investor_name: result.investor_name,
    eligibility: result.result,
  };

  if (result.result === "fail") {
    return { ...common, sizing: null, rate_used_pct: null, note: "Ineligible — not sized." };
  }

  const inputs = inputsForInvestor(base, result, rules);
  if (!hasAnyConstraint(inputs)) {
    return {
      ...common,
      sizing: null,
      rate_used_pct: inputs.rate * 100,
      note: "No leverage caps or coverage floors resolvable for this investor.",
    };
  }

  try {
    const sizing = underwrite(inputs);
    return {
      ...common,
      sizing,
      rate_used_pct: inputs.rate * 100,
      note: `Sized to ${sizing.bindingConstraint} at ${(inputs.rate * 100).toFixed(2)}%.`,
    };
  } catch (err) {
    return {
      ...common,
      sizing: null,
      rate_used_pct: inputs.rate * 100,
      note: err instanceof Error ? err.message : "Could not size.",
    };
  }
}

// Best-execution ordering: most loan proceeds first (the borrower's lens),
// unsizable investors last. The UI can re-sort by rate if desired.
export function sizeAllInvestors(
  base: SizingInputs,
  results: EligibilityResult[],
  rulesById: Record<string, InvestorRules>,
): PerInvestorSizing[] {
  return results
    .map((r) => sizeForInvestor(base, r, rulesById[r.investor_id] ?? {}))
    .sort((a, b) => (b.sizing?.maxLoan ?? -1) - (a.sizing?.maxLoan ?? -1));
}
