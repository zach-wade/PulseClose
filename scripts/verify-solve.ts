// Cross-check for the live-solve / goal-seek layer (UW-5).
//
// The correctness discipline for an inverter is the ROUND-TRIP: solve for the
// input that hits a target, then forward-run the sizer at that input and confirm
// it reproduces the target. Plus a pure-math check of the bisection root-finder.
//
// Run:  npx tsx scripts/verify-solve.ts   (exit 0 all-pass, 1 on fail)

import { goalSeek, solveRtlAdvanceForCashToClose, solveRtlAdvanceForLoan, solveConstructionAdvanceForLtarv, solveMaxLoanForDscr } from "../src/lib/underwriting/solve";
import { sizeRtl } from "../src/lib/underwriting/rtl-sizer";
import { sizeConstruction } from "../src/lib/underwriting/construction-sizer";

let failures = 0;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\n1. Bisection root-finder (pure math):");
// Solve x^3 = 2 on [0,2] — a non-linear, closed-form-known root (cube root of 2).
const cube = goalSeek((x) => x * x * x, 2, { lo: 0, hi: 2 });
check("x^3 = 2 → x ≈ 1.259921 (cube root of 2)", near(cube.x, Math.cbrt(2), 1e-6), `${cube.x}`);
check("converged flag set", cube.converged);
// Decreasing function handled: solve 10 − x = 3 → x = 7.
const dec = goalSeek((x) => 10 - x, 3, { lo: 0, hi: 20 });
check("decreasing fn: 10 − x = 3 → x = 7", near(dec.x, 7, 1e-6), `${dec.x}`);
let threw = false;
try { goalSeek((x) => x, 99, { lo: 0, hi: 1 }); } catch { threw = true; }
check("throws when target not bracketed", threw);

// RTL base (the Option_1 fixture, advance left free for the solver)
const RTL_BASE = {
  asIsValue: 2_480_000, arv: 3_250_000, purchasePrice: 2_495_000, rehabBudget: 190_000,
  rehabFundingPct: 1, interestRate: 0.085, prepaidInterestMonths: 1, closingCostsPct: 0.002,
  tier: 1 as const, fico: 750, rehabType: "Light" as const,
};

console.log("\n2. RTL round-trips (solve → forward-run reproduces the target):");
const s1 = solveRtlAdvanceForCashToClose(RTL_BASE, 250_000);
const ctc = sizeRtl({ ...RTL_BASE, purchaseAdvancePct: s1.x }).cashToClose;
check("solve advance for $250k cash-to-close, then forward-run hits $250k", near(ctc, 250_000, 0.5), `adv=${s1.x.toFixed(4)} → CTC=${ctc.toFixed(2)}`);
const s2 = solveRtlAdvanceForLoan(RTL_BASE, 2_422_000); // size exactly to the Option_1 max
const loan = sizeRtl({ ...RTL_BASE, purchaseAdvancePct: s2.x }).proposedLoan;
check("solve advance to size loan = $2,422,000 (the buy-box max)", near(loan, 2_422_000, 0.5), `adv=${s2.x.toFixed(4)} → loan=${loan.toFixed(2)}`);
// closed-form cross-check: advance = (loan − holdback)/purchase = (2,422,000 − 190,000)/2,495,000
check("solved advance matches closed form (loan−holdback)/purchase", near(s2.x, (2_422_000 - 190_000) / 2_495_000, 1e-6), `${s2.x}`);

console.log("\n3. Construction round-trip:");
const C_BASE = {
  purchasePrice: 1_000_000, constructionBudget: 500_000, arv: 2_200_000, asIsValue: 1_200_000,
  rate: 0.1, reserveMonths: 12, reserveDiscount: 1, originationFeePct: 0.02, fixedClosingCosts: 5_000,
  constructionHoldbackPct: 1,
};
const s3 = solveConstructionAdvanceForLtarv(C_BASE, 0.7); // target 70% LTARV
const ltarv = sizeConstruction({ ...C_BASE, purchaseAdvancePct: s3.x }).ltarv;
check("solve advance for 70% LTARV, forward-run hits 0.70", near(ltarv, 0.7, 1e-6), `adv=${s3.x.toFixed(4)} → LTARV=${ltarv.toFixed(6)}`);

console.log("\n4. DSCR direct inversion (no search):");
// NOI $53,200, target 1.25x, 7.625% / 360 → max loan; round-trip: at that loan,
// annual debt service ÷ NOI should be 1/1.25 (i.e. DSCR back to 1.25).
const maxLoan = solveMaxLoanForDscr(53_200, 1.25, 0.07625, 360);
check("max loan at 1.25x DSCR < max loan at 0.8x (tighter coverage → smaller loan)", maxLoan < solveMaxLoanForDscr(53_200, 0.8, 0.07625, 360), `${maxLoan.toFixed(0)}`);

console.log("");
if (failures > 0) { console.error(`Solve layer: ${failures} check(s) FAILED.`); process.exit(1); }
console.log("Solve layer: all checks passed — goal-seek inverts the sizers, round-trips reproduce targets.");
