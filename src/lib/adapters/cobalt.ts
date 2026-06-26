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
import { enrichPropertiesWithRentcast } from "./rentcast";
import { canonicalizeName } from "@/lib/domain/upsert";
import { searchLitigationCourtListener } from "./courtlistener";
import { lookupCSLB, CSLBError } from "./cslb";
import { screenSanctionsOpenSanctions, OpenSanctionsError } from "./opensanctions";
import { screenSanctionsOFAC } from "./ofac";
import { lookupEntityFreeSOS } from "./sos-free";

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
    signal: AbortSignal.timeout(30000),
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

// Try live data with exponential-backoff-on-429, then fall back to Cobalt's
// cached data (`liveData=false`) — also retried — if live keeps throttling.
// Cached data is usually within days of live and is enough for entity
// verification. Only after ALL attempts throttle do we surface the 429, so the
// pipeline marks the entity check UNAVAILABLE (not a false "not found") — the
// honest degrade (finding #19). Backoff has jitter to de-correlate concurrent
// validations hitting the shared rate limit.
async function cobaltSearch(
  entityName: string,
  state: string,
  apiKey: string,
): Promise<CobaltResponse> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const jitter = () => Math.floor(Math.random() * 400);

  // Live attempts with exponential backoff (~0 / 0.5 / 1.5 / 3.5s + jitter).
  const liveBackoffs = [500, 1500, 3500];
  for (let attempt = 0; attempt <= liveBackoffs.length; attempt++) {
    try {
      return await cobaltSearchOnce(entityName, state, apiKey, true);
    } catch (err) {
      if (!(err instanceof CobaltRateLimitError)) throw err;
      if (attempt < liveBackoffs.length) {
        const wait = liveBackoffs[attempt] + jitter();
        console.warn(`Cobalt 429 (live attempt ${attempt + 1}/${liveBackoffs.length + 1}) — backing off ${wait}ms`);
        await sleep(wait);
      }
    }
  }

  // Cached fallback, retried once. Cobalt caches recent scrapes; this avoids
  // another upstream state-SOS hit.
  console.warn("Cobalt live throttled — falling back to cached (liveData=false)");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await cobaltSearchOnce(entityName, state, apiKey, false);
    } catch (err) {
      if (!(err instanceof CobaltRateLimitError)) throw err;
      if (attempt === 0) {
        console.warn("Cobalt 429 on cached attempt — backing off 1.5s and retrying once");
        await sleep(1500 + jitter());
      }
    }
  }

  // Every attempt throttled — surface the rate-limit so the entity check is
  // marked unavailable (honest), never a false "not found".
  throw new CobaltRateLimitError();
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
        signal: AbortSignal.timeout(30000),
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

// Tokenize-and-set comparison via the canonical primitive used
// elsewhere (verify-core deed-chain matcher, validations input warning,
// 00021 dedup keys). Drift between the substring-based fallback that
// lived here and canonicalizeName(true) created false-mismatch warnings
// like "Registered name 'TT Investment Properties LLC' differs from
// search 'TT INVESTMENT PROPERTIES, LLC'" (entity-suffix tokens were
// stripped on one side but not the other). ROADMAP cross-cutting
// principle 8.
function namesMatchCanonically(a: string, b: string): boolean {
  const ca = canonicalizeName(a, { stripEntitySuffixes: true });
  const cb = canonicalizeName(b, { stripEntitySuffixes: true });
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  // Subset match — if the smaller token set is contained in the larger,
  // treat as a match. Handles "TT Investment Properties" ⊂ "TT
  // Investment Properties Holdings".
  const aTokens = new Set(ca.split(" "));
  const bTokens = new Set(cb.split(" "));
  const [smaller, larger] = aTokens.size <= bTokens.size ? [aTokens, bTokens] : [bTokens, aTokens];
  for (const t of smaller) if (!larger.has(t)) return false;
  return true;
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
  // (not just casing or LLC/Inc suffix differences). Tokenize-and-set
  // via canonicalizeName per ROADMAP cross-cutting principle 8.
  if (biz.title && !namesMatchCanonically(biz.title, entityName)) {
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
  rentcastKey?: string;
  regridToken?: string;
  courtListenerToken?: string;
  openSanctionsKey?: string;
  calicoKey?: string;
}

function createCobaltAdapter(opts: CobaltAdapterOptions): ValidationAdapter {
  const { cobaltKey: apiKey, realieKey, rentcastKey, regridToken, courtListenerToken, openSanctionsKey, calicoKey } = opts;
  return {
    async lookupEntity(req: SOSLookupRequest): Promise<SOSLookupResult> {
      try {
        // Free official SOS sources first (de-rent Cobalt): CALICO for CA, Socrata
        // for CO/NY. A resolved hit short-circuits Cobalt entirely; on no match /
        // unsupported state / source error we fall through to the paid lookup.
        const free = await lookupEntityFreeSOS(req, { calicoKey });
        if (free) return free;

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
    // RentCast enriches with sale history if Regrid was used (Realie already has transfer data)
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

      // RentCast enrichment only if we used Regrid (Realie already has transfer/lender data)
      if (!usedRealie && rentcastKey && results.length > 0) {
        try {
          const toEnrich = results.slice(0, 5);
          const enriched = await enrichPropertiesWithRentcast(toEnrich, rentcastKey);
          results = [...enriched, ...results.slice(5)];
        } catch (err) {
          console.warn("RentCast enrichment failed, returning data without enrichment:", err);
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
        const { bankruptcy, lawsuits, failedNames } = await searchLitigationCourtListener(
          req,
          courtListenerToken,
        );
        const incomplete = failedNames.length > 0;

        // Build results: real data for bankruptcy + lawsuits, stub for county-level records
        const records: LitigationRecord[] = [];

        // Always keep any real hits we DID find.
        if (bankruptcy.length > 0) records.push(...bankruptcy);
        if (lawsuits.length > 0) records.push(...lawsuits);

        if (incomplete) {
          // The screen did not complete for at least one name (rate-limit /
          // upstream error). NEVER assert "clear" on an incomplete screen —
          // emit a single "not_run" sentinel so the pipeline can mark the
          // pillar incomplete, withhold the "no litigation" confidence bonus,
          // and tell the reviewer to re-run. (Finding #13.)
          records.push({
            search_type: "lawsuit",
            entity_name: req.entity_name || req.borrower_name,
            result: "not_run",
            details: `Litigation screen incomplete — could not search ${failedNames
              .map((n) => `"${n}"`)
              .join(", ")} (rate-limited or upstream error). Re-run to complete.`,
            case_number: null,
            source: "CourtListener RECAP Archive",
            raw_response: {
              _adapter: "courtlistener",
              _result: "incomplete",
              _failed_names: failedNames,
            },
          });
        } else {
          // Screen completed. Emit honest "clear" sentinels for empty buckets.
          if (bankruptcy.length === 0) {
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
          if (lawsuits.length === 0) {
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
        }

        // Foreclosure + lis pendens: not searched (county-level, no API yet)
        // Don't insert fake "clear" records — only return what we actually searched.

        return records;
      } catch (err) {
        // Total failure of the litigation search. Do NOT fall back to stub data
        // in production — fake "clear"/"found" demo rows presented as a real
        // screen is the exact false-clean this fix removes. Return a "not_run"
        // sentinel instead. (The no-token path above still uses the stub for
        // local/dev where no live screen is expected.)
        console.error("CourtListener litigation search failed — marking screen not_run:", err);
        return [
          {
            search_type: "lawsuit",
            entity_name: req.entity_name || req.borrower_name,
            result: "not_run",
            details:
              "Litigation screen could not run (upstream error). Re-run to complete the federal court search.",
            case_number: null,
            source: "CourtListener RECAP Archive",
            raw_response: {
              _adapter: "courtlistener",
              _result: "error",
              _message: err instanceof Error ? err.message : String(err),
            },
          },
        ];
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
