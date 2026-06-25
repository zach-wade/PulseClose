// CourtListener adapter — searches RECAP archive for federal court records.
// Free tier: 5,000 requests/day with API token.
// Covers: bankruptcy (federal), lawsuits (federal civil).
// Does NOT cover: foreclosure, lis pendens (county-level records).

import type { LitigationSearchRequest, LitigationRecord } from "./types";
import { scoreMatchGroup, type CandidateIdentity } from "../screening/disambiguation";

// Two-letter state inferred from a CourtListener court_id. Federal district /
// bankruptcy court IDs embed the state (e.g. "cand" = CA Northern, "nysb" =
// NY Southern Bankruptcy, "txwd" = TX Western). The leading two letters are
// the state postal code for the vast majority of district/bankruptcy courts.
// Best-effort: returns null for appellate / specialty courts that don't.
function courtState(courtId?: string | null): string | null {
  if (!courtId) return null;
  const m = courtId.toLowerCase().match(/^([a-z]{2})[a-z]*$/);
  const STATES = new Set([
    "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
    "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
    "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
    "va","wa","wv","wi","wy",
  ]);
  if (m && STATES.has(m[1])) return m[1].toUpperCase();
  return null;
}

const BASE_URL = "https://www.courtlistener.com/api/rest/v4";

// CourtListener's /search/?type=d endpoint returns Solr-style camelCase
// for several fields (caseName, dateFiled, dateTerminated, docketNumber,
// suitNature, docket_absolute_url) while keeping court / court_id / cause
// in snake_case. The /dockets/ ORM endpoint returns the snake_case form
// throughout. Declare both so this adapter works with either response
// shape — historical data stored with one shape, future runs with the
// other.
interface CLDocket {
  // Snake-case (also kept for compatibility with the /dockets/ endpoint).
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
  // CamelCase from /search/?type=d Solr index — used by the search call below.
  caseName?: string;
  dateFiled?: string;
  dateTerminated?: string;
  docketNumber?: string;
  suitNature?: string;
  docket_absolute_url?: string;
  court_citation_string?: string;
}

function pickDocketField<K extends keyof CLDocket>(
  d: CLDocket,
  ...keys: K[]
): CLDocket[K] | undefined {
  for (const k of keys) {
    const v = d[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
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
  const caseName = pickDocketField(docket, "caseName", "case_name", "case_name_short");
  const dateTerminated = pickDocketField(docket, "dateTerminated", "date_terminated");
  const natureOfSuit = pickDocketField(docket, "suitNature", "nature_of_suit");
  const docketNumber = pickDocketField(docket, "docketNumber", "docket_number");

  const details = [
    caseName,
    natureOfSuit ? `Nature of suit: ${natureOfSuit}` : null,
    docket.cause ? `Cause: ${docket.cause}` : null,
    dateTerminated ? `Terminated: ${dateTerminated}` : null,
    !dateTerminated ? "Case may be active" : null,
  ]
    .filter(Boolean)
    .join(". ");

  return {
    search_type: searchType,
    entity_name: searchName,
    result: "found",
    details: details || "Federal court record found",
    case_number: docketNumber ?? null,
    source: `CourtListener RECAP Archive`,
    raw_response: docket as unknown as Record<string, unknown>,
  };
}

export async function searchLitigationCourtListener(
  req: LitigationSearchRequest,
  token: string,
): Promise<{
  bankruptcy: LitigationRecord[];
  lawsuits: LitigationRecord[];
  // Names whose search threw (rate-limit / upstream error). Non-empty => the
  // screen is INCOMPLETE: an empty result set cannot be asserted as "clear".
  failedNames: string[];
}> {
  const searchNames = [req.borrower_name];
  if (req.entity_name && req.entity_name !== req.borrower_name) {
    searchNames.push(req.entity_name);
  }

  const bankruptcyResults: LitigationRecord[] = [];
  const lawsuitResults: LitigationRecord[] = [];
  const failedNames: string[] = [];

  for (const name of searchNames) {
    try {
      const dockets = await searchDockets(name, token);
      if (dockets.length === 0) continue;

      // Match the borrower against each docket's CAPTION. For bankruptcy the
      // caption IS the debtor's name; for civil it's "X v. Y". The matcher's
      // first-name-position logic means a caption like "Paul Mark Morrison" or
      // "Weinraub v. BofA" scores weak/none for a "Mark Morrison" search — the
      // borrower isn't actually the named party, just text in the docket.
      // (We do NOT fetch the /parties/ endpoint: it's empty for search-index
      // bankruptcy dockets — calibration 0/8 — and the per-docket call storm
      // trips CourtListener's rate limit, degrading the core search.)
      const isEntityName = name === req.entity_name && name !== req.borrower_name;
      const candidates: CandidateIdentity[] = dockets.map((d) => ({
        name: pickDocketField(d, "caseName", "case_name", "case_name_short") ?? name,
        jurisdictionState: courtState(d.court_id),
      }));
      const group = scoreMatchGroup(
        { fullName: name, knownStates: req.known_states },
        candidates,
        { entity: isEntityName, kind: "case" },
      );

      dockets.forEach((docket, i) => {
        const d = group.results[i];
        const bucket = isBankruptcyCourt(docket.court_id)
          ? bankruptcyResults
          : lawsuitResults;
        const rec = mapDocketToRecord(
          docket,
          isBankruptcyCourt(docket.court_id) ? "bankruptcy" : "lawsuit",
          name,
        );
        rec.confidence = d.confidence;
        rec.name_match = d.nameMatch;
        rec.review_required = d.reviewRequired;
        // Persist confidence into raw_response so it survives the
        // litigation_checks round-trip and reaches extract.ts + factors.
        rec.raw_response = {
          ...(rec.raw_response ?? {}),
          _disambiguation: {
            confidence: d.confidence,
            name_match: d.nameMatch,
            review_required: d.reviewRequired,
            name_is_common: d.nameIsCommon,
            common_name_likely: group.commonNameLikely,
          },
        };
        bucket.push(rec);
      });
    } catch (err) {
      console.error(`CourtListener search failed for "${name}":`, err);
      // Don't throw — return what we have and let other search types run, but
      // RECORD the failure so the caller knows the screen is incomplete and must
      // not present an empty result as "clear".
      failedNames.push(name);
    }
  }

  return { bankruptcy: bankruptcyResults, lawsuits: lawsuitResults, failedNames };
}
