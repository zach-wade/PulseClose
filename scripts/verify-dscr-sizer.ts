// Regression + math cross-check for the DSCR / rental income-approach sizer (UW-6).
//
// Three checks:
//  1. RESIDENTIAL PITIA DSCR — reproduce the DSCR Calculator sheet to the penny
//     (amortizing DSCR, interest-only DSCR, LTV).
//  2. COMMERCIAL NOI MAX LOAN — reproduce the sheet's PV-based max loan, AND
//     assert it equals sizing.ts underwrite()'s DSCR formula (no drift between
//     the two engines).
//  3. IO SANITY — interest-only DSCR ≥ amortizing DSCR (lower payment).
//
// Run:  npx tsx scripts/verify-dscr-sizer.ts   (exit 0 all-pass, 1 on fail)

import { dscrForLoan, maxLoanByDscr, monthlyPayment, sizeDscr, presentValue } from "../src/lib/underwriting/dscr-sizer";

let failures = 0;
const eqCents = (got: number, want: number) => Math.abs(got - want) <= 0.01;
const eqRatio = (got: number, want: number) => Math.abs(got - want) <= 1e-6;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\n1. Residential PITIA DSCR (DSCR Calculator sheet, to the penny):");
// Sheet inputs: rent $4,500/mo, loan $700k, 7.875% / 360, taxes $825, ins $200,
// HOA $0, value $1.3M.
const res = dscrForLoan({
  monthlyRent: 4_500,
  loanAmount: 700_000,
  rate: 0.07875,
  amortizationMonths: 360,
  monthlyTaxes: 825,
  monthlyInsurance: 200,
  monthlyHoa: 0,
  propertyValue: 1_300_000,
});
check("monthly P&I = $5,075.49", eqCents(res.monthlyPI, 5075.4857451026037), `${res.monthlyPI}`);
check("PITIA = $6,100.49", eqCents(res.pitia, 6100.4857451026037), `${res.pitia}`);
check("amortizing DSCR = 0.737646", eqRatio(res.dscrAmortizing, 0.73764617901329343), `${res.dscrAmortizing}`);
check("interest-only payment = $4,593.75", eqCents(res.interestOnlyPayment, 4593.75), `${res.interestOnlyPayment}`);
check("IO-TIA = $5,618.75", eqCents(res.ioTia, 5618.75), `${res.ioTia}`);
check("interest-only DSCR = 0.800890", eqRatio(res.dscrInterestOnly, 0.80088987764182429), `${res.dscrInterestOnly}`);
check("LTV = 0.538462", eqRatio(res.ltv as number, 0.53846153846153844), `${res.ltv}`);

console.log("\n2. Commercial NOI max loan (Sheet1 PV, + equivalence to underwrite()):");
// Sheet inputs: income $5,500/mo → $66k/yr; taxes $10.8k; ins $2k → NOI $53.2k;
// target DSCR 0.8; 7.625% / 360.
const mx = maxLoanByDscr({ annualNOI: 53_200, targetDSCR: 0.8, rate: 0.07625, amortizationMonths: 360 });
check("annual debt service supported = $66,500", eqCents(mx.annualDebtServiceSupported, 66_500));
check("monthly payment supported = $5,541.67", eqCents(mx.monthlyPaymentSupported, 5541.666666666667), `${mx.monthlyPaymentSupported}`);
check("max loan (PV) = $782,949.37", eqCents(mx.maxLoan, 782949.36840117874), `${mx.maxLoan}`);
check("PV max loan == underwrite() constant formula (no engine drift)", eqCents(mx.maxLoan, mx.maxLoanViaConstant), `${mx.maxLoan} vs ${mx.maxLoanViaConstant}`);

console.log("\n   Round-trip: the supportable payment amortizes the max loan exactly:");
check("payment(maxLoan) == supportable payment", eqCents(monthlyPayment(mx.maxLoan, 0.07625, 360), mx.monthlyPaymentSupported), "");

console.log("\n3. Interest-only vs amortizing sanity:");
check("IO DSCR ≥ amortizing DSCR (lower payment)", res.dscrInterestOnly >= res.dscrAmortizing, `${res.dscrInterestOnly} vs ${res.dscrAmortizing}`);
const mxIO = maxLoanByDscr({ annualNOI: 53_200, targetDSCR: 0.8, rate: 0.07625 }); // interest-only
check("IO max loan ≥ amortizing max loan", mxIO.maxLoan >= mx.maxLoan, `${mxIO.maxLoan} vs ${mx.maxLoan}`);

console.log("\n4. sizeDscr() — residential PITIA SIZING (resolves #23; inverts dscrForLoan):");
// rent $3,000; target 1.20; 7.5% / 360; T&I $420/mo. supportable PITIA = 3000/1.2 = 2500;
// supportable P&I = 2500 − 420 = 2080; maxLoan = PV(2080, 7.5%, 360).
const sz = sizeDscr({ monthlyRent: 3_000, targetDSCR: 1.2, rate: 0.075, amortizationMonths: 360, monthlyTaxes: 300, monthlyInsurance: 120, monthlyHoa: 0, propertyValue: 500_000 });
check("supportable PITIA = $2,500", eqCents(sz.supportablePitia, 2500), `${sz.supportablePitia}`);
check("supportable P&I = $2,080", eqCents(sz.supportablePI, 2080), `${sz.supportablePI}`);
check("maxLoan == PV(supportable P&I)", eqCents(sz.maxLoan, presentValue(2080, 0.075, 360)), `${sz.maxLoan}`);
check("round-trip: DSCR at maxLoan == target 1.20 (amortizing)", eqCents(sz.atMaxLoan.dscrAmortizing, 1.2), `${sz.atMaxLoan.dscrAmortizing}`);
check("LTV at max computed against value", sz.ltvAtMax != null && Math.abs(sz.ltvAtMax - sz.maxLoan / 500_000) <= 1e-9);
// IO sizes larger than amortizing (lower payment carries more loan).
const szIO = sizeDscr({ monthlyRent: 3_000, targetDSCR: 1.2, rate: 0.075, monthlyTaxes: 300, monthlyInsurance: 120 });
check("IO maxLoan ≥ amortizing maxLoan", szIO.maxLoan >= sz.maxLoan, `${szIO.maxLoan} vs ${sz.maxLoan}`);

console.log("");
if (failures > 0) { console.error(`DSCR sizer: ${failures} check(s) FAILED.`); process.exit(1); }
console.log("DSCR sizer: all checks passed — reproduces the DSCR Calculator; PV path == underwrite() DSCR; sizeDscr round-trips.");
