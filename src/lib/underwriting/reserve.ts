// Interest-reserve sizing (Module 10 depth) — "how much reserve does the bridge
// need to carry debt service until the property covers itself?"
//
// On a value-add bridge, in-place NOI doesn't cover debt service through the
// reposition. Lenders fund an interest reserve to bridge that gap — and some
// investors capitalize it into the loan / cost basis (per the pricing interview:
// *"some investors want interest reserve and cost basis"*). It changes the loan
// amount, so it belongs in the sizing layer. Pure, deterministic, drill-down. No I/O.
//
// The reserve covers the monthly shortfall (debt service − in-place NOI, ramping
// toward stabilized NOI) over the reserve period. We report gross (full debt
// service) and net (less the NOI the property actually throws off) so the lender
// sees both the conservative and the realistic number.

import { mortgageConstant } from "./sizing";

export interface InterestReserveInputs {
  loanAmount: number;
  rate: number;
  amortizationMonths?: number; // omit/0 => interest-only (typical bridge)

  reserveMonths: number; // period to reserve for (usually months-to-stabilize)

  // optional NOI offset — the income the property throws off during the period.
  // If a stabilized ramp is given, NOI ramps linearly to it over reserveMonths.
  currentNOI?: number;
  stabilizedNOI?: number;
}

export interface InterestReserveResult {
  monthlyDebtService: number;
  reserveMonths: number;
  grossReserve: number; // full debt service over the period (no income offset)
  noiOffset: number; // in-place/ramping NOI applied over the period
  netReserve: number; // grossReserve − noiOffset, floored at 0 (what's actually needed)
  reserveAsPctOfLoan: number; // netReserve / loanAmount
  summary: string;
}

export function sizeInterestReserve(d: InterestReserveInputs): InterestReserveResult {
  const k = mortgageConstant(d.rate, d.amortizationMonths);
  const monthlyDebtService = (d.loanAmount * k) / 12;
  const months = Math.max(0, Math.round(d.reserveMonths));
  const grossReserve = monthlyDebtService * months;

  // A reserve covers the DEFICIT months — the early months where in-place income
  // can't pay debt service. Surplus in later months (once NOI ramps past DS)
  // accrues to the borrower; it does NOT refund the reserve. So net reserve =
  // sum of the per-month shortfalls, not gross minus total income. NOI ramps
  // linearly from currentNOI to stabilizedNOI over the period; flat if only
  // currentNOI is known; no offset (net == gross) if neither.
  let netReserve = 0;
  for (let m = 1; m <= months; m++) {
    let monthlyNOI = 0;
    if (d.currentNOI != null) {
      const cur = d.currentNOI;
      const stab = d.stabilizedNOI ?? d.currentNOI;
      const frac = months > 0 ? m / months : 1;
      monthlyNOI = (cur + (stab - cur) * frac) / 12;
    }
    netReserve += Math.max(0, monthlyDebtService - monthlyNOI);
  }
  const noiOffset = grossReserve - netReserve; // what in-place income covered
  const reserveAsPctOfLoan = d.loanAmount > 0 ? netReserve / d.loanAmount : 0;

  const summary =
    netReserve <= 0
      ? `In-place income covers debt service over ${months} mo — no interest reserve required.`
      : `Reserve ≈ $${Math.round(netReserve).toLocaleString()} (${(reserveAsPctOfLoan * 100).toFixed(1)}% of loan) to carry ${months} mo of debt service net of in-place income.`;

  return { monthlyDebtService, reserveMonths: months, grossReserve, noiOffset, netReserve, reserveAsPctOfLoan, summary };
}
