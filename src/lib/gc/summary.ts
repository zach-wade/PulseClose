// Pure derivation: GCLookupResult → gc_summary cached jsonb shape stored
// on borrower_validations.gc_summary. Used by the dashboard list to
// render the GC status chip inline without joining gc_validations.

import type { GCLookupResult } from "@/lib/adapters/types";

export type GCSummaryStatus =
  | "active"
  | "active_with_discipline"
  | "manual_review"
  | "expired"
  | "suspended"
  | "revoked"
  | "none";

export interface GCSummary {
  schema_version: 1;
  status: GCSummaryStatus;
  license_id: string | null;
  state: string | null;
  classifications: string[];
  expires_at: string | null;
  has_discipline: boolean;
}

export function buildGCSummary(result: GCLookupResult | null): GCSummary | null {
  if (!result) return null;

  const hasDiscipline = result.disciplinary_actions.length > 0;

  let status: GCSummaryStatus;
  if (result.license_status === "active") {
    status = hasDiscipline ? "active_with_discipline" : "active";
  } else if (
    result.license_status === "expired" ||
    result.license_status === "suspended" ||
    result.license_status === "revoked"
  ) {
    status = result.license_status;
  } else {
    status = "manual_review";
  }

  return {
    schema_version: 1,
    status,
    license_id: result.license_number,
    state: result.license_state,
    classifications: result.license_classification ? [result.license_classification] : [],
    expires_at: result.expiration_date,
    has_discipline: hasDiscipline,
  };
}

// Sentinel returned when validation has no GC pillar at all (e.g. entity-only
// flow). UI renders a "—" chip; functionally equivalent to `null` but lets
// us distinguish "ran GC and got nothing" from "GC pillar wasn't run".
export const GC_SUMMARY_NONE: GCSummary = {
  schema_version: 1,
  status: "none",
  license_id: null,
  state: null,
  classifications: [],
  expires_at: null,
  has_discipline: false,
};
