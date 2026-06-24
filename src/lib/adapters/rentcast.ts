// RentCast adapter — address-based property record + sale-history enrichment.
// Replaces ATTOM (deprecated). RentCast's /properties endpoint returns a full
// record including a `history` map of Sale/Listing events; we use it to fill
// acquisition/disposition dates + prices, hold, profit, and flip detection.
//
// Endpoint: GET /v1/properties?address=<full address>
// Docs: https://developers.rentcast.io/reference/property-records
// Auth: header `X-Api-Key: <key>`
//
// IMPORTANT (fidelity): RentCast reliably returns sale DATES, but PRICES are
// partial — non-disclosure states + older records often have a Sale event with
// no `price`. We carry the date and leave price null rather than fabricate one.

import type { PropertyRecord } from "./types";

const RENTCAST_BASE_URL = "https://api.rentcast.io/v1";

// Response shape verified against the live API (2026-06-24).
interface RentcastHistoryEvent {
  event?: string; // "Sale" | "Listing" | ...
  date?: string; // ISO
  price?: number;
}
interface RentcastProperty {
  id?: string;
  formattedAddress?: string;
  propertyType?: string;
  yearBuilt?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
  owner?: { names?: string[] } | null;
  ownerOccupied?: boolean;
  history?: Record<string, RentcastHistoryEvent>;
}

export class RentcastError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public vendor: string = "rentcast",
  ) {
    super(message);
    this.name = "RentcastError";
  }
}

async function rentcastFetch(address: string, apiKey: string): Promise<RentcastProperty | null> {
  const url = `${RENTCAST_BASE_URL}/properties?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
  });

  if (!res.ok) {
    // 404 = no record for that address; treat as a clean miss, not an error.
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new RentcastError(`RentCast API error ${res.status}: ${res.statusText}. ${body}`.trim(), res.status);
  }

  const data = await res.json();
  // /properties returns an array (or a single object for an exact match).
  if (Array.isArray(data)) return data[0] ?? null;
  return (data as RentcastProperty) ?? null;
}

/**
 * Enrich a single PropertyRecord with RentCast sale history. Mirrors the ATTOM
 * enrichment contract it replaces. Best-effort: returns the record unchanged on
 * any miss/error so one bad address never fails the whole search.
 */
export async function enrichWithSaleHistory(
  record: PropertyRecord,
  apiKey: string,
): Promise<PropertyRecord> {
  try {
    const prop = await rentcastFetch(record.property_address, apiKey);
    const history = prop?.history;
    if (!history) return record;

    const sales = Object.values(history)
      .filter((e) => (e.event ?? "").toLowerCase() === "sale" && e.date)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    if (sales.length === 0) return record;

    const mostRecent = sales[0];
    const previous = sales.length > 1 ? sales[1] : null;

    const dispositionDate = mostRecent.date ?? null;
    const dispositionPrice = mostRecent.price ?? null; // may be null — non-disclosure
    const acquisitionDate = previous?.date ?? record.acquisition_date;
    const acquisitionPrice = previous?.price ?? record.acquisition_price;

    let holdMonths: number | null = null;
    if (acquisitionDate && dispositionDate) {
      const acq = new Date(acquisitionDate);
      const disp = new Date(dispositionDate);
      if (!isNaN(acq.getTime()) && !isNaN(disp.getTime())) {
        holdMonths = Math.abs(
          (disp.getFullYear() - acq.getFullYear()) * 12 + (disp.getMonth() - acq.getMonth()),
        );
      }
    }

    // Profit only when BOTH prices are present — never infer one.
    const hasProfit =
      dispositionPrice != null && acquisitionPrice != null && dispositionPrice > acquisitionPrice;

    return {
      ...record,
      acquisition_date: acquisitionDate,
      acquisition_price: acquisitionPrice,
      disposition_date: previous ? dispositionDate : record.disposition_date,
      disposition_price: previous ? dispositionPrice : record.disposition_price,
      hold_months: holdMonths ?? record.hold_months,
      profit: hasProfit ? dispositionPrice! - acquisitionPrice! : record.profit,
      project_type: previous ? "flip" : record.project_type,
      outcome: previous ? "completed" : record.outcome,
      source: `${record.source} + RentCast Sale History`,
      raw_response: {
        ...(record.raw_response as Record<string, unknown>),
        _rentcast_enrichment: {
          history,
          yearBuilt: prop?.yearBuilt ?? null,
          owner: prop?.owner ?? null,
          ownerOccupied: prop?.ownerOccupied ?? null,
        },
      },
    };
  } catch {
    return record;
  }
}

/**
 * Enrich an array of PropertyRecords with RentCast sale history, batched to
 * respect the rate limit. Same contract as the ATTOM function it replaces.
 */
export async function enrichPropertiesWithRentcast(
  records: PropertyRecord[],
  apiKey: string,
  maxConcurrent = 5,
): Promise<PropertyRecord[]> {
  if (records.length === 0) return records;
  const results: PropertyRecord[] = [];
  for (let i = 0; i < records.length; i += maxConcurrent) {
    const batch = records.slice(i, i + maxConcurrent);
    const enriched = await Promise.all(batch.map((r) => enrichWithSaleHistory(r, apiKey)));
    results.push(...enriched);
  }
  return results;
}
