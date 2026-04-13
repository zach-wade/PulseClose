// CourtListener adapter — searches RECAP archive for federal court records.
// Free tier: 5,000 requests/day with API token.
// Covers: bankruptcy (federal), lawsuits (federal civil).
// Does NOT cover: foreclosure, lis pendens (county-level records).

import type { LitigationSearchRequest, LitigationRecord } from "./types";

const BASE_URL = "https://www.courtlistener.com/api/rest/v4";

interface CLDocket {
  absolute_url?: string;
  case_name?: string;
  case_name_short?: string;
  court?: string;
  court_id?: string;
  date_filed?: string;
  date_terminated?: string;
  docket_number?: string;
  cause?: string;
  nature_of_suit?: string;
}

interface CLSearchResponse {
  count: number;
  next: string | null;
  results: CLDocket[];
}

async function searchDockets(
  query: string,
  token: string,
  courtType?: string,
): Promise<CLDocket[]> {
  const params = new URLSearchParams({
    q: `"${query}"`,
    type: "d",
    order_by: "dateFiled desc",
    page_size: "20",
  });

  if (courtType) {
    params.set("court", courtType);
  }

  const res = await fetch(`${BASE_URL}/search/?${params}`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`CourtListener API error: ${res.status} ${res.statusText}`);
  }

  const data: CLSearchResponse = await res.json();
  return data.results ?? [];
}

// Bankruptcy court IDs in CourtListener all contain "bankr"
function isBankruptcyCourt(courtId?: string): boolean {
  return !!courtId && courtId.includes("bankr");
}

function mapDocketToRecord(
  docket: CLDocket,
  searchType: "bankruptcy" | "lawsuit",
  searchName: string,
): LitigationRecord {
  const details = [
    docket.case_name,
    docket.nature_of_suit ? `Nature of suit: ${docket.nature_of_suit}` : null,
    docket.cause ? `Cause: ${docket.cause}` : null,
    docket.date_terminated ? `Terminated: ${docket.date_terminated}` : null,
    !docket.date_terminated ? "Case may be active" : null,
  ]
    .filter(Boolean)
    .join(". ");

  return {
    search_type: searchType,
    entity_name: searchName,
    result: "found",
    details: details || "Federal court record found",
    case_number: docket.docket_number ?? null,
    source: `CourtListener RECAP Archive`,
    raw_response: docket as unknown as Record<string, unknown>,
  };
}

export async function searchLitigationCourtListener(
  req: LitigationSearchRequest,
  token: string,
): Promise<{ bankruptcy: LitigationRecord[]; lawsuits: LitigationRecord[] }> {
  const searchNames = [req.borrower_name];
  if (req.entity_name && req.entity_name !== req.borrower_name) {
    searchNames.push(req.entity_name);
  }

  const bankruptcyResults: LitigationRecord[] = [];
  const lawsuitResults: LitigationRecord[] = [];

  for (const name of searchNames) {
    try {
      const dockets = await searchDockets(name, token);

      for (const docket of dockets) {
        if (isBankruptcyCourt(docket.court_id)) {
          bankruptcyResults.push(
            mapDocketToRecord(docket, "bankruptcy", name),
          );
        } else {
          lawsuitResults.push(mapDocketToRecord(docket, "lawsuit", name));
        }
      }
    } catch (err) {
      console.error(`CourtListener search failed for "${name}":`, err);
      // Don't throw — return what we have and let other search types run
    }
  }

  return { bankruptcy: bankruptcyResults, lawsuits: lawsuitResults };
}
