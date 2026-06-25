// GC license lookup against the ingested contractor_licenses reference table
// (WA / OR / FL via official bulk data; CA rows if present). Tried BEFORE the
// CSLB scrape — for the bulk-ingest states this is the primary source; for CA
// the pipeline still falls back to the per-license CSLB scrape.
//
// Match by license number first (exact), then by canonicalized business name
// within the state (accepted only when unambiguous — a single match).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GCLookupRequest, GCLookupResult } from "../adapters/types";
import { canonicalizeName } from "../domain/upsert";

interface ContractorRow {
  state: string;
  license_number: string;
  business_name: string;
  license_type: string | null;
  status: string;
  status_raw: string | null;
  expiration_date: string | null;
  refreshed_at: string;
  source: string;
}

// Map our normalized status → the GCLookupResult enum. "inactive"/"expired"/
// "unknown" all collapse to "expired" (not currently a valid active license);
// the verbatim source status is preserved in raw_response.
function toLicenseStatus(s: string): GCLookupResult["license_status"] {
  if (s === "active") return "active";
  if (s === "suspended") return "suspended";
  if (s === "revoked") return "revoked";
  return "expired";
}

// Per-state public verification URL so a reviewer can drill to the source.
function verificationUrl(state: string): string | null {
  switch (state) {
    case "WA": return "https://secure.lni.wa.gov/verify/";
    case "OR": return "https://search.ccb.state.or.us/search/";
    case "FL": return "https://www.myfloridalicense.com/wl11.asp";
    case "CA": return "https://www.cslb.ca.gov/onlineservices/checklicenseII/checklicense.aspx";
    default: return null;
  }
}

function mapRow(row: ContractorRow, req: GCLookupRequest): GCLookupResult {
  return {
    gc_name: req.gc_name || row.business_name,
    license_number: row.license_number,
    license_state: row.state,
    license_status: toLicenseStatus(row.status),
    license_classification: row.license_type,
    expiration_date: row.expiration_date,
    disciplinary_actions: [],
    insurance_verified: false,
    source_url: verificationUrl(row.state),
    raw_response: {
      _source: "contractor_licenses",
      _state_dataset: row.source,
      _matched_name: row.business_name,
      status_raw: row.status_raw,
      refreshed_at: row.refreshed_at,
    },
  };
}

export async function lookupContractorFromDb(
  supabase: SupabaseClient,
  req: GCLookupRequest,
): Promise<GCLookupResult | null> {
  const state = (req.state ?? "").toUpperCase();
  if (!state) return null;
  const cols = "state, license_number, business_name, license_type, status, status_raw, expiration_date, refreshed_at, source";

  // 1) Exact license-number match (most reliable).
  if (req.license_number) {
    const { data } = await supabase
      .from("contractor_licenses")
      .select(cols)
      .eq("state", state)
      .eq("license_number", req.license_number.trim())
      .maybeSingle();
    if (data) return mapRow(data as ContractorRow, req);
  }

  // 2) Unambiguous name match within the state.
  if (req.gc_name) {
    const norm = canonicalizeName(req.gc_name, { stripEntitySuffixes: true });
    if (norm) {
      const { data } = await supabase
        .from("contractor_licenses")
        .select(cols)
        .eq("state", state)
        .eq("normalized_name", norm)
        .limit(2);
      // Only accept a single match — multiple same-name licensees are
      // ambiguous and shouldn't be asserted as "the" GC.
      if (data && data.length === 1) return mapRow(data[0] as ContractorRow, req);
    }
  }

  return null;
}
