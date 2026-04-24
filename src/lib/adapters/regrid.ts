import type {
  PropertySearchRequest,
  PropertyRecord,
} from "./types";

const REGRID_BASE_URL = "https://app.regrid.com/api/v2";

export class RegridError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public vendor: string = "regrid",
  ) {
    super(message);
    this.name = "RegridError";
  }
}

interface RegridAddress {
  a_address?: string;
  a_scity?: string;
  a_state2?: string;
  a_szip5?: string;
}

interface RegridFields {
  owner?: string;
  owner2?: string;
  address?: string;
  scity?: string;
  state2?: string;
  szip?: string;
  szip5?: string;
  saleprice?: number;
  saledate?: string;
  yearbuilt?: number;
  improvval?: number;
  landval?: number;
  parval?: number;
  usecode?: string;
  usedesc?: string;
  ll_updated_at?: string;
  [key: string]: unknown;
}

interface RegridFeature {
  properties: {
    fields: RegridFields;
    addresses: RegridAddress[];
    headline?: string;
    path?: string;
    ll_uuid?: string;
  };
}

interface RegridResponse {
  parcels: {
    type: string;
    features: RegridFeature[];
  };
}

function buildFullAddress(feature: RegridFeature): string {
  const fields = feature.properties.fields;
  const addrs = feature.properties.addresses;

  // Prefer the addresses array if populated
  if (addrs && addrs.length > 0) {
    const a = addrs[0];
    const parts = [a.a_address, a.a_scity, a.a_state2, a.a_szip5].filter(Boolean);
    if (parts.length >= 2) return parts.join(", ");
  }

  // Fall back to fields (scity/state2/szip are usually present even when addresses[] is empty)
  const street = fields.address;
  const city = fields.scity;
  const state = fields.state2;
  const zip = fields.szip5 ?? fields.szip;

  if (street && city && state) {
    return `${street}, ${city}, ${state}${zip ? ` ${zip}` : ""}`;
  }

  return street ?? "Unknown address";
}

function inferProjectType(
  saleprice: number | undefined,
  yearbuilt: number | undefined,
): PropertyRecord["project_type"] {
  if (!yearbuilt) return "hold";
  const age = new Date().getFullYear() - yearbuilt;
  if (age <= 2) return "ground_up";
  if (saleprice && saleprice > 0) return "flip";
  return "rehab";
}

function inferOutcome(saledate: string | undefined): PropertyRecord["outcome"] {
  if (!saledate) return "in_progress";
  return "completed";
}

function calculateHoldMonths(saledate: string | undefined): number | null {
  if (!saledate) return null;
  const sale = new Date(saledate);
  const now = new Date();
  const months = (now.getFullYear() - sale.getFullYear()) * 12 +
    (now.getMonth() - sale.getMonth());
  return Math.abs(months);
}

/**
 * Search Regrid for properties by owner name.
 * Uses /parcels/owner endpoint (dedicated owner search, prefix-matched, min 4 chars).
 * Docs: https://support.regrid.com/api/parcel-api-endpoints
 */
export async function searchPropertiesRegrid(
  req: PropertySearchRequest,
  token: string,
): Promise<PropertyRecord[]> {
  const searchName = req.entity_name || req.borrower_name;

  const params = new URLSearchParams({
    owner: searchName,
    token,
    limit: "25",
  });

  // Scope to state if provided
  if (req.state) {
    params.set("path", `/us/${req.state.toLowerCase()}`);
  }

  try {
    const res = await fetch(`${REGRID_BASE_URL}/parcels/owner?${params}`, {
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new RegridError(
        `Regrid API error ${res.status}: ${res.statusText}. ${body}`.trim(),
        res.status,
      );
    }

    const data: RegridResponse = await res.json();
    const features = data.parcels?.features ?? [];

    if (features.length === 0 && req.entity_name && req.borrower_name !== req.entity_name) {
      // Fallback: try with borrower personal name
      const fallbackParams = new URLSearchParams({
        owner: req.borrower_name,
        token,
        limit: "25",
      });
      if (req.state) {
        fallbackParams.set("path", `/us/${req.state.toLowerCase()}`);
      }

      const fallbackRes = await fetch(`${REGRID_BASE_URL}/parcels/owner?${fallbackParams}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!fallbackRes.ok) return [];
      const fallbackData: RegridResponse = await fallbackRes.json();
      return mapFeaturesToRecords(fallbackData.parcels?.features ?? []);
    }

    return mapFeaturesToRecords(features);
  } catch (err) {
    if (err instanceof RegridError) throw err;
    throw new RegridError(`Regrid property search failed: ${err}`, 0);
  }
}

function mapFeaturesToRecords(features: RegridFeature[]): PropertyRecord[] {
  return features.map((f) => {
    const fields = f.properties.fields;
    const address = buildFullAddress(f);
    const saleprice = fields.saleprice && fields.saleprice > 0 ? fields.saleprice : null;

    return {
      property_address: address,
      acquisition_date: fields.saledate ?? null,
      disposition_date: null, // Regrid shows current ownership, not disposition
      acquisition_price: saleprice,
      disposition_price: null,
      project_type: inferProjectType(saleprice ?? undefined, fields.yearbuilt),
      outcome: inferOutcome(fields.saledate),
      hold_months: calculateHoldMonths(fields.saledate),
      profit: null, // Can't calculate without disposition
      source: "Regrid Property Records",
      raw_response: f.properties as unknown as Record<string, unknown>,
    };
  });
}
