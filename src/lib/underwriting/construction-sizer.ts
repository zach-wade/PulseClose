// Ground-up construction loan sizer.
//
// Replicates ICC's Loan Sizer - Construction.xlsx (decoded in the 2026-07-01
// trove, clients/insignia-capital/data/loan-sizer-trove-2026-07/README.md) — a
// Sources/Uses model that BUILDS the loan from an advance on the purchase basis +
// a construction holdback + a **capitalized interest reserve**.
//
// The interest reserve is the "Solver" piece: the reserve is funded by the loan,
// and is computed ON the loan that includes it — a circular reference Excel
// resolves by iteration. It solves in CLOSED FORM, so this engine is deterministic
// where the spreadsheet iterates:
//
//     base      = purchaseAdvance + constructionHoldback         (the non-reserve loan)
//     k         = rate/12 × reserveMonths × reserveDiscount      (the reserve factor)
//     totalLoan = base / (1 − k)
//     reserve   = totalLoan − base = base × k / (1 − k)
//
// This is the ground-up companion to rtl-sizer.ts (fix&flip) and the income-based
// underwrite() in sizing.ts. Pure, dependency-free. $ in whole dollars, rates as
// decimals. Cross-checked (closed-form == fixed-point; Park Place real deal) in
// scripts/verify-construction-sizer.ts.
//
// Two findings from the source model, preserved here as deliberate choices:
//  • FINDING 1 — the sheet's Total Cost = SUM(purchase, construction, reserve) omits
//    closing costs, so its "Closing costs in LTC?" toggle is a no-op. We DEFAULT to
//    the correct behavior (closing counted when closingInCostBasis) and expose
//    `legacyCostBasis` to reproduce the sheet exactly.
//  • FINDING 2 — the reserve is sized on the full loan for the full term (draws
//    actually ramp, so this over-reserves early → conservative). A draw-weighted
//    reserve is the AN-2 "reserve adequacy" improvement; this engine matches the
//    sheet's conservative full-balance basis.

export type ConstructionLoanType = "purchase" | "refinance";

export interface ConstructionSizingInputs {
  name?: string;
  loanType?: ConstructionLoanType; // default "purchase"

  // basis
  purchasePrice: number; // purchase price, or (refi) the as-is / payoff basis for the initial disbursement
  constructionBudget: number;
  arv: number; // after-repaired value
  asIsValue?: number; // as-is value (for initial LTAIS + refi)

  // rate + capitalized reserve
  rate: number; // annual, decimal
  reserveMonths?: number; // months of interest to capitalize (default 0 => no reserve)
  reserveDiscount?: number; // 0..1 factor on the reserve (default 1)

  // fees
  originationFeePct?: number; // of total loan (default 0)
  fixedClosingCosts?: number; // $ (default 0)

  // how the loan is built (advance rates)
  purchaseAdvancePct: number; // initial disbursement ÷ purchase basis
  constructionHoldbackPct?: number; // holdback ÷ construction budget (default 1)

  // cost-basis composition (see FINDING 1)
  reserveInCostBasis?: boolean; // default true
  closingInCostBasis?: boolean; // default true (the source sheet ignored this — legacy flag below)
  legacyCostBasis?: boolean; // true => reproduce the sheet exactly (closing never in basis)

  // optional buy-box caps → a recommended max loan
  maxLTC?: number;
  maxLoanToARV?: number;
}

export interface ConstructionSizingResult {
  // ── loan build (Sources) ──
  initialDisbursement: number; // purchase basis × advance%
  constructionHoldback: number; // budget × holdback%
  interestReserve: number; // capitalized, closed-form
  totalLoan: number;
  reserveFactorK: number; // the k used; guard: must be < 1

  // ── uses / equity ──
  closingCosts: number; // origFee% × loan + fixed
  costBasis: number; // LTC denominator (composition per the flags)
  totalUses: number; // purchase + construction + reserve + closing
  equityRequired: number; // uses − loan (positive = borrower cash in / shortage)

  // ── metrics ──
  ltc: number; // loan ÷ cost basis
  ltarv: number; // loan ÷ ARV
  initialLtais: number | null; // initial disbursement ÷ as-is value

  // ── optional buy-box max ──
  maxLoanByLTC: number | null;
  maxLoanByLTARV: number | null;
  recommendedMaxLoan: number | null;
  loanOverUnderMax: number | null; // totalLoan − recommendedMaxLoan
}

export function sizeConstruction(d: ConstructionSizingInputs): ConstructionSizingResult {
  const holdbackPct = d.constructionHoldbackPct ?? 1;
  const reserveMonths = d.reserveMonths ?? 0;
  const reserveDiscount = d.reserveDiscount ?? 1;
  const origFeePct = d.originationFeePct ?? 0;
  const fixedClosing = d.fixedClosingCosts ?? 0;
  const reserveInCostBasis = d.reserveInCostBasis ?? true;
  const closingInCostBasis = d.closingInCostBasis ?? true;

  const initialDisbursement = d.purchasePrice * d.purchaseAdvancePct;
  const constructionHoldback = d.constructionBudget * holdbackPct;
  const base = initialDisbursement + constructionHoldback;

  // capitalized interest reserve — closed-form solve of the circular reference.
  const k = (d.rate / 12) * reserveMonths * reserveDiscount;
  if (k >= 1) {
    throw new Error(
      `reserve factor k=${k.toFixed(4)} ≥ 1 (rate × months × discount too large) — loan does not converge`,
    );
  }
  const totalLoan = base / (1 - k);
  const interestReserve = totalLoan - base;

  const closingCosts = origFeePct * totalLoan + fixedClosing;

  // cost basis (LTC denominator). FINDING 1: the source sheet omits closing; we
  // count it by default and expose legacyCostBasis to reproduce the sheet.
  const includeClosing = closingInCostBasis && !d.legacyCostBasis;
  const costBasis =
    d.purchasePrice +
    d.constructionBudget +
    (reserveInCostBasis ? interestReserve : 0) +
    (includeClosing ? closingCosts : 0);

  const totalUses = d.purchasePrice + d.constructionBudget + interestReserve + closingCosts;
  const equityRequired = totalUses - totalLoan;

  const ltc = totalLoan / costBasis;
  const ltarv = totalLoan / d.arv;
  const initialLtais = d.asIsValue ? initialDisbursement / d.asIsValue : null;

  let maxLoanByLTC: number | null = null;
  let maxLoanByLTARV: number | null = null;
  let recommendedMaxLoan: number | null = null;
  if (d.maxLTC != null) maxLoanByLTC = d.maxLTC * costBasis;
  if (d.maxLoanToARV != null) maxLoanByLTARV = d.maxLoanToARV * d.arv;
  const caps = [maxLoanByLTC, maxLoanByLTARV].filter((x): x is number => x != null);
  if (caps.length > 0) recommendedMaxLoan = Math.min(...caps);

  return {
    initialDisbursement,
    constructionHoldback,
    interestReserve,
    totalLoan,
    reserveFactorK: k,
    closingCosts,
    costBasis,
    totalUses,
    equityRequired,
    ltc,
    ltarv,
    initialLtais,
    maxLoanByLTC,
    maxLoanByLTARV,
    recommendedMaxLoan,
    loanOverUnderMax: recommendedMaxLoan != null ? totalLoan - recommendedMaxLoan : null,
  };
}
