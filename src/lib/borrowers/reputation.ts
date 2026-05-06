// E2 — Borrower reputation / lender-relationship history.
//
// Server-computed summary per borrower. No new table — small enough that
// joins beat cache-invalidation. Components per ROADMAP Stage 8:
//   - validation count
//   - tier mix (HIGH/MEDIUM/LOW) historically with this org
//   - outcome mix from E1 (funded/repaid/extended/defaulted/withdrawn)
//   - signal-correction rate (overrides applied / risk_factors total)
//   - first / latest seen
//
// Tier is derived from risk_factors at read time (matches the rest of
// the codebase — tier is never persisted on borrower_validations). The
// derivation is the same `deriveTier` used everywhere else.
//
// Org-scoped. Cross-tenant aggregation is E3, gated on density + legal.

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTier, type RiskFactor, type Tier } from "@/lib/risk/factors";

export interface BorrowerReputation {
  borrower_id: string;
  display_name: string;
  validation_count: number;
  first_seen_at: string | null;
  latest_seen_at: string | null;
  tier_mix: Record<Tier, number>;
  outcome_mix: {
    funded: number;
    repaid: number;
    extended: number;
    defaulted: number;
    withdrawn: number;
    no_outcome: number;
  };
  funded_total_cents: number | null;
  signal_corrections: number;
  risk_factor_total: number;
  // Convenience ratios (0-1) for the UI; undefined when denominator is zero.
  default_rate: number | null;
  extension_rate: number | null;
  signal_correction_rate: number | null;
}

export async function getBorrowerReputation(
  supabase: SupabaseClient,
  borrowerId: string,
  orgId: string,
): Promise<BorrowerReputation | null> {
  const { data: borrower } = await supabase
    .from("borrowers")
    .select("id, display_name")
    .eq("id", borrowerId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!borrower) return null;

  // Cap at 500 — same reasoning as the validations roll-up route. Beyond
  // this the JS aggregation slows the page and the marginal info from
  // older runs is low. If a borrower legitimately exceeds this we'd
  // switch to a SQL aggregation.
  const REPUTATION_VALIDATIONS_LIMIT = 500;
  const { data: validations } = await supabase
    .from("borrower_validations")
    .select("id, created_at")
    .eq("primary_borrower_id", borrowerId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(REPUTATION_VALIDATIONS_LIMIT);

  const validationIds = (validations ?? []).map((v) => v.id);
  const validationCount = validationIds.length;

  if (validationCount === 0) {
    return {
      borrower_id: borrower.id,
      display_name: borrower.display_name,
      validation_count: 0,
      first_seen_at: null,
      latest_seen_at: null,
      tier_mix: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      outcome_mix: {
        funded: 0,
        repaid: 0,
        extended: 0,
        defaulted: 0,
        withdrawn: 0,
        no_outcome: 0,
      },
      funded_total_cents: null,
      signal_corrections: 0,
      risk_factor_total: 0,
      default_rate: null,
      extension_rate: null,
      signal_correction_rate: null,
    };
  }

  // Pull the substrate — risk_factors, deal_outcomes, signals — in parallel.
  // Three small selects scoped to the validation_ids we already have.
  const [factorsRes, outcomesRes, borrowerSignalsRes, propertySignalsRes] =
    await Promise.all([
      supabase
        .from("risk_factors")
        .select(
          "validation_id, factor_key, severity, excluded, exclusion_reason, contributing_data, explanation",
        )
        .in("validation_id", validationIds),
      supabase
        .from("deal_outcomes")
        .select("validation_id, status, outcome_data")
        .in("validation_id", validationIds),
      supabase
        .from("borrower_signals")
        .select("id, superseded_at")
        .eq("borrower_id", borrowerId),
      supabase
        .from("borrower_property_signals")
        .select("id, superseded_at")
        .eq("borrower_id", borrowerId),
    ]);

  // Group factors by validation_id → derive tier per validation.
  const factorsByValidation = new Map<string, RiskFactor[]>();
  for (const f of factorsRes.data ?? []) {
    const list = factorsByValidation.get(f.validation_id) ?? [];
    list.push(f as RiskFactor);
    factorsByValidation.set(f.validation_id, list);
  }

  const tierMix: Record<Tier, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const vid of validationIds) {
    const factors = factorsByValidation.get(vid) ?? [];
    if (factors.length === 0) continue; // validations without factors
    tierMix[deriveTier(factors)]++;
  }

  // Outcome counts. UPSERT keeps deal_outcomes 1:1 with validation_id, so
  // counts are deal-count, not status-event-count.
  const outcomeMix = {
    funded: 0,
    repaid: 0,
    extended: 0,
    defaulted: 0,
    withdrawn: 0,
    no_outcome: 0,
  };
  let fundedTotalCents = 0;
  const seen = new Set<string>();
  for (const o of outcomesRes.data ?? []) {
    seen.add(o.validation_id);
    const status = o.status as keyof Omit<typeof outcomeMix, "no_outcome">;
    if (status in outcomeMix) outcomeMix[status]++;
    if (status === "funded") {
      const amt = (o.outcome_data as { funded_amount?: number })?.funded_amount;
      if (typeof amt === "number" && Number.isFinite(amt)) {
        fundedTotalCents += Math.round(amt * 100);
      }
    }
  }
  outcomeMix.no_outcome = validationCount - seen.size;

  // Signal corrections — exclude superseded rows. These represent the
  // lender's overrides on derived data ("primary residence", "bank-financed").
  const liveBorrowerSignals = (borrowerSignalsRes.data ?? []).filter(
    (s) => !s.superseded_at,
  ).length;
  const livePropertySignals = (propertySignalsRes.data ?? []).filter(
    (s) => !s.superseded_at,
  ).length;
  const signalCorrections = liveBorrowerSignals + livePropertySignals;
  const riskFactorTotal = factorsRes.data?.length ?? 0;

  const fundedAndExtended =
    outcomeMix.funded +
    outcomeMix.repaid +
    outcomeMix.extended +
    outcomeMix.defaulted;

  return {
    borrower_id: borrower.id,
    display_name: borrower.display_name,
    validation_count: validationCount,
    first_seen_at: validations?.[0]?.created_at ?? null,
    latest_seen_at: validations?.[validationCount - 1]?.created_at ?? null,
    tier_mix: tierMix,
    outcome_mix: outcomeMix,
    funded_total_cents: fundedTotalCents > 0 ? fundedTotalCents : null,
    signal_corrections: signalCorrections,
    risk_factor_total: riskFactorTotal,
    default_rate:
      fundedAndExtended > 0 ? outcomeMix.defaulted / fundedAndExtended : null,
    extension_rate:
      fundedAndExtended > 0 ? outcomeMix.extended / fundedAndExtended : null,
    signal_correction_rate:
      riskFactorTotal > 0 ? signalCorrections / riskFactorTotal : null,
  };
}
