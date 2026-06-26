// Coverage map — which states we can validate Secretary-of-State (entity) and
// General-Contractor licenses for RIGHT NOW, and how. Code-driven (reads the
// same constants the adapters use) so it can't drift from reality. Surfaced at
// /dashboard/coverage and mirrored narratively in docs/COVERAGE.md.

import { FREE_SOS_STATES } from "@/lib/adapters/sos-free";
import {
  GC_BULK_INGEST_STATES,
  GC_NO_STATEWIDE_LICENSE_STATES,
} from "@/lib/adapters/gc-coverage";

// ── Secretary of State ───────────────────────────────────────────────────────
// Free official sources de-rent Cobalt: CALICO (CA, live, needs a key),
// Socrata (CO/NY, live), FL Sunbiz (bulk ingest → sos_entities). Everything
// else falls through to Cobalt (paid; trial quota currently exhausted in prod).

export type SosTier = "free-live" | "free-bulk" | "cobalt";

export interface SosRow {
  state: string;
  tier: SosTier;
  source: string;
  cost: string;
  /** Working now without any pending action. CA is false until CALICO key is set. */
  live: boolean;
  note?: string;
}

const SOS_FREE_BULK = ["FL"] as const;

export function sosCoverage(opts?: { calicoKeySet?: boolean }): SosRow[] {
  const rows: SosRow[] = [];
  for (const s of FREE_SOS_STATES) {
    // CA is the only free-live state gated on a key (CALICO).
    const caGated = s === "CA";
    rows.push({
      state: s,
      tier: "free-live",
      source: s === "CA" ? "CALICO (CA SOS API)" : "Socrata (open data)",
      cost: "$0",
      live: caGated ? Boolean(opts?.calicoKeySet) : true,
      note: caGated && !opts?.calicoKeySet ? "needs CALICO key (free, self-serve)" : undefined,
    });
  }
  for (const s of SOS_FREE_BULK) {
    rows.push({ state: s, tier: "free-bulk", source: "FL Sunbiz bulk (SFTP)", cost: "$0", live: true });
  }
  return rows.sort((a, b) => a.state.localeCompare(b.state));
}

export const SOS_FALLBACK = {
  label: "All other states",
  source: "Cobalt Intelligence (50-state SOS)",
  cost: "~$5 / fresh lookup ($0 cached)",
  live: false,
  note: "trial quota currently exhausted — needs a paid key or trial rotation",
};

// ── General Contractor ───────────────────────────────────────────────────────
// CA = CSLB per-license scrape; WA/OR/FL/VA = official bulk ingest
// (contractor_licenses, ~400k rows); TX/NY/PA = no statewide GC license at all;
// everything else = manual until bulk ingest is added.

export type GcTier = "scrape" | "bulk" | "none" | "manual";

export interface GcRow {
  state: string;
  tier: GcTier;
  source: string;
  live: boolean;
  note?: string;
}

export function gcCoverageRows(): GcRow[] {
  const rows: GcRow[] = [
    { state: "CA", tier: "scrape", source: "CSLB live scrape", live: true, note: "license # required" },
  ];
  for (const s of GC_BULK_INGEST_STATES) {
    const src =
      s === "WA" ? "WA L&I bulk" : s === "OR" ? "OR CCB bulk" : s === "FL" ? "FL DBPR bulk" : "VA DPOR bulk";
    rows.push({ state: s, tier: "bulk", source: src, live: true });
  }
  for (const s of GC_NO_STATEWIDE_LICENSE_STATES) {
    rows.push({ state: s, tier: "none", source: "—", live: false, note: "no statewide GC license (municipal only)" });
  }
  return rows.sort((a, b) => a.state.localeCompare(b.state));
}

export const GC_FALLBACK = {
  label: "All other states",
  source: "Manual review",
  live: false,
  note: "bulk ingest added as miss-telemetry shows volume",
};

// ── At-a-glance: states where BOTH SOS and GC validate, free, today ──────────
// The intersection of free-now SOS and automated GC — the cleanest place to run
// a full end-to-end. (CA joins the moment the CALICO key is set.)
export function fullyCoveredStates(opts?: { calicoKeySet?: boolean }): string[] {
  const sosNow = new Set(sosCoverage(opts).filter((r) => r.live).map((r) => r.state));
  const gcNow = new Set(gcCoverageRows().filter((r) => r.live).map((r) => r.state));
  return [...sosNow].filter((s) => gcNow.has(s)).sort();
}

// ── Nationwide pillars (not state-gated) ─────────────────────────────────────
export const NATIONWIDE_PILLARS = [
  { pillar: "Litigation", source: "CourtListener — federal civil + bankruptcy", note: "federal nationwide; state/county courts not yet" },
  { pillar: "Sanctions / PEP", source: "OpenSanctions → OFAC SDN fallback", note: "global; always-on free fallback" },
  { pillar: "Track record", source: "Realie → RentCast → Regrid", note: "nationwide property + deed chain" },
] as const;
