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
} from "./types";
import { stubAdapter } from "./stub";
import { searchPropertiesRegrid } from "./regrid";

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

async function cobaltSearch(
  entityName: string,
  state: string,
  apiKey: string,
): Promise<CobaltResponse> {
  const params = new URLSearchParams({
    searchQuery: entityName,
    state: state,
  });

  const res = await fetch(`${COBALT_BASE_URL}/search?${params}`, {
    headers: { "x-api-key": apiKey },
  });

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

async function pollForResult(
  retryId: string,
  apiKey: string,
  maxRetries = 30,
): Promise<CobaltResponse> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const res = await fetch(
      `${COBALT_BASE_URL}/search?retryId=${retryId}`,
      { headers: { "x-api-key": apiKey } },
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

  // Name mismatch
  if (biz.title && biz.title.toLowerCase() !== entityName.toLowerCase()) {
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

function createCobaltAdapter(apiKey: string, regridToken?: string): ValidationAdapter {
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
        // Fall back to stub on error
        return stubAdapter.lookupEntity(req);
      }
    },

    // Property search via Regrid (if token available) or stub
    searchProperties(req: PropertySearchRequest): Promise<PropertyRecord[]> {
      if (regridToken) {
        return searchPropertiesRegrid(req, regridToken);
      }
      return stubAdapter.searchProperties(req);
    },
    lookupGC(req: GCLookupRequest): Promise<GCLookupResult> {
      return stubAdapter.lookupGC(req);
    },
    searchLitigation(req: LitigationSearchRequest): Promise<LitigationRecord[]> {
      return stubAdapter.searchLitigation(req);
    },
  };
}

export { createCobaltAdapter };
