// Bridge / CRE loan-sizing engine (Module 10 — Underwriting Workbench core).
//
// Sizes a value-add bridge loan as the MINIMUM across the lender's five
// constraints (LTV / LTC / LTARV / DSCR / debt yield) — the binding one
// defines the deal — and reports the resulting metrics + a value-add returns
// sketch. Pure, dependency-free, no I/O.
//
// Ported verbatim from the validated standalone engine
// (consulting/shared/products/bridge-deal-evaluator) whose math is checked
// against a hand-computed deal. The regression test lives in
// scripts/verify-underwriting-engine.ts (run: `npx tsx scripts/verify-underwriting-engine.ts`).
//
// This is the loan-sizing layer the eligibility engine (src/lib/evaluate)
// deliberately lacks — eligibility answers "will this investor do the deal";
// sizing answers "how big a loan does the deal actually support". They
// compose in src/lib/underwriting/per-investor.ts.
//
// All $ in whole dollars; rates as decimals (0.095 = 9.5%).

export interface SizingInputs {
  name?: string;

  // acquisition + project cost
  purchasePrice: number;
  rehabBudget?: number; // value-add / capex (remaining / cost-to-complete)
  closingCosts?: number; // acquisition closing + financing costs
  // Capital already sunk into the project before this loan (a refinance of an
  // in-progress build/value-add). Without it, LTC sizes on too small a basis and
  // reports a nonsensically high leverage on a deal that's actually conservative
  // — calibration finding #16 (loan 812-tait: $3.3M already spent, only $143k
  // cost-to-complete, so cost-basis LTC read 116% while LTARV was a clean 67%).
  costSpentToDate?: number;

  // income
  currentNOI: number; // in-place / going-in NOI
  stabilizedNOI?: number; // pro-forma NOI after the business plan

  // market
  goingInCapRate: number; // values the as-is property (currentNOI / cap)
  exitCapRate?: number; // values the stabilized property (stabilizedNOI / cap) = ARV

  // loan terms
  rate: number; // annual interest rate
  termMonths?: number; // loan term (info / hold proxy)
  amortizationMonths?: number; // 0 / undefined => interest-only (typical bridge)

  // sizing constraints (omit any to ignore it)
  maxLTV?: number; // of as-is value
  maxLTC?: number; // of total project cost
  maxLoanToARV?: number; // of stabilized value (construction / heavy value-add)
  minDSCR?: number;
  minDebtYield?: number;

  // which NOI the coverage tests size on. "current" is the conservative
  // as-is basis lenders typically size to; "stabilized" sizes to the plan.
  coverageBasis?: "current" | "stabilized";

  // exit assumptions for the returns sketch
  sellingCostPct?: number; // % of sale price (default 2%)
}

export type ConstraintKey = "LTV" | "LTC" | "LoanToARV" | "DSCR" | "DebtYield";

export interface Constraint {
  key: ConstraintKey;
  label: string;
  maxLoan: number; // loan this constraint permits
  binding: boolean; // is this the one that sets the loan?
  basis: string; // what it's measured against (for transparency / drill-down)
}

export interface SizingResult {
  asIsValue: number; // currentNOI / goingInCapRate
  stabilizedValue: number | null; // stabilizedNOI / exitCapRate (ARV)
  totalProjectCost: number; // purchase + rehab + closing

  constraints: Constraint[];
  maxLoan: number; // min across constraints
  bindingConstraint: ConstraintKey;
  equityRequired: number; // cost - loan
  annualDebtService: number; // at maxLoan
  mortgageConstant: number; // annual debt service / loan (rate if IO)

  // resulting metrics at the sized loan
  ltv: number; // loan / as-is value
  ltc: number; // loan / cost
  dscrCurrent: number; // currentNOI / debt service
  dscrStabilized: number | null;
  debtYieldCurrent: number; // currentNOI / loan
  debtYieldStabilized: number | null;

  // returns sketch (sell at stabilized value)
  projectProfit: number | null; // stabilizedValue - cost - selling costs
  equityMultiple: number | null; // equity proceeds / equity in
  returnOnCost: number | null; // stabilizedNOI / total cost (yield-on-cost)
  developmentSpread: number | null; // yield-on-cost - exit cap (value-add margin)
}

/** Annual mortgage constant = annual debt service per $1 of loan.
 *  Interest-only => the rate. Amortizing => from the standard payment formula. */
export function mortgageConstant(annualRate: number, amortizationMonths?: number): number {
  if (!amortizationMonths || amortizationMonths <= 0) return annualRate; // interest-only
  const r = annualRate / 12;
  if (r === 0) return 12 / amortizationMonths;
  const monthly = r / (1 - Math.pow(1 + r, -amortizationMonths)); // payment per $1
  return monthly * 12;
}

export function underwrite(d: SizingInputs): SizingResult {
  const rehab = d.rehabBudget ?? 0;
  const closing = d.closingCosts ?? 0;
  const spentToDate = d.costSpentToDate ?? 0;
  // LTC basis = original acquisition + all capital deployed (spent-to-date) +
  // remaining rehab + closing. Including spent-to-date keeps LTC honest on a
  // refi of an in-progress project (finding #16).
  const totalProjectCost = d.purchasePrice + spentToDate + rehab + closing;

  const asIsValue = d.currentNOI / d.goingInCapRate;
  const stabilizedValue =
    d.stabilizedNOI != null && d.exitCapRate ? d.stabilizedNOI / d.exitCapRate : null;

  const k = mortgageConstant(d.rate, d.amortizationMonths);
  const basis = d.coverageBasis ?? "current";
  const coverageNOI =
    basis === "stabilized" && d.stabilizedNOI != null ? d.stabilizedNOI : d.currentNOI;

  // each constraint -> the max loan it permits
  const raw: Omit<Constraint, "binding">[] = [];
  if (d.maxLTV != null)
    raw.push({ key: "LTV", label: "Loan-to-Value (as-is)", maxLoan: d.maxLTV * asIsValue, basis: `${(d.maxLTV * 100).toFixed(0)}% of as-is value` });
  if (d.maxLTC != null)
    raw.push({ key: "LTC", label: "Loan-to-Cost", maxLoan: d.maxLTC * totalProjectCost, basis: `${(d.maxLTC * 100).toFixed(0)}% of total cost` });
  if (d.maxLoanToARV != null && stabilizedValue != null)
    raw.push({ key: "LoanToARV", label: "Loan-to-ARV (stabilized)", maxLoan: d.maxLoanToARV * stabilizedValue, basis: `${(d.maxLoanToARV * 100).toFixed(0)}% of stabilized value` });
  if (d.minDSCR != null)
    raw.push({ key: "DSCR", label: "Debt-Service Coverage", maxLoan: coverageNOI / (d.minDSCR * k), basis: `${d.minDSCR.toFixed(2)}x on ${basis} NOI` });
  if (d.minDebtYield != null)
    raw.push({ key: "DebtYield", label: "Debt Yield", maxLoan: coverageNOI / d.minDebtYield, basis: `${(d.minDebtYield * 100).toFixed(1)}% on ${basis} NOI` });

  if (raw.length === 0) throw new Error("provide at least one sizing constraint");

  const maxLoan = Math.min(...raw.map((c) => c.maxLoan));
  const bindingKey = raw.find((c) => c.maxLoan === maxLoan)!.key;
  const constraints: Constraint[] = raw
    .map((c) => ({ ...c, binding: c.key === bindingKey }))
    .sort((a, b) => a.maxLoan - b.maxLoan);

  const annualDebtService = maxLoan * k;
  const equityRequired = totalProjectCost - maxLoan;
  const sellingCostPct = d.sellingCostPct ?? 0.02;

  // returns sketch: sell at stabilized value, repay loan
  let projectProfit: number | null = null;
  let equityMultiple: number | null = null;
  let returnOnCost: number | null = null;
  let developmentSpread: number | null = null;
  if (stabilizedValue != null) {
    const sellingCosts = stabilizedValue * sellingCostPct;
    const equityProceeds = stabilizedValue - sellingCosts - maxLoan;
    projectProfit = stabilizedValue - sellingCosts - totalProjectCost;
    equityMultiple = equityRequired > 0 ? equityProceeds / equityRequired : null;
    returnOnCost = (d.stabilizedNOI as number) / totalProjectCost;
    if (d.exitCapRate) developmentSpread = returnOnCost - d.exitCapRate;
  }

  return {
    asIsValue,
    stabilizedValue,
    totalProjectCost,
    constraints,
    maxLoan,
    bindingConstraint: bindingKey,
    equityRequired,
    annualDebtService,
    mortgageConstant: k,
    ltv: maxLoan / asIsValue,
    ltc: maxLoan / totalProjectCost,
    dscrCurrent: d.currentNOI / annualDebtService,
    dscrStabilized: d.stabilizedNOI != null ? d.stabilizedNOI / annualDebtService : null,
    debtYieldCurrent: d.currentNOI / maxLoan,
    debtYieldStabilized: d.stabilizedNOI != null ? d.stabilizedNOI / maxLoan : null,
    projectProfit,
    equityMultiple,
    returnOnCost,
    developmentSpread,
  };
}
