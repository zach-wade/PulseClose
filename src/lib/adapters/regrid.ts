import type {
  PropertySearchRequest,
  PropertyRecord,
} from "./types";

const REGRID_BASE_URL = "https://app.regrid.com/api/v2";

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

  if (addrs && addrs.length > 0) {
    const a = addrs[0];
    const parts = [a.a_address, a.a_scity, a.a_state2, a.a_szip5].filter(Boolean);
    if (parts.length >= 2) return parts.join(", ");
  }

  return fields.address ?? "Unknown address";
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

export async function searchPropertiesRegrid(
  req: PropertySearchRequest,
  token: string,
): Promise<PropertyRecord[]> {
  // Search by owner name (entity or person)
  const searchName = req.entity_name || req.borrower_name;

  const params = new URLSearchParams({
    "fields[owner][ilike]": searchName,
    token,
    limit: "25",
  });

  // Scope to state if provided
  if (req.state) {
    params.set("path", `/us/${req.state.toLowerCase()}`);
  }

  try {
    const res = await fetch(`${REGRID_BASE_URL}/parcels/query?${params}`);

    if (!res.ok) {
      console.error(`Regrid API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data: RegridResponse = await res.json();
    const features = data.parcels?.features ?? [];

    if (features.length === 0) {
      // Try with just borrower name if entity search returned nothing
      if (req.entity_name && req.borrower_name !== req.entity_name) {
        const fallbackParams = new URLSearchParams({
          "fields[owner][ilike]": req.borrower_name,
          token,
          limit: "25",
        });
        if (req.state) {
          fallbackParams.set("path", `/us/${req.state.toLowerCase()}`);
        }

        const fallbackRes = await fetch(
          `${REGRID_BASE_URL}/parcels/query?${fallbackParams}`,
        );
        if (fallbackRes.ok) {
          const fallbackData: RegridResponse = await fallbackRes.json();
          return mapFeaturesToRecords(fallbackData.parcels?.features ?? []);
        }
      }
      return [];
    }

    return mapFeaturesToRecords(features);
  } catch (err) {
    console.error("Regrid property search failed:", err);
    return [];
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
