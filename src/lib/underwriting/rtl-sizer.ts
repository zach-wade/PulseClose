// RTL (Residential Transition Loan — fix&flip / bridge purchase-money) sizer.
//
// Replicates ICC's RTL_Loan_Sizer_Fillable.xlsx (Noah Furie, 2026-06-23),
// decoded in clients/insignia-capital/data/loan-sizer-trove-2026-07/README.md.
//
// This is a DIFFERENT sizing mode from the income/value-add engine in sizing.ts:
// there, as-is value is DERIVED from NOI ÷ cap rate; here, As-Is and ARV are
// DIRECT appraisal inputs and the loan is built as a purchase advance + a rehab
// holdback. It produces a STRUCTURED DEAL — a proceeds waterfall (advance +
// holdback − prepaid interest − closing → net proceeds → cash-to-close → equity%),
// an initial-advance-vs-holdback split, and a per-constraint cushion — not just a
// max-loan number. That structure is what lets the product REPLACE the lender's
// Excel one-sheet rather than sit beside it (ROADMAP UW-1).
//
// Dispatch: use this for loan_type = Fix&Flip / RTL / Ground-Up (purchase-money,
// rehab-holdback deals). Use sizing.ts `underwrite()` for stabilized / DSCR-rental
// / MFR-income deals where value comes from NOI.
//
// Pure, dependency-free, no I/O. All $ in whole dollars; rates/percents as
// decimals (0.089 = 89%). Golden fixture (Option_1) asserted to the penny in
// scripts/verify-rtl-sizer.ts.

export type RehabType = "Light" | "Moderate" | "Heavy";
export type BorrowerTier = 1 | 2 | 3;

/** One row of the editable Tier × Rehab-Type buy-box (the Guidelines tab). */
export interface RtlGuideline {
  tier: BorrowerTier;
  rehabType: RehabType;
  minFico: number;
  maxPurchaseAdvancePct: number; // max initial advance ÷ purchase price
  maxInitialLtv: number; // max initial advance ÷ as-is value
  maxLtc: number; // max loan ÷ total cost
  maxLtarv: number; // max loan ÷ ARV
  comment?: string;
}

/** ICC's default RTL buy-box grid (RTL_Loan_Sizer Guidelines tab, 2026-06-23).
 *  Editable per lender — pass a replacement via RtlSizingInputs.guidelines. */
export const RTL_GUIDELINES: RtlGuideline[] = [
  { tier: 1, rehabType: "Light", minFico: 720, maxPurchaseAdvancePct: 0.9, maxInitialLtv: 0.9, maxLtc: 0.925, maxLtarv: 0.75, comment: "Strong borrower / light rehab" },
  { tier: 1, rehabType: "Moderate", minFico: 720, maxPurchaseAdvancePct: 0.875, maxInitialLtv: 0.875, maxLtc: 0.9, maxLtarv: 0.7, comment: "Tier 1 / moderate rehab" },
  { tier: 1, rehabType: "Heavy", minFico: 720, maxPurchaseAdvancePct: 0.85, maxInitialLtv: 0.85, maxLtc: 0.875, maxLtarv: 0.65, comment: "Tier 1 / heavy rehab" },
  { tier: 2, rehabType: "Light", minFico: 680, maxPurchaseAdvancePct: 0.85, maxInitialLtv: 0.85, maxLtc: 0.875, maxLtarv: 0.7, comment: "Tier 2 / light rehab" },
  { tier: 2, rehabType: "Moderate", minFico: 680, maxPurchaseAdvancePct: 0.825, maxInitialLtv: 0.825, maxLtc: 0.85, maxLtarv: 0.65, comment: "Tier 2 / moderate rehab" },
  { tier: 2, rehabType: "Heavy", minFico: 680, maxPurchaseAdvancePct: 0.8, maxInitialLtv: 0.8, maxLtc: 0.825, maxLtarv: 0.6, comment: "Tier 2 / heavy rehab" },
  { tier: 3, rehabType: "Light", minFico: 640, maxPurchaseAdvancePct: 0.8, maxInitialLtv: 0.8, maxLtc: 0.85, maxLtarv: 0.65, comment: "Tier 3 / light rehab" },
  { tier: 3, rehabType: "Moderate", minFico: 640, maxPurchaseAdvancePct: 0.775, maxInitialLtv: 0.775, maxLtc: 0.825, maxLtarv: 0.6, comment: "Tier 3 / moderate rehab" },
  { tier: 3, rehabType: "Heavy", minFico: 640, maxPurchaseAdvancePct: 0.75, maxInitialLtv: 0.75, maxLtc: 0.8, maxLtarv: 0.55, comment: "Tier 3 / heavy rehab" },
];

export interface RtlSizingInputs {
  name?: string;

  // appraisal / cost (direct inputs — NOT derived from a cap rate)
  asIsValue: number;
  arv: number; // after-repair value
  purchasePrice: number;
  rehabBudget: number;

  // requested structure
  purchaseAdvancePct: number; // requested advance ÷ purchase price (e.g. 0.89)
  rehabFundingPct?: number; // share of rehab held back + funded (default 1.0)
  interestRate: number; // annual, decimal
  prepaidInterestMonths?: number; // months of interest collected at close (default 0)
  closingCostsPct?: number; // of the loan amount (default 0)

  // borrower / project profile → selects the buy-box row
  tier: BorrowerTier;
  fico: number;
  rehabType: RehabType;

  guidelines?: RtlGuideline[]; // override the default grid
}

export type RtlConstraintKey = "FICO" | "InitialLTV" | "LTP" | "LTC" | "LTARV";

export interface RtlConstraint {
  key: RtlConstraintKey;
  label: string;
  actual: number; // ratio at the proposed structure (or the FICO value)
  limit: number; // guideline
  pass: boolean;
  /** Headroom to the limit. For ratio tests, limit − actual (higher = more room).
   *  For FICO, actual − minFico (points of buffer). Surface this everywhere a
   *  constraint binds — it's the "how much room to negotiate" signal (UW-1 cushion). */
  cushion: number;
  /** Max loan this constraint permits (null for FICO, which is a gate not a sizer). */
  maxLoan: number | null;
  basis: string;
}

export interface RtlSizingResult {
  guideline: RtlGuideline; // the buy-box row used

  // ── proceeds waterfall ──
  totalCost: number; // purchase + rehab
  purchaseAdvance: number; // purchase × advance%
  rehabHoldback: number; // rehab × funding%
  proposedLoan: number; // advance + holdback
  initialAdvance: number; // loan − holdback (funded at close)
  prepaidInterest: number; // initialAdvance × rate/12 × months
  closingCosts: number; // loan × closing%
  netProceedsAtClose: number; // loan − holdback − prepaid − closing
  cashToClose: number; // max(0, purchase − net proceeds)
  borrowerEquityPct: number; // cash-to-close ÷ purchase

  // ── constraints + max loan ──
  constraints: RtlConstraint[]; // FICO + the four ratio tests, sorted by maxLoan
  recommendedMaxLoan: number; // MIN across the four ratio tests
  bindingConstraint: RtlConstraintKey; // which ratio test sets the max
  loanOverUnderMax: number; // proposed − recommended max (negative = headroom)
  recommendedInitialAdvance: number; // max(0, maxLoan − holdback)
  overallStatus: "PASS" | "FAIL"; // proposed ≤ recommended max AND FICO passes
}

function pickGuideline(g: RtlGuideline[], tier: BorrowerTier, rehabType: RehabType): RtlGuideline {
  const row = g.find((r) => r.tier === tier && r.rehabType === rehabType);
  if (!row) throw new Error(`no RTL guideline for tier ${tier} / ${rehabType}`);
  return row;
}

export function sizeRtl(d: RtlSizingInputs): RtlSizingResult {
  const grid = d.guidelines ?? RTL_GUIDELINES;
  const g = pickGuideline(grid, d.tier, d.rehabType);

  const rehabFundingPct = d.rehabFundingPct ?? 1;
  const prepaidMonths = d.prepaidInterestMonths ?? 0;
  const closingPct = d.closingCostsPct ?? 0;

  // ── waterfall ──
  const totalCost = d.purchasePrice + d.rehabBudget;
  const purchaseAdvance = d.purchasePrice * d.purchaseAdvancePct;
  const rehabHoldback = d.rehabBudget * rehabFundingPct;
  const proposedLoan = purchaseAdvance + rehabHoldback;
  const initialAdvance = proposedLoan - rehabHoldback; // = purchaseAdvance
  const prepaidInterest = (initialAdvance * d.interestRate) / 12 * prepaidMonths;
  const closingCosts = proposedLoan * closingPct;
  const netProceedsAtClose = proposedLoan - rehabHoldback - prepaidInterest - closingCosts;
  const cashToClose = Math.max(0, d.purchasePrice - netProceedsAtClose);
  const borrowerEquityPct = d.purchasePrice > 0 ? cashToClose / d.purchasePrice : 0;

  // ── constraints ──
  // Note the holdback add-back on the advance-based tests: LTV/LTP govern the
  // INITIAL ADVANCE (what funds at close) against as-is / purchase, so the max
  // TOTAL loan they permit is (basis × limit) + the rehab holdback.
  const initialLtv = initialAdvance / d.asIsValue;
  const ltp = purchaseAdvance / d.purchasePrice;
  const ltc = proposedLoan / totalCost;
  const ltarv = proposedLoan / d.arv;

  const ratioConstraints: RtlConstraint[] = [
    {
      key: "InitialLTV",
      label: "Initial LTV (advance ÷ as-is)",
      actual: initialLtv,
      limit: g.maxInitialLtv,
      pass: initialLtv <= g.maxInitialLtv,
      cushion: g.maxInitialLtv - initialLtv,
      maxLoan: d.asIsValue * g.maxInitialLtv + rehabHoldback,
      basis: `${(g.maxInitialLtv * 100).toFixed(1)}% of as-is + holdback`,
    },
    {
      key: "LTP",
      label: "Loan-to-Purchase (advance ÷ purchase)",
      actual: ltp,
      limit: g.maxPurchaseAdvancePct,
      pass: ltp <= g.maxPurchaseAdvancePct,
      cushion: g.maxPurchaseAdvancePct - ltp,
      maxLoan: d.purchasePrice * g.maxPurchaseAdvancePct + rehabHoldback,
      basis: `${(g.maxPurchaseAdvancePct * 100).toFixed(1)}% of purchase + holdback`,
    },
    {
      key: "LTC",
      label: "Loan-to-Cost",
      actual: ltc,
      limit: g.maxLtc,
      pass: ltc <= g.maxLtc,
      cushion: g.maxLtc - ltc,
      maxLoan: totalCost * g.maxLtc,
      basis: `${(g.maxLtc * 100).toFixed(1)}% of total cost`,
    },
    {
      key: "LTARV",
      label: "Loan-to-ARV",
      actual: ltarv,
      limit: g.maxLtarv,
      pass: ltarv <= g.maxLtarv,
      cushion: g.maxLtarv - ltarv,
      maxLoan: d.arv * g.maxLtarv,
      basis: `${(g.maxLtarv * 100).toFixed(1)}% of ARV`,
    },
  ];

  const recommendedMaxLoan = Math.min(...ratioConstraints.map((c) => c.maxLoan as number));
  const bindingConstraint = ratioConstraints.find((c) => c.maxLoan === recommendedMaxLoan)!.key;

  const ficoConstraint: RtlConstraint = {
    key: "FICO",
    label: "Minimum FICO",
    actual: d.fico,
    limit: g.minFico,
    pass: d.fico >= g.minFico,
    cushion: d.fico - g.minFico,
    maxLoan: null,
    basis: `≥ ${g.minFico}`,
  };

  const constraints = [ficoConstraint, ...ratioConstraints].sort((a, b) => {
    // FICO (no maxLoan) sorts last; ratio tests ascending by permitted loan.
    if (a.maxLoan == null) return 1;
    if (b.maxLoan == null) return -1;
    return a.maxLoan - b.maxLoan;
  });

  const overallStatus: "PASS" | "FAIL" =
    proposedLoan <= recommendedMaxLoan && ficoConstraint.pass ? "PASS" : "FAIL";

  return {
    guideline: g,
    totalCost,
    purchaseAdvance,
    rehabHoldback,
    proposedLoan,
    initialAdvance,
    prepaidInterest,
    closingCosts,
    netProceedsAtClose,
    cashToClose,
    borrowerEquityPct,
    constraints,
    recommendedMaxLoan,
    bindingConstraint,
    loanOverUnderMax: proposedLoan - recommendedMaxLoan,
    recommendedInitialAdvance: Math.max(0, recommendedMaxLoan - rehabHoldback),
    overallStatus,
  };
}
