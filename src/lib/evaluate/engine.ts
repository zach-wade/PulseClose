// Investor eligibility engine — adapted from the archive's evaluate-engine
// to operate over the JSONB investor_criteria schema.
//
// Each investor has N rows in investor_criteria, each (criteria_key,
// criteria_value) pair. The engine reads them into an InvestorRules
// object once, then runs a deal through a four-stage pipeline:
//   1. normalizeDeal — lowercase enums, default optional fields
//   2. calculateRatios — LTV / LTC / LTARV from prices + loan amount
//   3. evaluateBasicChecks — yes/no gates that knock the investor out
//   4. findMatchingTier + applyAdjusters — leverage matrix + rate bumps
//
// Output: EligibilityResult per investor with pass / conditional / fail
// plus a reasoning trail.
//
// Pure functions only — no I/O. The API route does the DB fetch.

export type DealParams = {
  loan_type: string;          // bridge | fix_flip | ground_up | dscr
  property_type: string;      // sfr | 2_4_unit | small_multifamily | mixed_use | condo | townhouse
  property_state: string;     // 2-letter, uppercase
  purchase_price: number | null;
  loan_amount: number;
  arv: number | null;
  rehab_budget: number | null;
  construction_budget: number | null;
  borrower_fico: number | null;
  borrower_experience: number;  // count of completed deals
  occupancy: string;           // non_owner_occupied | owner_occupied
  unit_count: number;
  is_rural: boolean;
  loan_purpose: string;        // purchase | refinance | cash_out_refi
  // Loose metadata for record-keeping (not used by the matcher)
  borrower_name?: string | null;
  property_address?: string | null;
  notes?: string | null;
};

export type FailureReason = {
  field: string;
  rule: string;
  expected: string | number | string[] | null;
  actual: string | number | null;
};

export type LeverageTier = {
  loan_type: string | null;
  property_type: string | null;
  min_fico: number | null;
  max_fico: number | null;
  min_experience: number;
  max_experience: number | null;
  max_ltv: number | null;     // decimal: 0.75 = 75%
  max_ltc: number | null;
  max_ltarv: number | null;
  base_rate_bps: number;      // e.g. 950 = 9.50%
  base_points_bps: number;    // e.g. 200 = 2 points
  sort_order: number;
};

export type RateAdjusterCondition = {
  field: string;        // borrower_fico | ltv | property_state | is_rural | etc.
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between" | "in" | "not_in" | "is_true" | "is_false";
  value?: string | number | boolean | (string | number)[];
  value_max?: number;   // for "between"
};

export type RateAdjuster = {
  name: string;
  condition: RateAdjusterCondition;
  rate_bps: number;
  points_bps: number;
  ltv_adjustment_pct: number;  // negative numbers reduce max LTV
  ltc_adjustment_pct: number;
  group?: string | null;       // non-stackable adjusters in same group fire once
  stackable?: boolean;
};

// Aggregate rule set assembled from an investor's investor_criteria rows.
export type InvestorRules = {
  loan_types?: string[];
  property_types?: string[];
  excluded_property_types?: string[];
  allowed_states?: string[];           // null/missing = all states allowed
  excluded_states?: string[];
  min_loan_amount?: number;
  max_loan_amount?: number;
  min_fico?: number;
  min_experience?: number;
  max_ltv?: number;
  max_ltc?: number;
  max_ltarv?: number;
  rural_allowed?: boolean;
  allowed_occupancy?: string[];
  leverage_matrix?: LeverageTier[];
  rate_adjusters?: RateAdjuster[];
};

export type EligibilityResult = {
  investor_id: string;
  investor_name: string;
  result: "pass" | "conditional" | "fail";
  failure_reasons: FailureReason[];
  boundary_warnings: { field: string; message: string }[];
  // Computed terms (when pass/conditional)
  max_ltv: number | null;
  max_ltc: number | null;
  max_ltarv: number | null;
  estimated_rate_pct: number | null;
  estimated_points: number | null;
  applied_adjusters: { name: string; rate_bps: number; points_bps: number }[];
  matched_tier_index: number | null;
  reasoning: string;
};

// ── Normalization ────────────────────────────────────────────────────────

export function normalizeDeal(deal: DealParams): DealParams {
  return {
    ...deal,
    loan_type: (deal.loan_type ?? "").toLowerCase(),
    property_type: (deal.property_type ?? "").toLowerCase(),
    property_state: (deal.property_state ?? "").toUpperCase(),
    occupancy: (deal.occupancy ?? "non_owner_occupied").toLowerCase(),
    loan_purpose: (deal.loan_purpose ?? "purchase").toLowerCase(),
  };
}

// ── Ratios ──────────────────────────────────────────────────────────────

export function calculateRatios(deal: DealParams) {
  const pp = deal.purchase_price ?? 0;
  // Ground-up: "purchase price" is land cost only, LTV against it isn't
  // meaningful. Fall back to LTC/LTARV.
  const ltv =
    pp > 0 && !(deal.construction_budget && deal.construction_budget > 0)
      ? deal.loan_amount / pp
      : null;
  const totalCost =
    pp + (deal.rehab_budget ?? 0) + (deal.construction_budget ?? 0);
  const ltc = totalCost > 0 ? deal.loan_amount / totalCost : null;
  const ltarv =
    deal.arv && deal.arv > 0 ? deal.loan_amount / deal.arv : null;
  return { ltv, ltc, ltarv };
}

const ratioToPct = (r: number) => Math.round(r * 10000) / 100;

// ── Basic checks ─────────────────────────────────────────────────────────

export function evaluateBasicChecks(
  deal: DealParams,
  rules: InvestorRules,
  ratios: { ltv: number | null; ltc: number | null; ltarv: number | null },
): FailureReason[] {
  const failures: FailureReason[] = [];

  if (rules.loan_types && rules.loan_types.length > 0 && !rules.loan_types.includes(deal.loan_type)) {
    failures.push({
      field: "loan_type",
      rule: "Loan type not accepted",
      expected: rules.loan_types,
      actual: deal.loan_type,
    });
  }

  if (rules.property_types && rules.property_types.length > 0 && !rules.property_types.includes(deal.property_type)) {
    failures.push({
      field: "property_type",
      rule: "Property type not accepted",
      expected: rules.property_types,
      actual: deal.property_type,
    });
  }

  if (rules.excluded_property_types?.includes(deal.property_type)) {
    failures.push({
      field: "property_type",
      rule: "Property type explicitly excluded",
      expected: `Not in: ${rules.excluded_property_types.join(", ")}`,
      actual: deal.property_type,
    });
  }

  if (rules.allowed_states && rules.allowed_states.length > 0 && !rules.allowed_states.includes(deal.property_state)) {
    failures.push({
      field: "property_state",
      rule: "State not in allowed list",
      expected: rules.allowed_states,
      actual: deal.property_state,
    });
  }

  if (rules.excluded_states?.includes(deal.property_state)) {
    failures.push({
      field: "property_state",
      rule: "State explicitly excluded",
      expected: `Not in: ${rules.excluded_states.join(", ")}`,
      actual: deal.property_state,
    });
  }

  if (rules.min_fico != null && deal.borrower_fico != null && deal.borrower_fico < rules.min_fico) {
    failures.push({
      field: "borrower_fico",
      rule: "FICO below minimum",
      expected: rules.min_fico,
      actual: deal.borrower_fico,
    });
  }

  if (rules.min_experience != null && deal.borrower_experience < rules.min_experience) {
    failures.push({
      field: "borrower_experience",
      rule: "Insufficient experience",
      expected: rules.min_experience,
      actual: deal.borrower_experience,
    });
  }

  if (rules.min_loan_amount != null && deal.loan_amount < rules.min_loan_amount) {
    failures.push({
      field: "loan_amount",
      rule: "Loan amount below minimum",
      expected: rules.min_loan_amount,
      actual: deal.loan_amount,
    });
  }

  if (rules.max_loan_amount != null && deal.loan_amount > rules.max_loan_amount) {
    failures.push({
      field: "loan_amount",
      rule: "Loan amount above maximum",
      expected: rules.max_loan_amount,
      actual: deal.loan_amount,
    });
  }

  if (rules.allowed_occupancy && rules.allowed_occupancy.length > 0 && !rules.allowed_occupancy.includes(deal.occupancy)) {
    failures.push({
      field: "occupancy",
      rule: "Occupancy type not accepted",
      expected: rules.allowed_occupancy,
      actual: deal.occupancy,
    });
  }

  if (rules.rural_allowed === false && deal.is_rural) {
    failures.push({
      field: "is_rural",
      rule: "Rural properties not accepted",
      expected: "non-rural",
      actual: "rural",
    });
  }

  // Coarse leverage caps (matrix may further refine these for matched tiers)
  if (rules.max_ltv != null && ratios.ltv != null && ratios.ltv > rules.max_ltv) {
    failures.push({
      field: "ltv",
      rule: "LTV exceeds maximum",
      expected: ratioToPct(rules.max_ltv),
      actual: ratioToPct(ratios.ltv),
    });
  }
  if (rules.max_ltc != null && ratios.ltc != null && ratios.ltc > rules.max_ltc) {
    failures.push({
      field: "ltc",
      rule: "LTC exceeds maximum",
      expected: ratioToPct(rules.max_ltc),
      actual: ratioToPct(ratios.ltc),
    });
  }
  if (rules.max_ltarv != null && ratios.ltarv != null && ratios.ltarv > rules.max_ltarv) {
    failures.push({
      field: "ltarv",
      rule: "LTARV exceeds maximum",
      expected: ratioToPct(rules.max_ltarv),
      actual: ratioToPct(ratios.ltarv),
    });
  }

  return failures;
}

// ── Leverage matrix ──────────────────────────────────────────────────────

export function findMatchingTier(
  deal: DealParams,
  matrix: LeverageTier[] | undefined,
): { tier: LeverageTier; index: number } | null {
  if (!matrix || matrix.length === 0) return null;
  const sorted = matrix
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.sort_order - b.t.sort_order);

  for (const { t, i } of sorted) {
    if (t.loan_type !== null && t.loan_type !== deal.loan_type) continue;
    if (t.property_type !== null && t.property_type !== deal.property_type) continue;

    const fico = deal.borrower_fico;
    if (t.min_fico != null || t.max_fico != null) {
      if (fico == null) continue;  // gated tier needs a known FICO to match
      if (t.min_fico != null && fico < t.min_fico) continue;
      if (t.max_fico != null && fico > t.max_fico) continue;
    }

    const exp = deal.borrower_experience;
    if (exp < t.min_experience) continue;
    if (t.max_experience != null && exp > t.max_experience) continue;

    return { tier: t, index: i };
  }
  return null;
}

// ── Rate adjusters ───────────────────────────────────────────────────────

function dealField(
  field: string,
  deal: DealParams,
  ratios: { ltv: number | null; ltc: number | null; ltarv: number | null },
): string | number | boolean | null | undefined {
  const map: Record<string, string | number | boolean | null | undefined> = {
    loan_type: deal.loan_type,
    property_type: deal.property_type,
    property_state: deal.property_state,
    purchase_price: deal.purchase_price,
    loan_amount: deal.loan_amount,
    arv: deal.arv,
    rehab_budget: deal.rehab_budget,
    construction_budget: deal.construction_budget,
    borrower_fico: deal.borrower_fico,
    borrower_experience: deal.borrower_experience,
    occupancy: deal.occupancy,
    unit_count: deal.unit_count,
    is_rural: deal.is_rural,
    loan_purpose: deal.loan_purpose,
    ltv: ratios.ltv != null ? ratioToPct(ratios.ltv) : null,
    ltc: ratios.ltc != null ? ratioToPct(ratios.ltc) : null,
    ltarv: ratios.ltarv != null ? ratioToPct(ratios.ltarv) : null,
  };
  return map[field];
}

export function evaluateAdjusterCondition(
  cond: RateAdjusterCondition,
  deal: DealParams,
  ratios: { ltv: number | null; ltc: number | null; ltarv: number | null },
): boolean {
  const field = dealField(cond.field, deal, ratios);
  if (field === null || field === undefined) return false;
  const val = cond.value;
  switch (cond.op) {
    case "eq": return String(field) === String(val);
    case "neq": return String(field) !== String(val);
    case "gt": return Number(field) > Number(val);
    case "gte": return Number(field) >= Number(val);
    case "lt": return Number(field) < Number(val);
    case "lte": return Number(field) <= Number(val);
    case "between":
      if (val == null || cond.value_max == null) return false;
      return Number(field) >= Number(val) && Number(field) <= Number(cond.value_max);
    case "in": return Array.isArray(val) && val.map(String).includes(String(field));
    case "not_in": return Array.isArray(val) && !val.map(String).includes(String(field));
    case "is_true": return field === true || field === "true" || field === 1;
    case "is_false": return field === false || field === "false" || field === 0;
    default: return false;
  }
}

export function applyAdjusters(
  deal: DealParams,
  ratios: { ltv: number | null; ltc: number | null; ltarv: number | null },
  adjusters: RateAdjuster[] | undefined,
): {
  applied: { name: string; rate_bps: number; points_bps: number }[];
  total_rate_bps: number;
  total_points_bps: number;
  total_ltv_pct: number;
  total_ltc_pct: number;
} {
  if (!adjusters || adjusters.length === 0) {
    return { applied: [], total_rate_bps: 0, total_points_bps: 0, total_ltv_pct: 0, total_ltc_pct: 0 };
  }
  const applied: { name: string; rate_bps: number; points_bps: number }[] = [];
  let total_rate_bps = 0;
  let total_points_bps = 0;
  let total_ltv_pct = 0;
  let total_ltc_pct = 0;
  const appliedGroups = new Set<string>();

  for (const a of adjusters) {
    if (a.stackable === false && a.group && appliedGroups.has(a.group)) continue;
    if (!evaluateAdjusterCondition(a.condition, deal, ratios)) continue;

    applied.push({ name: a.name, rate_bps: a.rate_bps, points_bps: a.points_bps });
    total_rate_bps += a.rate_bps;
    total_points_bps += a.points_bps;
    total_ltv_pct += a.ltv_adjustment_pct ?? 0;
    total_ltc_pct += a.ltc_adjustment_pct ?? 0;
    if (a.stackable === false && a.group) appliedGroups.add(a.group);
  }
  return { applied, total_rate_bps, total_points_bps, total_ltv_pct, total_ltc_pct };
}

// ── Boundary warnings ────────────────────────────────────────────────────
// Flag near-misses (LTV is 74% with a 75% cap) so the LO can flag for
// manual review before submission.

const BOUNDARY_PCT = 1; // within 1% of cap = boundary

function nearCap(value: number | null, cap: number | null | undefined): boolean {
  if (value == null || cap == null) return false;
  const valuePct = ratioToPct(value);
  const capPct = ratioToPct(cap);
  return capPct - valuePct >= 0 && capPct - valuePct <= BOUNDARY_PCT;
}

function buildBoundaryWarnings(
  ratios: { ltv: number | null; ltc: number | null; ltarv: number | null },
  rules: InvestorRules,
): { field: string; message: string }[] {
  const warnings: { field: string; message: string }[] = [];
  if (nearCap(ratios.ltv, rules.max_ltv)) {
    warnings.push({ field: "ltv", message: `LTV ${ratioToPct(ratios.ltv!)}% is within 1% of cap ${ratioToPct(rules.max_ltv!)}%` });
  }
  if (nearCap(ratios.ltc, rules.max_ltc)) {
    warnings.push({ field: "ltc", message: `LTC ${ratioToPct(ratios.ltc!)}% is within 1% of cap ${ratioToPct(rules.max_ltc!)}%` });
  }
  if (nearCap(ratios.ltarv, rules.max_ltarv)) {
    warnings.push({ field: "ltarv", message: `LTARV ${ratioToPct(ratios.ltarv!)}% is within 1% of cap ${ratioToPct(rules.max_ltarv!)}%` });
  }
  return warnings;
}

// ── Top-level evaluator ──────────────────────────────────────────────────

export function evaluateDealForInvestor(
  deal: DealParams,
  investor: { id: string; display_name: string; rules: InvestorRules },
): EligibilityResult {
  const normalized = normalizeDeal(deal);
  const ratios = calculateRatios(normalized);
  const failures = evaluateBasicChecks(normalized, investor.rules, ratios);
  const matched = findMatchingTier(normalized, investor.rules.leverage_matrix);
  const adjusters = applyAdjusters(normalized, ratios, investor.rules.rate_adjusters);

  // Resolve effective leverage caps (matrix tier overrides coarse limits
  // when one matched). Then apply adjusters' LTV/LTC haircuts.
  const baseMaxLtv = matched?.tier.max_ltv ?? investor.rules.max_ltv ?? null;
  const baseMaxLtc = matched?.tier.max_ltc ?? investor.rules.max_ltc ?? null;
  const baseMaxLtarv = matched?.tier.max_ltarv ?? investor.rules.max_ltarv ?? null;
  const max_ltv = baseMaxLtv != null ? Math.max(0, baseMaxLtv + (adjusters.total_ltv_pct / 100)) : null;
  const max_ltc = baseMaxLtc != null ? Math.max(0, baseMaxLtc + (adjusters.total_ltc_pct / 100)) : null;

  // Rate: tier base + adjusters
  const baseRateBps = matched?.tier.base_rate_bps ?? null;
  const basePointsBps = matched?.tier.base_points_bps ?? null;
  const estimated_rate_pct = baseRateBps != null
    ? (baseRateBps + adjusters.total_rate_bps) / 100
    : null;
  const estimated_points = basePointsBps != null
    ? (basePointsBps + adjusters.total_points_bps) / 100
    : null;

  // Boundary warnings — useful even on pass results
  const boundary_warnings = buildBoundaryWarnings(ratios, investor.rules);

  // If the matrix had tiers but none matched AND there were no other
  // failures, this is a "conditional" — the deal fits coarse limits but
  // doesn't slot into a priced tier (typical for FICO/experience gaps
  // that warrant exception review).
  const noTier = (investor.rules.leverage_matrix?.length ?? 0) > 0 && matched === null;

  let result: "pass" | "conditional" | "fail";
  let reasoning: string;
  if (failures.length > 0) {
    result = "fail";
    reasoning = `${failures.length} basic check${failures.length === 1 ? "" : "s"} failed: ${failures.map((f) => f.rule).join("; ")}`;
  } else if (noTier) {
    result = "conditional";
    reasoning = "Passes coarse limits but no leverage tier matched — manual review recommended.";
  } else if (boundary_warnings.length > 0) {
    result = "conditional";
    reasoning = `Eligible at boundary: ${boundary_warnings.map((w) => w.message).join("; ")}`;
  } else {
    result = "pass";
    reasoning = matched
      ? `Tier matched with rate ${(estimated_rate_pct ?? 0).toFixed(2)}% and ${adjusters.applied.length} adjuster${adjusters.applied.length === 1 ? "" : "s"} applied.`
      : "All basic checks passed.";
  }

  return {
    investor_id: investor.id,
    investor_name: investor.display_name,
    result,
    failure_reasons: failures,
    boundary_warnings,
    max_ltv,
    max_ltc,
    max_ltarv: baseMaxLtarv,
    estimated_rate_pct,
    estimated_points,
    applied_adjusters: adjusters.applied,
    matched_tier_index: matched?.index ?? null,
    reasoning,
  };
}

// ── Counter-offer suggestions ────────────────────────────────────────────
// For each fail/conditional, compute the smallest single-knob change that
// would flip the result to pass. Three categories:
//   - "loan_amount" — drop the loan to clear an LTV/LTC/LTARV/max_loan cap
//   - "borrower_change" — borrower-side targets (FICO, experience) the LO
//     can't reprice their way around
//   - "structural" — hard exclusions (loan_type, state, etc.) that no
//     amount of repricing fixes
//
// Pure function. The API embeds the result in computed_terms.counter_offers.

export type CounterOffer =
  | {
      kind: "loan_amount";
      new_loan_amount: number;
      delta_amount: number;       // positive = reduction
      reason: string;
      predicted_result: "pass" | "conditional";
      predicted_rate_pct: number | null;
      predicted_points: number | null;
    }
  | {
      kind: "borrower_change";
      field: "borrower_fico" | "borrower_experience";
      target: number;
      delta: number;              // positive = needs increase
      reason: string;
    }
  | {
      kind: "structural";
      field: string;
      reason: string;
    };

// Round loan amount DOWN to the nearest $1k so suggestions are clean.
function floorTo1k(n: number): number {
  return Math.floor(n / 1000) * 1000;
}

export function suggestCounterOffers(
  deal: DealParams,
  investor: { id: string; display_name: string; rules: InvestorRules },
  current: EligibilityResult,
): CounterOffer[] {
  if (current.result === "pass") return [];

  const offers: CounterOffer[] = [];

  // ── Loan-amount knobs ──────────────────────────────────────────────
  // For each capped ratio that's currently exceeded, compute the largest
  // loan_amount that clears it. Take the MIN across all binding caps
  // (the deal must clear every cap simultaneously).
  const candidateLoanAmounts: { amount: number; reason: string }[] = [];

  for (const f of current.failure_reasons) {
    if (f.field === "ltv" && deal.purchase_price && deal.purchase_price > 0) {
      const cap = investor.rules.max_ltv;
      if (cap != null) {
        candidateLoanAmounts.push({
          amount: floorTo1k(cap * deal.purchase_price),
          reason: `clears ${ratioToPct(cap)}% LTV cap`,
        });
      }
    }
    if (f.field === "ltc") {
      const cap = investor.rules.max_ltc;
      const totalCost =
        (deal.purchase_price ?? 0) +
        (deal.rehab_budget ?? 0) +
        (deal.construction_budget ?? 0);
      if (cap != null && totalCost > 0) {
        candidateLoanAmounts.push({
          amount: floorTo1k(cap * totalCost),
          reason: `clears ${ratioToPct(cap)}% LTC cap`,
        });
      }
    }
    if (f.field === "ltarv" && deal.arv && deal.arv > 0) {
      const cap = investor.rules.max_ltarv;
      if (cap != null) {
        candidateLoanAmounts.push({
          amount: floorTo1k(cap * deal.arv),
          reason: `clears ${ratioToPct(cap)}% LTARV cap`,
        });
      }
    }
    if (f.field === "loan_amount" && f.rule === "Loan amount above maximum") {
      const cap = investor.rules.max_loan_amount;
      if (cap != null) {
        candidateLoanAmounts.push({
          amount: floorTo1k(cap),
          reason: `clears $${cap.toLocaleString()} max loan amount`,
        });
      }
    }
  }

  if (candidateLoanAmounts.length > 0) {
    // Take the minimum (most binding) cap. If multiple caps tie, pick
    // arbitrary first; reason text concatenates.
    const minAmount = Math.min(...candidateLoanAmounts.map((c) => c.amount));
    const reasons = candidateLoanAmounts
      .filter((c) => c.amount === minAmount)
      .map((c) => c.reason);

    if (minAmount > 0 && minAmount < deal.loan_amount) {
      // Re-evaluate with the new loan amount.
      const trialDeal: DealParams = { ...deal, loan_amount: minAmount };
      const trialResult = evaluateDealForInvestor(trialDeal, investor);
      // Only suggest if the change actually flips to pass / conditional.
      if (trialResult.result !== "fail") {
        offers.push({
          kind: "loan_amount",
          new_loan_amount: minAmount,
          delta_amount: deal.loan_amount - minAmount,
          reason: reasons.join(" + "),
          predicted_result: trialResult.result,
          predicted_rate_pct: trialResult.estimated_rate_pct,
          predicted_points: trialResult.estimated_points,
        });
      }
    }
  }

  // ── Borrower-side knobs ────────────────────────────────────────────
  // Cannot be repriced; surface as targets so the LO knows what to ask
  // the borrower for (or to skip this investor).
  for (const f of current.failure_reasons) {
    if (f.field === "borrower_fico" && investor.rules.min_fico != null) {
      const target = investor.rules.min_fico;
      const actual = deal.borrower_fico ?? 0;
      offers.push({
        kind: "borrower_change",
        field: "borrower_fico",
        target,
        delta: target - actual,
        reason: `Borrower FICO ${actual} below ${target} minimum`,
      });
    }
    if (f.field === "borrower_experience" && investor.rules.min_experience != null) {
      const target = investor.rules.min_experience;
      const actual = deal.borrower_experience;
      offers.push({
        kind: "borrower_change",
        field: "borrower_experience",
        target,
        delta: target - actual,
        reason: `Borrower has ${actual} completed deals; investor requires ${target}`,
      });
    }
    if (f.field === "loan_amount" && f.rule === "Loan amount below minimum" && investor.rules.min_loan_amount != null) {
      offers.push({
        kind: "structural",
        field: "loan_amount",
        reason: `Investor minimum loan size is $${investor.rules.min_loan_amount.toLocaleString()}`,
      });
    }
  }

  // ── Structural (no repricing fix) ──────────────────────────────────
  for (const f of current.failure_reasons) {
    if (
      f.field === "loan_type" ||
      f.field === "property_type" ||
      f.field === "property_state" ||
      f.field === "occupancy" ||
      f.field === "is_rural"
    ) {
      offers.push({
        kind: "structural",
        field: f.field,
        reason: f.rule,
      });
    }
  }

  // ── Conditional: no tier matched ───────────────────────────────────
  // Find the smallest FICO bump or experience bump that would land in a
  // tier. Only meaningful when result is "conditional" with no tier.
  if (
    current.result === "conditional" &&
    current.matched_tier_index == null &&
    investor.rules.leverage_matrix &&
    investor.rules.leverage_matrix.length > 0
  ) {
    const matrix = investor.rules.leverage_matrix;
    let bestFicoTarget: number | null = null;
    let bestExpTarget: number | null = null;

    for (const t of matrix) {
      // Tier loan_type/property_type must match (these are structural
      // already covered above).
      if (t.loan_type !== null && t.loan_type !== deal.loan_type) continue;
      if (t.property_type !== null && t.property_type !== deal.property_type) continue;

      const fico = deal.borrower_fico ?? 0;
      const exp = deal.borrower_experience;

      if (t.min_fico != null && fico < t.min_fico) {
        if (bestFicoTarget == null || t.min_fico < bestFicoTarget) {
          bestFicoTarget = t.min_fico;
        }
      }
      if (exp < t.min_experience) {
        if (bestExpTarget == null || t.min_experience < bestExpTarget) {
          bestExpTarget = t.min_experience;
        }
      }
    }

    if (bestFicoTarget != null && deal.borrower_fico != null) {
      offers.push({
        kind: "borrower_change",
        field: "borrower_fico",
        target: bestFicoTarget,
        delta: bestFicoTarget - deal.borrower_fico,
        reason: `Lowest tier requires FICO ≥ ${bestFicoTarget} (currently ${deal.borrower_fico})`,
      });
    }
    if (bestExpTarget != null) {
      offers.push({
        kind: "borrower_change",
        field: "borrower_experience",
        target: bestExpTarget,
        delta: bestExpTarget - deal.borrower_experience,
        reason: `Lowest tier requires ${bestExpTarget} completed deals (currently ${deal.borrower_experience})`,
      });
    }
  }

  // Suppress duplicate reasons (e.g. min_loan_amount can fire twice).
  const seen = new Set<string>();
  return offers.filter((o) => {
    const key = `${o.kind}:${"field" in o ? o.field : ""}:${"reason" in o ? o.reason : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Criteria assembly from JSONB rows ────────────────────────────────────
// Reads an investor's investor_criteria rows (ARRAY of {criteria_key,
// criteria_value}) and builds a single InvestorRules object. Unknown
// keys are ignored — the engine tolerates partial / future criteria.

export function assembleRulesFromCriteria(
  rows: Array<{ criteria_key: string; criteria_value: unknown }>,
): InvestorRules {
  const rules: InvestorRules = {};
  for (const row of rows) {
    const v = row.criteria_value;
    switch (row.criteria_key) {
      case "loan_types": rules.loan_types = (v as string[]).map((s) => s.toLowerCase()); break;
      case "property_types": rules.property_types = (v as string[]).map((s) => s.toLowerCase()); break;
      case "excluded_property_types": rules.excluded_property_types = (v as string[]).map((s) => s.toLowerCase()); break;
      case "allowed_states": rules.allowed_states = (v as string[]).map((s) => s.toUpperCase()); break;
      case "excluded_states": rules.excluded_states = (v as string[]).map((s) => s.toUpperCase()); break;
      case "min_loan_amount": rules.min_loan_amount = Number(v); break;
      case "max_loan_amount": rules.max_loan_amount = Number(v); break;
      case "min_fico": rules.min_fico = Number(v); break;
      case "min_experience": rules.min_experience = Number(v); break;
      case "max_ltv": rules.max_ltv = Number(v); break;
      case "max_ltc": rules.max_ltc = Number(v); break;
      case "max_ltarv": rules.max_ltarv = Number(v); break;
      case "rural_allowed": rules.rural_allowed = Boolean(v); break;
      case "allowed_occupancy": rules.allowed_occupancy = (v as string[]).map((s) => s.toLowerCase()); break;
      case "leverage_matrix": rules.leverage_matrix = v as LeverageTier[]; break;
      case "rate_adjusters": rules.rate_adjusters = v as RateAdjuster[]; break;
      // Unknown keys are ignored on purpose — investor_criteria.criteria_key
      // is open-ended; we want to support adding new dimensions without
      // shipping a new build.
    }
  }
  return rules;
}
