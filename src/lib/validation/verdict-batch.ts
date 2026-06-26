// Server-side batch verdict computation. The list / borrower / portfolio
// surfaces need a verdict per validation but only hold the row columns
// (`/api/validations` is select("*"), no joined pillar tables). This helper
// batch-fetches the 5 pillar tables + risk_factors + mandate_assessments for a
// set of validations and runs the SAME computeVerdict() the detail page uses —
// so a list chip and the detail hero can never disagree (UX-REDESIGN §11.5).

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeVerdict, type MandateStanding, type RiskTier, type VerdictState } from "./verdict";
import { deriveTier, type RiskFactor } from "@/lib/risk/factors";

export interface ValidationRef {
  id: string;
  primary_borrower_id: string | null;
  created_at: string;
}

export interface BatchVerdict {
  state: VerdictState;
  headline: string;
  tier: RiskTier | null;
  /** Tier of this borrower's previous run, for the delta chip. Null = first run. */
  prior_tier: RiskTier | null;
  issueCount: number;
}

const MANDATE_RANK: Record<string, number> = { pass: 0, conditional: 1, fail: 2 };
const TO_STANDING: Record<string, MandateStanding> = {
  pass: "meets",
  conditional: "conditional",
  fail: "does_not_meet",
};

function groupBy<T extends { validation_id: string }>(rows: T[] | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows ?? []) {
    const arr = m.get(r.validation_id);
    if (arr) arr.push(r);
    else m.set(r.validation_id, [r]);
  }
  return m;
}

export async function computeVerdictsForValidations(
  supabase: SupabaseClient,
  validations: ValidationRef[],
): Promise<Map<string, BatchVerdict>> {
  const result = new Map<string, BatchVerdict>();
  const ids = validations.map((v) => v.id);
  if (ids.length === 0) return result;

  // 7 batched reads cover any row count (vs. N×7 per-row).
  const [entity, track, litigation, gc, sanctions, factors, mandates] = await Promise.all([
    supabase.from("entity_checks").select("validation_id, state, sos_status, flags, raw_response").in("validation_id", ids),
    supabase.from("track_record_entries").select("validation_id, outcome, review_status").in("validation_id", ids),
    supabase.from("litigation_checks").select("validation_id, result, details, raw_response").in("validation_id", ids),
    supabase.from("gc_validations").select("validation_id, license_status").in("validation_id", ids),
    supabase.from("sanctions_checks").select("validation_id, result, matches, match_count").in("validation_id", ids),
    supabase.from("risk_factors").select("*").in("validation_id", ids),
    supabase.from("mandate_assessments").select("validation_id, result").in("validation_id", ids),
  ]);

  const entityG = groupBy(entity.data as Array<{ validation_id: string }> | null);
  const trackG = groupBy(track.data as Array<{ validation_id: string }> | null);
  const litG = groupBy(litigation.data as Array<{ validation_id: string }> | null);
  const gcG = groupBy(gc.data as Array<{ validation_id: string }> | null);
  const sanctionsG = groupBy(sanctions.data as Array<{ validation_id: string }> | null);
  const factorsG = groupBy(factors.data as Array<RiskFactor & { validation_id: string }> | null);
  const mandatesG = groupBy(mandates.data as Array<{ validation_id: string; result: string }> | null);

  // First pass — compute tier + verdict per validation.
  const tierById = new Map<string, RiskTier | null>();
  for (const v of validations) {
    const tier = deriveTier((factorsG.get(v.id) ?? []) as RiskFactor[]);
    tierById.set(v.id, tier);

    const mandateRows = mandatesG.get(v.id) ?? [];
    let mandate: MandateStanding | null = null;
    if (mandateRows.length > 0) {
      const worst = mandateRows.reduce((a, b) => (MANDATE_RANK[b.result] > MANDATE_RANK[a.result] ? b : a));
      mandate = TO_STANDING[worst.result] ?? null;
    }

    const verdict = computeVerdict({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entity_checks: (entityG.get(v.id) ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      track_record: (trackG.get(v.id) ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      litigation_checks: (litG.get(v.id) ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gc_validations: (gcG.get(v.id) ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sanctions_checks: (sanctionsG.get(v.id) ?? []) as any,
      tier,
      mandate,
    });

    result.set(v.id, {
      state: verdict.state,
      headline: verdict.headline,
      tier,
      prior_tier: null,
      issueCount: verdict.issueCount,
    });
  }

  // Second pass — prior_tier from the same borrower's previous run (by date).
  const byBorrower = new Map<string, ValidationRef[]>();
  for (const v of validations) {
    if (!v.primary_borrower_id) continue;
    const arr = byBorrower.get(v.primary_borrower_id);
    if (arr) arr.push(v);
    else byBorrower.set(v.primary_borrower_id, [v]);
  }
  for (const runs of byBorrower.values()) {
    runs.sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest → newest
    for (let i = 1; i < runs.length; i++) {
      const entry = result.get(runs[i].id);
      if (entry) entry.prior_tier = tierById.get(runs[i - 1].id) ?? null;
    }
  }

  return result;
}

// Standalone prior-tier lookup for the detail page (which loads one validation
// and doesn't have the borrower's full run set in hand).
export async function priorTierForValidation(
  supabase: SupabaseClient,
  borrowerId: string | null,
  beforeCreatedAt: string,
  orgId: string,
): Promise<RiskTier | null> {
  if (!borrowerId) return null;
  const { data: prior } = await supabase
    .from("borrower_validations")
    .select("id")
    .eq("primary_borrower_id", borrowerId)
    .eq("org_id", orgId)
    .lt("created_at", beforeCreatedAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prior?.id) return null;
  const { data: factors } = await supabase.from("risk_factors").select("*").eq("validation_id", prior.id);
  return deriveTier((factors ?? []) as RiskFactor[]);
}
