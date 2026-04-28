import type {
  ValidationAdapter,
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
} from "./types";
import { stubAdapter } from "./stub";
import { searchPropertiesRealie, RealieError } from "./realie";
import { searchPropertiesRegrid, RegridError } from "./regrid";
import { enrichPropertiesWithAttom } from "./attom";
import { searchLitigationCourtListener } from "./courtlistener";
import { lookupCSLB, CSLBError } from "./cslb";
import { screenSanctionsOpenSanctions, OpenSanctionsError } from "./opensanctions";
import { screenSanctionsOFAC } from "./ofac";

const COBALT_BASE_URL = "https://apigateway.cobaltintelligence.com/v1";

interface CobaltBusiness {
  title?: string;
  sosId?: string;
  entityType?: string;
  entitySubType?: string;
  status?: string;
  normalizedStatus?: string;
  filingDate?: string;
  normalizedFilingDate?: string;
  stateOfSosRegistration?: string;
  stateOfFormation?: string;
  agentName?: string;
  agentResigned?: boolean;
  url?: string;
  confidenceLevel?: number;
  messages?: string[];
  documents?: { name?: string; date?: string }[];
  officers?: { name?: string; title?: string }[];
}

interface CobaltResponse {
  status: string;
  retryId?: string;
  results?: CobaltBusiness[];
  message?: string;
}

class CobaltRateLimitError extends Error {
  constructor() {
    super("Cobalt rate limited (429)");
    this.name = "CobaltRateLimitError";
  }
}

async function cobaltSearchOnce(
  entityName: string,
  state: string,
  apiKey: string,
  liveData: boolean,
): Promise<CobaltResponse> {
  const params = new URLSearchParams({
    searchQuery: entityName,
    state: state,
    liveData: String(liveData),
  });

  const res = await fetch(`${COBALT_BASE_URL}/search?${params}`, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 429) {
    throw new CobaltRateLimitError();
  }
  if (!res.ok) {
    throw new Error(`Cobalt API error: ${res.status} ${res.statusText}`);
  }

  const data: CobaltResponse = await res.json();

  // Handle long polling (some states like TX, DE require it)
  if (data.retryId && data.status === "Incomplete") {
    return pollForResult(data.retryId, apiKey);
  }

  return data;
}

// Try live data with retry-on-429, then fall back to Cobalt's cached data
// (`liveData=false`) if live keeps throttling. Cached data is usually within
// days of live and is enough for entity verification.
async function cobaltSearch(
  entityName: string,
  state: string,
  apiKey: string,
): Promise<CobaltResponse> {
  // Attempt 1: live, no wait
  try {
    return await cobaltSearchOnce(entityName, state, apiKey, true);
  } catch (err) {
    if (!(err instanceof CobaltRateLimitError)) throw err;
    console.warn("Cobalt 429 on first live attempt — backing off 2s and retrying");
  }

  // Attempt 2: live, after 2s backoff
  await new Promise((r) => setTimeout(r, 2000));
  try {
    return await cobaltSearchOnce(entityName, state, apiKey, true);
  } catch (err) {
    if (!(err instanceof CobaltRateLimitError)) throw err;
    console.warn("Cobalt 429 on second live attempt — falling back to liveData=false (cached)");
  }

  // Attempt 3: cached. Cobalt caches recent scrapes; this avoids another
  // upstream state-SOS hit. We accept slightly stale data over surfacing 429.
  return cobaltSearchOnce(entityName, state, apiKey, false);
}

async function pollForResult(
  retryId: string,
  apiKey: string,
  maxRetries = 30,
): Promise<CobaltResponse> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const res = await fetch(
      `${COBALT_BASE_URL}/search?retryId=${retryId}`,
      {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      throw new Error(`Cobalt poll error: ${res.status}`);
    }

    const data: CobaltResponse = await res.json();

    if (data.status !== "Incomplete") {
      return data;
    }
  }

  throw new Error("Cobalt Intelligence: polling timed out");
}

function mapSosStatus(
  normalizedStatus?: string,
  rawStatus?: string,
): SOSLookupResult["sos_status"] {
  if (!normalizedStatus && !rawStatus) return "not_found";

  const normalized = normalizedStatus?.toLowerCase();
  if (normalized === "active") return "active";

  // Check raw status for more specific inactive reasons
  const raw = rawStatus?.toLowerCase() ?? "";
  if (raw.includes("dissolved") || raw.includes("cancelled") || raw.includes("revoked")) {
    return "dissolved";
  }
  if (raw.includes("suspended") || raw.includes("delinquent") || raw.includes("forfeited")) {
    return "suspended";
  }

  // Default inactive to dissolved
  return "dissolved";
}

// Normalize entity names so "TT INVESTMENT PROPERTIES, LLC" and
// "TT Investment Properties" compare as the same name. Without this we'd
// flag every search where the user dropped the suffix or used different case.
function normalizeEntityName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:'"()/\\&]/g, " ")
    .replace(/\b(llc|inc|incorporated|corp|corporation|ltd|limited|lp|llp|trust|company|co)\b\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFlags(biz: CobaltBusiness, entityName: string): string[] {
  const flags: string[] = [];

  // Low confidence match
  if (biz.confidenceLevel != null && biz.confidenceLevel < 0.8) {
    flags.push(
      `Low name match confidence (${Math.round(biz.confidenceLevel * 100)}%) — verify this is the correct entity`,
    );
  }

  // Agent resigned
  if (biz.agentResigned) {
    flags.push("Registered agent has resigned");
  }

  // Entity not active
  if (biz.normalizedStatus?.toLowerCase() !== "active") {
    flags.push(`Entity status: ${biz.status ?? "inactive"}`);
  }

  // Foreign entity (formed in different state)
  if (
    biz.stateOfFormation &&
    biz.stateOfSosRegistration &&
    biz.stateOfFormation !== biz.stateOfSosRegistration
  ) {
    flags.push(
      `Foreign entity — formed in ${biz.stateOfFormation}, registered in ${biz.stateOfSosRegistration}`,
    );
  }

  // Name mismatch — only flag if the names differ in a meaningful way
  // (not just casing or LLC/Inc suffix differences).
  if (biz.title && normalizeEntityName(biz.title) !== normalizeEntityName(entityName)) {
    flags.push(`Registered name "${biz.title}" differs from search "${entityName}"`);
  }

  // Cobalt messages (warnings from scrape)
  if (biz.messages) {
    for (const msg of biz.messages) {
      if (msg && msg.length > 0) {
        flags.push(msg);
      }
    }
  }

  return flags;
}

function getLastFilingDate(biz: CobaltBusiness): string | null {
  if (!biz.documents || biz.documents.length === 0) return null;

  const dates = biz.documents
    .map((d) => d.date)
    .filter((d): d is string => !!d)
    .sort()
    .reverse();

  return dates[0] ?? null;
}

interface CobaltAdapterOptions {
  cobaltKey: string;
  realieKey?: string;
  attomKey?: string;
  regridToken?: string;
  courtListenerToken?: string;
  openSanctionsKey?: string;
}

function createCobaltAdapter(opts: CobaltAdapterOptions): ValidationAdapter {
  const { cobaltKey: apiKey, realieKey, attomKey, regridToken, courtListenerToken, openSanctionsKey } = opts;
  return {
    async lookupEntity(req: SOSLookupRequest): Promise<SOSLookupResult> {
      try {
        const response = await cobaltSearch(req.entity_name, req.state, apiKey);

        if (
          response.status === "Failed" ||
          !response.results ||
          response.results.length === 0
        ) {
          return {
            entity_name: req.entity_name,
            state: req.state,
            entity_type: null,
            sos_status: "not_found",
            formation_date: null,
            last_filing_date: null,
            registered_agent: null,
            source_url: null,
            flags: [`Entity not found in ${req.state} Secretary of State records`],
            raw_response: response as unknown as Record<string, unknown>,
          };
        }

        const biz = response.results[0];

        const entityType = [biz.entitySubType, biz.entityType]
          .filter(Boolean)
          .join(" ") || null;

        return {
          entity_name: biz.title ?? req.entity_name,
          state: biz.stateOfSosRegistration ?? req.state,
          entity_type: entityType,
          sos_status: mapSosStatus(biz.normalizedStatus, biz.status),
          formation_date: biz.normalizedFilingDate ?? biz.filingDate ?? null,
          last_filing_date: getLastFilingDate(biz),
          registered_agent: biz.agentName ?? null,
          source_url: biz.url ?? null,
          flags: buildFlags(biz, req.entity_name),
          raw_response: response as unknown as Record<string, unknown>,
        };
      } catch (err) {
        console.error("Cobalt Intelligence lookup failed:", err);
        // Return a clear error result instead of silently falling back to stub
        return {
          entity_name: req.entity_name,
          state: req.state,
          entity_type: null,
          sos_status: "not_found" as const,
          formation_date: null,
          last_filing_date: null,
          registered_agent: null,
          source_url: null,
          flags: [`Entity lookup failed: ${err instanceof Error ? err.message : "unknown error"}. Manual verification recommended.`],
          raw_response: { _adapter: "cobalt", _error: true, _message: String(err) },
        };
      }
    },

    // Property search: Realie primary (rich data) → Regrid fallback → stub
    // ATTOM enriches with sale history if Regrid was used (Realie already has transfer data)
    async searchProperties(req: PropertySearchRequest): Promise<PropertyRecord[]> {
      let results: PropertyRecord[] = [];
      let usedRealie = false;

      // Realie: owner-name property search (primary — richer data, cheaper)
      if (realieKey && req.state) {
        try {
          results = await searchPropertiesRealie(req, realieKey);
          usedRealie = true;
        } catch (err) {
          console.warn("Realie property search failed:", err instanceof RealieError ? err.message : err);
        }
      }

      // Regrid fallback: if Realie failed, unavailable, or no state param
      if (results.length === 0 && regridToken) {
        try {
          results = await searchPropertiesRegrid(req, regridToken);
        } catch (err) {
          console.warn("Regrid property search failed:", err instanceof RegridError ? err.message : err);
        }
      }

      // No vendor keys at all — stub
      if (!realieKey && !regridToken) {
        return stubAdapter.searchProperties(req);
      }

      // ATTOM enrichment only if we used Regrid (Realie already has transfer/lender data)
      if (!usedRealie && attomKey && results.length > 0) {
        try {
          const toEnrich = results.slice(0, 5);
          const enriched = await enrichPropertiesWithAttom(toEnrich, attomKey);
          results = [...enriched, ...results.slice(5)];
        } catch (err) {
          console.warn("ATTOM enrichment failed, returning data without enrichment:", err);
        }
      }

      return results;
    },

    // GC lookup: CSLB for California with license number, otherwise return
    // a clear "not_automated" result so analysts know to do a manual check
    // instead of being shown stub demo data that looks real.
    async lookupGC(req: GCLookupRequest): Promise<GCLookupResult> {
      const state = req.state.toUpperCase();
      if (state === "CA" && req.license_number) {
        try {
          return await lookupCSLB(req);
        } catch (err) {
          console.warn("CSLB lookup failed:", err instanceof CSLBError ? err.message : err);
          // Surface CSLB failure as not_automated rather than fake stub data.
        }
      }
      const reason = state === "CA"
        ? "CSLB lookup requires a license number"
        : `License validation not yet automated for ${state}`;
      return {
        gc_name: req.gc_name,
        license_number: req.license_number ?? null,
        license_state: state,
        license_status: "active",          // unknown — UI uses _not_automated flag
        license_classification: null,
        expiration_date: null,
        disciplinary_actions: [],
        insurance_verified: false,
        source_url: null,
        raw_response: {
          _adapter: "cobalt",
          _not_automated: true,
          _reason: reason,
          _state: state,
        },
      };
    },
    async searchLitigation(req: LitigationSearchRequest): Promise<LitigationRecord[]> {
      if (!courtListenerToken) {
        return stubAdapter.searchLitigation(req);
      }

      try {
        const { bankruptcy, lawsuits } = await searchLitigationCourtListener(req, courtListenerToken);

        // Build results: real data for bankruptcy + lawsuits, stub for county-level records
        const records: LitigationRecord[] = [];

        // Bankruptcy — real CourtListener data
        if (bankruptcy.length > 0) {
          records.push(...bankruptcy);
        } else {
          records.push({
            search_type: "bankruptcy",
            entity_name: req.entity_name || req.borrower_name,
            result: "clear",
            details: null,
            case_number: null,
            source: "CourtListener RECAP Archive",
            raw_response: { _adapter: "courtlistener", _result: "no_records" },
          });
        }

        // Lawsuits — real CourtListener data
        if (lawsuits.length > 0) {
          records.push(...lawsuits);
        } else {
          records.push({
            search_type: "lawsuit",
            entity_name: req.entity_name || req.borrower_name,
            result: "clear",
            details: null,
            case_number: null,
            source: "CourtListener RECAP Archive",
            raw_response: { _adapter: "courtlistener", _result: "no_records" },
          });
        }

        // Foreclosure + lis pendens: not searched (county-level, no API yet)
        // Don't insert fake "clear" records — only return what we actually searched.

        return records;
      } catch (err) {
        console.error("CourtListener litigation search failed, falling back to stub:", err);
        return stubAdapter.searchLitigation(req);
      }
    },

    // Sanctions / PEP screening:
    //   1. OpenSanctions if key (covers OFAC + EU + UN + UK + global PEPs)
    //   2. OFAC SDN direct download (free, government source) as fallback
    async screenSanctions(req: SanctionsScreenRequest): Promise<SanctionsScreenResult> {
      if (openSanctionsKey) {
        try {
          return await screenSanctionsOpenSanctions(req, openSanctionsKey);
        } catch (err) {
          console.warn(
            "OpenSanctions screen failed, falling back to OFAC direct:",
            err instanceof OpenSanctionsError ? err.message : err,
          );
        }
      }
      // Free fallback: OFAC SDN direct download. Always available, no key required.
      return screenSanctionsOFAC(req);
    },
  };
}

export { createCobaltAdapter };
