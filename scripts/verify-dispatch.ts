// Cross-check for the sizing-mode dispatcher (UW-1 capstone).
//
// Verifies (a) the loan_type → mode mapping across the real Nexys enum spellings,
// (b) the CALIBRATION #14 economics override (heavy build cost re-routes a
// mislabeled deal to construction), and (c) sizeDeal() returns the correctly-typed
// mode-tagged result and matches calling the sizer directly.
//
// Run:  npx tsx scripts/verify-dispatch.ts   (exit 0 all-pass, 1 on fail)

import { sizingModeForLoanType, sizeDeal } from "../src/lib/underwriting/dispatch";
import { sizeRtl } from "../src/lib/underwriting/rtl-sizer";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\n1. loan_type → sizing mode (real Nexys enum spellings):");
check("'Ground Up Construction' → construction", sizingModeForLoanType("Ground Up Construction") === "construction");
check("'Fix & Flip / Fix to Rent' → rtl", sizingModeForLoanType("Fix & Flip / Fix to Rent") === "rtl");
check("'DSCR (Rental Loan)' → dscr", sizingModeForLoanType("DSCR (Rental Loan)") === "dscr");
check("'Bridge' → bridge", sizingModeForLoanType("Bridge") === "bridge");
check("unknown/empty → bridge (safe default)", sizingModeForLoanType("") === "bridge" && sizingModeForLoanType(null) === "bridge");
check("case-insensitive ('ground up construction')", sizingModeForLoanType("ground up construction") === "construction");

console.log("\n2. CALIBRATION #14 — economics override a mislabeled deal:");
// Loan 10228 shape: tagged 'Refinance'/'Bridge' but rehab $2.11M >> as-is $550k.
check(
  "'Bridge' with rehab ≥ as-is → construction (10228 teardown case)",
  sizingModeForLoanType("Bridge", { rehabBudget: 2_110_000, asIsValue: 550_000 }) === "construction",
  sizingModeForLoanType("Bridge", { rehabBudget: 2_110_000, asIsValue: 550_000 }),
);
check(
  "'Bridge' with modest rehab < as-is → stays bridge",
  sizingModeForLoanType("Bridge", { rehabBudget: 100_000, asIsValue: 800_000 }) === "bridge",
);
check(
  "no economics → label wins",
  sizingModeForLoanType("DSCR (Rental Loan)") === "dscr",
);

console.log("\n3. sizeDeal() routes + returns the mode-tagged result:");
const rtlInput = {
  mode: "rtl" as const,
  asIsValue: 2_480_000, arv: 3_250_000, purchasePrice: 2_495_000, rehabBudget: 190_000,
  purchaseAdvancePct: 0.89, rehabFundingPct: 1, interestRate: 0.085, prepaidInterestMonths: 1,
  closingCostsPct: 0.002, tier: 1 as const, fico: 750, rehabType: "Light" as const,
};
const out = sizeDeal(rtlInput);
check("sizeDeal(mode:rtl).mode === 'rtl'", out.mode === "rtl");
check(
  "sizeDeal result matches sizeRtl() directly (max loan $2,422,000)",
  out.mode === "rtl" && Math.abs(out.result.recommendedMaxLoan - sizeRtl(rtlInput).recommendedMaxLoan) <= 0.01,
);
const con = sizeDeal({
  mode: "construction",
  purchasePrice: 1_000_000, constructionBudget: 500_000, arv: 2_200_000, asIsValue: 1_200_000,
  rate: 0.1, reserveMonths: 12, reserveDiscount: 1, originationFeePct: 0.02, fixedClosingCosts: 5_000,
  purchaseAdvancePct: 0.8, constructionHoldbackPct: 1,
});
check("sizeDeal(mode:construction).mode === 'construction'", con.mode === "construction");
check("construction total loan = $1,444,444.44", con.mode === "construction" && Math.abs(con.result.totalLoan - 1_444_444.4444444444) <= 0.01);

console.log("");
if (failures > 0) { console.error(`Dispatch: ${failures} check(s) FAILED.`); process.exit(1); }
console.log("Dispatch: all checks passed — loan_type routes correctly; economics override honored.");
