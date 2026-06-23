// Regression test for the Underwriting Workbench sizing engine.
//
// PulseClose has no unit-test runner, so this is a tsx-runnable assertion
// script (the repo's verification convention — see scripts/). It is the
// credibility anchor for the loan-sizing math: the engine must reproduce a
// hand-computed bridge underwrite. Ported from the validated standalone's
// underwrite.test.ts (consulting/shared/products/bridge-deal-evaluator).
//
// Run:  npx tsx scripts/verify-underwriting-engine.ts
// Exits 0 on all-pass, 1 on any failure.

import {
  underwrite,
  mortgageConstant,
  type SizingInputs,
} from "../src/lib/underwriting/sizing";

// $10M multifamily acquisition, $2M reposition, $0.5M closing ($12.5M all-in).
// In-place NOI $600k (6% going-in cap => $10M as-is); stabilized NOI $1.2M
// (5.5% exit cap => ~$21.82M ARV). 9.5% interest-only bridge.
const SAMPLE_DEAL: SizingInputs = {
  name: "Sample value-add multifamily (bridge)",
  purchasePrice: 10_000_000,
  rehabBudget: 2_000_000,
  closingCosts: 500_000,
  currentNOI: 600_000,
  stabilizedNOI: 1_200_000,
  goingInCapRate: 0.06,
  exitCapRate: 0.055,
  rate: 0.095, // interest-only
  termMonths: 24,
  maxLTV: 0.75,
  maxLTC: 0.7,
  maxLoanToARV: 0.65,
  minDSCR: 1.0,
  minDebtYield: 0.08,
  coverageBasis: "current",
  sellingCostPct: 0.02,
};

let failures = 0;
const near = (got: number, want: number, tol = 0.001) =>
  Math.abs(got - want) / (Math.abs(want) > 1e-9 ? Math.abs(want) : 1) <= tol;

function check(label: string, pass: boolean, detail = "") {
  if (pass) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const r = underwrite(SAMPLE_DEAL);

console.log("\nValuation (as-is + stabilized/ARV):");
check("as-is value = $10M (600k / 6%)", near(r.asIsValue, 10_000_000), `got ${r.asIsValue}`);
check("stabilized value = ~$21.82M (1.2M / 5.5%)", near(r.stabilizedValue!, 21_818_181.82), `got ${r.stabilizedValue}`);
check("total project cost = $12.5M", near(r.totalProjectCost, 12_500_000), `got ${r.totalProjectCost}`);

console.log("\nSizing (binding constraint = DSCR @ 1.0x on in-place NOI):");
check("binding constraint is DSCR", r.bindingConstraint === "DSCR", `got ${r.bindingConstraint}`);
check("max loan = $6,315,789.47", near(r.maxLoan, 6_315_789.47), `got ${r.maxLoan}`);
check("annual debt service = $600,000", near(r.annualDebtService, 600_000), `got ${r.annualDebtService}`);
check("equity required = $6,184,210.53", near(r.equityRequired, 6_184_210.53), `got ${r.equityRequired}`);

console.log("\nResulting metrics:");
check("LTV = 63.16%", near(r.ltv, 0.631579), `got ${r.ltv}`);
check("LTC = 50.53%", near(r.ltc, 0.505263), `got ${r.ltc}`);
check("DSCR in-place = 1.00x", near(r.dscrCurrent, 1.0), `got ${r.dscrCurrent}`);
check("DSCR stabilized = 2.00x", near(r.dscrStabilized!, 2.0), `got ${r.dscrStabilized}`);
check("debt yield in-place = 9.5%", near(r.debtYieldCurrent, 0.095), `got ${r.debtYieldCurrent}`);
check("debt yield stabilized = 19.0%", near(r.debtYieldStabilized!, 0.19), `got ${r.debtYieldStabilized}`);

console.log("\nValue-add returns sketch:");
check("yield-on-cost = 9.6%", near(r.returnOnCost!, 0.096), `got ${r.returnOnCost}`);
check("development spread = 4.1%", near(r.developmentSpread!, 0.041), `got ${r.developmentSpread}`);
check("project profit = $8,881,818.18", near(r.projectProfit!, 8_881_818.18), `got ${r.projectProfit}`);
check("equity multiple = 2.44x", near(r.equityMultiple!, 2.4362, 0.002), `got ${r.equityMultiple}`);

console.log("\nConstraint ladder:");
check("lists all 5 constraints", r.constraints.length === 5, `got ${r.constraints.length}`);
check("exactly one binding", r.constraints.filter((c) => c.binding).length === 1);
check("lowest-permitted is first and binding", r.constraints[0].binding === true);

console.log("\nBinding constraint switches when coverage is loosened:");
const r2 = underwrite({ ...SAMPLE_DEAL, minDSCR: 0.5, minDebtYield: 0.05 });
check("LTV binds at $7.5M", r2.bindingConstraint === "LTV" && near(r2.maxLoan, 7_500_000), `got ${r2.bindingConstraint} ${r2.maxLoan}`);

console.log("\nMortgage constant:");
check("equals rate when interest-only", near(mortgageConstant(0.095), 0.095));
check("exceeds rate when amortizing (30yr @ 9.5%)", mortgageConstant(0.095, 360) > 0.095 && near(mortgageConstant(0.095, 360), 0.10089, 0.01));

if (failures > 0) {
  console.error(`\n❌ ${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log("\n✅ All underwriting-engine checks passed.\n");
