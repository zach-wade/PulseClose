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

  if (cobaltKey) {
    // Cobalt: entity lookups
    // ATTOM (primary) + Regrid (fallback): property/track record search
    // CSLB: GC validation (CA only, auto-detected by state)
    // CourtListener: litigation (bankruptcy + federal lawsuits)
    return createCobaltAdapter({
      cobaltKey,
      attomKey: attomKey || undefined,
      regridToken: regridToken || undefined,
      courtListenerToken: courtListenerToken || undefined,
    });
  }

  return stubAdapter;
}

// Helper: detect which data source was actually used for property search
// Regrid is primary (owner-name search), ATTOM enriches with sale history
export function getPropertyDataSource(): string {
  if (process.env.REGRID_API_TOKEN && process.env.ATTOM_API_KEY) return "regrid+attom";
  if (process.env.REGRID_API_TOKEN) return "regrid";
  return "stub";
}

// Helper: detect which data source was used for GC lookup
export function getGCDataSource(state: string, licenseNumber?: string): string {
  if (state.toUpperCase() === "CA" && licenseNumber) return "cslb";
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
} from "./types";
