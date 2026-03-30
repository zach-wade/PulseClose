import type { ValidationAdapter } from "./types";
import { stubAdapter } from "./stub";
import { createCobaltAdapter } from "./cobalt";

// Returns the active adapter based on available API keys.
// Real adapters are used when keys exist; stub fills in the rest.
export function getAdapter(): ValidationAdapter {
  const cobaltKey = process.env.COBALT_INTELLIGENCE_API_KEY;
  const regridToken = process.env.REGRID_API_TOKEN;

  if (cobaltKey) {
    // Cobalt handles entity lookups, Regrid handles property search
    return createCobaltAdapter(cobaltKey, regridToken || undefined);
  }

  return stubAdapter;
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
