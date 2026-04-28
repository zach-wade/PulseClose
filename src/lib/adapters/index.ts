import type { ValidationAdapter } from "./types";
import { stubAdapter } from "./stub";
import { createCobaltAdapter } from "./cobalt";

// Returns the active adapter based on available API keys.
// Real adapters are used when keys exist; stub fills in the rest.
export function getAdapter(): ValidationAdapter {
  const cobaltKey = process.env.COBALT_INTELLIGENCE_API_KEY;
  const attomKey = process.env.ATTOM_API_KEY;
  const regridToken = process.env.REGRID_API_TOKEN;
  const courtListenerToken = process.env.COURTLISTENER_API_TOKEN;
  const openSanctionsKey = process.env.OPENSANCTIONS_API_KEY;

  const realieKey = process.env.REALIE_API_KEY;

  if (cobaltKey) {
    // Cobalt: entity lookups
    // Realie (primary) + Regrid (fallback): property/track record search
    // ATTOM: sale history enrichment (only when Regrid is used)
    // CSLB: GC validation (CA only, auto-detected by state)
    // CourtListener: litigation (bankruptcy + federal lawsuits)
    // OpenSanctions (if key) → OFAC SDN direct (always-on free fallback)
    return createCobaltAdapter({
      cobaltKey,
      realieKey: realieKey || undefined,
      attomKey: attomKey || undefined,
      regridToken: regridToken || undefined,
      courtListenerToken: courtListenerToken || undefined,
      openSanctionsKey: openSanctionsKey || undefined,
    });
  }

  return stubAdapter;
}

// Helper: detect which data source was actually used for property search
// Realie is primary (richer data), Regrid is fallback, ATTOM enriches Regrid results
export function getPropertyDataSource(): string {
  if (process.env.REALIE_API_KEY) return "realie";
  if (process.env.REGRID_API_TOKEN && process.env.ATTOM_API_KEY) return "regrid+attom";
  if (process.env.REGRID_API_TOKEN) return "regrid";
  return "stub";
}

// Helper: detect which data source was used for GC lookup
export function getGCDataSource(state: string, licenseNumber?: string): string {
  if (state.toUpperCase() === "CA" && licenseNumber) return "cslb";
  return "stub";
}

// Helper: detect which data source was used for sanctions screening.
// OpenSanctions if key set, otherwise free OFAC SDN direct download.
export function getSanctionsDataSource(): string {
  if (process.env.OPENSANCTIONS_API_KEY) return "opensanctions";
  if (process.env.COBALT_INTELLIGENCE_API_KEY) return "ofac"; // real adapter active
  return "stub";
}

export type { ValidationAdapter } from "./types";
export type {
  SOSLookupRequest,
  SOSLookupResult,
  PropertySearchRequest,
  PropertyRecord,
  GCLookupRequest,
  GCLookupResult,
  LitigationSearchRequest,
  LitigationRecord,
  SanctionsScreenRequest,
  SanctionsScreenResult,
  SanctionsMatch,
} from "./types";
