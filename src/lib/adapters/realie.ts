// Realie adapter — owner-name property search with rich data.
// Uses /public/premium/owner/ endpoint (requires state param).
// Returns: ownership, transfer history, lender, liens, AVM, LTV, foreclosure.
// Docs: https://docs.realie.ai/api-reference/premium/premium-owner-search
// Auth: header `Authorization: <key>`

import type { PropertySearchRequest, PropertyRecord } from "./types";

const REALIE_BASE_URL = "https://app.realie.ai/api";

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

  // Check transfer history for acquisition info (prior purchase by this entity)
  const transfers = prop.transfers ?? [];
  let acquisitionDate = saleDate;
  let acquisitionPrice = salePrice;
  let dispositionDate: string | null = null;
  let dispositionPrice: number | null = null;
  let holdMonths: number | null = null;
  let profit: number | null = null;

  if (transfers.length > 0) {
    // Most recent transfer is the current owner's purchase
    // The main record (transferDate/transferPrice) is the latest deed recording
    // Prior transfers show the chain
    const priorTransfer = transfers[0];
    if (priorTransfer.transferDate) {
      // If there's a prior transfer, the main record is acquisition, prior is... prior
      // The current transferDate is when the current owner acquired it
      acquisitionDate = saleDate;
      acquisitionPrice = salePrice;
    }
  }

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

    // Filter to exact owner name match (Realie does prefix matching, returns partial matches)
    const exactMatches = properties.filter((p) => {
      const owner = p.ownerName?.toUpperCase() ?? "";
      const search = searchName.toUpperCase();
      // Match exact name or name with suffix (LLC, INC, etc.)
      return owner.startsWith(search);
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
      return (fallbackData.properties ?? []).map(mapPropertyToRecord);
    }

    return results;
  } catch (err) {
    if (err instanceof RealieError) throw err;
    throw new RealieError(`Realie property search failed: ${err}`, 0);
  }
}
