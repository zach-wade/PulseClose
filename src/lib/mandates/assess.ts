// Capital-provider mandate assessment (Item 4).
//
// Assesses a completed borrower validation against each of the org's enabled
// investor mandates (diligence gates), persists the result to
// mandate_assessments (upsert per validation+mandate), and fires the
// mandate.assessed webhook. The deterministic gate evaluation is the
// endorsement signal — there's no AI here.
//
// The deal-eligibility half is NOT re-derived: the optional eligibility gate
// reads the most recent evaluate result for the mandate's investor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTier, type RiskFactor, type Tier } from "@/lib/risk/factors";
import { parseMandateGatesV1, type MandateFailureV1 } from "@/lib/schemas/jsonb";
import { dispatchWebhookEvent } from "@/lib/webhooks/deliver";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pulseclose.com";

const TIER_RANK: Record<Tier, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export type MandateResult = "pass" | "conditional" | "fail";

export interface MandateAssessment {
  mandate_id: string;
  investor_id: string;
  mandate_name: string;
  investor_name: string | null;
  result: MandateResult;
  failures: MandateFailureV1[];
}

interface ValidationDiligence {
  risk_tier: Tier;
  sos_active: boolean;
  /** Entity check errored (e.g. 429) — unverified, not a confirmed "not active". */
  sos_unavailable: boolean;
  has_active_litigation: boolean;
  /** Litigation screen could not complete — cannot be asserted clear. */
  litigation_incomplete: boolean;
  sanctions_hit: boolean;
  /** Sanctions screen could not complete — cannot be asserted clear. */
  sanctions_incomplete: boolean;
  experience_tier: number | null;
  confidence_score: number | null;
  has_inactive_gc: boolean;
  /** investor_id → most recent eligibility result for this validation. */
  eligibilityByInvestor: Map<string, "pass" | "conditional" | "fail">;
}

async function loadValidationDiligence(
  supabase: SupabaseClient,
  validationId: string,
  orgId: string,
): Promise<ValidationDiligence | null> {
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, experience_tier, confidence_score")
    .eq("id", validationId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!validation) return null;

  const [factorsRes, entityRes, litigationRes, sanctionsRes, gcRes, evalRes] = await Promise.all([
    supabase.from("risk_factors").select("severity, excluded").eq("validation_id", validationId),
    supabase
      .from("entity_checks")
      .select("sos_status, raw_response")
      .eq("validation_id", validationId)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("litigation_checks").select("result, raw_response").eq("validation_id", validationId),
    supabase
      .from("sanctions_checks")
      .select("result, matches")
      .eq("validation_id", validationId)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("gc_validations").select("license_status").eq("validation_id", validationId),
    supabase
      .from("deal_evaluations")
      .select("id")
      .eq("validation_id", validationId)
      .eq("org_id", orgId)
      .order("evaluated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const risk_tier = deriveTier((factorsRes.data ?? []) as unknown as RiskFactor[]);

  // The mandate gates must read diligence the same way the risk factors do —
  // through the disambiguation + list-type classification + not-run layers —
  // never raw results (finding #18). A name-only "possible" litigation match, an
  // exclusion-list "sanctions" entry, or a rate-limited entity check must NOT be
  // asserted as a confirmed negative against the borrower.
  const sos_status = entityRes.data?.sos_status ?? null;
  const sos_active = sos_status === "active";
  // A 429 / upstream error is NOT a confirmation the entity is absent — it's an
  // unverified check that should make the mandate conditional, not auto-fail.
  const sos_unavailable = Boolean(
    (entityRes.data?.raw_response as { _error?: boolean } | null)?._error,
  );

  const litRows = litigationRes.data ?? [];
  // Only a CONFIRMED active federal case (corroborated by a second identifier)
  // trips the active-litigation gate — mirrors factors.ts `active_fed_litigation`.
  // "possible"/"weak"/name-only matches are review items, never a gate breach.
  const has_active_litigation = litRows.some((l) => {
    if (l.result !== "found") return false;
    const raw = l.raw_response as Record<string, unknown> | null;
    if (raw?.date_terminated) return false;
    const confidence = (raw?._disambiguation as { confidence?: string } | undefined)?.confidence;
    return confidence === "confirmed";
  });
  // An incomplete litigation screen (a not_run sentinel) cannot be asserted clear.
  const litigation_incomplete = litRows.some((l) => l.result === "not_run");

  // Sanctions: only a CONFIRMED match on an actual sanction/PEP list (not a
  // SAM/FINRA/medical exclusion, not a name-only possible) trips the gate —
  // mirrors factors.ts `sanctions_hit`. Read the matches, not just `result`.
  const sanctionsMatches = (sanctionsRes.data?.matches ?? []) as Array<{
    category?: string;
    confidence?: string;
  }>;
  const isScreeningRelevant = (m: { category?: string }) =>
    m.category == null || m.category === "sanction" || m.category === "pep";
  const sanctions_hit = sanctionsMatches.some(
    (m) => isScreeningRelevant(m) && m.confidence === "confirmed",
  );
  const sanctions_incomplete = sanctionsRes.data?.result === "not_run";
  const has_inactive_gc = (gcRes.data ?? []).some((g) => g.license_status && g.license_status !== "active");

  const eligibilityByInvestor = new Map<string, "pass" | "conditional" | "fail">();
  if (evalRes.data?.id) {
    const { data: elig } = await supabase
      .from("deal_eligibility_results")
      .select("investor_id, result")
      .eq("deal_evaluation_id", evalRes.data.id);
    for (const r of elig ?? []) {
      eligibilityByInvestor.set(r.investor_id, r.result as "pass" | "conditional" | "fail");
    }
  }

  return {
    risk_tier,
    sos_active,
    sos_unavailable,
    has_active_litigation,
    litigation_incomplete,
    sanctions_hit,
    sanctions_incomplete,
    experience_tier: validation.experience_tier ?? null,
    confidence_score: validation.confidence_score ?? null,
    has_inactive_gc,
    eligibilityByInvestor,
  };
}

interface MandateGates {
  max_risk_tier?: Tier | null;
  require_sos_active?: boolean;
  disallow_active_litigation?: boolean;
  disallow_sanctions_hit?: boolean;
  max_experience_tier?: number | null;
  min_confidence_score?: number | null;
  require_gc_active?: boolean;
  require_eligibility_pass?: boolean;
}

// Pure gate evaluation. Hard-gate breaches → fail; an otherwise-clean
// validation whose eligibility is only "conditional" → conditional.
export function assessGates(
  gates: MandateGates,
  dil: ValidationDiligence,
  investorId: string,
): { result: MandateResult; failures: MandateFailureV1[] } {
  const failures: MandateFailureV1[] = [];
  // Reasons that make a verdict CONDITIONAL (needs re-run / review) rather than a
  // hard FAIL — e.g. a check that could not complete. We must not auto-fail a
  // borrower on a check that never ran (finding #18).
  const conditionalReasons: MandateFailureV1[] = [];
  let conditional = false;

  if (gates.max_risk_tier && TIER_RANK[dil.risk_tier] > TIER_RANK[gates.max_risk_tier]) {
    failures.push({ gate: "max_risk_tier", message: `Risk tier ${dil.risk_tier} exceeds the allowed ${gates.max_risk_tier}.` });
  }
  if (gates.require_sos_active && !dil.sos_active) {
    if (dil.sos_unavailable) {
      conditional = true;
      conditionalReasons.push({
        gate: "require_sos_active",
        message: "Entity status could not be verified — the SOS lookup did not complete (e.g. rate limit). Re-run before relying on this verdict; this is not a confirmation the entity is inactive.",
      });
    } else {
      failures.push({ gate: "require_sos_active", message: "Entity is not active in Secretary of State records." });
    }
  }
  if (gates.disallow_active_litigation) {
    if (dil.has_active_litigation) {
      failures.push({ gate: "disallow_active_litigation", message: "Confirmed active federal litigation found." });
    } else if (dil.litigation_incomplete) {
      conditional = true;
      conditionalReasons.push({
        gate: "disallow_active_litigation",
        message: "Litigation screen did not complete — re-run before relying on this verdict.",
      });
    }
  }
  if (gates.disallow_sanctions_hit) {
    if (dil.sanctions_hit) {
      failures.push({ gate: "disallow_sanctions_hit", message: "Confirmed sanctions / PEP match found." });
    } else if (dil.sanctions_incomplete) {
      conditional = true;
      conditionalReasons.push({
        gate: "disallow_sanctions_hit",
        message: "Sanctions/PEP screen did not complete — re-run before relying on this verdict.",
      });
    }
  }
  if (
    gates.max_experience_tier != null &&
    dil.experience_tier != null &&
    dil.experience_tier > gates.max_experience_tier
  ) {
    failures.push({
      gate: "max_experience_tier",
      message: `Experience tier ${dil.experience_tier} is below the required tier ${gates.max_experience_tier} or better.`,
    });
  }
  if (gates.min_confidence_score != null && dil.confidence_score != null && dil.confidence_score < gates.min_confidence_score) {
    // When a check could not complete, the confidence score is artificially
    // depressed (incomplete diligence ≠ low-quality borrower). Don't HARD-fail a
    // borrower on a confidence number we couldn't fully compute — make it
    // conditional ("re-run") instead (finding #18 / same family as #13).
    const incomplete = dil.sos_unavailable || dil.litigation_incomplete || dil.sanctions_incomplete;
    if (incomplete) {
      conditional = true;
      conditionalReasons.push({
        gate: "min_confidence_score",
        message: `Confidence (${dil.confidence_score}) is below the required ${gates.min_confidence_score}, but diligence is incomplete (a check did not complete) — re-run to compute a reliable score before relying on this verdict.`,
      });
    } else {
      failures.push({
        gate: "min_confidence_score",
        message: `Confidence ${dil.confidence_score} is below the required ${gates.min_confidence_score}.`,
      });
    }
  }
  if (gates.require_gc_active && dil.has_inactive_gc) {
    failures.push({ gate: "require_gc_active", message: "A general contractor on this deal does not hold an active license." });
  }

  if (gates.require_eligibility_pass) {
    const elig = dil.eligibilityByInvestor.get(investorId);
    if (elig === undefined) {
      failures.push({ gate: "require_eligibility_pass", message: "No deal evaluation found for this investor. Run an evaluation first." });
    } else if (elig === "fail") {
      failures.push({ gate: "require_eligibility_pass", message: "Deal is ineligible for this investor under the current terms." });
    } else if (elig === "conditional") {
      conditional = true;
      conditionalReasons.push({ gate: "require_eligibility_pass", message: "Deal is conditionally eligible for this investor." });
    }
  }

  // A hard breach is a FAIL regardless of conditional notes. Otherwise, an
  // incomplete/unverified check makes the verdict CONDITIONAL (carry the reasons
  // so the reviewer knows what to re-run) — never a silent pass.
  if (failures.length > 0) return { result: "fail", failures };
  if (conditional) return { result: "conditional", failures: conditionalReasons };
  return { result: "pass", failures: [] };
}

/**
 * Assess a validation against every enabled mandate in its org, upsert the
 * results, and fire mandate.assessed webhooks. Returns the assessments.
 * Best-effort: a webhook failure never breaks the assessment.
 */
export async function assessValidationMandates(
  supabase: SupabaseClient,
  orgId: string,
  validationId: string,
  opts: { fireWebhook?: boolean } = {},
): Promise<MandateAssessment[]> {
  const { fireWebhook = true } = opts;

  const { data: mandates } = await supabase
    .from("investor_mandates")
    .select("id, investor_id, name, gates, investors ( display_name )")
    .eq("org_id", orgId)
    .eq("enabled", true);

  if (!mandates || mandates.length === 0) return [];

  const dil = await loadValidationDiligence(supabase, validationId, orgId);
  if (!dil) return [];

  const out: MandateAssessment[] = [];

  for (const m of mandates) {
    const parsed = parseMandateGatesV1(m.gates);
    const gates = (parsed.data ?? { schema_version: 1 }) as MandateGates;
    const { result, failures } = assessGates(gates, dil, m.investor_id);
    const investorJoin = m.investors as { display_name: string } | { display_name: string }[] | null;
    const investor_name = Array.isArray(investorJoin) ? investorJoin[0]?.display_name ?? null : investorJoin?.display_name ?? null;

    await supabase
      .from("mandate_assessments")
      .upsert(
        {
          org_id: orgId,
          validation_id: validationId,
          mandate_id: m.id,
          investor_id: m.investor_id,
          result,
          failures,
          assessed_at: new Date().toISOString(),
        },
        { onConflict: "validation_id,mandate_id" },
      );

    out.push({
      mandate_id: m.id,
      investor_id: m.investor_id,
      mandate_name: m.name,
      investor_name,
      result,
      failures,
    });

    if (fireWebhook) {
      await dispatchWebhookEvent(supabase, orgId, "mandate.assessed", {
        validation_id: validationId,
        mandate_id: m.id,
        mandate_name: m.name,
        investor_id: m.investor_id,
        investor_name,
        result,
        failures,
        detail_url: `${APP_BASE}/dashboard/validations/${validationId}`,
        assessed_at: new Date().toISOString(),
      });
    }
  }

  return out;
}
