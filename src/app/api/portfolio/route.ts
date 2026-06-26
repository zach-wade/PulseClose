// GET /api/portfolio — aggregate stats for the org's borrower book.
// Powers the portfolio health dashboard (B2). One round-trip per
// browser load: validation summary + risk-factor severity counts +
// deal_outcomes (last 90d) + borrowers-needing-attention list.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { computeVerdictsForValidations } from "@/lib/validation/verdict-batch";

type RiskSeverity = "critical" | "moderate" | "minor" | "informational" | "none";
type ValidationStatus = "pending" | "verified" | "partial" | "flagged";
type OutcomeStatus = "withdrawn" | "funded" | "extended" | "repaid" | "defaulted";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [validationsRes, factorsRes, outcomesRes, attentionRes] = await Promise.all([
    supabase
      .from("borrower_validations")
      // Alias primary_borrower_id → borrower_id so the response shape
      // stays unchanged for the page consumer. The underlying column was
      // renamed in 00010 but this route still referenced the old name —
      // hence the silent 500 the page surfaced as "Failed to load."
      .select("id, overall_status, experience_tier, borrower_id:primary_borrower_id, borrower_name, validation_date, created_at")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("risk_factors")
      .select("severity, validation_id, borrower_validations!inner(org_id)")
      .eq("excluded", false)
      .eq("borrower_validations.org_id", profile.org_id),
    supabase
      .from("deal_outcomes")
      .select("status, recorded_at")
      .eq("org_id", profile.org_id)
      .gte("recorded_at", ninetyDaysAgo),
    // Borrowers with ≥1 critical (non-excluded) risk factor in their
    // latest validation. Pull recent + flagged validations and let JS
    // dedupe by borrower (we only want the latest per borrower).
    supabase
      .from("borrower_validations")
      .select(`
        id,
        borrower_id:primary_borrower_id,
        borrower_name,
        borrower_entity_name,
        overall_status,
        experience_tier,
        created_at,
        risk_factors!inner(severity, excluded, factor_key)
      `)
      .eq("org_id", profile.org_id)
      .eq("risk_factors.severity", "critical")
      .eq("risk_factors.excluded", false)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (validationsRes.error) {
    return NextResponse.json({ error: validationsRes.error.message }, { status: 500 });
  }

  const validations = validationsRes.data ?? [];
  const factors = factorsRes.data ?? [];
  const outcomes = outcomesRes.data ?? [];
  const attentionRows = attentionRes.data ?? [];

  // ── Validation buckets ────────────────────────────────────────────
  const statusCounts: Record<ValidationStatus, number> = {
    pending: 0, verified: 0, partial: 0, flagged: 0,
  };
  const tierCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, unknown: 0 };
  const uniqueBorrowers = new Set<string>();

  for (const v of validations) {
    if (v.overall_status && v.overall_status in statusCounts) {
      statusCounts[v.overall_status as ValidationStatus]++;
    }
    const t = v.experience_tier;
    if (t === 1 || t === 2 || t === 3 || t === 4) tierCounts[String(t)]++;
    else tierCounts.unknown++;
    if (v.borrower_id) uniqueBorrowers.add(v.borrower_id);
  }

  // ── Risk factor severity counts (across all current validations) ──
  const severityCounts: Record<RiskSeverity, number> = {
    critical: 0, moderate: 0, minor: 0, informational: 0, none: 0,
  };
  for (const f of factors) {
    if (f.severity in severityCounts) {
      severityCounts[f.severity as RiskSeverity]++;
    }
  }

  // ── Outcomes (last 90d) ───────────────────────────────────────────
  const outcomeCounts: Record<OutcomeStatus, number> = {
    withdrawn: 0, funded: 0, extended: 0, repaid: 0, defaulted: 0,
  };
  for (const o of outcomes) {
    if (o.status in outcomeCounts) {
      outcomeCounts[o.status as OutcomeStatus]++;
    }
  }

  // ── Verdict mix (the SAME computeVerdict() as the detail hero + list) ──
  // Latest validation per borrower, so this reads as "how many of my borrowers
  // are clean / need review / flagged right now" — not inflated by re-runs.
  const latestPerBorrower = new Map<string, (typeof validations)[number]>();
  for (const v of validations) {
    const key = v.borrower_id ?? v.id;
    const seen = latestPerBorrower.get(key);
    if (!seen || new Date(v.created_at) > new Date(seen.created_at)) latestPerBorrower.set(key, v);
  }
  const latest = Array.from(latestPerBorrower.values());
  const verdictMap = await computeVerdictsForValidations(
    supabase,
    latest.map((v) => ({ id: v.id, primary_borrower_id: v.borrower_id ?? null, created_at: v.created_at })),
  );
  const verdictCounts: Record<"verified" | "needs_review" | "flagged", number> = {
    verified: 0,
    needs_review: 0,
    flagged: 0,
  };
  for (const vd of verdictMap.values()) verdictCounts[vd.state]++;

  // ── Borrowers needing attention (dedupe by borrower, latest first) ─
  const seenBorrowers = new Set<string>();
  type AttentionRow = typeof attentionRows[number];
  type CriticalFactor = { severity: string; excluded: boolean; factor_key: string };
  const attention = [];
  for (const row of attentionRows) {
    const r = row as AttentionRow & { risk_factors: CriticalFactor[] };
    const key = r.borrower_id ?? r.id;
    if (seenBorrowers.has(key)) continue;
    seenBorrowers.add(key);
    const criticalKeys = (r.risk_factors ?? [])
      .filter((f) => f.severity === "critical" && !f.excluded)
      .map((f) => f.factor_key);
    attention.push({
      validation_id: r.id,
      borrower_id: r.borrower_id,
      borrower_name: r.borrower_name,
      borrower_entity_name: r.borrower_entity_name,
      overall_status: r.overall_status,
      experience_tier: r.experience_tier,
      created_at: r.created_at,
      critical_factor_keys: criticalKeys,
    });
    if (attention.length >= 12) break;
  }

  return NextResponse.json({
    totals: {
      validations: validations.length,
      borrowers: uniqueBorrowers.size,
    },
    status_counts: statusCounts,
    verdict_counts: verdictCounts,
    tier_counts: tierCounts,
    severity_counts: severityCounts,
    outcomes_90d: outcomeCounts,
    attention,
  });
}
