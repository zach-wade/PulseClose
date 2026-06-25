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
import { sizeTakeout } from "../src/lib/underwriting/exit";
import { stabilizationPath } from "../src/lib/underwriting/stabilization";
import { sizeInterestReserve } from "../src/lib/underwriting/reserve";

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

// ── Exit / takeout sizing (exit.ts) ─────────────────────────────────────────
// Same sample deal: stabilized value ~$21.82M, stabilized NOI $1.2M, bridge
// balance at exit = the sized bridge loan ($6,315,789, interest-only). Size a
// permanent takeout at 70% LTV / 1.25x DSCR / 8% debt yield, 6.5% over 30yr.
console.log("\nExit / takeout sizing (perm takeout at stabilization):");
const t = sizeTakeout({
  stabilizedValue: r.stabilizedValue!,
  stabilizedNOI: 1_200_000,
  bridgeBalanceAtExit: r.maxLoan,
  takeoutMaxLTV: 0.7,
  takeoutMinDSCR: 1.25,
  takeoutMinDebtYield: 0.08,
  takeoutRate: 0.065,
  takeoutAmortizationMonths: 360,
  bridgeTermMonths: 24,
  monthsToStabilize: 18,
});
check("takeout binds on perm DSCR", t.bindingConstraint === "PermDSCR", `got ${t.bindingConstraint}`);
check("max takeout ≈ $12.66M", near(t.maxTakeout, 12_656_700, 0.002), `got ${t.maxTakeout}`);
check("refinanceable (takeout repays bridge)", t.refinanceable === true);
check("takeout coverage ≈ 2.00x", near(t.takeoutCoverage, 2.004, 0.01), `got ${t.takeoutCoverage}`);
check("positive cushion", t.cushion > 0 && t.shortfall === 0, `cushion ${t.cushion} shortfall ${t.shortfall}`);
check("lists 3 perm constraints, one binding", t.constraints.length === 3 && t.constraints.filter((c) => c.binding).length === 1);
check("term sufficient (18mo stabilize ≤ 24mo bridge)", t.termSufficient === true);

console.log("\nExit shortfall scenario (takeout shorts the bridge):");
const t2 = sizeTakeout({
  stabilizedValue: 8_000_000,
  stabilizedNOI: 400_000,
  bridgeBalanceAtExit: 6_000_000,
  takeoutMaxLTV: 0.65,
  takeoutMinDSCR: 1.25,
  takeoutRate: 0.065,
  takeoutAmortizationMonths: 360,
  bridgeTermMonths: 12,
  monthsToStabilize: 20,
});
check("NOT refinanceable", t2.refinanceable === false);
check("reports a shortfall > $1M", t2.shortfall > 1_000_000, `got ${t2.shortfall}`);
check("raises a shortfall flag", t2.flags.some((f) => f.includes("shorts the bridge")));
check("raises a longer-term-required flag", t2.flags.some((f) => f.includes("Longer term required")));

// ── Stabilization-path coverage (stabilization.ts) ──────────────────────────
// Westbrook-shaped: in-place $138k ramps to stabilized $228k over 18 mo on the
// $1.8M bridge @ 9.5% IO. Target 1.25x DSCR. Annual DS = 171,000.
// At stabilization NOI 228k => DSCR 1.33x, so it clears inside the ramp.
console.log("\nStabilization path (years to target DSCR):");
const sp = stabilizationPath({
  currentNOI: 138_000,
  stabilizedNOI: 228_000,
  monthsToStabilize: 18,
  loanAmount: 1_800_000,
  rate: 0.095,
  targetDSCR: 1.25,
});
check("annual debt service = $171,000", near(sp.annualDebtService, 171_000), `got ${sp.annualDebtService}`);
check("projects 5 years", sp.years.length === 5, `got ${sp.years.length}`);
check("clears target within horizon", sp.clearsWithinHorizon === true);
check("clears in ≤ 18 months (within ramp)", sp.monthsToClear != null && sp.monthsToClear <= 18, `got ${sp.monthsToClear}`);
check("year-5 DSCR ≥ stabilized 1.33x", sp.years[4].dscr >= 1.33, `got ${sp.years[4].dscr}`);

console.log("\nStabilization path that never clears (target too high):");
const sp2 = stabilizationPath({ currentNOI: 100_000, stabilizedNOI: 150_000, monthsToStabilize: 24, loanAmount: 2_000_000, rate: 0.10, targetDSCR: 1.25 });
check("does NOT clear within horizon", sp2.clearsWithinHorizon === false && sp2.monthsToClear === null);

// ── Interest-reserve sizing (reserve.ts) ────────────────────────────────────
// $1.8M @ 9.5% IO, 18-mo reserve; in-place $138k ramping to $228k offsets it.
console.log("\nInterest-reserve sizing:");
const ir = sizeInterestReserve({
  loanAmount: 1_800_000,
  rate: 0.095,
  reserveMonths: 18,
  currentNOI: 138_000,
  stabilizedNOI: 228_000,
});
check("monthly debt service = $14,250", near(ir.monthlyDebtService, 14_250), `got ${ir.monthlyDebtService}`);
check("gross reserve = $256,500 (18 mo)", near(ir.grossReserve, 256_500), `got ${ir.grossReserve}`);
check("net reserve < gross (NOI offsets)", ir.netReserve < ir.grossReserve && ir.netReserve > 0, `got ${ir.netReserve}`);
check("reserve % of loan reported", ir.reserveAsPctOfLoan > 0 && ir.reserveAsPctOfLoan < 1);

console.log("\nInterest reserve not required (income covers DS):");
const ir2 = sizeInterestReserve({ loanAmount: 1_000_000, rate: 0.07, reserveMonths: 12, currentNOI: 200_000 });
check("no reserve when in-place income covers", ir2.netReserve === 0);

if (failures > 0) {
  console.error(`\n❌ ${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log("\nCost-spent-to-date basis (finding #16 — in-progress refi):");
// Same deal but $3M already sunk into the build. LTC basis must grow by $3M,
// so the LTC-permitted loan grows by 0.7 * $3M = $2.1M, and total cost reflects it.
const rSpent = underwrite({ ...SAMPLE_DEAL, costSpentToDate: 3_000_000 });
check(
  "total project cost includes spent-to-date ($15.5M)",
  near(rSpent.totalProjectCost, 15_500_000),
  `got ${rSpent.totalProjectCost}`,
);
const ltcOf = (res: typeof r) => res.constraints.find((c) => c.key === "LTC")!.maxLoan;
check(
  "LTC-permitted loan rises by 0.7 × $3M = $2.1M",
  near(ltcOf(rSpent) - ltcOf(r), 2_100_000),
  `got Δ ${ltcOf(rSpent) - ltcOf(r)}`,
);
check(
  "omitting costSpentToDate is unchanged (backward-compatible)",
  near(underwrite(SAMPLE_DEAL).totalProjectCost, r.totalProjectCost),
);

console.log("\n✅ All underwriting-engine checks passed.\n");
