// Stabilization-path coverage — "how many years to 1.20–1.25x?" (Module 10 depth).
//
// Damon's own words on how Insignia underwrites value-add: *"none of the MFR
// constraints really bind. They model how many years of permissible rent
// increase get them to 1.20–1.25x [DSCR]."* The static constraint-min sizer
// answers "how big today"; this answers the TEMPORAL question — the binding
// constraint that actually drives their judgment.
//
// Not a 120-month pro-forma (that stays in Excel). A credible per-year trend
// line: NOI ramps from in-place to the plan's stabilized NOI over the business-
// plan period, then grows at a modest rent-growth assumption; we report DSCR /
// debt-yield each year and the first year coverage clears the target. Pure,
// deterministic, drill-down-able. No I/O.

import { mortgageConstant } from "./sizing";

export interface StabilizationInputs {
  currentNOI: number; // in-place NOI today
  stabilizedNOI: number; // the plan's target NOI at stabilization
  monthsToStabilize: number; // business-plan period to reach stabilizedNOI
  loanAmount: number; // the loan whose coverage we're tracing (the bridge)
  rate: number; // note rate (for debt service)
  amortizationMonths?: number; // omit/0 => interest-only
  targetDSCR?: number; // coverage to clear (default 1.25 — Damon's upper bound)
  postStabilizationRentGrowth?: number; // annual NOI growth after stabilization (default 3%)
  horizonYears?: number; // how many years to project (default 5)
}

export interface StabilizationYear {
  year: number;
  noi: number;
  dscr: number;
  debtYield: number;
  clearsTarget: boolean;
}

export interface StabilizationResult {
  annualDebtService: number;
  targetDSCR: number;
  years: StabilizationYear[];
  monthsToClear: number | null; // first month DSCR ≥ target (null if never within horizon)
  yearsToClear: number | null; // monthsToClear / 12, rounded up to a whole year
  clearsWithinHorizon: boolean;
  summary: string; // human one-liner ("clears 1.25x DSCR in ~2.0 yrs")
}

// NOI at a given month: linear ramp from in-place to stabilized over the plan
// period, then compounding rent growth. Mirrors how an underwriter sketches it.
function noiAtMonth(m: number, d: StabilizationInputs): number {
  const growth = d.postStabilizationRentGrowth ?? 0.03;
  if (m >= d.monthsToStabilize) {
    const yearsPast = (m - d.monthsToStabilize) / 12;
    return d.stabilizedNOI * Math.pow(1 + growth, yearsPast);
  }
  if (d.monthsToStabilize <= 0) return d.stabilizedNOI;
  return d.currentNOI + (d.stabilizedNOI - d.currentNOI) * (m / d.monthsToStabilize);
}

export function stabilizationPath(d: StabilizationInputs): StabilizationResult {
  const k = mortgageConstant(d.rate, d.amortizationMonths);
  const annualDebtService = d.loanAmount * k;
  const targetDSCR = d.targetDSCR ?? 1.25;
  const horizon = d.horizonYears ?? 5;

  const years: StabilizationYear[] = [];
  for (let y = 1; y <= horizon; y++) {
    const noi = noiAtMonth(y * 12, d);
    const dscr = annualDebtService > 0 ? noi / annualDebtService : Infinity;
    years.push({
      year: y,
      noi,
      dscr,
      debtYield: d.loanAmount > 0 ? noi / d.loanAmount : Infinity,
      clearsTarget: dscr >= targetDSCR,
    });
  }

  // Scan monthly for the first month coverage clears the target.
  let monthsToClear: number | null = null;
  for (let m = 1; m <= horizon * 12; m++) {
    const dscr = annualDebtService > 0 ? noiAtMonth(m, d) / annualDebtService : Infinity;
    if (dscr >= targetDSCR) {
      monthsToClear = m;
      break;
    }
  }
  const yearsToClear = monthsToClear != null ? Math.ceil(monthsToClear / 12) : null;
  const clearsWithinHorizon = monthsToClear != null;

  const summary = clearsWithinHorizon
    ? `Clears ${targetDSCR.toFixed(2)}x DSCR in ~${(monthsToClear! / 12).toFixed(1)} yrs (${monthsToClear} mo).`
    : `Does NOT reach ${targetDSCR.toFixed(2)}x DSCR within ${horizon} yrs on the modeled plan — coverage is the binding (temporal) constraint.`;

  return { annualDebtService, targetDSCR, years, monthsToClear, yearsToClear, clearsWithinHorizon, summary };
}
