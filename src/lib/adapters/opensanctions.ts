// OpenSanctions adapter — name screening against sanctions, PEPs, watchlists.
// Uses POST /match/default which covers OFAC SDN, EU/UK/UN consolidated lists,
// and global PEPs in a single call.
// Docs: https://www.opensanctions.org/docs/api/matching/
// Auth: header `Authorization: ApiKey <key>`

import type {
  SanctionsScreenRequest,
  SanctionsScreenResult,
  SanctionsMatch,
  SanctionsIdentifiers,
  SanctionsCategory,
} from "./types";
import {
  scoreMatchGroup,
  type CandidateIdentity,
  type MatchConfidence,
} from "../screening/disambiguation";

const OPENSANCTIONS_BASE_URL = "https://api.opensanctions.org";
// Score threshold below which we treat a result as noise.
// OpenSanctions returns 0..1; their guidance is ~0.7 for review-worthy hits.
const MATCH_THRESHOLD = 0.7;

interface OpenSanctionsMatchEntity {
  id?: string;
  caption?: string;
  schema?: string;
  score?: number;
  match?: boolean;
  properties?: {
    name?: string[];
    sanctions?: unknown[];
    topics?: string[];
    program?: string[];
    sourceUrl?: string[];
    [key: string]: unknown;
  };
  datasets?: string[];
  referents?: string[];
}

interface OpenSanctionsMatchResponse {
  responses?: Record<
    string,
    {
      query?: unknown;
      results?: OpenSanctionsMatchEntity[];
      total?: { value: number };
    }
  >;
}

export class OpenSanctionsError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "OpenSanctionsError";
  }
}

// Supporting identifiers we hold on the borrower. Passing them into the query
// lets OpenSanctions PENALIZE candidates whose DOB/nationality/country diverge
// (their guidance + the name-qualified scoring variant) — server-side false-
// positive reduction. country is derived from the borrower's known US states.
interface SubjectProps {
  country?: string[];   // ISO codes, e.g. ["us"]
  birthDate?: string[]; // YYYY-MM-DD — once captured at intake (1003)
}

function buildPersonQuery(name: string, sp: SubjectProps = {}) {
  // OpenSanctions accepts a single `name` field — it splits internally.
  return {
    schema: "Person" as const,
    properties: {
      name: [name],
      ...(sp.country?.length ? { country: sp.country } : {}),
      ...(sp.birthDate?.length ? { birthDate: sp.birthDate } : {}),
    },
  };
}

function buildEntityQuery(name: string, sp: SubjectProps = {}) {
  return {
    schema: "Company" as const,
    properties: {
      name: [name],
      ...(sp.country?.length ? { jurisdiction: sp.country } : {}),
    },
  };
}

// US state list → ISO country code. All our borrowers are US-domiciled today;
// passing country=us down-scores foreign-only sanctioned entities, which for a
// US real-estate borrower are almost always false positives.
function deriveCountry(knownStates?: string[]): string[] {
  return (knownStates ?? []).length > 0 ? ["us"] : [];
}

function extractListName(entity: OpenSanctionsMatchEntity): string {
  const datasets = entity.datasets ?? [];
  if (datasets.length === 0) return "OpenSanctions";
  // Prefer well-known list IDs in priority order
  const known = [
    "us_ofac_sdn",
    "us_ofac_cons",
    "eu_fsf",
    "gb_hmt_sanctions",
    "un_sc_sanctions",
    "ca_dfatd_sema_sanctions",
    "wd_peps",
  ];
  for (const k of known) {
    if (datasets.includes(k)) {
      return readableListName(k);
    }
  }
  return readableListName(datasets[0]);
}

function readableListName(id: string): string {
  const map: Record<string, string> = {
    us_ofac_sdn: "OFAC SDN",
    us_ofac_cons: "OFAC Consolidated",
    eu_fsf: "EU Consolidated",
    gb_hmt_sanctions: "UK HMT",
    un_sc_sanctions: "UN Security Council",
    ca_dfatd_sema_sanctions: "Canada SEMA",
    wd_peps: "PEPs (Wikidata)",
  };
  return map[id] ?? id;
}

// Pull the distinguishing identifiers OpenSanctions carries for an entry so a
// reviewer can clear (or confirm) a common-name match against facts, not just
// a name. FollowTheMoney property names: birthDate, birthPlace, nationality,
// country, address, idNumber, position.
function extractIdentifiers(
  props: Record<string, unknown>,
): SanctionsIdentifiers | undefined {
  const arr = (key: string): string[] | undefined => {
    const v = props[key];
    if (!Array.isArray(v)) return undefined;
    const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
    return out.length > 0 ? [...new Set(out)] : undefined;
  };
  const ids: SanctionsIdentifiers = {
    dob: arr("birthDate"),
    birth_place: arr("birthPlace"),
    nationality: arr("nationality"),
    countries: arr("country"),
    addresses: arr("address"),
    id_numbers: arr("idNumber"),
    positions: arr("position"),
  };
  return Object.values(ids).some(Boolean) ? ids : undefined;
}

// Classify a match by OFAC FAQ #5 Step 1: is this an actual sanctions/PEP hit,
// or "some other reason" (a debarment / regulatory-exclusion list)? Driven by
// OpenSanctions `topics` first, then dataset IDs as a fallback. Topic taxonomy:
// https://www.opensanctions.org/docs/topics/
const EXCLUSION_DATASETS = [
  "us_sam_exclusions", "us_ny_med_exclusions", "us_oig_exclusions",
  "us_finra_actions", "gb_coh_disqualified", "debarment",
];
function classifyMatch(
  topics: string[],
  datasets: string[],
): SanctionsCategory {
  const t = topics.map((x) => x.toLowerCase());
  if (t.some((x) => x === "sanction" || x.startsWith("sanction"))) return "sanction";
  if (t.some((x) => x === "role.pep" || x === "role.rca" || x.startsWith("role.pep"))) return "pep";
  if (
    t.some((x) => x === "debarment" || x.startsWith("reg.")) ||
    datasets.some((d) => EXCLUSION_DATASETS.some((e) => d.includes(e)))
  ) {
    return "exclusion";
  }
  // No topic signal + a sanctions-list dataset → treat as sanction (recall-safe).
  const SANCTION_DATASETS = ["ofac", "eu_fsf", "hmt", "un_sc", "sema", "_sanctions"];
  if (datasets.some((d) => SANCTION_DATASETS.some((s) => d.includes(s)))) return "sanction";
  return "other";
}

function mapEntity(
  entity: OpenSanctionsMatchEntity,
  queryName: string,
): SanctionsMatch {
  const props = entity.properties ?? {};
  const programs = Array.isArray(props.program)
    ? (props.program as string[])
    : [];
  const sourceUrls = Array.isArray(props.sourceUrl)
    ? (props.sourceUrl as string[])
    : [];
  const topics = Array.isArray(props.topics) ? (props.topics as string[]) : [];

  const schemaRaw = entity.schema ?? "Other";
  const schema: SanctionsMatch["schema"] =
    schemaRaw === "Person" || schemaRaw === "Company" || schemaRaw === "LegalEntity"
      ? schemaRaw
      : "Other";

  return {
    query_name: queryName,
    matched_name: entity.caption ?? props.name?.[0] ?? "Unknown",
    list_name: extractListName(entity),
    programs,
    schema,
    score: entity.score ?? 0,
    source_url: sourceUrls[0] ?? null,
    identifiers: extractIdentifiers(props as Record<string, unknown>),
    topics,
    category: classifyMatch(topics, entity.datasets ?? []),
  };
}

function entityToCandidate(
  entity: OpenSanctionsMatchEntity,
): CandidateIdentity {
  const props = entity.properties ?? {};
  const birthDate = Array.isArray((props as Record<string, unknown>).birthDate)
    ? ((props as Record<string, unknown>).birthDate as string[])[0]
    : null;
  const country = Array.isArray((props as Record<string, unknown>).country)
    ? ((props as Record<string, unknown>).country as string[])[0]
    : null;
  return {
    name: entity.caption ?? props.name?.[0] ?? "Unknown",
    dob: birthDate ?? null,
    jurisdictionState: country ?? null,
    vendorScore: entity.score ?? null,
  };
}

export async function screenSanctionsOpenSanctions(
  req: SanctionsScreenRequest,
  apiKey: string,
): Promise<SanctionsScreenResult> {
  // Build queries: one per name we want to screen. Attach the borrower's known
  // country (+ DOB once captured at intake) so OpenSanctions down-scores
  // candidates whose nationality/DOB diverge — server-side FP reduction.
  const queries: Record<string, unknown> = {};
  const queryNameMap: Record<string, string> = {};
  const sp: SubjectProps = {
    country: deriveCountry(req.known_states),
    birthDate: req.borrower_dob ? [req.borrower_dob.slice(0, 10)] : undefined,
  };

  if (req.borrower_name) {
    queries.borrower = buildPersonQuery(req.borrower_name, sp);
    queryNameMap.borrower = req.borrower_name;
  }
  if (req.entity_name) {
    queries.entity = buildEntityQuery(req.entity_name, sp);
    queryNameMap.entity = req.entity_name;
  }
  if (req.guarantor_name && req.guarantor_name !== req.borrower_name) {
    queries.guarantor = buildPersonQuery(req.guarantor_name, sp);
    queryNameMap.guarantor = req.guarantor_name;
  }
  // Officers, registered agent, and other principals from the entity
  // filing. Dedupe + skip names already screened above.
  const seen = new Set(
    [req.borrower_name, req.guarantor_name]
      .filter((s): s is string => Boolean(s))
      .map((s) => s.toLowerCase().replace(/\s+/g, " ").trim()),
  );
  for (const [idx, name] of (req.additional_persons ?? []).entries()) {
    const norm = name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const qid = `person_${idx}`;
    // Officers/agents: pass country (US-domiciled entity) but not the
    // borrower's DOB — it isn't theirs.
    queries[qid] = buildPersonQuery(name, { country: sp.country });
    queryNameMap[qid] = name;
  }

  if (Object.keys(queries).length === 0) {
    return {
      result: "not_run",
      sources_searched: [],
      matches: [],
      source: "OpenSanctions",
      raw_response: { _adapter: "opensanctions", _result: "no_input" },
    };
  }

  try {
    const res = await fetch(
      `${OPENSANCTIONS_BASE_URL}/match/default?algorithm=logic-v2`,
      {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queries }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OpenSanctionsError(
        `OpenSanctions API error ${res.status}: ${res.statusText}. ${body}`.trim(),
        res.status,
      );
    }

    const data: OpenSanctionsMatchResponse = await res.json();
    const responses = data.responses ?? {};

    // Build matches per query name, then run each name's matches through the
    // disambiguation layer so a common-name false positive ("Mark Morrison")
    // is capped at "possible — review" instead of asserted as a hit.
    const matches: SanctionsMatch[] = [];
    let commonNameLikely = false;
    const order: MatchConfidence[] = ["confirmed", "probable", "possible", "weak"];
    let highest: MatchConfidence = "weak";

    for (const [qid, response] of Object.entries(responses)) {
      const queryName = queryNameMap[qid] ?? qid;
      const isEntity = qid === "entity";
      const entities = (response.results ?? []).filter(
        (e) => (e.score ?? 0) >= MATCH_THRESHOLD,
      );
      if (entities.length === 0) continue;

      const candidates = entities.map(entityToCandidate);
      const group = scoreMatchGroup(
        {
          fullName: queryName,
          knownStates: req.known_states,
          // DOB belongs only to the borrower/guarantor query, not officers.
          dob: qid === "borrower" || qid === "guarantor" ? req.borrower_dob : undefined,
        },
        candidates,
        { entity: isEntity, kind: "match" },
      );
      if (group.commonNameLikely) commonNameLikely = true;
      if (order.indexOf(group.highestConfidence) < order.indexOf(highest)) {
        highest = group.highestConfidence;
      }

      entities.forEach((entity, i) => {
        const m = mapEntity(entity, queryName);
        const d = group.results[i];
        m.confidence = d.confidence;
        m.name_match = d.nameMatch;
        m.review_required = d.reviewRequired;
        m.match_reasons = d.reasons;
        matches.push(m);
      });
    }

    // Split true sanctions/PEP hits from regulatory-exclusion noise (OFAC FAQ
    // #5 §1) so the summary is honest about what actually matched.
    const screening = matches.filter(
      (m) => m.category === "sanction" || m.category === "pep" || m.category == null,
    );
    const exclusions = matches.length - screening.length;
    const screeningReview = screening.filter((m) => m.review_required !== false).length;
    let reviewSummary: string | undefined;
    if (screeningReview > 0) {
      reviewSummary = `${screeningReview} possible sanctions/PEP ${screeningReview === 1 ? "match" : "matches"} — review${commonNameLikely ? " (name appears common)" : ""}.`;
    } else if (exclusions > 0) {
      reviewSummary = `No sanctions/PEP matches; ${exclusions} regulatory-exclusion ${exclusions === 1 ? "entry" : "entries"} (informational).`;
    }

    return {
      result: matches.length > 0 ? "potential_match" : "clear",
      sources_searched: [
        "OFAC SDN",
        "OFAC Consolidated",
        "EU Consolidated",
        "UN Security Council",
        "UK HMT",
        "Global PEPs",
      ],
      matches,
      source: "OpenSanctions",
      raw_response: data as unknown as Record<string, unknown>,
      common_name_likely: commonNameLikely,
      highest_confidence: screening.length > 0 ? highest : undefined,
      review_summary: reviewSummary,
    };
  } catch (err) {
    if (err instanceof OpenSanctionsError) throw err;
    throw new OpenSanctionsError(
      `OpenSanctions screen failed: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }
}
