// Realie adapter — owner-name property search with rich data.
// Uses /public/premium/owner/ endpoint (requires state param).
// Returns: ownership, transfer history, lender, liens, AVM, LTV, foreclosure.
// Docs: https://docs.realie.ai/api-reference/premium/premium-owner-search
// Auth: header `Authorization: <key>`

import type { PropertySearchRequest, PropertyRecord } from "./types";

const REALIE_BASE_URL = "https://app.realie.ai/api";

export interface AddressLookupResult {
  property: PropertyRecord | null;
  rawProperty: Record<string, unknown> | null;
}

interface RealieTransfer {
  grantor?: string;
  grantee?: string;
  transferDate?: string;
  transferPrice?: number | null;
  transferDocType?: string;
  recordingDate?: string;
}

interface RealieProperty {
  _id?: string;
  address?: string;
  addressFull?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  ownerName?: string;
  ownerAddressFull?: string;
  transferDate?: string;
  transferDateObject?: string;
  transferPrice?: number;
  transferDocType?: string;
  recordingDate?: string;
  lenderName?: string;
  yearBuilt?: number;
  buildingArea?: number;
  totalBedrooms?: number;
  totalBathrooms?: number;
  stories?: number;
  totalAssessedValue?: number;
  taxValue?: number;
  taxYear?: number;
  modelValue?: number;
  modelValueMin?: number;
  modelValueMax?: number;
  totalLienCount?: number;
  totalLienBalance?: number;
  LTVCurrentEstCombined?: number;
  LTVPurchase?: number;
  equityCurrentEstBal?: number;
  forecloseCode?: string | null;
  forecloseRecordDate?: string | null;
  forecloseFileDate?: string | null;
  forecloseCaseNum?: string | null;
  auctionDate?: string | null;
  transfers?: RealieTransfer[];
  latitude?: number;
  longitude?: number;
  zoningCode?: string;
  useCode?: string;
  acres?: number;
  landArea?: number;
  garageCount?: number;
  pool?: boolean;
  [key: string]: unknown;
}

interface RealieResponse {
  properties?: RealieProperty[];
  metadata?: { limit?: number; offset?: number; count?: number };
  error?: string;
  message?: string;
}

// Token helpers — kept inline (rather than imported from upsert.ts) because
// realie.ts is in the adapter layer and shouldn't depend on domain code.
// Logic mirrors canonicalizeName / tokenSetMatch in verify-core / upsert.
const ENTITY_SUFFIX_TOKENS = new Set([
  "llc", "inc", "incorporated", "corp", "corporation",
  "ltd", "limited", "lp", "llp", "trust", "company", "co",
]);

function canonicalTokens(input: string | null | undefined, stripEntitySuffixes: boolean): string[] {
  if (!input) return [];
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 1)
    .filter((t) => !stripEntitySuffixes || !ENTITY_SUFFIX_TOKENS.has(t));
}

function tokensSubset(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0 || haystack.length === 0) return false;
  const set = new Set(haystack);
  if (needle.length === 1) {
    // Single-token search needs ≥3 chars to match — guards against
    // common-word false positives.
    return needle[0].length >= 3 && set.has(needle[0]);
  }
  return needle.every((t) => set.has(t));
}

export class RealieError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public vendor: string = "realie",
  ) {
    super(message);
    this.name = "RealieError";
  }
}

function formatDate(raw?: string): string | null {
  if (!raw) return null;
  // Realie uses YYYYMMDD format in transferDate, ISO in transferDateObject
  if (raw.includes("-") || raw.includes("T")) return raw.slice(0, 10);
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw;
}

function inferProjectType(
  prop: RealieProperty,
): PropertyRecord["project_type"] {
  const yearBuilt = prop.yearBuilt;
  if (!yearBuilt) return "hold";
  const age = new Date().getFullYear() - yearBuilt;
  if (age <= 2) return "ground_up";

  const useCode = prop.useCode?.toLowerCase() ?? "";
  if (useCode.includes("vacant") || useCode.includes("land")) return "ground_up";

  if (prop.transferPrice && prop.transferPrice > 0) return "flip";
  return "rehab";
}

function mapPropertyToRecord(prop: RealieProperty): PropertyRecord {
  const address = prop.addressFull ?? prop.address ?? "Unknown address";
  const saleDate = formatDate(prop.transferDateObject ?? prop.transferDate);
  const salePrice = prop.transferPrice && prop.transferPrice > 0 ? prop.transferPrice : null;

  // Current owner's most recent transfer is the acquisition. We don't see
  // the disposition because the borrower still owns the property. Realized
  // profit is unknown until a deed-history vendor is wired up.
  const acquisitionDate = saleDate;
  const acquisitionPrice = salePrice;
  const dispositionDate: string | null = null;
  const dispositionPrice: number | null = null;
  const profit: number | null = null;
  let holdMonths: number | null = null;

  if (acquisitionDate) {
    const acq = new Date(acquisitionDate);
    const now = new Date();
    if (!isNaN(acq.getTime())) {
      holdMonths = Math.abs(
        (now.getFullYear() - acq.getFullYear()) * 12 +
        (now.getMonth() - acq.getMonth()),
      );
    }
  }

  return {
    property_address: address,
    acquisition_date: acquisitionDate,
    disposition_date: dispositionDate,
    acquisition_price: acquisitionPrice,
    disposition_price: dispositionPrice,
    project_type: inferProjectType(prop),
    outcome: "in_progress", // Current owner = hasn't sold yet
    hold_months: holdMonths,
    profit,
    source: "Realie Property Records",
    raw_response: prop as unknown as Record<string, unknown>,
  };
}

/**
 * Look up a single property by street address.
 * Uses /public/property/address/ endpoint.
 * Used for trust-but-verify: borrower claims they flipped 123 Oak St,
 * we check the deed chain to confirm they actually owned it.
 */
export async function lookupPropertyByAddress(
  address: string,
  state: string,
  apiKey: string,
): Promise<AddressLookupResult> {
  const params = new URLSearchParams({
    state: state.toUpperCase(),
    address,
  });

  const res = await fetch(
    `${REALIE_BASE_URL}/public/property/address/?${params}`,
    {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    },
  );

  if (res.status === 404) {
    // Realie returns 404 when no property is found at the address.
    return { property: null, rawProperty: null };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RealieError(
      `Realie address lookup ${res.status}: ${res.statusText}. ${body}`.trim(),
      res.status,
    );
  }

  const data = (await res.json()) as { property?: RealieProperty };
  if (!data.property) return { property: null, rawProperty: null };

  return {
    property: mapPropertyToRecord(data.property),
    rawProperty: data.property as unknown as Record<string, unknown>,
  };
}

/**
 * Search Realie for properties by owner name.
 * Uses /public/premium/owner/ endpoint.
 * Requires state parameter — will search state from request, or run without if not provided.
 */
export async function searchPropertiesRealie(
  req: PropertySearchRequest,
  apiKey: string,
): Promise<PropertyRecord[]> {
  const searchName = req.entity_name || req.borrower_name;

  // Realie requires state — if not provided, we can't search
  if (!req.state) {
    console.warn("Realie requires state parameter for owner search");
    return [];
  }

  const params = new URLSearchParams({
    state: req.state.toUpperCase(),
    lastName: searchName,
    limit: "25",
  });

  try {
    const res = await fetch(`${REALIE_BASE_URL}/public/premium/owner/?${params}`, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new RealieError(
        `Realie API error ${res.status}: ${res.statusText}. ${body}`.trim(),
        res.status,
      );
    }

    const data: RealieResponse = await res.json();
    const properties = data.properties ?? [];

    // Filter to confident owner-name matches. Realie's owner-search is a
    // prefix match server-side and returns partial matches; we want
    // semantic equivalence regardless of comma/punctuation/word-order.
    // Reuses the same canonicalize logic we use for domain dedup +
    // deed-chain matching (verify-core.ts) — see ROADMAP.md cross-cutting
    // principle 8 (tokenize-and-set, never substring).
    //
    // Without this, search "TT Investment Properties, LLC" against Realie
    // record ownerName "TT INVESTMENT PROPERTIES LLC" (no comma) returns
    // false on startsWith and the entity match was silently dropped, then
    // the fallback fired against borrower personal name. This worked for
    // Truong but masked the bug.
    const searchTokens = canonicalTokens(searchName, true);
    const exactMatches = properties.filter((p) => {
      const ownerTokens = canonicalTokens(p.ownerName ?? "", true);
      return tokensSubset(searchTokens, ownerTokens);
    });

    const results = exactMatches.map(mapPropertyToRecord);

    // If entity search found nothing, try borrower personal name
    if (results.length === 0 && req.entity_name && req.borrower_name !== req.entity_name) {
      const fallbackParams = new URLSearchParams({
        state: req.state.toUpperCase(),
        lastName: req.borrower_name,
        limit: "25",
      });

      const fallbackRes = await fetch(`${REALIE_BASE_URL}/public/premium/owner/?${fallbackParams}`, {
        headers: { Authorization: apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });

      if (!fallbackRes.ok) return [];
      const fallbackData: RealieResponse = await fallbackRes.json();
      const fallbackProperties = fallbackData.properties ?? [];

      // Same tokenize-and-set filter as primary search. Realie's prefix-match
      // server-side returns hits like every "Kim Truong" in the state, not
      // just the borrower we asked about. Without this filter every same-
      // surname owner in the state leaks into track_record_entries (Truong
      // demo 2026-05-08: SJ-only borrower returned Fullerton/Cypress hits).
      const fallbackTokens = canonicalTokens(req.borrower_name, true);
      const fallbackMatches = fallbackProperties.filter((p) => {
        const ownerTokens = canonicalTokens(p.ownerName ?? "", true);
        return tokensSubset(fallbackTokens, ownerTokens);
      });
      return fallbackMatches.map(mapPropertyToRecord);
    }

    return results;
  } catch (err) {
    if (err instanceof RealieError) throw err;
    throw new RealieError(`Realie property search failed: ${err}`, 0);
  }
}
