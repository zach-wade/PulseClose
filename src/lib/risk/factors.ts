// Deterministic risk-factor computation. Each pillar contributes one or
// more named factors with a severity tag; the tier is then derived purely
// from the active (non-excluded) factors. Pure functions only — DB I/O
// happens in the caller.

import { normalizeAddress } from "@/lib/domain/upsert";
//
// Factor catalogue v1 (per ROADMAP — "Risk-tier rebuild"):
//   - entity_status            severity from sos_status
//   - active_fed_litigation    critical if any active federal case
//   - dismissed_litigation     informational if any dismissed case
//   - sanctions_hit            critical if any potential match
//   - gc_license_issue         moderate if non-active license (when GC was provided)
//   - extended_hold            moderate; per-property exclusions for
//                              primary residence + bank-financed
//   - lender_concentration     minor if ≥3 properties share one lender
//   - foreclosure_distress     moderate if any property has Realie forecloseCode
//
// Tier rule: any active critical → HIGH; else ≥2 active moderate → MEDIUM;
// else LOW. AI memo gets the factor list and narrates it; AI never picks
// the tier directly.

export type FactorSeverity = "critical" | "moderate" | "minor" | "informational" | "none";
export type Tier = "HIGH" | "MEDIUM" | "LOW";

export interface RiskFactor {
  factor_key: string;
  severity: FactorSeverity;
  excluded: boolean;
  exclusion_reason: string | null;
  contributing_data: Record<string, unknown>;
  explanation: string;
}

export interface FactorPropertyView {
  property_id: string | null;
  property_address: string;
  hold_months: number | null;
  acquisition_date: string | null;
  disposition_date: string | null;
  lender_id: string | null;
  lender_classification: "bank" | "bridge" | "private_credit" | "unknown" | null;
  is_primary_residence: boolean;
  raw_response: Record<string, unknown> | null;
  // Property-level pricing context used by market_outlier factor
  zip: string | null;
  zip_median_value: number | null;  // ZHVI typical-home value for this zip
  current_avm: number | null;        // Realie modelValue
}

export interface FactorEntityView {
  sos_status: string | null;
  flags: string[];
  last_filing_date: string | null;
  // C4 — additional fields for the address-consistency cross-check.
  // Optional so legacy callers (and tests) keep compiling.
  state?: string | null;
  registered_agent?: string | null;
}

export interface FactorLitigationView {
  result: string;
  case_number: string | null;
  details: string | null;
  raw_response: Record<string, unknown> | null;
}

export interface FactorSanctionsView {
  result: string;
  matches: Array<{ matched_name?: string; list_name?: string }>;
}

export interface FactorGCView {
  gc_name: string;
  license_status: string;
  license_state: string;
}

export interface ComputeFactorsInput {
  entity: FactorEntityView | null;
  litigation: FactorLitigationView[];
  sanctions: FactorSanctionsView | null;
  gc: FactorGCView | null;
  properties: FactorPropertyView[];
  // C4 — name passed in for the registered-agent self-service check.
  // Optional; absent in older test callers.
  borrower_name?: string | null;
  guarantor_name?: string | null;
}

// Threshold for the extended-hold flag. 18 months captures stalled flips
// without flagging legitimate buy-and-rehab cycles. Bridge ICP only —
// adjust per loan-type in v2.
const EXTENDED_HOLD_MONTHS = 18;

// Lender concentration threshold (count of properties sharing one lender).
const LENDER_CONCENTRATION_MIN = 3;

// ZHVI deviation thresholds — how far a property's AVM has to be from
// the zip's typical home value to flag. The signal is informational
// (high-end deals legitimately exceed zip-medians); never tier-changing.
const MARKET_OUTLIER_HIGH_RATIO = 2.0;   // 2x+ the zip median
const MARKET_OUTLIER_LOW_RATIO = 0.5;    // 50% or less of the zip median

export function computeRiskFactors(input: ComputeFactorsInput): RiskFactor[] {
  const factors: RiskFactor[] = [];

  // ── Entity status ────────────────────────────────────────────────────
  if (input.entity) {
    const status = (input.entity.sos_status ?? "").toLowerCase();
    let severity: FactorSeverity = "none";
    let explanation = `Entity is in good standing (SOS: ${status || "unknown"}).`;

    if (status === "dissolved") {
      severity = "critical";
      explanation = "Entity has been dissolved per the secretary of state.";
    } else if (status === "suspended") {
      severity = "moderate";
      explanation = "Entity is suspended per the secretary of state — filing reinstatement may be required before closing.";
    } else if (status === "not_found") {
      severity = "minor";
      explanation = "Entity could not be located in the secretary of state database — verify spelling and jurisdiction.";
    } else if (status === "active") {
      severity = "none";
    }

    factors.push({
      factor_key: "entity_status",
      severity,
      excluded: false,
      exclusion_reason: null,
      contributing_data: {
        sos_status: input.entity.sos_status,
        last_filing_date: input.entity.last_filing_date,
      },
      explanation,
    });
  }

  // ── Litigation ───────────────────────────────────────────────────────
  const isFound = (l: FactorLitigationView) => l.result === "found";
  const isActive = (l: FactorLitigationView) => {
    if (!isFound(l)) return false;
    const raw = l.raw_response as Record<string, unknown> | null;
    return !raw?.date_terminated;
  };
  const activeCases = input.litigation.filter(isActive);
  const dismissedCases = input.litigation.filter((l) => isFound(l) && !isActive(l));

  if (activeCases.length > 0) {
    factors.push({
      factor_key: "active_fed_litigation",
      severity: "critical",
      excluded: false,
      exclusion_reason: null,
      contributing_data: {
        count: activeCases.length,
        cases: activeCases.map((c) => ({
          case_number: c.case_number,
          search_type: (c.raw_response as Record<string, unknown> | null)?.search_type ?? null,
        })),
      },
      explanation: `${activeCases.length} active federal case${activeCases.length === 1 ? "" : "s"} found via CourtListener — review before extending credit.`,
    });
  }

  if (dismissedCases.length > 0) {
    factors.push({
      factor_key: "dismissed_litigation",
      severity: "informational",
      excluded: false,
      exclusion_reason: null,
      contributing_data: {
        count: dismissedCases.length,
        cases: dismissedCases.map((c) => ({ case_number: c.case_number })),
      },
      explanation: `${dismissedCases.length} dismissed/terminated federal case${dismissedCases.length === 1 ? "" : "s"} on record — informational only.`,
    });
  }

  // ── Sanctions ────────────────────────────────────────────────────────
  if (input.sanctions && input.sanctions.result === "potential_match") {
    factors.push({
      factor_key: "sanctions_hit",
      severity: "critical",
      excluded: false,
      exclusion_reason: null,
      contributing_data: {
        match_count: input.sanctions.matches.length,
        lists: [...new Set(input.sanctions.matches.map((m) => m.list_name).filter(Boolean))],
      },
      explanation: `Sanctions/PEP screen returned a potential match (${input.sanctions.matches.length} hit${input.sanctions.matches.length === 1 ? "" : "s"}) — manual review required.`,
    });
  }

  // ── GC license ───────────────────────────────────────────────────────
  if (input.gc && input.gc.license_status && input.gc.license_status !== "active") {
    factors.push({
      factor_key: "gc_license_issue",
      severity: "moderate",
      excluded: false,
      exclusion_reason: null,
      contributing_data: {
        gc_name: input.gc.gc_name,
        license_status: input.gc.license_status,
        license_state: input.gc.license_state,
      },
      explanation: `GC "${input.gc.gc_name}" has a non-active license (${input.gc.license_status}) in ${input.gc.license_state}.`,
    });
  }

  // ── Extended hold (with Bridge ICP exclusions) ──────────────────────
  // Per memory project_risk_tier_bridge_icp: exclude primary-residence and
  // bank-financed properties from this flag. Currently-held only — sold
  // properties don't have an "extended hold" issue regardless of duration.
  const heldProperties = input.properties.filter((p) => !p.disposition_date);
  const longHolds = heldProperties.filter(
    (p) => p.hold_months != null && p.hold_months > EXTENDED_HOLD_MONTHS,
  );

  if (longHolds.length > 0) {
    const annotated = longHolds.map((p) => {
      const isBankFinanced = p.lender_classification === "bank";
      const excluded = p.is_primary_residence || isBankFinanced;
      const reason = p.is_primary_residence
        ? "primary_residence"
        : isBankFinanced
          ? "bank_financed"
          : null;
      return {
        property_id: p.property_id,
        property_address: p.property_address,
        hold_months: p.hold_months,
        excluded,
        exclusion_reason: reason,
      };
    });
    const allExcluded = annotated.every((a) => a.excluded);

    factors.push({
      factor_key: "extended_hold",
      severity: allExcluded ? "none" : "moderate",
      excluded: allExcluded,
      exclusion_reason: allExcluded
        ? "All affected properties excluded (primary-residence and/or bank-financed)."
        : null,
      contributing_data: { properties: annotated, threshold_months: EXTENDED_HOLD_MONTHS },
      explanation: allExcluded
        ? `${longHolds.length} property hold${longHolds.length === 1 ? "" : "s"} exceed${longHolds.length === 1 ? "s" : ""} ${EXTENDED_HOLD_MONTHS} months but all are excluded (primary residence or bank-financed).`
        : `${longHolds.length} property hold${longHolds.length === 1 ? "" : "s"} exceed${longHolds.length === 1 ? "s" : ""} ${EXTENDED_HOLD_MONTHS} months — bridge financing typically expects shorter cycles.`,
    });
  }

  // ── Lender concentration ─────────────────────────────────────────────
  const lenderCounts = new Map<string, number>();
  for (const p of input.properties) {
    if (!p.lender_id) continue;
    lenderCounts.set(p.lender_id, (lenderCounts.get(p.lender_id) ?? 0) + 1);
  }
  const concentrated = [...lenderCounts.entries()].filter(([, n]) => n >= LENDER_CONCENTRATION_MIN);
  if (concentrated.length > 0) {
    factors.push({
      factor_key: "lender_concentration",
      severity: "minor",
      excluded: false,
      exclusion_reason: null,
      contributing_data: {
        lenders: concentrated.map(([lender_id, count]) => ({ lender_id, count })),
        threshold: LENDER_CONCENTRATION_MIN,
      },
      explanation: `Borrower has ≥${LENDER_CONCENTRATION_MIN} properties with a single lender — concentration risk to monitor.`,
    });
  }

  // ── Market outlier (ZHVI deviation) ──────────────────────────────────
  // Compare each property's AVM (Realie modelValue) to the zip's ZHVI
  // median. >2x or <0.5x flags as informational — high-end deals
  // legitimately exceed medians, but the deviation is worth surfacing
  // for the lender's manual sanity check (Damon's "would be amazing"
  // ask on the 4/28 call).
  const outliers = input.properties
    .map((p) => {
      if (p.current_avm == null || p.zip_median_value == null || p.zip_median_value <= 0) return null;
      const ratio = p.current_avm / p.zip_median_value;
      const isHigh = ratio >= MARKET_OUTLIER_HIGH_RATIO;
      const isLow = ratio <= MARKET_OUTLIER_LOW_RATIO;
      if (!isHigh && !isLow) return null;
      return {
        property_id: p.property_id,
        property_address: p.property_address,
        zip: p.zip,
        avm: p.current_avm,
        zip_median: p.zip_median_value,
        ratio,
        direction: isHigh ? "above" : "below",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (outliers.length > 0) {
    factors.push({
      factor_key: "market_outlier",
      severity: "informational",
      excluded: false,
      exclusion_reason: null,
      contributing_data: {
        properties: outliers,
        thresholds: { high_ratio: MARKET_OUTLIER_HIGH_RATIO, low_ratio: MARKET_OUTLIER_LOW_RATIO },
      },
      explanation: `${outliers.length} property AVM${outliers.length === 1 ? "" : "s"} deviate${outliers.length === 1 ? "s" : ""} significantly from zip median (Zillow ZHVI) — informational, not necessarily fraud.`,
    });
  }

  // Properties with an AVM but no zip-median lookup — ZHVI dataset doesn't
  // cover every zip (e.g. new construction, manual zip edits). Surface the
  // gap as an informational factor so we don't silently miss outliers.
  const unavailableZips = input.properties
    .filter((p) => p.current_avm != null && p.zip_median_value == null)
    .map((p) => ({
      property_id: p.property_id,
      property_address: p.property_address,
      zip: p.zip,
      avm: p.current_avm,
    }));
  if (unavailableZips.length > 0) {
    factors.push({
      factor_key: "market_outlier_unavailable",
      severity: "informational",
      excluded: false,
      exclusion_reason: null,
      contributing_data: { properties: unavailableZips },
      explanation: `AVM not comparable for ${unavailableZips.length} property — zip not in the Zillow ZHVI dataset. Outlier detection skipped.`,
    });
  }

  // ── C4: Address consistency cross-check ──────────────────────────────
  // Informational signal. Catches three classes of weirdness:
  //   (a) Registered agent name matches the borrower/guarantor → DIY
  //       agent, not necessarily fraud but worth surfacing (some states
  //       require third-party service, and an investor underwriter will
  //       care).
  //   (b) Entity formed in state X, all properties in state Y where
  //       X ≠ Y AND |Y - distinct property states| > 0 → cross-state
  //       paper-only entity. Common with NV/DE LLCs holding CA assets;
  //       not a flag at small N, surfaces at high N.
  //   (c) Multiple properties claim the same exact street address
  //       (common during portfolio-fraud stings).
  const consistencyFindings: string[] = [];
  const consistencyDetails: Record<string, unknown> = {};
  if (input.entity?.registered_agent && (input.borrower_name || input.guarantor_name)) {
    const ra = canonicalizeForCompare(input.entity.registered_agent);
    const bm = canonicalizeForCompare(input.borrower_name);
    const gm = canonicalizeForCompare(input.guarantor_name);
    if (ra && (ra === bm || ra === gm)) {
      consistencyFindings.push(
        `Registered agent (${input.entity.registered_agent}) is the same person as the borrower/guarantor — third-party agent recommended.`,
      );
      consistencyDetails.self_served_registered_agent = true;
    }
  }
  if (input.entity?.state && input.properties.length >= 3) {
    const propStates = new Set(
      input.properties
        .map((p) => extractStateFromAddress(p.property_address))
        .filter((s): s is string => s !== null),
    );
    const entityState = input.entity.state.toUpperCase();
    if (propStates.size > 0 && !propStates.has(entityState)) {
      consistencyFindings.push(
        `Entity formed in ${entityState} but no properties in that state (${[...propStates].join(", ")}).`,
      );
      consistencyDetails.cross_state = {
        entity_state: entityState,
        property_states: [...propStates],
      };
    }
  }
  // Property-line clustering — exact duplicates of the same line1.
  // Use the USPS-canonical normalizer (00029) so "1259 Almaden Ave" and
  // "1259 ALMADEN AVE." collapse to the same key. Falls back to the raw
  // pre-comma slice if normalize returns null (e.g. empty input).
  const addrCounts = new Map<string, number>();
  for (const p of input.properties) {
    const raw = (p.property_address ?? "").split(",")[0]?.trim();
    if (!raw) continue;
    const key = normalizeAddress(raw) ?? raw.toLowerCase();
    addrCounts.set(key, (addrCounts.get(key) ?? 0) + 1);
  }
  const dupes = [...addrCounts.entries()].filter(([, n]) => n > 1);
  if (dupes.length > 0) {
    consistencyFindings.push(
      `${dupes.length} street address${dupes.length === 1 ? "" : "es"} appear in the track record more than once.`,
    );
    consistencyDetails.duplicate_addresses = dupes.map(([line1, count]) => ({ line1, count }));
  }

  if (consistencyFindings.length > 0) {
    factors.push({
      factor_key: "address_consistency",
      severity: "informational",
      excluded: false,
      exclusion_reason: null,
      contributing_data: consistencyDetails,
      explanation: consistencyFindings.join(" "),
    });
  }

  // ── Foreclosure / distress ───────────────────────────────────────────
  const distressed = input.properties.filter((p) => {
    const raw = p.raw_response as Record<string, unknown> | null;
    return raw && (raw.forecloseCode || raw.forecloseFileDate || raw.auctionDate);
  });
  if (distressed.length > 0) {
    factors.push({
      factor_key: "foreclosure_distress",
      severity: "moderate",
      excluded: false,
      exclusion_reason: null,
      contributing_data: {
        count: distressed.length,
        properties: distressed.map((p) => ({
          property_id: p.property_id,
          property_address: p.property_address,
        })),
      },
      explanation: `${distressed.length} property with foreclosure / auction filing on record.`,
    });
  }

  return factors;
}

export function deriveTier(factors: RiskFactor[]): Tier {
  const active = factors.filter((f) => !f.excluded && f.severity !== "none");
  if (active.some((f) => f.severity === "critical")) return "HIGH";
  if (active.filter((f) => f.severity === "moderate").length >= 2) return "MEDIUM";
  return "LOW";
}

export function tierLabel(tier: Tier): string {
  return tier === "HIGH" ? "High risk" : tier === "MEDIUM" ? "Medium risk" : "Low risk";
}

export function humanizeFactorKey(key: string): string {
  const map: Record<string, string> = {
    entity_status: "Entity status",
    active_fed_litigation: "Active federal litigation",
    dismissed_litigation: "Dismissed/terminated litigation",
    sanctions_hit: "Sanctions / PEP screen",
    gc_license_issue: "GC license issue",
    extended_hold: "Extended hold period",
    lender_concentration: "Lender concentration",
    foreclosure_distress: "Foreclosure / distress",
    market_outlier: "Market outlier (vs. zip median)",
    market_outlier_unavailable: "Market outlier (data unavailable)",
    address_consistency: "Address consistency",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

// Local helpers for the address-consistency factor. canonicalize is
// intentionally lighter than the dedup canonicalizeName (we tolerate
// "John A. Smith" vs "John Smith" via tokenize-and-set rather than
// requiring the entity-suffix-stripped canonical form).
function canonicalizeForCompare(input: string | null | undefined): string | null {
  if (!input) return null;
  const tokens = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .sort();
  return tokens.length > 0 ? tokens.join(" ") : null;
}

// Best-effort state extraction from a property_address. Pulls the
// first 2-letter token followed by a 5-digit zip OR a token in the
// known state-code set as a fallback.
const STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);
function extractStateFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  // First try ", ST ZIP" tail — most reliable.
  const m = addr.match(/,\s*([A-Z]{2})\s+\d{5}/);
  if (m && STATE_CODES.has(m[1])) return m[1];
  // Fallback: any 2-letter uppercase token in the canonical set.
  for (const tok of addr.split(/[^A-Z]+/)) {
    if (tok.length === 2 && STATE_CODES.has(tok)) return tok;
  }
  return null;
}
