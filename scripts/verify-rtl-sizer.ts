// Regression test for the RTL (fix&flip / bridge purchase-money) sizer.
//
// The credibility anchor for UW-1: sizeRtl() must reproduce ICC's real
// RTL_Loan_Sizer_Fillable.xlsx (Noah Furie, 2026-06-23) TO THE PENNY on the
// model's own Option_1 default scenario. The decoded model + expected values
// live in clients/insignia-capital/data/loan-sizer-trove-2026-07/README.md.
//
// Same convention as scripts/verify-underwriting-engine.ts (tsx-runnable
// assertion script; no unit-test runner in the repo).
//
// Run:  npx tsx scripts/verify-rtl-sizer.ts
// Exits 0 on all-pass, 1 on any failure.

import { sizeRtl, RTL_GUIDELINES, type RtlSizingInputs } from "../src/lib/underwriting/rtl-sizer";

let failures = 0;
// Penny tolerance: absolute $0.01 on dollar figures, 1e-6 on ratios.
const eqCents = (got: number, want: number) => Math.abs(got - want) <= 0.01;
const eqRatio = (got: number, want: number) => Math.abs(got - want) <= 1e-6;

function check(label: string, pass: boolean, detail = "") {
  if (pass) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Option_1 (the RTL sizer's default fillable inputs) ──
const OPTION_1: RtlSizingInputs = {
  name: "RTL Option_1 (golden fixture)",
  asIsValue: 2_480_000,
  arv: 3_250_000,
  purchasePrice: 2_495_000,
  rehabBudget: 190_000,
  purchaseAdvancePct: 0.89,
  rehabFundingPct: 1,
  interestRate: 0.085,
  prepaidInterestMonths: 1,
  closingCostsPct: 0.002,
  tier: 1,
  fico: 750,
  rehabType: "Light",
};

const r = sizeRtl(OPTION_1);

console.log("\nBuy-box row (Tier 1 / Light):");
check("min FICO 720", r.guideline.minFico === 720);
check("max initial LTV 90%", r.guideline.maxInitialLtv === 0.9);
check("max LTARV 75%", r.guideline.maxLtarv === 0.75);

console.log("\nProceeds waterfall (to the penny vs RTL_Loan_Sizer):");
check("Total cost = $2,685,000", eqCents(r.totalCost, 2_685_000), `${r.totalCost}`);
check("Purchase advance = $2,220,550", eqCents(r.purchaseAdvance, 2_220_550), `${r.purchaseAdvance}`);
check("Rehab holdback = $190,000", eqCents(r.rehabHoldback, 190_000), `${r.rehabHoldback}`);
check("Proposed loan = $2,410,550", eqCents(r.proposedLoan, 2_410_550), `${r.proposedLoan}`);
check("Initial advance = $2,220,550", eqCents(r.initialAdvance, 2_220_550), `${r.initialAdvance}`);
check("Prepaid interest = $15,728.8958…", eqCents(r.prepaidInterest, 15_728.895833333334), `${r.prepaidInterest}`);
check("Closing costs = $4,821.10", eqCents(r.closingCosts, 4_821.1), `${r.closingCosts}`);
check("Net proceeds at close = $2,200,000.00", eqCents(r.netProceedsAtClose, 2_200_000.0041666664), `${r.netProceedsAtClose}`);
check("Cash to close = $294,999.9958…", eqCents(r.cashToClose, 294_999.99583333358), `${r.cashToClose}`);
check("Borrower equity % = 11.82%", eqRatio(r.borrowerEquityPct, 0.1182364712758852), `${r.borrowerEquityPct}`);

console.log("\nGuideline tests (max loan by constraint):");
const byKey = Object.fromEntries(r.constraints.map((c) => [c.key, c]));
check("Initial LTV actual = 89.538%", eqRatio(byKey.InitialLTV.actual, 0.89538306451612903), `${byKey.InitialLTV.actual}`);
check("Initial LTV max loan = $2,422,000", eqCents(byKey.InitialLTV.maxLoan as number, 2_422_000), `${byKey.InitialLTV.maxLoan}`);
check("LTP max loan = $2,435,500", eqCents(byKey.LTP.maxLoan as number, 2_435_500), `${byKey.LTP.maxLoan}`);
check("LTC max loan = $2,483,625", eqCents(byKey.LTC.maxLoan as number, 2_483_625), `${byKey.LTC.maxLoan}`);
check("LTARV max loan = $2,437,500", eqCents(byKey.LTARV.maxLoan as number, 2_437_500), `${byKey.LTARV.maxLoan}`);
check("all five tests PASS", r.constraints.every((c) => c.pass));

console.log("\nMax-loan calculation:");
check("Recommended max loan = $2,422,000", eqCents(r.recommendedMaxLoan, 2_422_000), `${r.recommendedMaxLoan}`);
check("Binding constraint = Initial LTV", r.bindingConstraint === "InitialLTV", r.bindingConstraint);
check("Loan over/(under) max = -$11,450", eqCents(r.loanOverUnderMax, -11_450), `${r.loanOverUnderMax}`);
check("Recommended initial advance = $2,232,000", eqCents(r.recommendedInitialAdvance, 2_232_000), `${r.recommendedInitialAdvance}`);
check("Overall status = PASS", r.overallStatus === "PASS");

console.log("\nCushion (headroom) is surfaced per test:");
check("Initial LTV cushion ≈ 0.462%", eqRatio(byKey.InitialLTV.cushion, 0.9 - 0.89538306451612903), `${byKey.InitialLTV.cushion}`);
check("LTARV cushion ≈ 0.829%", eqRatio(byKey.LTARV.cushion, 0.75 - 0.74170769230769229), `${byKey.LTARV.cushion}`);
check("FICO cushion = 30 pts", byKey.FICO.cushion === 30);

// ── Sanity: a thin-FICO / heavy-rehab Tier 3 deal should bind tighter ──
console.log("\nSanity — Tier 3 / Heavy tightens the box:");
const t3 = sizeRtl({ ...OPTION_1, tier: 3, rehabType: "Heavy", fico: 640 });
check("Tier 3 Heavy max LTARV = 55%", t3.guideline.maxLtarv === 0.55);
check("Tier 3 Heavy binds tighter than Tier 1 Light", t3.recommendedMaxLoan < r.recommendedMaxLoan, `${t3.recommendedMaxLoan}`);
check("guideline grid has 9 rows", RTL_GUIDELINES.length === 9);

console.log("");
if (failures > 0) {
  console.error(`RTL sizer: ${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("RTL sizer: all checks passed — reproduces RTL_Loan_Sizer Option_1 to the penny.");
