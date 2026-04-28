// Extract structured data from vendor raw_response JSONB fields.
// These run client-side at render time — no DB migration needed.

// ── Realie ──

// Realie returns dates as YYYYMMDD strings. Convert to ISO so the rest
// of the app can use shared formatDate helpers.
function realieDateToISO(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (raw.includes("-") || raw.includes("T")) return raw.slice(0, 10);
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw;
}

export interface RealieDetails {
  lenderName: string | null;
  modelValue: number | null;
  modelValueMin: number | null;
  modelValueMax: number | null;
  ltvCurrent: number | null;
  ltvPurchase: number | null;
  equityEstimate: number | null;
  totalLienCount: number | null;
  totalLienBalance: number | null;
  forecloseCode: string | null;
  forecloseDate: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotAcres: number | null;
  zoning: string | null;
  assessedValue: number | null;
  taxValue: number | null;
  transfers: { grantor: string; grantee: string; date: string | null; price: number | null }[];
}

export function extractRealieDetails(raw: Record<string, unknown> | null | undefined): RealieDetails | null {
  if (!raw) return null;
  // Detect Realie vs other adapters
  if (raw._adapter === "stub" || raw._demo) return null;

  return {
    lenderName: (raw.lenderName as string) ?? null,
    modelValue: (raw.modelValue as number) ?? null,
    modelValueMin: (raw.modelValueMin as number) ?? null,
    modelValueMax: (raw.modelValueMax as number) ?? null,
    ltvCurrent: (raw.LTVCurrentEstCombined as number) ?? null,
    ltvPurchase: (raw.LTVPurchase as number) ?? null,
    equityEstimate: (raw.equityCurrentEstBal as number) ?? null,
    totalLienCount: (raw.totalLienCount as number) ?? null,
    totalLienBalance: (raw.totalLienBalance as number) ?? null,
    forecloseCode: (raw.forecloseCode as string) ?? null,
    forecloseDate: (raw.forecloseRecordDate as string) ?? null,
    beds: (raw.totalBedrooms as number) ?? null,
    baths: (raw.totalBathrooms as number) ?? null,
    sqft: (raw.buildingArea as number) ?? null,
    yearBuilt: (raw.yearBuilt as number) ?? null,
    lotAcres: (raw.acres as number) ?? null,
    zoning: (raw.zoningCode as string) ?? null,
    assessedValue: (raw.totalAssessedValue as number) ?? null,
    taxValue: (raw.taxValue as number) ?? null,
    transfers: Array.isArray(raw.transfers)
      ? (raw.transfers as Record<string, unknown>[])
          .map((t) => ({
            grantor: (t.grantor as string) ?? "Unknown",
            grantee: (t.grantee as string) ?? "Unknown",
            date: realieDateToISO(t.transferDate),
            price: (t.transferPrice as number) ?? null,
          }))
          // Most recent transfer first — most useful for "when did the
          // current owner acquire this property?"
          .sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return b.date.localeCompare(a.date);
          })
      : [],
  };
}

// ── CourtListener ──

export interface CourtListenerDetails {
  courtName: string | null;
  courtId: string | null;
  natureOfSuit: string | null;
  cause: string | null;
  dateFiled: string | null;
  dateTerminated: string | null;
  isActive: boolean;
  caseName: string | null;
  absoluteUrl: string | null;
}

export function extractCourtListenerDetails(raw: Record<string, unknown> | null | undefined): CourtListenerDetails | null {
  if (!raw) return null;
  if (raw._adapter === "stub" || raw._demo) return null;
  // CourtListener docket data or our wrapper
  const docket = raw as Record<string, unknown>;

  return {
    courtName: (docket.court as string) ?? null,
    courtId: (docket.court_id as string) ?? null,
    natureOfSuit: (docket.nature_of_suit as string) ?? null,
    cause: (docket.cause as string) ?? null,
    dateFiled: (docket.date_filed as string) ?? null,
    dateTerminated: (docket.date_terminated as string) ?? null,
    isActive: !docket.date_terminated,
    caseName: (docket.case_name as string) ?? null,
    absoluteUrl: docket.absolute_url
      ? `https://www.courtlistener.com${docket.absolute_url}`
      : null,
  };
}

// ── Cobalt Intelligence ──

export interface CobaltDetails {
  officers: { name: string; title: string }[];
  documents: { name: string; date: string }[];
  confidenceLevel: number | null;
  sosId: string | null;
  sourceUrl: string | null;
}

export function extractCobaltDetails(raw: Record<string, unknown> | null | undefined): CobaltDetails | null {
  if (!raw) return null;
  if (raw._adapter === "stub" || raw._demo || raw._error) return null;

  // Cobalt stores the full CobaltResponse — results[0] has the business data
  const results = raw.results as Record<string, unknown>[] | undefined;
  const biz = results?.[0];
  if (!biz) return null;

  const officers = Array.isArray(biz.officers)
    ? (biz.officers as Record<string, unknown>[]).map((o) => ({
        name: (o.name as string) ?? "Unknown",
        title: (o.title as string) ?? "",
      }))
    : [];

  const documents = Array.isArray(biz.documents)
    ? (biz.documents as Record<string, unknown>[])
        .filter((d) => d.name || d.date)
        .map((d) => ({
          name: (d.name as string) ?? "Filing",
          date: (d.date as string) ?? "",
        }))
        .slice(0, 5)
    : [];

  return {
    officers,
    documents,
    confidenceLevel: (biz.confidenceLevel as number) ?? null,
    sosId: (biz.sosId as string) ?? null,
    sourceUrl: (biz.url as string) ?? null,
  };
}
