// Cross-check for the dispatch-aware live solve (UW-5 SolveControl).
//
// solveDeal() inverts a WHOLE mode-tagged deal (dispatch.ts): vary one input
// lever, re-run sizeDeal(), read one output metric. The correctness discipline is
// the ROUND-TRIP — solve for the lever that hits a target, forward-size at that
// lever, confirm the metric reproduces the target — plus the not-reachable guard.
//
// Run:  npx tsx scripts/verify-solve-live.ts   (exit 0 all-pass, 1 on fail)

import { solveDeal, trySolveDeal, SOLVE_OPTIONS } from "../src/lib/underwriting/solve";
import { sizeDeal, type SizeDealInput } from "../src/lib/underwriting/dispatch";

let failures = 0;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// A "solve, then forward-size at the solved lever, then read the metric" helper —
// exactly what the round-trip must reproduce (uses only public sizeDeal()).
function reSizeMetric(input: SizeDealInput, lever: "purchaseAdvancePct" | "targetDSCR", x: number, read: (r: ReturnType<typeof sizeDeal>) => number) {
  return read(sizeDeal({ ...input, [lever]: x } as SizeDealInput));
}

console.log("\n1. RTL — solve purchase advance for a target metric:");
const RTL: SizeDealInput = {
  mode: "rtl",
  asIsValue: 2_480_000, arv: 3_250_000, purchasePrice: 2_495_000, rehabBudget: 190_000,
  rehabFundingPct: 1, interestRate: 0.085, prepaidInterestMonths: 1, closingCostsPct: 0.002,
  tier: 1, fico: 750, rehabType: "Light", purchaseAdvancePct: 0.5,
};
{
  const opt = SOLVE_OPTIONS.rtl.find((o) => o.metric === "cashToClose")!;
  const r = solveDeal(RTL, opt.lever, opt.metric, 250_000, opt.bracket);
  const ctc = reSizeMetric(RTL, "purchaseAdvancePct", r.leverValue, (x) => (x.mode === "rtl" ? x.result.cashToClose : NaN));
  check("solve advance → $250k cash-to-close, re-size reproduces it", r.converged && near(ctc, 250_000, 0.5), `adv=${(r.leverValue * 100).toFixed(2)}% → CTC=${ctc.toFixed(2)}`);
  check("result is mode-tagged rtl", r.result.mode === "rtl");
}
{
  const opt = SOLVE_OPTIONS.rtl.find((o) => o.metric === "proposedLoan")!;
  const r = solveDeal(RTL, opt.lever, opt.metric, 2_422_000, opt.bracket);
  const loan = r.result.mode === "rtl" ? r.result.result.proposedLoan : NaN;
  check("solve advance → loan = $2,422,000 (buy-box max)", r.converged && near(loan, 2_422_000, 0.5), `adv=${(r.leverValue * 100).toFixed(2)}% → loan=${loan.toFixed(2)}`);
  // closed-form: advance = (loan − holdback)/purchase
  check("solved advance matches closed form (loan−holdback)/purchase", near(r.leverValue, (2_422_000 - 190_000) / 2_495_000, 1e-6), `${r.leverValue}`);
}

console.log("\n2. Construction — solve initial advance for LTARV / total loan:");
const CON: SizeDealInput = {
  mode: "construction",
  purchasePrice: 1_400_000, constructionBudget: 2_178_318, arv: 5_350_000, asIsValue: 1_400_000,
  rate: 0.1099, reserveMonths: 18, reserveDiscount: 0.78, originationFeePct: 0.02, fixedClosingCosts: 5_000,
  constructionHoldbackPct: 1, purchaseAdvancePct: 0.2,
};
{
  const opt = SOLVE_OPTIONS.construction.find((o) => o.metric === "ltarv")!;
  const r = solveDeal(CON, opt.lever, opt.metric, 0.6, opt.bracket);
  const ltarv = r.result.mode === "construction" ? r.result.result.ltarv : NaN;
  check("solve advance → 60% LTARV, re-size reproduces 0.60", r.converged && near(ltarv, 0.6, 1e-5), `adv=${(r.leverValue * 100).toFixed(2)}% → LTARV=${ltarv.toFixed(6)}`);
}
{
  const opt = SOLVE_OPTIONS.construction.find((o) => o.metric === "totalLoan")!;
  const r = solveDeal(CON, opt.lever, opt.metric, 3_000_000, opt.bracket);
  const loan = r.result.mode === "construction" ? r.result.result.totalLoan : NaN;
  check("solve advance → total loan = $3,000,000", r.converged && near(loan, 3_000_000, 1), `adv=${(r.leverValue * 100).toFixed(2)}% → loan=${loan.toFixed(2)}`);
}

console.log("\n3. DSCR — solve the DSCR floor for a target max loan (monotone decreasing):");
const DSCR: SizeDealInput = {
  mode: "dscr",
  monthlyRent: 3_000, targetDSCR: 1.2, rate: 0.07625, amortizationMonths: 360,
  monthlyTaxes: 300, monthlyInsurance: 120, monthlyHoa: 0,
};
{
  const loanAt12 = sizeDeal(DSCR).mode === "dscr" ? (sizeDeal(DSCR) as { mode: "dscr"; result: { maxLoan: number } }).result.maxLoan : NaN;
  // pick a target between the loan at a low floor (bigger) and a high floor (smaller)
  const target = loanAt12 * 0.9;
  const opt = SOLVE_OPTIONS.dscr[0];
  const r = solveDeal(DSCR, opt.lever, opt.metric, target, opt.bracket);
  const ml = r.result.mode === "dscr" ? r.result.result.maxLoan : NaN;
  check("solve DSCR floor → target max loan, re-size reproduces it", r.converged && near(ml, target, 1), `dscr=${r.leverValue.toFixed(4)} → maxLoan=${ml.toFixed(2)} (target ${target.toFixed(2)})`);
  check("a tighter target (smaller loan) needs a higher DSCR floor", (() => {
    const tighter = solveDeal(DSCR, opt.lever, opt.metric, target * 0.8, opt.bracket);
    return tighter.leverValue > r.leverValue;
  })());
}

console.log("\n4. Not-reachable guard:");
check("trySolveDeal returns null when the target is out of range", trySolveDeal(RTL, "purchaseAdvancePct", "cashToClose", 99_000_000, { lo: 0, hi: 1 }) === null);
let threw = false;
try { solveDeal(RTL, "purchaseAdvancePct", "cashToClose", 99_000_000, { lo: 0, hi: 1 }); } catch { threw = true; }
check("solveDeal throws (unbracketed) where trySolveDeal swallows", threw);

console.log("");
if (failures > 0) { console.error(`Live-solve layer: ${failures} check(s) FAILED.`); process.exit(1); }
console.log("Live-solve layer: all checks passed — solveDeal inverts whole deals, round-trips reproduce targets.");
