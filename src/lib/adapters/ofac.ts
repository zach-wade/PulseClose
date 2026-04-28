// OFAC SDN direct adapter — free, government-source name screening.
// Downloads the SDN CSV from Treasury and matches names locally.
// Used as a free fallback when no OpenSanctions key is configured.
// SDN list: https://www.treasury.gov/ofac/downloads/sdn.csv

import type {
  SanctionsScreenRequest,
  SanctionsScreenResult,
  SanctionsMatch,
} from "./types";

const SDN_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
// Cache the parsed list at module scope. Vercel serverless re-uses warm
// instances, so most requests will hit the cache.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface SdnEntry {
  entNum: string;
  name: string;
  type: string;       // "individual" | "entity" | "vessel" | "aircraft"
  program: string;
  remarks: string;
  normalized: string; // lowercased, punctuation-stripped, suffix-stripped
}

let cachedList: SdnEntry[] | null = null;
let cachedAt = 0;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:'"()/\\]/g, " ")
    .replace(/\b(llc|inc|incorporated|corp|corporation|ltd|limited|lp|llp|trust|company|co|n a|na)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Parse a single CSV line (no embedded newlines). The SDN CSV uses
// double-quote escaping but most rows are simple comma-separated values.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function loadSdnList(): Promise<SdnEntry[]> {
  if (cachedList && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedList;
  }

  const res = await fetch(SDN_CSV_URL, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`OFAC SDN download failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const lines = text.split("\n");
  const entries: SdnEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    // SDN columns: ent_num, sdn_name, sdn_type, program, title, call_sign,
    // vess_type, tonnage, grt, vess_flag, vess_owner, remarks
    const [entNum, name, type, program, , , , , , , , remarks] = cols;
    if (!name) continue;
    entries.push({
      entNum: (entNum ?? "").trim(),
      name: name.trim(),
      type: (type ?? "").trim().toLowerCase(),
      program: (program ?? "").trim(),
      remarks: (remarks ?? "").trim(),
      normalized: normalize(name),
    });
  }

  cachedList = entries;
  cachedAt = Date.now();
  return entries;
}

// Token-based matching: every token of the query must appear in the candidate.
// Reasonable balance between recall and precision for screening.
function matches(queryNorm: string, candidateNorm: string): boolean {
  const queryTokens = queryNorm.split(" ").filter((t) => t.length > 1);
  if (queryTokens.length === 0) return false;
  return queryTokens.every((t) => candidateNorm.includes(t));
}

function scoreMatch(queryNorm: string, candidateNorm: string): number {
  const queryTokens = queryNorm.split(" ").filter((t) => t.length > 1);
  const candidateTokens = candidateNorm.split(" ").filter((t) => t.length > 1);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const overlap = queryTokens.filter((t) => candidateTokens.includes(t)).length;
  // Jaccard-ish: overlap / union size, with bonus for exact token-set match
  const union = new Set([...queryTokens, ...candidateTokens]).size;
  const base = overlap / union;
  if (queryNorm === candidateNorm) return 1;
  return Math.min(0.95, base + (overlap === queryTokens.length ? 0.15 : 0));
}

interface ScreenOneResult {
  matches: SanctionsMatch[];
}

function screenName(
  list: SdnEntry[],
  name: string,
  expectedType: "individual" | "entity",
  threshold = 0.6,
): ScreenOneResult {
  const norm = normalize(name);
  if (!norm) return { matches: [] };

  const hits: SanctionsMatch[] = [];
  for (const entry of list) {
    if (!matches(norm, entry.normalized)) continue;
    // Filter to compatible record types when possible
    if (expectedType === "individual" && entry.type !== "individual") continue;
    if (expectedType === "entity" && entry.type !== "entity") continue;

    const score = scoreMatch(norm, entry.normalized);
    if (score < threshold) continue;

    hits.push({
      query_name: name,
      matched_name: entry.name,
      list_name: "OFAC SDN",
      programs: entry.program ? entry.program.split(/[;,]/).map((p) => p.trim()).filter(Boolean) : [],
      schema: expectedType === "individual" ? "Person" : "Company",
      score,
      source_url: `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${entry.entNum}`,
    });
  }

  // Dedupe by matched_name + list, keep highest score
  const dedup = new Map<string, SanctionsMatch>();
  for (const h of hits) {
    const key = `${h.list_name}|${h.matched_name}`;
    const existing = dedup.get(key);
    if (!existing || h.score > existing.score) dedup.set(key, h);
  }
  return { matches: [...dedup.values()].sort((a, b) => b.score - a.score) };
}

export async function screenSanctionsOFAC(
  req: SanctionsScreenRequest,
): Promise<SanctionsScreenResult> {
  try {
    const list = await loadSdnList();

    const allMatches: SanctionsMatch[] = [];
    if (req.borrower_name) {
      allMatches.push(...screenName(list, req.borrower_name, "individual").matches);
    }
    if (req.entity_name) {
      allMatches.push(...screenName(list, req.entity_name, "entity").matches);
    }
    if (req.guarantor_name && req.guarantor_name !== req.borrower_name) {
      allMatches.push(...screenName(list, req.guarantor_name, "individual").matches);
    }

    return {
      result: allMatches.length > 0 ? "potential_match" : "clear",
      sources_searched: ["OFAC SDN"],
      matches: allMatches.slice(0, 25),
      source: "OFAC SDN (direct)",
      raw_response: {
        _adapter: "ofac",
        _list_size: list.length,
        _matches: allMatches.length,
      },
    };
  } catch (err) {
    return {
      result: "not_run",
      sources_searched: [],
      matches: [],
      source: "OFAC SDN (direct)",
      raw_response: {
        _adapter: "ofac",
        _error: true,
        _message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
