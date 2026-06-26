// Free official Secretary-of-State sources — the de-rent layer in front of Cobalt
// (the only paid SOS source, ~$2/lookup, trial-quota-exhausted in prod).
//
// Each source is a LIVE name-query adapter, NOT a bulk load: CA via the state's
// official CALICO JSON API, CO/NY via their Socrata open-data registries. A
// resolved hit is returned to the caller (cobalt.ts lookupEntity), which writes it
// into the shared `sos_entities` cache (00050) stamped with `_source`, so repeat
// lookups, override re-runs, and warm re-validations are $0 and Cobalt is never
// paid for these states. Cobalt remains the deep fallback for every other state.
//
// Why live-query + cache instead of bulk ingest (the original RESEARCH-SOS-
// REPLACEMENT.md framing): CALICO has NO bulk endpoint (per-name search only,
// ≤150 results), and the Socrata registries are 3–4M rows EACH (CO 3.07M,
// NY 4.24M) — bulk-loading them is unjustified storage for a per-deal lookup. Live
// query is the same $0 with ~0 storage, no ingest cron, and unifies cleanly with
// CALICO's mandatory per-name model. Matches the adapter-with-fallback pattern
// (Realie→Regrid, OpenSanctions→OFAC). See ROADMAP cross-cutting principles.

import type { SOSLookupRequest, SOSLookupResult } from "./types";
import { canonicalizeName } from "@/lib/domain/upsert";

export interface FreeSOSOptions {
  /** CALICO subscription key (CA only). Free self-serve signup at calicodev.sos.ca.gov. */
  calicoKey?: string;
}

// ── canonical name matching (mirror of cobalt.ts namesMatchCanonically) ──────
// Tokenize-and-set, never substring (ROADMAP principle 8). A candidate matches if
// the smaller canonical token set is contained in the larger.
function namesMatchCanonically(a: string, b: string): boolean {
  const ca = canonicalizeName(a, { stripEntitySuffixes: true });
  const cb = canonicalizeName(b, { stripEntitySuffixes: true });
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const at = new Set(ca.split(" "));
  const bt = new Set(cb.split(" "));
  const [smaller, larger] = at.size <= bt.size ? [at, bt] : [bt, at];
  for (const t of smaller) if (!larger.has(t)) return false;
  return true;
}

// Pick the best candidate by canonical match to the query: prefer an exact
// canonical-equal name, else the first subset match, else null (no confident
// match → caller falls back to Cobalt rather than asserting a wrong entity).
function pickBest<T extends { _name: string }>(cands: T[], query: string): T | null {
  const q = canonicalizeName(query, { stripEntitySuffixes: true });
  if (!q) return null;
  let subset: T | null = null;
  for (const c of cands) {
    const cn = canonicalizeName(c._name, { stripEntitySuffixes: true });
    if (!cn) continue;
    if (cn === q) return c;
    if (!subset && namesMatchCanonically(c._name, query)) subset = c;
  }
  return subset;
}

// Socrata/ISO timestamps ("2000-10-13T00:00:00.000") → YYYY-MM-DD.
function isoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const iso = String(input).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

// ── CALICO — California SOS Business Entity Public Search API ─────────────────
// Azure APIM gateway; key in the Ocp-Apim-Subscription-Key header. Keyword search
// is "contains", caps at 150 results, no pagination. Auth failure surfaces as 503,
// no-match/bad-params as 400 — both → null (fall back to Cobalt). No filing
// history and no CA officers in this product (by design — Cobalt notes CA officers
// are excluded statewide).
const CALICO_BASE = "https://calico.sos.ca.gov/cbc/v1/api";

interface CalicoEntity {
  EntityID?: string;
  EntityName?: string;
  EntityType?: string;
  StatusCode?: number | string;
  StatusDescription?: string;
  FilingDate?: string;
  AgentName?: string;
  Jurisdiction?: string;
}

// CA status vocabulary is inconsistent between the API and the SOS website, so map
// defensively on substrings, never exact-match (research caveat).
function mapCalicoStatus(desc?: string): SOSLookupResult["sos_status"] {
  const s = (desc ?? "").toLowerCase();
  if (!s) return "not_found";
  if (s.includes("active")) return "active";
  if (s.includes("suspend") || s.includes("forfeit") || s.includes("delinquent")) return "suspended";
  if (
    s.includes("dissolv") || s.includes("cancel") || s.includes("surrender") ||
    s.includes("merged") || s.includes("converted") || s.includes("term expired") ||
    s.includes("inactive")
  ) return "dissolved";
  return "not_found";
}

async function lookupCalico(req: SOSLookupRequest, key: string): Promise<SOSLookupResult | null> {
  const params = new URLSearchParams({ "search-term": req.entity_name, "begins-with": "false" });
  const res = await fetch(`${CALICO_BASE}/BusinessEntityKeywordSearch?${params}`, {
    headers: { "Ocp-Apim-Subscription-Key": key },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    console.warn(`[sos-free] CALICO ${res.status} for "${req.entity_name}" — falling back`);
    return null;
  }
  const data = (await res.json()) as { RecordCount?: number; EntityData?: CalicoEntity[] };
  const cands = (data.EntityData ?? []).map((e) => ({ ...e, _name: e.EntityName ?? "" }));
  const best = pickBest(cands, req.entity_name);
  if (!best) return null;
  const status = mapCalicoStatus(best.StatusDescription);
  if (status === "not_found") return null;
  const flags: string[] = [];
  if (status !== "active") flags.push(`Entity status: ${best.StatusDescription ?? "inactive"}`);
  if (best.EntityName && !namesMatchCanonically(best.EntityName, req.entity_name))
    flags.push(`Registered name "${best.EntityName}" differs from search "${req.entity_name}"`);
  return {
    entity_name: best.EntityName ?? req.entity_name,
    state: "CA",
    entity_type: best.EntityType ?? null,
    sos_status: status,
    formation_date: isoDate(best.FilingDate),
    last_filing_date: null, // CALICO BE Public Search exposes no filing history.
    registered_agent: best.AgentName ?? null,
    source_url: "https://bizfileonline.sos.ca.gov/search/business",
    flags,
    raw_response: {
      _source: "ca_calico",
      _entity_id: best.EntityID ?? null,
      status_description: best.StatusDescription ?? null,
      status_code: best.StatusCode ?? null,
      results: [{ officers: [] }],
    },
  };
}

// ── Socrata open-data registries (CO, NY) ────────────────────────────────────
// Live SoQL name query against the state portal. Free, no key (SOCRATA_APP_TOKEN
// raises rate limits but isn't required at our volume).
interface SocrataSOSSource {
  state: string;
  url: string; // https://<domain>/resource/<dataset-id>.json
  nameField: string; // column matched against the borrower entity name
  map: (row: Record<string, string>, req: SOSLookupRequest) => SOSLookupResult;
}

// CO status vocabulary (verified live 2026-06-25): Good Standing / Exists = active;
// Delinquent / Noncompliant / Registered Agent Resigned / Effectiveness Prevented =
// suspended; Voluntarily/Judicially/Administratively Dissolved, Dissolved (Term
// Expired), Revoked, Withdrawn, Merged, Consolidated, Converted = dissolved.
function mapCoStatus(raw: string | undefined): SOSLookupResult["sos_status"] {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "not_found";
  if (s.includes("good standing") || s.includes("exists") || s.includes("active")) return "active";
  if (s.includes("delinquent") || s.includes("noncompliant") || s.includes("resigned") || s.includes("prevented") || s.includes("suspend"))
    return "suspended";
  if (
    s.includes("dissolv") || s.includes("revoked") || s.includes("withdrawn") || s.includes("merged") ||
    s.includes("consolidated") || s.includes("converted") || s.includes("terminated") || s.includes("expired") ||
    s.includes("cancel") || s.includes("forfeit")
  ) return "dissolved";
  return "active"; // present on file, wording unrecognized — exists ⇒ active.
}

const CO: SocrataSOSSource = {
  state: "CO",
  url: "https://data.colorado.gov/resource/4ykn-tg5h.json",
  nameField: "entityname",
  map(r, req) {
    const status = mapCoStatus(r.entitystatus);
    const person = [r.agentfirstname, r.agentmiddlename, r.agentlastname, r.agentsuffix].filter(Boolean).join(" ").trim();
    const agent = (r.agentorganizationname && r.agentorganizationname.trim()) || person || null;
    return {
      entity_name: r.entityname ?? req.entity_name,
      state: "CO",
      entity_type: r.entitytype ?? null,
      sos_status: status,
      formation_date: isoDate(r.entityformdate),
      last_filing_date: null,
      registered_agent: agent,
      source_url: "https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do",
      flags: status !== "active" ? [`Entity status: ${r.entitystatus ?? "unknown"}`] : [],
      raw_response: {
        _source: "co_socrata",
        _entity_id: r.entityid ?? null,
        status_raw: r.entitystatus ?? null,
        jurisdiction: r.jurisdictonofformation ?? null, // (sic — misspelled in source)
        results: [{ officers: [] }],
      },
    };
  },
};

// NY "Active Corporations" feed — presence ⇒ active (no status column). A miss
// (dissolved or never-existed — indistinguishable here) returns null → Cobalt
// decides, so we never assert a false "dissolved". Carries a CEO/chairman name we
// surface as an officer for the downstream sanctions screen.
const NY: SocrataSOSSource = {
  state: "NY",
  url: "https://data.ny.gov/resource/n9v6-gdp6.json",
  nameField: "current_entity_name",
  map(r, req) {
    const officers = r.chairman_name && r.chairman_name.trim() ? [{ name: r.chairman_name.trim(), title: "CEO" }] : [];
    return {
      entity_name: r.current_entity_name ?? req.entity_name,
      state: "NY",
      entity_type: r.entity_type ?? null,
      sos_status: "active",
      formation_date: isoDate(r.initial_dos_filing_date),
      last_filing_date: null,
      registered_agent: (r.registered_agent_name && r.registered_agent_name.trim()) || (r.dos_process_name && r.dos_process_name.trim()) || null,
      source_url: "https://apps.dos.ny.gov/publicInquiry/",
      flags: [],
      raw_response: {
        _source: "ny_socrata",
        _dos_id: r.dos_id ?? null,
        county: r.county ?? null,
        jurisdiction: r.jurisdiction ?? null,
        results: [{ officers }],
      },
    };
  },
};

const SOCRATA_SOURCES: Record<string, SocrataSOSSource> = { CO, NY };

// Articles + entity suffixes to drop when building the SQL pre-filter so it keys
// on the distinctive words. Client-side canonical matching (pickBest) does the
// authoritative, order-independent check afterward.
const SQL_STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "llc", "inc", "corp", "co", "company", "ltd", "lp",
  "llp", "pllc", "plc", "incorporated", "corporation", "limited", "partnership",
]);

async function lookupSocrata(src: SocrataSOSSource, req: SOSLookupRequest): Promise<SOSLookupResult | null> {
  // Build the LIKE pattern from the RAW name's significant words IN ORDER —
  // canonicalizeName sorts tokens (tokenize-and-set), which would scramble a
  // positional LIKE. Wildcards between words absorb punctuation/spacing diffs in
  // the source; pickBest then canonical-matches the ≤50 candidates client-side.
  const tokens = req.entity_name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !SQL_STOPWORDS.has(t))
    .slice(0, 3);
  if (tokens.length === 0) return null;
  const pattern = `%${tokens.join("%")}%`.replace(/'/g, "''");
  const where = `upper(${src.nameField}) like upper('${pattern}')`;
  const url = `${src.url}?$where=${encodeURIComponent(where)}&$limit=50`;
  const appToken = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: appToken ? { "X-App-Token": appToken } : {},
  });
  if (!res.ok) {
    console.warn(`[sos-free] Socrata ${src.state} ${res.status} for "${req.entity_name}" — falling back`);
    return null;
  }
  const rows = (await res.json()) as Record<string, string>[];
  const cands = rows.map((r) => ({ ...r, _name: r[src.nameField] ?? "" }));
  const best = pickBest(cands, req.entity_name);
  return best ? src.map(best, req) : null;
}

/**
 * Try the free official SOS source for `req.state` (CALICO for CA, Socrata for
 * CO/NY). Returns a resolved SOSLookupResult (stamped with `_source`) or null when
 * there's no source for the state, no confident match, or the source errored — in
 * every null case the caller (cobalt.ts) falls back to Cobalt. Never throws.
 */
export async function lookupEntityFreeSOS(
  req: SOSLookupRequest,
  opts: FreeSOSOptions,
): Promise<SOSLookupResult | null> {
  const state = (req.state ?? "").toUpperCase();
  if (!req.entity_name?.trim() || !state) return null;
  try {
    if (state === "CA") return opts.calicoKey ? await lookupCalico(req, opts.calicoKey) : null;
    const src = SOCRATA_SOURCES[state];
    if (src) return await lookupSocrata(src, req);
  } catch (err) {
    console.warn(`[sos-free] ${state} lookup error:`, err instanceof Error ? err.message : err);
  }
  return null;
}

/** States covered by a free source (CALICO requires a key to actually fire). */
export const FREE_SOS_STATES = ["CA", "CO", "NY"] as const;
