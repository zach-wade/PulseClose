// Map an /api/underwrite request body → a mode-tagged structured sizing (UX-2).
//
// The route stays thin: it hands us the parsed body + the resolved SizingMode and
// gets back a SizeDealInput ready for sizeDeal(), or null when the mode's minimum
// inputs aren't present (so the caller can fall back to / require the bridge path).
// Pure + dependency-free; the sizers themselves are the source of truth for the math.

import type { SizeDealInput, SizeDealResult, SizingMode } from "./dispatch";
import type { RehabType, BorrowerTier } from "./rtl-sizer";

/** The subset of the request body this mapper reads. snake_case mirrors the API. */
export interface StructuredRequestBody {
  deal_name?: string | null;
  loan_type?: string | null;
  rate?: number | null; // decimal (already normalized by the route)
  // shared value / cost
  purchase_price?: number | null;
  as_is_value?: number | null;
  arv?: number | null;
  rehab_budget?: number | null;
  construction_budget?: number | null;
  // RTL
  purchase_advance_pct?: number | null;
  rehab_funding_pct?: number | null;
  prepaid_interest_months?: number | null;
  closing_costs_pct?: number | null;
  tier?: number | null;
  borrower_fico?: number | null;
  rehab_type?: string | null;
  // construction
  reserve_months?: number | null;
  reserve_discount?: number | null;
  construction_holdback_pct?: number | null;
  origination_fee_pct?: number | null;
  fixed_closing_costs?: number | null;
  max_ltc?: number | null; // decimal
  max_ltarv?: number | null; // decimal
  // DSCR
  monthly_rent?: number | null;
  target_dscr?: number | null;
  amortization_months?: number | null;
  monthly_taxes?: number | null;
  monthly_insurance?: number | null;
  monthly_hoa?: number | null;
  property_value?: number | null;
}

const pos = (v: number | null | undefined): v is number => typeof v === "number" && !Number.isNaN(v) && v > 0;
const nn = (v: number | null | undefined): number | undefined =>
  v == null || Number.isNaN(v) ? undefined : v;

function coerceTier(v: number | null | undefined): BorrowerTier | null {
  return v === 1 || v === 2 || v === 3 ? v : null;
}
function coerceRehabType(v: string | null | undefined): RehabType | null {
  const t = (v ?? "").trim().toLowerCase();
  if (t === "light") return "Light";
  if (t === "moderate") return "Moderate";
  if (t === "heavy") return "Heavy";
  return null;
}

/**
 * Build the sizeDeal() input for a structured mode, or null if the minimum inputs
 * aren't present (route then falls back to bridge, or 400s). `bridge` is handled
 * by the existing route path, so this returns null for it.
 */
export function buildStructuredInput(mode: SizingMode, b: StructuredRequestBody): SizeDealInput | null {
  const rate = nn(b.rate);
  const name = b.deal_name ?? undefined;

  if (mode === "rtl") {
    const tier = coerceTier(b.tier);
    const rehabType = coerceRehabType(b.rehab_type);
    if (
      !pos(b.as_is_value) || !pos(b.arv) || !pos(b.purchase_price) ||
      !pos(b.purchase_advance_pct) || rate == null || tier == null || rehabType == null ||
      !pos(b.borrower_fico)
    ) return null;
    return {
      mode: "rtl", name,
      asIsValue: b.as_is_value!, arv: b.arv!, purchasePrice: b.purchase_price!,
      rehabBudget: nn(b.rehab_budget) ?? 0,
      purchaseAdvancePct: b.purchase_advance_pct!,
      rehabFundingPct: nn(b.rehab_funding_pct),
      interestRate: rate,
      prepaidInterestMonths: nn(b.prepaid_interest_months),
      closingCostsPct: nn(b.closing_costs_pct),
      tier, fico: b.borrower_fico!, rehabType,
    };
  }

  if (mode === "construction") {
    if (!pos(b.purchase_price) || !pos(b.construction_budget) || !pos(b.arv) ||
        rate == null || !pos(b.purchase_advance_pct)) return null;
    return {
      mode: "construction", name,
      purchasePrice: b.purchase_price!, constructionBudget: b.construction_budget!,
      arv: b.arv!, asIsValue: nn(b.as_is_value),
      rate,
      reserveMonths: nn(b.reserve_months),
      reserveDiscount: nn(b.reserve_discount),
      originationFeePct: nn(b.origination_fee_pct),
      fixedClosingCosts: nn(b.fixed_closing_costs),
      purchaseAdvancePct: b.purchase_advance_pct!,
      constructionHoldbackPct: nn(b.construction_holdback_pct),
      maxLTC: nn(b.max_ltc),
      maxLoanToARV: nn(b.max_ltarv),
    };
  }

  if (mode === "dscr") {
    if (!pos(b.monthly_rent) || !pos(b.target_dscr) || rate == null) return null;
    return {
      mode: "dscr",
      monthlyRent: b.monthly_rent!, targetDSCR: b.target_dscr!, rate,
      amortizationMonths: nn(b.amortization_months),
      monthlyTaxes: nn(b.monthly_taxes),
      monthlyInsurance: nn(b.monthly_insurance),
      monthlyHoa: nn(b.monthly_hoa),
      propertyValue: nn(b.property_value),
    };
  }

  return null; // bridge → existing route path
}

/** A mode-agnostic {maxLoan, bindingConstraint} summary for activity + response. */
export function summarizeStructured(r: SizeDealResult): { maxLoan: number; bindingConstraint: string } {
  switch (r.mode) {
    case "rtl":
      return { maxLoan: r.result.recommendedMaxLoan, bindingConstraint: r.result.bindingConstraint };
    case "construction":
      return {
        maxLoan: r.result.recommendedMaxLoan ?? r.result.totalLoan,
        bindingConstraint: r.result.recommendedMaxLoan != null ? "LTC/LTARV" : "sized",
      };
    case "dscr":
      return { maxLoan: r.result.maxLoan, bindingConstraint: `DSCR ${r.result.targetDSCR}` };
    case "bridge":
      return { maxLoan: r.result.maxLoan, bindingConstraint: r.result.bindingConstraint };
  }
}
