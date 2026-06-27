// The single source of truth for the borrower-validation verdict.
//
// Every surface (detail page, borrowers list, handoff BLUF, mandate console,
// fund rollup) computes its verdict HERE, so they can never disagree —
// inconsistent verdicts destroy trust faster than missing ones
// (UX-REDESIGN-PLAN §11.3 / §11.5).
//
// Three principles encoded:
//   1. BLUF / verdict-first — one synthesized answer + a one-line "why".
//   2. A first-class "couldn't-complete" state that NEVER reads as a pass.
//      This is the Achilles fix: a Cobalt-429'd entity lookup is INCOMPLETE,
//      not "Verified". An incomplete check beats every other signal.
//   3. The deterministic `tier` rides alongside the verdict — AI sets neither.
//
// This module is pure (no React, no lucide) so it can run server-side, in
// scripts, and in the (future) list-enrichment path. The presentational
// tokens (color + icon + shape) live in components/validation/status.tsx.

// ── pillars ────────────────────────────────────────────────────────────────

export type PillarKey = "entity" | "track" | "litigation" | "gc" | "sanctions";

// Four pillar states, in descending precedence for the verdict roll-up:
//   incomplete   — the check errored / was rate-limited / didn't run. NEVER a pass.
//   flagged      — the check completed and found a material, confirmed issue.
//   verified     — the check completed clean.
//   not_applicable — nothing to check (no GC on the deal, no entity on file).
export type PillarStatus = "incomplete" | "flagged" | "verified" | "not_applicable";

export interface Pillar {
  key: PillarKey;
  label: string;
  status: PillarStatus;
  /** Short concrete state — "CA · Cobalt 429", "civil · 2025". Never an adjective. */
  subLabel: string | null;
  /** Plain-language one-liner — "Didn't complete", "License active". */
  message: string;
}

export const PILLAR_LABELS: Record<PillarKey, string> = {
  entity: "Entity / SOS",
  track: "Track record",
  litigation: "Litigation",
  gc: "GC",
  sanctions: "Sanctions / PEP",
};

// ── verdict ──────────────────────────────────────────────────────────────────

export type VerdictState = "verified" | "needs_review" | "flagged";
export type RiskTier = "LOW" | "MEDIUM" | "HIGH";
export type MandateStanding = "meets" | "conditional" | "does_not_meet";

export interface Verdict {
  state: VerdictState;
  /** Display headline — "Verified · LOW risk", "Needs review", "Flagged · 2 issues". */
  headline: string;
  tier: RiskTier | null;
  /** BLUF one-liner — the binding driver / why. */
  reason: string;
  /** "What clears this" — null when nothing needs clearing (verified). */
  counterfactual: string | null;
  pillars: Pillar[];
  /** Number of pillars driving the non-pass (incomplete or flagged). */
  issueCount: number;
}

// ── minimal structural inputs (decoupled from the component layer) ───────────
// These mirror the fields the detail API already returns; we keep them narrow
// so the extractor stays a pure mapping with no UI coupling.

interface EntityLike {
  state?: string | null;
  sos_status: string;
  flags?: string[];
  raw_response?: Record<string, unknown> | null;
}
interface TrackLike {
  outcome?: string | null;
  review_status?: string | null;
}
interface LitigationLike {
  result: string;
  details?: string | null;
  raw_response?: Record<string, unknown> | null;
}
interface GCLike {
  license_status: string;
}
interface SanctionsLike {
  result: string;
  matches?: Array<{ confidence?: string | null }>;
  match_count?: number;
}

export interface VerdictSource {
  entity_checks: EntityLike[];
  track_record: TrackLike[];
  verified_flips?: unknown[];
  litigation_checks: LitigationLike[];
  gc_validations: GCLike[];
  sanctions_checks: SanctionsLike[];
  tier: RiskTier | null;
  /** Most-binding mandate standing across the validation's mandate assessments. */
  mandate?: MandateStanding | null;
}

// ── per-pillar extraction (mirrors src/lib/validations/pipeline.ts) ──────────

function entityPillar(checks: EntityLike[]): Pillar {
  const base = { key: "entity" as const, label: PILLAR_LABELS.entity };
  // No entity captured — nothing to verify (common for individual bridge
  // borrowers). Not a flag: an absent LLC is not borrower risk, and a false
  // positive destroys trust (Noah's rule). The lender can add one at intake.
  if (checks.length === 0) {
    return { ...base, status: "not_applicable", subLabel: "no entity on file", message: "No entity captured" };
  }
  const unavailable = checks.find((c) => (c.raw_response as { _error?: boolean } | null)?._error === true);
  if (unavailable) {
    // Achilles: a 429'd / errored lookup is INCOMPLETE, never "Verified".
    return {
      ...base,
      status: "incomplete",
      subLabel: unavailable.state ? `${unavailable.state} · lookup error` : "lookup error",
      message: "Didn't complete",
    };
  }
  const bad = checks.find((c) => c.sos_status !== "active");
  if (bad) {
    const word =
      bad.sos_status === "not_found" ? "Not found in SOS" : `${cap(bad.sos_status)} — not in good standing`;
    return { ...base, status: "flagged", subLabel: bad.state ?? null, message: word };
  }
  const active = checks[0];
  return { ...base, status: "verified", subLabel: active.state ?? null, message: "Active · good standing" };
}

function trackPillar(track: TrackLike[]): Pillar {
  const base = { key: "track" as const, label: PILLAR_LABELS.track };
  // Track record is a search, not a pass/fail screen — it never errors into a
  // flag and a thin record affects the tier, not the verdict. Always "complete".
  const verified = track.filter((t) => t.review_status !== "pending_review" && t.review_status !== "rejected");
  const pending = track.filter((t) => t.review_status === "pending_review").length;
  if (verified.length === 0) {
    // Don't say "No properties found" when N auto-discovered matches are sitting
    // in the verify tray — that contradicts the "Properties Found: N" stat + the
    // preliminary memo. Surface them as a review item (still unverified, so not a
    // "verified" track record — the lender must confirm what's theirs).
    if (pending > 0) {
      return {
        ...base,
        status: "not_applicable",
        subLabel: `${pending} pending review`,
        message: `${pending} found · awaiting review`,
      };
    }
    return { ...base, status: "not_applicable", subLabel: null, message: "No properties found" };
  }
  const suffix = pending > 0 ? ` · ${pending} pending` : "";
  return { ...base, status: "verified", subLabel: null, message: `${verified.length} verified${suffix}` };
}

function litigationPillar(checks: LitigationLike[]): Pillar {
  const base = { key: "litigation" as const, label: PILLAR_LABELS.litigation };
  // not_run sentinel (00048) — the screen didn't complete. Beats everything.
  if (checks.some((l) => l.result === "not_run")) {
    return { ...base, status: "incomplete", subLabel: "rate-limited / error", message: "Didn't complete" };
  }
  // Only CONFIRMED active cases are flags. Name-only matches are capped at
  // "possible — review" by the disambiguation layer and must never inflate the
  // scary number (the 10228 trust-killer). Active = not terminated.
  const active = checks.filter(
    (l) =>
      l.result === "found" &&
      litigationConfidence(l) === "confirmed" &&
      !(l.raw_response as Record<string, unknown> | null)?.date_terminated,
  );
  if (active.length > 0) {
    return {
      ...base,
      status: "flagged",
      subLabel: active.length === 1 ? "1 active case" : `${active.length} active cases`,
      message: `${active.length} active case${active.length === 1 ? "" : "s"}`,
    };
  }
  return { ...base, status: "verified", subLabel: null, message: "No federal cases" };
}

function gcPillar(gcs: GCLike[]): Pillar {
  const base = { key: "gc" as const, label: PILLAR_LABELS.gc };
  if (gcs.length === 0) {
    return { ...base, status: "not_applicable", subLabel: "no GC on deal", message: "Not applicable" };
  }
  const bad = gcs.find((g) => g.license_status !== "active");
  if (bad) {
    return { ...base, status: "flagged", subLabel: bad.license_status, message: "License not active" };
  }
  return { ...base, status: "verified", subLabel: null, message: "License active" };
}

function sanctionsPillar(checks: SanctionsLike[]): Pillar {
  const base = { key: "sanctions" as const, label: PILLAR_LABELS.sanctions };
  const s = checks[0];
  if (!s || s.result === "not_run" || s.result === "pending") {
    return { ...base, status: "incomplete", subLabel: "upstream error", message: "Didn't complete" };
  }
  // Only CONFIRMED matches are hits (disambiguation rule — name-only ⇒ review).
  const confirmed = (s.matches ?? []).filter((m) => m.confidence === "confirmed").length;
  if (confirmed > 0) {
    return {
      ...base,
      status: "flagged",
      subLabel: confirmed === 1 ? "1 confirmed" : `${confirmed} confirmed`,
      message: `${confirmed} confirmed hit${confirmed === 1 ? "" : "s"}`,
    };
  }
  const possible = (s.match_count ?? (s.matches ?? []).length) || 0;
  return {
    ...base,
    status: "verified",
    subLabel: possible > 0 ? `${possible} possible — review` : null,
    message: "No confirmed hits",
  };
}

export function extractPillars(src: VerdictSource): Pillar[] {
  return [
    entityPillar(src.entity_checks ?? []),
    trackPillar(src.track_record ?? []),
    litigationPillar(src.litigation_checks ?? []),
    gcPillar(src.gc_validations ?? []),
    sanctionsPillar(src.sanctions_checks ?? []),
  ];
}

// ── the verdict roll-up ──────────────────────────────────────────────────────

export function computeVerdict(src: VerdictSource): Verdict {
  const pillars = extractPillars(src);
  const incomplete = pillars.filter((p) => p.status === "incomplete");
  const flagged = pillars.filter((p) => p.status === "flagged");
  const mandateFails = src.mandate === "does_not_meet";
  const tier = src.tier ?? null;

  // Precedence: incomplete ⇒ needs_review (an incomplete check can never read
  // clean), else any flag (pillar or mandate) ⇒ flagged, else verified.
  if (incomplete.length > 0) {
    const names = andList(incomplete.map((p) => p.label));
    const one = incomplete.length === 1;
    return {
      state: "needs_review",
      headline: "Needs review",
      tier,
      reason: `${one ? "One check didn't complete" : `${incomplete.length} checks didn't complete`} — the ${names} ${one ? "lookup" : "lookups"} couldn't finish, so this isn't a clean pass yet.`,
      counterfactual: counterfactualForIncomplete(incomplete),
      pillars,
      issueCount: incomplete.length,
    };
  }

  if (flagged.length > 0 || mandateFails) {
    const issues = [...flagged.map((p) => p.message), ...(mandateFails ? ["does not meet the mandate"] : [])];
    const n = issues.length;
    return {
      state: "flagged",
      headline: `Flagged · ${n} issue${n === 1 ? "" : "s"}`,
      tier,
      reason: `Checks completed, but ${n === 1 ? "one material flag needs" : `${n} material flags need`} a human decision before this advances.`,
      counterfactual: counterfactualForFlags(flagged, mandateFails),
      pillars,
      issueCount: n,
    };
  }

  const completed = pillars.filter((p) => p.status === "verified").length;
  const trackCount = pillars.find((p) => p.key === "track")?.message.match(/^(\d+)/)?.[1];
  return {
    state: "verified",
    headline: tier ? `Verified · ${tier} risk` : "Verified",
    tier,
    reason:
      `All ${completed === 5 ? "five" : completed} checks completed and cleared.` +
      (trackCount ? ` Binding signal: ${trackCount} corroborated propert${trackCount === "1" ? "y" : "ies"}; no entity, litigation, or sanctions flags.` : ""),
    counterfactual: null,
    pillars,
    issueCount: 0,
  };
}

// ── reason / counterfactual helpers ──────────────────────────────────────────

function counterfactualForIncomplete(incomplete: Pillar[]): string {
  const hasEntity = incomplete.some((p) => p.key === "entity");
  // Keep the label's own casing ("Entity / SOS", not "entity / sos").
  const names = andList(incomplete.map((p) => p.label));
  const hint = hasEntity
    ? " (or add the CA CALICO key — then CA resolves free)"
    : "";
  return `Re-run the ${names} check once the source is available${hint}. No other issues stand.`;
}

function counterfactualForFlags(flagged: Pillar[], mandateFails: boolean): string {
  const parts: string[] = [];
  for (const p of flagged) {
    if (p.key === "entity") parts.push("confirm the entity's SOS standing");
    else if (p.key === "litigation") parts.push("resolve or explain the active case");
    else if (p.key === "gc") parts.push("verify the GC license");
    else if (p.key === "sanctions") parts.push("clear the confirmed screening hit");
  }
  if (mandateFails) parts.push("meet (or waive) the mandate gate");
  return `What clears this: ${andList(parts)}. These are reviewer decisions — the engine won't auto-clear them.`;
}

// ── small utils ──────────────────────────────────────────────────────────────

function litigationConfidence(l: LitigationLike): string {
  return (
    ((l.raw_response as { _disambiguation?: { confidence?: string } } | null)?._disambiguation?.confidence) ??
    "possible"
  );
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function andList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
