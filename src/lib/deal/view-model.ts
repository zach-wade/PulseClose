// The Deal view-model — the single source of truth the Deal stepper holds.
//
// One Deal moves through 5 steps (Terms → Eligibility → Sizing → Judgment →
// Hand off). Terms are entered ONCE and read by Eligibility + Sizing; editing a
// Term marks downstream results "stale" instead of leaving them silently wrong.
// Sizing + Judgment are opt-in, so a verify-only lender never meets their inputs.
//
// Numeric inputs are stored as strings (mirrors the form state they replace and
// preserves "blank = null / IO" semantics); conversion to numbers happens only
// at API-call time. Result types are declared locally — like the page/panel they
// supersede — to keep this module client-safe (no server-only imports).

// ── Result shapes (the API JSON, stored verbatim) ──────────────────────────

export interface FailureReason {
  field: string;
  rule: string;
  expected: string | number | string[] | null;
  actual: string | number | null;
}

export interface EligibilityResult {
  investor_id: string;
  investor_name: string;
  result: "pass" | "conditional" | "fail";
  failure_reasons: FailureReason[];
  boundary_warnings: { field: string; message: string }[];
  max_ltv: number | null;
  max_ltc: number | null;
  max_ltarv: number | null;
  estimated_rate_pct: number | null;
  estimated_points: number | null;
  applied_adjusters: { name: string; rate_bps: number; points_bps: number }[];
  matched_tier_index: number | null;
  reasoning: string;
}

export type ConstraintKey = "LTV" | "LTC" | "LoanToARV" | "DSCR" | "DebtYield";

export type TakeoutConstraintKey = "PermLTV" | "PermDSCR" | "PermDebtYield";

// Exit / takeout sizing — the permanent loan that repays the bridge at
// stabilization. Mirrors src/lib/underwriting/exit.ts (TakeoutResult).
export interface TakeoutResult {
  stabilizedValue: number;
  bridgeBalanceAtExit: number;
  constraints: { key: TakeoutConstraintKey; label: string; maxLoan: number; binding: boolean; basis: string }[];
  maxTakeout: number;
  bindingConstraint: TakeoutConstraintKey;
  permMortgageConstant: number;
  takeoutCoverage: number;
  refinanceable: boolean;
  cushion: number;
  shortfall: number;
  takeoutDSCR: number;
  takeoutDebtYield: number;
  termSufficient: boolean | null;
  flags: string[];
}

export interface SizingResult {
  asIsValue: number;
  stabilizedValue: number | null;
  totalProjectCost: number;
  constraints: { key: ConstraintKey; label: string; maxLoan: number; binding: boolean; basis: string }[];
  maxLoan: number;
  bindingConstraint: ConstraintKey;
  equityRequired: number;
  annualDebtService: number;
  mortgageConstant: number;
  ltv: number;
  ltc: number;
  dscrCurrent: number;
  dscrStabilized: number | null;
  debtYieldCurrent: number;
  debtYieldStabilized: number | null;
  projectProfit: number | null;
  equityMultiple: number | null;
  returnOnCost: number | null;
  developmentSpread: number | null;
  takeout?: TakeoutResult;
}

export interface PerInvestorSizing {
  investor_id: string;
  investor_name: string;
  eligibility: "pass" | "conditional" | "fail";
  sizing: SizingResult | null;
  rate_used_pct: number | null;
  note: string;
}

export interface DimensionRead {
  dimension: "sponsor" | "economics" | "market" | "structure" | "exit";
  severity: "strength" | "neutral" | "concern" | "dealkiller";
  read: string;
  flags: string[];
}

export interface Judgment {
  headline: string;
  framework: DimensionRead[];
  dealKillers: string[];
  fiveConcept: string;
  recommendation: { stance: "pursue" | "pursue-with-conditions" | "pass"; rationale: string };
  memo: string;
  model: string;
}

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface DealTerms {
  loan_type: string;
  property_type: string;
  property_state: string;
  purchase_price: string;
  loan_amount: string;
  arv: string;
  rehab_budget: string;
  borrower_fico: string;
  borrower_experience: string;
  occupancy: string;
  loan_purpose: string;
  is_rural: boolean;
  borrower_name: string;
  property_address: string;
}

export interface SizingTerms {
  current_noi: string;
  stabilized_noi: string;
  going_in_cap: string;
  exit_cap: string;
  rate: string;
  amort_months: string; // blank = interest-only
  closing_costs: string;
  max_ltv: string;
  max_ltc: string;
  max_ltarv: string;
  min_dscr: string;
  min_debt_yield: string;
  coverage_basis: "current" | "stabilized";
  // exit / takeout assumptions — the human governs the exit story
  term_months: string;
  takeout_max_ltv: string;
  takeout_min_dscr: string;
  takeout_rate: string;
  months_to_stabilize: string;
}

export interface JudgmentContext {
  sponsor: string;
  market: string;
  businessPlan: string;
  notes: string;
}

export type StepStatus = "untouched" | "ready" | "stale" | "running" | "done" | "error";

export interface Deal {
  // identity / linkage
  validation_id: string | null;
  evaluation_id: string | null;
  uw_model_id: string | null;

  terms: DealTerms;
  sizing: SizingTerms;
  judgmentCtx: JudgmentContext;

  // results
  eligibilityResults: EligibilityResult[] | null;
  sizingResult: SizingResult | null;
  perInvestor: PerInvestorSizing[] | null;
  judgmentResult: Judgment | null;

  // stale-state: the Terms/Sizing hash each result was computed from
  computedFrom: { eligibility: string | null; sizing: string | null };

  steps: { eligibility: StepStatus; sizing: StepStatus; judgment: StepStatus };
  optedInSizing: boolean;
  optedInJudgment: boolean;
  error: string | null;
}

// ── Option lists (shared with the Terms step) ──────────────────────────────

export const LOAN_TYPES = ["bridge", "fix_flip", "ground_up", "dscr"] as const;
export const PROPERTY_TYPES = ["sfr", "2_4_unit", "small_multifamily", "condo", "townhouse", "mixed_use"] as const;
export const OCCUPANCIES = ["non_owner_occupied", "owner_occupied"] as const;
export const LOAN_PURPOSES = ["purchase", "refinance", "cash_out_refi"] as const;

// ── Factory + prefill ──────────────────────────────────────────────────────

export interface DealPrefill {
  validation_id?: string | null;
  borrower_name?: string;
  property_state?: string;
  // validation experience_tier (1-4, 1 = most experienced) → deal-count integer
  experience_tier?: string | null;
}

const TIER_TO_EXPERIENCE: Record<string, string> = { "1": "10", "2": "5", "3": "2", "4": "0" };

export function emptyDeal(prefill: DealPrefill = {}): Deal {
  const experience =
    prefill.experience_tier && TIER_TO_EXPERIENCE[prefill.experience_tier]
      ? TIER_TO_EXPERIENCE[prefill.experience_tier]
      : "5";
  return {
    validation_id: prefill.validation_id ?? null,
    evaluation_id: null,
    uw_model_id: null,
    terms: {
      loan_type: "bridge",
      property_type: "sfr",
      property_state: prefill.property_state || "CA",
      purchase_price: "500000",
      loan_amount: "375000",
      arv: "",
      rehab_budget: "",
      borrower_fico: "720",
      borrower_experience: experience,
      occupancy: "non_owner_occupied",
      loan_purpose: "purchase",
      is_rural: false,
      borrower_name: prefill.borrower_name || "",
      property_address: "",
    },
    sizing: {
      current_noi: "",
      stabilized_noi: "",
      going_in_cap: "6",
      exit_cap: "5.5",
      rate: "9.5",
      amort_months: "",
      closing_costs: "",
      max_ltv: "75",
      max_ltc: "70",
      max_ltarv: "65",
      min_dscr: "1.0",
      min_debt_yield: "8",
      coverage_basis: "current",
      term_months: "24",
      takeout_max_ltv: "70",
      takeout_min_dscr: "1.25",
      takeout_rate: "",
      months_to_stabilize: "",
    },
    judgmentCtx: { sponsor: "", market: "", businessPlan: "", notes: "" },
    eligibilityResults: null,
    sizingResult: null,
    perInvestor: null,
    judgmentResult: null,
    computedFrom: { eligibility: null, sizing: null },
    steps: { eligibility: "untouched", sizing: "untouched", judgment: "untouched" },
    optedInSizing: false,
    optedInJudgment: false,
    error: null,
  };
}

// ── Stale-state hashes ─────────────────────────────────────────────────────

// Hash of the Terms fields that actually change eligibility/sizing — borrower
// name + address are excluded (they don't affect the engines).
export function hashTerms(t: DealTerms): string {
  return JSON.stringify([
    t.loan_type, t.property_type, t.property_state, t.purchase_price,
    t.loan_amount, t.arv, t.rehab_budget, t.borrower_fico,
    t.borrower_experience, t.occupancy, t.loan_purpose, t.is_rural,
  ]);
}

export function hashSizing(s: SizingTerms): string {
  return JSON.stringify(Object.values(s));
}

// ── Step-3 default house constraints from the matched investors ────────────

// LTV/LTC/LTARV default to the most generous cap across non-failing investors
// (so the house default isn't artificially tight). Eligibility does NOT surface
// DSCR / debt-yield floors, so those keep their house defaults. Returns percent
// strings matching the sizing inputs ("78" not "0.78").
export function defaultSizingConstraintsFromResults(
  results: EligibilityResult[] | null,
): Pick<SizingTerms, "max_ltv" | "max_ltc" | "max_ltarv"> | null {
  if (!results) return null;
  const eligible = results.filter((r) => r.result !== "fail");
  if (eligible.length === 0) return null;
  const toPct = (vals: (number | null)[], fallback: string): string => {
    const present = vals.filter((v): v is number => v != null);
    if (present.length === 0) return fallback;
    const max = Math.max(...present);
    return String(Math.round((max <= 1 ? max * 100 : max)));
  };
  return {
    max_ltv: toPct(eligible.map((r) => r.max_ltv), "75"),
    max_ltc: toPct(eligible.map((r) => r.max_ltc), "70"),
    max_ltarv: toPct(eligible.map((r) => r.max_ltarv), "65"),
  };
}

// ── Display formatters ─────────────────────────────────────────────────────

export const usd = (n: number | null | undefined) =>
  n == null || Number.isNaN(n)
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
export const ratioPct = (n: number | null | undefined, d = 1) =>
  n == null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(d)}%`;
export const mult = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${n.toFixed(2)}x`;
// Eligibility max_ltv etc. may arrive as a ratio (0.78) or a percent (78).
export const loosePct = (v: number | null) =>
  v == null ? "—" : `${(v <= 1 ? v * 100 : v).toFixed(1)}%`;
export const rate2 = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`);

export const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

// ── Resume: hydrate a full Deal from a saved evaluation + uw_model ──────────
// Lets evaluate/[id] mount the stepper "done" instead of empty — the saved
// eligibility, sizing (incl. exit/takeout), best-execution, and judgment all
// re-render, and editing a field correctly re-stales the downstream step.

export interface EvaluationResumeData {
  id: string;
  validation_id: string | null;
  loan_type: string;
  property_type: string;
  location: string | null;
  purchase_price: number | null;
  loan_amount: number;
  arv: number | null;
  rehab_budget: number | null;
  fico: number | null;
  sponsor_experience_tier: number | null;
  additional_params: Record<string, unknown> | null;
  results: Array<{
    investor_id: string;
    result: "pass" | "conditional" | "fail";
    reasoning: string;
    investors: { display_name: string } | null;
    computed_terms: {
      max_ltv: number | null; max_ltc: number | null; max_ltarv: number | null;
      estimated_rate_pct: number | null; estimated_points: number | null;
      applied_adjusters: { name: string; rate_bps: number; points_bps: number }[];
      matched_tier_index: number | null;
      boundary_warnings: { field: string; message: string }[];
      failure_reasons: FailureReason[];
    } | null;
  }>;
  uw_model: {
    id: string;
    inputs: Record<string, unknown> | null;
    sizing: SizingResult | null;
    per_investor: PerInvestorSizing[] | null;
    judgment: (Judgment & { schema_version?: number }) | null;
  } | null;
}

// decimal (0.078) or percent (78) → percent string for the form ("78").
const toPctStr = (v: unknown, fallback = ""): string => {
  if (v == null || typeof v !== "number" || Number.isNaN(v)) return fallback;
  return String(v <= 1 ? +(v * 100).toFixed(3) : v);
};
const toNumStr = (v: unknown, fallback = ""): string =>
  v == null || typeof v !== "number" || Number.isNaN(v) ? fallback : String(v);

// 2-letter state from "Seed — Sacramento, CA" style location, else default.
function stateFromLocation(loc: string | null, fallback = "CA"): string {
  const m = (loc ?? "").match(/,\s*([A-Za-z]{2})\s*$/);
  return m ? m[1].toUpperCase() : fallback;
}

export function dealFromEvaluation(d: EvaluationResumeData): Deal {
  const ap = d.additional_params ?? {};
  const inp = d.uw_model?.inputs ?? null;
  const exp =
    d.sponsor_experience_tier != null && TIER_TO_EXPERIENCE[String(d.sponsor_experience_tier)]
      ? TIER_TO_EXPERIENCE[String(d.sponsor_experience_tier)]
      : "5";

  const terms: DealTerms = {
    loan_type: d.loan_type,
    property_type: d.property_type,
    property_state: (ap.property_state as string) || stateFromLocation(d.location),
    purchase_price: toNumStr(d.purchase_price),
    loan_amount: toNumStr(d.loan_amount),
    arv: toNumStr(d.arv),
    rehab_budget: toNumStr(d.rehab_budget),
    borrower_fico: toNumStr(d.fico, "720"),
    borrower_experience: exp,
    occupancy: (ap.occupancy as string) || "non_owner_occupied",
    loan_purpose: (ap.loan_purpose as string) || "purchase",
    is_rural: Boolean(ap.is_rural),
    borrower_name: (ap.borrower_name as string) || "",
    property_address: (ap.property_address as string) || "",
  };

  const blank = emptyDeal().sizing;
  const sizing: SizingTerms = inp
    ? {
        current_noi: toNumStr(inp.currentNOI),
        stabilized_noi: toNumStr(inp.stabilizedNOI),
        going_in_cap: toPctStr(inp.goingInCapRate, blank.going_in_cap),
        exit_cap: toPctStr(inp.exitCapRate, blank.exit_cap),
        rate: toPctStr(inp.rate, blank.rate),
        amort_months: toNumStr(inp.amortizationMonths),
        closing_costs: toNumStr(inp.closingCosts),
        max_ltv: toPctStr(inp.maxLTV, blank.max_ltv),
        max_ltc: toPctStr(inp.maxLTC, blank.max_ltc),
        max_ltarv: toPctStr(inp.maxLoanToARV, blank.max_ltarv),
        min_dscr: toNumStr(inp.minDSCR),
        min_debt_yield: toPctStr(inp.minDebtYield, blank.min_debt_yield),
        coverage_basis: (inp.coverageBasis as "current" | "stabilized") ?? "current",
        term_months: toNumStr(inp.termMonths, "24"),
        takeout_max_ltv: blank.takeout_max_ltv,
        takeout_min_dscr: blank.takeout_min_dscr,
        takeout_rate: blank.takeout_rate,
        months_to_stabilize: blank.months_to_stabilize,
      }
    : blank;

  const eligibilityResults: EligibilityResult[] = d.results.map((r) => ({
    investor_id: r.investor_id,
    investor_name: r.investors?.display_name ?? r.investor_id.slice(0, 8),
    result: r.result,
    failure_reasons: r.computed_terms?.failure_reasons ?? [],
    boundary_warnings: r.computed_terms?.boundary_warnings ?? [],
    max_ltv: r.computed_terms?.max_ltv ?? null,
    max_ltc: r.computed_terms?.max_ltc ?? null,
    max_ltarv: r.computed_terms?.max_ltarv ?? null,
    estimated_rate_pct: r.computed_terms?.estimated_rate_pct ?? null,
    estimated_points: r.computed_terms?.estimated_points ?? null,
    applied_adjusters: r.computed_terms?.applied_adjusters ?? [],
    matched_tier_index: r.computed_terms?.matched_tier_index ?? null,
    reasoning: r.reasoning,
  }));

  const sizingResult = d.uw_model?.sizing ?? null;
  const judgmentResult = d.uw_model?.judgment ?? null;
  const hasEligibility = eligibilityResults.length > 0;
  const termsHash = hashTerms(terms);

  return {
    validation_id: d.validation_id,
    evaluation_id: d.id,
    uw_model_id: d.uw_model?.id ?? null,
    terms,
    sizing,
    judgmentCtx: { sponsor: "", market: "", businessPlan: "", notes: "" },
    eligibilityResults: hasEligibility ? eligibilityResults : null,
    sizingResult,
    perInvestor: d.uw_model?.per_investor ?? null,
    judgmentResult,
    computedFrom: {
      eligibility: hasEligibility ? termsHash : null,
      sizing: sizingResult ? `${termsHash}|${hashSizing(sizing)}` : null,
    },
    steps: {
      eligibility: hasEligibility ? "done" : "untouched",
      sizing: sizingResult ? "done" : "untouched",
      judgment: judgmentResult ? "done" : "untouched",
    },
    optedInSizing: sizingResult != null,
    optedInJudgment: judgmentResult != null,
    error: null,
  };
}
