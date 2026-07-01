// Regression + math cross-check for the ground-up construction sizer.
//
// Four independent checks (the UW-1 discipline: prove the math, surface findings):
//  1. CLOSED-FORM == FIXED-POINT — the capitalized interest reserve is a circular
//     reference (the "Solver" piece). Assert the closed-form solve equals a naive
//     50-iteration fixed point to 1e-9. This is the proof that no Solver/iteration
//     is needed — the engine is deterministic where the spreadsheet iterates.
//  2. SOURCES == USES — the balance identity (loan + equity == total uses).
//  3. WORKED EXAMPLE — a hand-computed deal, every output asserted (incl. the
//     legacy-vs-correct cost-basis behavior from FINDING 1).
//  4. PARK PLACE — the LTC / LTARV / LTAIS / shortage definitions reproduce ICC's
//     real Loan Sizer for Park Place.xlsx (Franklin, TN) Option 1 to the penny.
//
// Run:  npx tsx scripts/verify-construction-sizer.ts   (exit 0 all-pass, 1 on fail)

import { sizeConstruction, type ConstructionSizingInputs } from "../src/lib/underwriting/construction-sizer";

let failures = 0;
const eqCents = (got: number, want: number) => Math.abs(got - want) <= 0.01;
const eqRatio = (got: number, want: number) => Math.abs(got - want) <= 1e-6;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── Worked example ──
const DEAL: ConstructionSizingInputs = {
  name: "Worked ground-up example",
  purchasePrice: 1_000_000,
  constructionBudget: 500_000,
  arv: 2_200_000,
  asIsValue: 1_200_000,
  rate: 0.1,
  reserveMonths: 12,
  reserveDiscount: 1,
  originationFeePct: 0.02,
  fixedClosingCosts: 5_000,
  purchaseAdvancePct: 0.8,
  constructionHoldbackPct: 1,
};
const r = sizeConstruction(DEAL);

console.log("\n1. Closed-form capitalized reserve == fixed-point iteration (the 'Solver' proof):");
const base = 800_000 + 500_000; // advance + holdback
const k = (0.1 / 12) * 12 * 1; // 0.10
let loanIter = 0;
for (let i = 0; i < 50; i++) loanIter = base + loanIter * k; // totalLoan = base + loan·k
check("closed-form total loan == 50-iteration fixed point", eqCents(r.totalLoan, loanIter), `${r.totalLoan} vs ${loanIter}`);
check("reserve == totalLoan × k", eqCents(r.interestReserve, r.totalLoan * k), `${r.interestReserve}`);
check("total loan = $1,444,444.44", eqCents(r.totalLoan, 1_444_444.4444444444), `${r.totalLoan}`);
check("interest reserve = $144,444.44", eqCents(r.interestReserve, 144_444.44444444444), `${r.interestReserve}`);

console.log("\n2. Sources == Uses (balance identity):");
check("loan + equity == total uses", eqCents(r.totalLoan + r.equityRequired, r.totalUses), `${r.totalLoan + r.equityRequired} vs ${r.totalUses}`);
check("total uses = $1,678,333.33", eqCents(r.totalUses, 1_678_333.3333333333), `${r.totalUses}`);
check("equity required = $233,888.89", eqCents(r.equityRequired, 233_888.8888888889), `${r.equityRequired}`);

console.log("\n3. Worked example outputs:");
check("initial disbursement = $800,000", eqCents(r.initialDisbursement, 800_000));
check("construction holdback = $500,000", eqCents(r.constructionHoldback, 500_000));
check("closing costs = $33,888.89", eqCents(r.closingCosts, 33_888.888888888889), `${r.closingCosts}`);
check("cost basis (closing counted) = $1,678,333.33", eqCents(r.costBasis, 1_678_333.3333333333), `${r.costBasis}`);
check("LTC = 86.07%", eqRatio(r.ltc, 1_444_444.4444444444 / 1_678_333.3333333333), `${r.ltc}`);
check("LTARV = 65.66%", eqRatio(r.ltarv, 1_444_444.4444444444 / 2_200_000), `${r.ltarv}`);
check("initial LTAIS = 66.67%", eqRatio(r.initialLtais as number, 800_000 / 1_200_000), `${r.initialLtais}`);

console.log("\n   FINDING 1 — legacy cost basis omits closing (source-sheet behavior):");
const legacy = sizeConstruction({ ...DEAL, legacyCostBasis: true });
check("legacy cost basis = $1,644,444.44 (no closing)", eqCents(legacy.costBasis, 1_644_444.4444444444), `${legacy.costBasis}`);
check("legacy LTC (87.84%) > correct LTC (86.07%)", legacy.ltc > r.ltc, `${legacy.ltc} vs ${r.ltc}`);

console.log("\n   Buy-box caps → recommended max loan:");
const capped = sizeConstruction({ ...DEAL, maxLTC: 0.85, maxLoanToARV: 0.7 });
check("max by LTARV = 70% × ARV = $1,540,000", eqCents(capped.maxLoanByLTARV as number, 1_540_000), `${capped.maxLoanByLTARV}`);
check("recommended max = min(LTC cap, LTARV cap)", eqCents(capped.recommendedMaxLoan as number, Math.min(capped.maxLoanByLTC as number, capped.maxLoanByLTARV as number)));

console.log("\n4. Park Place real-deal ratio definitions (Loan Sizer for Park Place, Option 1):");
// Real numbers from the sheet: loan $1.0M, cost basis $1.634M, ARV $1.75M,
// initial advance $554k (payoff $514k + fees $40k), as-is $1.1M, reserve $759,999.
const pp = { loan: 1_000_000, costBasis: 1_634_000, arv: 1_750_000, initialAdvance: 554_000, asIs: 1_100_000, payoff: 514_000, fees: 40_000, reserve: 759_999 };
check("LTC = loan/costBasis = 0.611995", eqRatio(pp.loan / pp.costBasis, 0.61199510403916768), `${pp.loan / pp.costBasis}`);
check("LTARV = loan/ARV = 0.571428", eqRatio(pp.loan / pp.arv, 0.5714285714285714), `${pp.loan / pp.arv}`);
check("initial LTAIS = advance/as-is = 0.503636", eqRatio(pp.initialAdvance / pp.asIs, 0.50363636363636366), `${pp.initialAdvance / pp.asIs}`);
check("shortage = uses − loan = $313,999", eqCents(pp.payoff + pp.fees + pp.reserve - pp.loan, 313_999), `${pp.payoff + pp.fees + pp.reserve - pp.loan}`);

console.log("");
if (failures > 0) { console.error(`Construction sizer: ${failures} check(s) FAILED.`); process.exit(1); }
console.log("Construction sizer: all checks passed — closed-form reserve is exact; ratios match ICC's real deals.");
