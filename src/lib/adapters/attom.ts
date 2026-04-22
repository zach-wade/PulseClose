// ATTOM Data Solutions adapter — address-based sale history enrichment.
// ATTOM does NOT support owner-name search. Use Regrid to find properties,
// then call ATTOM to enrich each property with full transaction history.
//
// Endpoint used: /saleshistory/snapshot (address1 + address2)
// Docs: https://api.developer.attomdata.com/docs
// Auth: header `apikey: <key>`

import type { PropertyRecord } from "./types";

const ATTOM_BASE_URL = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";

// Verified response shape from live API call (2026-04-22):
// {
//   status: { code: 0, msg: "SuccessWithResult", total: 1, ... },
//   property: [{
//     address: { oneLine, line1, line2, locality, countrySubd, postal1 },
//     summary: { proptype, yearbuilt },
//     salehistory: [{
//       saleSearchDate, saleTransDate,
//       amount: { saleamt, salecode, salerecdate, saletranstype }
//     }]
//   }]
// }

interface AttomSaleRecord {
  saleSearchDate?: string;
  saleTransDate?: string;
  amount?: {
    saleamt?: number;
    salecode?: string;
    salerecdate?: string;
    saledisclosuretype?: number;
    saledocnum?: string;
    saletranstype?: string;
  };
  calculation?: {
    priceperbed?: number;
    pricepersizeunit?: number;
  };
}

interface AttomProperty {
  identifier?: { attomId?: number; fips?: string; apn?: string };
  address?: {
    oneLine?: string;
    line1?: string;
    line2?: string;
    locality?: string;
    countrySubd?: string;
    postal1?: string;
  };
  summary?: { proptype?: string; propsubtype?: string; yearbuilt?: number };
  building?: { size?: { universalsize?: number }; rooms?: { bathstotal?: number; beds?: number } };
  lot?: { lotSize1?: number };
  salehistory?: AttomSaleRecord[];
}

interface AttomResponse {
  status?: { code?: number; msg?: string; total?: number };
  property?: AttomProperty[];
}

export class AttomError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public vendor: string = "attom",
  ) {
    super(message);
    this.name = "AttomError";
  }
}

async function attomFetch(
  endpoint: string,
  params: URLSearchParams,
  apiKey: string,
): Promise<AttomResponse> {
  const url = `${ATTOM_BASE_URL}${endpoint}?${params}`;
  const res = await fetch(url, {
    headers: { apikey: apiKey, Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // ATTOM returns 400 with code "SuccessWithoutResult" for no-match — not a real error
    if (res.status === 400 && body.includes("SuccessWithoutResult")) {
      return { status: { code: 400, msg: "SuccessWithoutResult", total: 0 }, property: [] };
    }
    throw new AttomError(
      `ATTOM API error ${res.status}: ${res.statusText}. ${body}`.trim(),
      res.status,
    );
  }

  return res.json();
}

/**
 * Parse an address string into address1 (street) and address2 (city, state zip).
 * Regrid addresses come as "123 Main St, San Jose, CA 95112"
 */
function splitAddress(fullAddress: string): { address1: string; address2: string } | null {
  // Try splitting on first comma: "123 Main St, San Jose, CA 95112"
  const firstComma = fullAddress.indexOf(",");
  if (firstComma === -1) return null;

  const address1 = fullAddress.slice(0, firstComma).trim();
  const address2 = fullAddress.slice(firstComma + 1).trim();

  if (!address1 || !address2) return null;
  return { address1, address2 };
}

/**
 * Enrich a single PropertyRecord with ATTOM sale history.
 * Takes an address, returns the sale history records merged into the property data.
 */
export async function enrichWithSaleHistory(
  record: PropertyRecord,
  apiKey: string,
): Promise<PropertyRecord> {
  const parsed = splitAddress(record.property_address);
  if (!parsed) return record;

  try {
    const params = new URLSearchParams({
      address1: parsed.address1,
      address2: parsed.address2,
    });

    const data = await attomFetch("/saleshistory/snapshot", params, apiKey);
    const prop = data.property?.[0];
    if (!prop?.salehistory?.length) return record;

    // Sort sales by date descending (most recent first)
    const sales = [...prop.salehistory]
      .filter((s) => s.amount?.saleamt && s.amount.saleamt > 0)
      .sort((a, b) => {
        const dateA = a.saleTransDate ?? a.saleSearchDate ?? "";
        const dateB = b.saleTransDate ?? b.saleSearchDate ?? "";
        return dateB.localeCompare(dateA);
      });

    if (sales.length === 0) return record;

    // If there are 2+ sales, we can infer acquisition and disposition
    const mostRecent = sales[0];
    const previous = sales.length > 1 ? sales[1] : null;

    const dispositionDate = mostRecent.saleTransDate ?? mostRecent.amount?.salerecdate ?? null;
    const dispositionPrice = mostRecent.amount?.saleamt ?? null;
    const acquisitionDate = previous?.saleTransDate ?? previous?.amount?.salerecdate ?? record.acquisition_date;
    const acquisitionPrice = previous?.amount?.saleamt ?? record.acquisition_price;

    // Determine if this looks like a flip (bought then sold)
    const isResale = mostRecent.amount?.saletranstype?.toLowerCase().includes("resale");
    const hasProfit = dispositionPrice && acquisitionPrice && dispositionPrice > acquisitionPrice;

    let holdMonths: number | null = null;
    if (acquisitionDate && dispositionDate) {
      const acq = new Date(acquisitionDate);
      const disp = new Date(dispositionDate);
      if (!isNaN(acq.getTime()) && !isNaN(disp.getTime())) {
        holdMonths = Math.abs(
          (disp.getFullYear() - acq.getFullYear()) * 12 +
          (disp.getMonth() - acq.getMonth()),
        );
      }
    }

    return {
      ...record,
      acquisition_date: acquisitionDate,
      acquisition_price: acquisitionPrice,
      disposition_date: previous ? dispositionDate : record.disposition_date,
      disposition_price: previous ? dispositionPrice : record.disposition_price,
      hold_months: holdMonths ?? record.hold_months,
      profit: hasProfit && dispositionPrice && acquisitionPrice
        ? dispositionPrice - acquisitionPrice
        : record.profit,
      project_type: isResale && previous ? "flip" : record.project_type,
      outcome: previous ? "completed" : record.outcome,
      source: `${record.source} + ATTOM Sale History`,
      raw_response: {
        ...(record.raw_response as Record<string, unknown>),
        _attom_enrichment: {
          salehistory: prop.salehistory,
          yearbuilt: prop.summary?.yearbuilt,
        },
      },
    };
  } catch {
    // Enrichment is best-effort — don't fail the whole search if one address doesn't match
    return record;
  }
}

/**
 * Enrich an array of PropertyRecords with ATTOM sale history.
 * Runs in parallel with concurrency limit to avoid rate limits.
 */
export async function enrichPropertiesWithAttom(
  records: PropertyRecord[],
  apiKey: string,
  maxConcurrent = 5,
): Promise<PropertyRecord[]> {
  if (records.length === 0) return records;

  const results: PropertyRecord[] = [];
  // Process in batches to respect rate limits
  for (let i = 0; i < records.length; i += maxConcurrent) {
    const batch = records.slice(i, i + maxConcurrent);
    const enriched = await Promise.all(
      batch.map((r) => enrichWithSaleHistory(r, apiKey)),
    );
    results.push(...enriched);
  }

  return results;
}
