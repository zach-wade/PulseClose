// DSCR / rental income-approach sizer (UW-6).
//
// Replicates ICC's DSCR Calculator.xlsx (2026-07-01 trove,
// clients/insignia-capital/data/loan-sizer-trove-2026-07/README.md). The sheet
// holds TWO calculators that use TWO different DSCR conventions — a real
// distinction worth naming (CALIBRATION-FINDINGS #22):
//
//  • RESIDENTIAL "PITIA DSCR" (the DSCR-loan convention): given a loan, DSCR =
//    gross monthly rent ÷ PITIA, where PITIA = P&I + taxes + insurance + HOA.
//    Debt service SITS INSIDE the ratio denominator alongside T&I. This is what
//    DSCR-rental lenders quote. -> dscrForLoan()
//
//  • COMMERCIAL "NOI DSCR" (the CRE convention): NOI already nets out opex
//    (taxes/insurance), and DSCR = NOI ÷ (P&I only). Sizing inverts it to a max
//    loan via present value of the supportable payment. -> maxLoanByDscr()
//
// maxLoanByDscr() is algebraically identical to the DSCR constraint already in
// sizing.ts `underwrite()` (maxLoan = NOI / (DSCR × mortgageConstant)); the test
// asserts that equivalence, so the two engines never drift.
//
// Pure, dependency-free. $ whole dollars, rates decimals. Cross-checked in
// scripts/verify-dscr-sizer.ts.

import { mortgageConstant } from "./sizing";

/** Excel PMT magnitude: level payment that amortizes `loan` at monthly `rate`
 *  over `nper` months. Interest-only (nper ≤ 0) => interest-only payment. */
export function monthlyPayment(loan: number, annualRate: number, amortizationMonths?: number): number {
  const r = annualRate / 12;
  if (!amortizationMonths || amortizationMonths <= 0) return loan * r; // interest-only
  if (r === 0) return loan / amortizationMonths;
  return (loan * r) / (1 - Math.pow(1 + r, -amortizationMonths));
}

/** Excel PV magnitude: loan supported by a level monthly `payment` at monthly
 *  `rate` over `nper` months. Interest-only => payment ÷ monthly rate. */
export function presentValue(payment: number, annualRate: number, amortizationMonths?: number): number {
  const r = annualRate / 12;
  if (!amortizationMonths || amortizationMonths <= 0) return r > 0 ? payment / r : 0; // interest-only
  if (r === 0) return payment * amortizationMonths;
  return (payment * (1 - Math.pow(1 + r, -amortizationMonths))) / r;
}

// ─────────────────────────── residential PITIA DSCR ───────────────────────────

export interface ResidentialDscrInputs {
  monthlyRent: number; // gross scheduled rent
  loanAmount: number;
  rate: number; // annual, decimal
  amortizationMonths?: number; // 0/undefined => interest-only
  monthlyTaxes?: number;
  monthlyInsurance?: number;
  monthlyHoa?: number;
  propertyValue?: number; // for LTV
}

export interface ResidentialDscrResult {
  monthlyPI: number; // amortizing principal & interest
  pitia: number; // P&I + taxes + insurance + HOA
  dscrAmortizing: number; // rent ÷ PITIA
  interestOnlyPayment: number; // loan × rate/12
  ioTia: number; // IO + taxes + insurance + HOA
  dscrInterestOnly: number; // rent ÷ IO-TIA
  ltv: number | null; // loan ÷ value
}

/** Given a loan, compute residential PITIA DSCR (amortizing + interest-only). */
export function dscrForLoan(d: ResidentialDscrInputs): ResidentialDscrResult {
  const tia = (d.monthlyTaxes ?? 0) + (d.monthlyInsurance ?? 0) + (d.monthlyHoa ?? 0);
  const monthlyPI = monthlyPayment(d.loanAmount, d.rate, d.amortizationMonths);
  const pitia = monthlyPI + tia;
  const interestOnlyPayment = (d.loanAmount * d.rate) / 12;
  const ioTia = interestOnlyPayment + tia;
  return {
    monthlyPI,
    pitia,
    dscrAmortizing: d.monthlyRent / pitia,
    interestOnlyPayment,
    ioTia,
    dscrInterestOnly: d.monthlyRent / ioTia,
    ltv: d.propertyValue ? d.loanAmount / d.propertyValue : null,
  };
}

// ─────────────────────────── commercial NOI DSCR max loan ───────────────────────────

export interface MaxLoanByDscrInputs {
  annualNOI: number; // net of opex (taxes/insurance/etc.)
  targetDSCR: number;
  rate: number; // annual, decimal
  amortizationMonths?: number; // 0/undefined => interest-only
}

export interface MaxLoanByDscrResult {
  annualDebtServiceSupported: number; // NOI ÷ target DSCR
  monthlyPaymentSupported: number;
  maxLoan: number; // present value of the supportable payment
  maxLoanViaConstant: number; // NOI / (DSCR × mortgage constant) — equivalence check
}

/** Given NOI + a target DSCR, compute the max supportable loan (PV of the
 *  supportable payment). Equivalent to sizing.ts `underwrite()`'s DSCR path. */
export function maxLoanByDscr(d: MaxLoanByDscrInputs): MaxLoanByDscrResult {
  const annualDebtServiceSupported = d.annualNOI / d.targetDSCR;
  const monthlyPaymentSupported = annualDebtServiceSupported / 12;
  const maxLoan = presentValue(monthlyPaymentSupported, d.rate, d.amortizationMonths);
  const k = mortgageConstant(d.rate, d.amortizationMonths);
  return {
    annualDebtServiceSupported,
    monthlyPaymentSupported,
    maxLoan,
    maxLoanViaConstant: d.annualNOI / (d.targetDSCR * k),
  };
}
