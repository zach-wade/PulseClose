// GC license-validation coverage — pure constants + predicates, safe to import
// from client components (no server/adapter code here).
//
// Grounded in docs/RESEARCH-GC-VALIDATION.md (deep-research 2026-06-24):
//   - CA is automated today via the CSLB scrape (cslb.ts).
//   - WA / OR / FL publish official commercially-reusable BULK datasets we can
//     ingest into our own DB (the durable multi-state path) — ETL pending.
//   - TX / NY / PA have NO statewide GC license: oversight is municipal or a
//     trade-specific/registration regime, so a state-level license check is
//     structurally impossible there (not just "unautomated").
//   - No nationwide GC-license API exists; Cobalt's contractor product is thin
//     and adds ~zero over bulk-ingest, so we did NOT adopt it.

// States with GC license validation live today.
export const GC_AUTOMATED_STATES = ["CA"] as const;

// States that publish an official bulk dataset we can ingest (ETL pending).
export const GC_BULK_INGEST_STATES = ["WA", "OR", "FL"] as const;

// States with NO statewide GC license — verification is municipal/registration
// only, so a state license check isn't possible regardless of vendor.
export const GC_NO_STATEWIDE_LICENSE_STATES = ["TX", "NY", "PA"] as const;

export type GCCoverage =
  | "automated"            // checked now
  | "needs_license_number" // CA, but no license # supplied
  | "bulk_pending"         // open dataset exists; ingest not built yet
  | "no_statewide_license" // structurally no state GC license
  | "manual";              // unknown / not yet covered

/** Is GC license validation automatable for this state? (CA needs a license #.) */
export function isGCStateAutomated(state: string, licenseNumber?: string): boolean {
  const s = state.toUpperCase();
  if (s === "CA") return Boolean(licenseNumber);
  return (GC_AUTOMATED_STATES as readonly string[]).includes(s);
}

const has = (arr: readonly string[], s: string) => arr.includes(s.toUpperCase());

/** Coverage category + a user-facing message for a GC's state. */
export function gcCoverage(state: string, licenseNumber?: string): {
  category: GCCoverage;
  message: string | null;
} {
  const s = state?.toUpperCase() ?? "";
  if (!s) {
    return {
      category: "manual",
      message: "Select the license state. GC license validation is automated for California (CSLB) today.",
    };
  }
  if (s === "CA") {
    return licenseNumber
      ? { category: "automated", message: null }
      : {
          category: "needs_license_number",
          message: "Add the CSLB license number to automate the California license check — without it, this GC will be flagged for manual review.",
        };
  }
  if (has(GC_NO_STATEWIDE_LICENSE_STATES, s)) {
    return {
      category: "no_statewide_license",
      message: `${s} has no statewide GC license — general-contractor oversight is municipal (or a trade-specific/registration regime), so a state license check isn't possible. Verify the local city registration where the deal warrants.`,
    };
  }
  if (has(GC_BULK_INGEST_STATES, s)) {
    return {
      category: "bulk_pending",
      message: `${s} publishes an official contractor-license dataset; automated checks are on the roadmap (bulk ingest). For now this GC will be flagged for manual review.`,
    };
  }
  return {
    category: "manual",
    message: `License validation isn't automated for ${s} — this GC will be flagged for manual review. Automated coverage today: California (CSLB).`,
  };
}
