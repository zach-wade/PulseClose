// OpenSanctions adapter — name screening against sanctions, PEPs, watchlists.
// Uses POST /match/default which covers OFAC SDN, EU/UK/UN consolidated lists,
// and global PEPs in a single call.
// Docs: https://www.opensanctions.org/docs/api/matching/
// Auth: header `Authorization: ApiKey <key>`

import type {
  SanctionsScreenRequest,
  SanctionsScreenResult,
  SanctionsMatch,
} from "./types";

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

function buildPersonQuery(name: string) {
  // OpenSanctions accepts a single `name` field — it splits internally.
  return {
    schema: "Person" as const,
    properties: { name: [name] },
  };
}

function buildEntityQuery(name: string) {
  return {
    schema: "Company" as const,
    properties: { name: [name] },
  };
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
  };
}

export async function screenSanctionsOpenSanctions(
  req: SanctionsScreenRequest,
  apiKey: string,
): Promise<SanctionsScreenResult> {
  // Build queries: one per name we want to screen.
  const queries: Record<string, unknown> = {};
  const queryNameMap: Record<string, string> = {};

  if (req.borrower_name) {
    queries.borrower = buildPersonQuery(req.borrower_name);
    queryNameMap.borrower = req.borrower_name;
  }
  if (req.entity_name) {
    queries.entity = buildEntityQuery(req.entity_name);
    queryNameMap.entity = req.entity_name;
  }
  if (req.guarantor_name && req.guarantor_name !== req.borrower_name) {
    queries.guarantor = buildPersonQuery(req.guarantor_name);
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
    queries[qid] = buildPersonQuery(name);
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

    const matches: SanctionsMatch[] = [];
    for (const [qid, response] of Object.entries(responses)) {
      const queryName = queryNameMap[qid] ?? qid;
      const results = response.results ?? [];
      for (const entity of results) {
        if ((entity.score ?? 0) >= MATCH_THRESHOLD) {
          matches.push(mapEntity(entity, queryName));
        }
      }
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
    };
  } catch (err) {
    if (err instanceof OpenSanctionsError) throw err;
    throw new OpenSanctionsError(
      `OpenSanctions screen failed: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }
}
