import type { ValidationAdapter } from "./types";
import { stubAdapter } from "./stub";

// Returns the active adapter. When vendor APIs are wired,
// this will check env vars and return the real adapter.
export function getAdapter(): ValidationAdapter {
  // TODO: check for COBALT_INTELLIGENCE_API_KEY, ATTOM_API_KEY, etc.
  // and return real adapters when available
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
