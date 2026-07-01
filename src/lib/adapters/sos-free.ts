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

// CT Business Registry "Business Master" (data.ct.gov n7gp-d28j, 1.28M rows,
// verified live 2026-06-30) — a real status column: Active / Forfeited (failed to
// file, reinstatable ⇒ suspended) / Revoked ⇒ suspended; Dissolved / Withdrawn /
// Merged / Cancelled / Expired ⇒ dissolved. Registered agent + principals live in
// sibling datasets (qh2m-n44y / ka36-64k6) keyed by account number — a later join.
function mapCtStatus(raw: string | undefined): SOSLookupResult["sos_status"] {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "not_found";
  if (s.includes("active")) return "active";
  if (s.includes("forfeit") || s.includes("revoked") || s.includes("suspend")) return "suspended";
  if (
    s.includes("dissolv") || s.includes("withdrawn") || s.includes("merged") ||
    s.includes("cancel") || s.includes("expired") || s.includes("terminated")
  ) return "dissolved";
  return "active"; // on file, wording unrecognized ⇒ exists.
}

const CT: SocrataSOSSource = {
  state: "CT",
  url: "https://data.ct.gov/resource/n7gp-d28j.json",
  nameField: "name",
  map(r, req) {
    const status = mapCtStatus(r.status);
    return {
      entity_name: r.name ?? req.entity_name,
      state: "CT",
      entity_type: null,
      sos_status: status,
      formation_date: isoDate(r.date_registration),
      last_filing_date: null,
      registered_agent: null, // sibling dataset (qh2m-n44y) join — follow-up
      source_url: "https://service.ct.gov/business/s/onlinebusinesssearch",
      flags: status !== "active" ? [`Entity status: ${r.status ?? "unknown"}`] : [],
      raw_response: {
        _source: "ct_socrata",
        _account_number: r.accountnumber ?? null,
        status_raw: r.status ?? null,
        results: [{ officers: [] }],
      },
    };
  },
};

// PA Dept. of State "Registered Businesses — Current" (data.pa.gov xvd7-5r2c, 4.0M
// rows, verified live) — a CURRENT-only export, so presence ⇒ active (a miss ⇒
// null ⇒ Cobalt, never a false "dissolved"). One row per officer (`party_type`),
// so pickBest returns one matching-name row; formation = creationdate. No agent.
const PA: SocrataSOSSource = {
  state: "PA",
  url: "https://data.pa.gov/resource/xvd7-5r2c.json",
  nameField: "business_name",
  map(r, req) {
    return {
      entity_name: r.business_name ?? req.entity_name,
      state: "PA",
      entity_type: r.typeofbusinessregistration ?? null,
      sos_status: "active",
      formation_date: isoDate(r.creationdate),
      last_filing_date: null,
      registered_agent: null,
      source_url: "https://file.dos.pa.gov/search/business",
      flags: [],
      raw_response: {
        _source: "pa_socrata",
        _filing_number: r.filing_number ?? null,
        results: [{ officers: [] }],
      },
    };
  },
};

// OR SOS "Active Businesses — ALL" (data.oregon.gov tckn-sxa6, verified live) — an
// ACTIVE-only export ⇒ presence ⇒ active (miss ⇒ null ⇒ Cobalt). Multiple rows per
// business (associated_name_type: registered agent / principal / mailing), so
// pickBest returns one matching-name row for status + formation + entity type.
const OR: SocrataSOSSource = {
  state: "OR",
  url: "https://data.oregon.gov/resource/tckn-sxa6.json",
  nameField: "business_name",
  map(r, req) {
    return {
      entity_name: r.business_name ?? req.entity_name,
      state: "OR",
      entity_type: r.entity_type ?? null,
      sos_status: "active",
      formation_date: isoDate(r.registry_date),
      last_filing_date: null,
      registered_agent: null,
      source_url: "https://sos.oregon.gov/business/pages/find.aspx",
      flags: [],
      raw_response: {
        _source: "or_socrata",
        _registry_number: r.registry_number ?? null,
        results: [{ officers: [] }],
      },
    };
  },
};

const SOCRATA_SOURCES: Record<string, SocrataSOSSource> = { CO, NY, CT, PA, OR };

// ── NY DOS live entity search (publicInquiry API) ────────────────────────────
// The Socrata "Active Corporations" export LEAKS — it's missing real, active NY
// entities (confirmed: "L Y I LLC", active since 2012, absent from Socrata but
// present here). This is the authoritative live database behind apps.dos.ny.gov/
// publicInquiry. It's a plain cookieless JSON POST (the SPA renders blank headless,
// but the API has no bot protection) and — unlike Socrata — returns a real
// Active/Inactive status. Used as the NY fallback when Socrata misses.
const NY_DOS_API = "https://apps.dos.ny.gov/PublicInquiryWeb/api/PublicInquiry/GetComplexSearchMatchingEntities";

interface NyDosEntity {
  entityName?: string;
  dosID?: string;
  initialFilingDate?: string;
  county?: string;
  entityType?: string;
  entityStatus?: string; // "Active" | "Inactive"
  jurisdiction?: string;
  entityTypeCategory?: string;
}

function mapNyDosStatus(s?: string): SOSLookupResult["sos_status"] {
  const v = (s ?? "").toLowerCase();
  if (v === "active") return "active";
  if (v === "inactive") return "dissolved"; // NY collapses dissolved/merged/cancelled → Inactive
  return "not_found";
}

async function lookupNyDosLive(req: SOSLookupRequest): Promise<SOSLookupResult | null> {
  const res = await fetch(NY_DOS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://apps.dos.ny.gov",
      Referer: "https://apps.dos.ny.gov/publicInquiry/",
    },
    body: JSON.stringify({
      searchValue: req.entity_name,
      searchByTypeIndicator: "EntityName",
      searchExpressionIndicator: "Contains",
      entityStatusIndicator: "AllStatuses",
      entityTypeIndicator: ["Corporation", "LimitedLiabilityCompany", "LimitedPartnership", "LimitedLiabilityPartnership"],
      listPaginationInfo: { listStartRecord: 1, listEndRecord: 50 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    console.warn(`[sos-free] NY DOS live ${res.status} for "${req.entity_name}" — falling back`);
    return null;
  }
  const data = (await res.json()) as { requestStatus?: string; entitySearchResultList?: NyDosEntity[] };
  const cands = (data.entitySearchResultList ?? []).map((e) => ({ ...e, _name: e.entityName ?? "" }));
  const best = pickBest(cands, req.entity_name);
  if (!best) return null;
  const status = mapNyDosStatus(best.entityStatus);
  if (status === "not_found") return null;
  const flags: string[] = [];
  if (status !== "active") flags.push(`Entity status: ${best.entityStatus ?? "inactive"}`);
  if (best.entityName && !namesMatchCanonically(best.entityName, req.entity_name))
    flags.push(`Registered name "${best.entityName}" differs from search "${req.entity_name}"`);
  return {
    entity_name: best.entityName ?? req.entity_name,
    state: "NY",
    entity_type: best.entityType ?? best.entityTypeCategory ?? null,
    sos_status: status,
    formation_date: isoDate(best.initialFilingDate),
    last_filing_date: null,
    registered_agent: null, // not in the search result; a detail call (by dosID) could add it later
    source_url: "https://apps.dos.ny.gov/publicInquiry/",
    flags,
    raw_response: {
      _source: "ny_dos_live",
      _dos_id: best.dosID ?? null,
      county: best.county ?? null,
      jurisdiction: best.jurisdiction ?? null,
      status_raw: best.entityStatus ?? null,
      results: [{ officers: [] }],
    },
  };
}

// ── TX Comptroller franchise-tax lookup (free, no-auth JSON) ─────────────────
// Texas SOS itself (SOSDirect) charges $1/search, but the Comptroller's public
// "Franchise Tax Account Status" search — which every TX corp/LLC must register
// for — is backed by an OPEN, keyless JSON API (verified live 2026-06-30). Two
// hops mirror the NY DOS pattern: name search → detail by taxpayer number. The
// detail record carries the good-standing signal ("right to transact business"),
// SOS file number, registered agent, AND officers. The one field it does NOT give
// reliably is a true formation date — `effectiveSosRegistrationDate` is the
// CURRENT registration effective date (a renewal re-stamps it; Dell reads 2026),
// so we deliberately leave formation_date null rather than print a wrong year.
// Undocumented/scraping-grade → wrapped in try/catch, falls back to Cobalt.
const TX_CPA_BASE = "https://comptroller.texas.gov/data-search/franchise-tax";

interface TxCpaListRow {
  name?: string;
  taxpayerId?: string;
  mailingAddressZip?: string;
}
interface TxCpaOfficer {
  AGNT_NM?: string;
  AGNT_TITL_TX?: string;
}
interface TxCpaDetail {
  name?: string;
  taxpayerId?: string;
  rightToTransactTX?: string;
  sosRegistrationStatus?: string;
  sosFileNumber?: string;
  effectiveSosRegistrationDate?: string;
  stateOfFormation?: string;
  registeredAgentName?: string;
  officerInfo?: TxCpaOfficer[];
}

// TX status: SOS "INACTIVE" ⇒ dissolved; a live right-to-transact ⇒ active;
// franchise-tax rights "ENDED"/"FORFEITED" while SOS still lists it ⇒ suspended.
function mapTxStatus(rightToTransact?: string, sosStatus?: string): SOSLookupResult["sos_status"] {
  const rtt = (rightToTransact ?? "").toUpperCase().trim();
  const sos = (sosStatus ?? "").toUpperCase().trim();
  if (sos === "INACTIVE") return "dissolved";
  if (rtt === "ACTIVE") return "active";
  if (rtt.includes("ENDED") || rtt.includes("FORFEIT")) return "suspended";
  if (sos === "ACTIVE") return "active";
  return "not_found";
}

async function lookupTxComptroller(req: SOSLookupRequest): Promise<SOSLookupResult | null> {
  const name = req.entity_name.trim();
  if (name.length < 2) return null;
  // Hop 1: name search → candidate list ({name, taxpayerId, zip}).
  const listRes = await fetch(`${TX_CPA_BASE}?name=${encodeURIComponent(name)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!listRes.ok) {
    console.warn(`[sos-free] TX CPA list ${listRes.status} for "${name}" — falling back`);
    return null;
  }
  const list = (await listRes.json()) as { success?: boolean; data?: TxCpaListRow[] };
  if (!list.success || !list.data?.length) return null;
  const cands = list.data.map((e) => ({ ...e, _name: e.name ?? "" }));
  const best = pickBest(cands, name);
  if (!best?.taxpayerId) return null;

  // Hop 2: detail by taxpayer number → status + agent + officers.
  const detRes = await fetch(`${TX_CPA_BASE}/${encodeURIComponent(best.taxpayerId)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!detRes.ok) {
    console.warn(`[sos-free] TX CPA detail ${detRes.status} for "${name}" — falling back`);
    return null;
  }
  const det = (await detRes.json()) as { success?: boolean; data?: TxCpaDetail };
  if (!det.success || !det.data) return null;
  const d = det.data;
  const status = mapTxStatus(d.rightToTransactTX, d.sosRegistrationStatus);
  if (status === "not_found") return null;

  const officers = (d.officerInfo ?? [])
    .filter((o) => o.AGNT_NM?.trim())
    .map((o) => ({ name: o.AGNT_NM!.trim(), title: (o.AGNT_TITL_TX ?? "").trim() }));

  const flags: string[] = [];
  if (status !== "active")
    flags.push(`Entity status: ${d.rightToTransactTX ?? d.sosRegistrationStatus ?? "inactive"}`);
  if (d.name && !namesMatchCanonically(d.name, name))
    flags.push(`Registered name "${d.name}" differs from search "${name}"`);

  return {
    entity_name: d.name ?? name,
    state: "TX",
    entity_type: null,
    sos_status: status,
    formation_date: null, // effectiveSosRegistrationDate is a renewal date, not formation
    last_filing_date: null,
    registered_agent: d.registeredAgentName?.trim() || null,
    source_url: `${TX_CPA_BASE.replace("/data-search/franchise-tax", "/taxes/franchise/account-status/search")}/${best.taxpayerId}`,
    flags,
    raw_response: {
      _source: "tx_comptroller",
      sos_file_number: d.sosFileNumber ?? null,
      right_to_transact: d.rightToTransactTX ?? null,
      sos_registration_status: d.sosRegistrationStatus ?? null,
      effective_registration_date: d.effectiveSosRegistrationDate ?? null,
      taxpayer_id: best.taxpayerId,
      results: [{ officers }],
    },
  };
}

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
  const allTokens = req.entity_name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 1 && !SQL_STOPWORDS.has(t));
  // Prefer multi-char tokens, but DON'T drop single-letter ones if that's all
  // there is — e.g. "L Y I LLC" tokenizes to ["l","y","i"] (llc is a stopword);
  // the old `length >= 2` filter emptied it and returned null WITHOUT querying.
  const significant = allTokens.filter((t) => t.length >= 2);
  const tokens = (significant.length > 0 ? significant : allTokens).slice(0, 4);
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

// ── DC DLCP corporate registry (ArcGIS FeatureServer, free, no-auth) ─────────
// DC publishes its full corporate register as an open Esri FeatureServer (verified
// live 2026-06-30, ~500k rows, datacenter-IP-friendly). Richer than the PA/OR
// presence-only feeds: real status vocab + formation date + registered agent.
const DC_FEATURESERVER =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer/0/query";

interface DcAttributes {
  BUSINESS_NAME?: string;
  ENTITY_STATUS?: string;
  EFFECTIVE_DATE?: number; // epoch ms
  RA_NAME?: string;
  MODELTYPE?: string;
  FILE_NUMBER?: string;
}

function mapDcStatus(raw?: string): SOSLookupResult["sos_status"] {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "not_found";
  if (s.includes("not in good standing")) return "suspended";
  if (s.includes("active")) return "active";
  if (s.includes("revoked")) return "suspended";
  if (
    s.includes("dissolv") || s.includes("terminated") || s.includes("cancel") ||
    s.includes("merged") || s.includes("consolidated") || s.includes("converted") ||
    s.includes("domesticated") || s.includes("withdrawn")
  ) return "dissolved";
  return "active";
}

async function lookupDcArcgis(req: SOSLookupRequest): Promise<SOSLookupResult | null> {
  // Build a positional LIKE from the name's significant tokens (same idea as the
  // Socrata path; pickBest canonical-matches the ≤50 candidates afterward).
  const tokens = req.entity_name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !SQL_STOPWORDS.has(t))
    .slice(0, 4);
  if (tokens.length === 0) return null;
  const pattern = `%${tokens.join("%")}%`.replace(/'/g, "''");
  const where = `UPPER(BUSINESS_NAME) LIKE UPPER('${pattern}')`;
  const params = new URLSearchParams({
    where,
    outFields: "BUSINESS_NAME,ENTITY_STATUS,EFFECTIVE_DATE,RA_NAME,MODELTYPE,FILE_NUMBER",
    returnGeometry: "false",
    resultRecordCount: "50",
    f: "json",
  });
  const res = await fetch(`${DC_FEATURESERVER}?${params}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    console.warn(`[sos-free] DC ArcGIS ${res.status} for "${req.entity_name}" — falling back`);
    return null;
  }
  const data = (await res.json()) as { features?: { attributes: DcAttributes }[] };
  const cands = (data.features ?? []).map((f) => ({ ...f.attributes, _name: f.attributes.BUSINESS_NAME ?? "" }));
  const best = pickBest(cands, req.entity_name);
  if (!best) return null;
  const status = mapDcStatus(best.ENTITY_STATUS);
  if (status === "not_found") return null;
  const formation =
    typeof best.EFFECTIVE_DATE === "number" ? new Date(best.EFFECTIVE_DATE).toISOString().slice(0, 10) : null;
  const flags: string[] = [];
  if (status !== "active") flags.push(`Entity status: ${best.ENTITY_STATUS ?? "inactive"}`);
  if (best.BUSINESS_NAME && !namesMatchCanonically(best.BUSINESS_NAME, req.entity_name))
    flags.push(`Registered name "${best.BUSINESS_NAME}" differs from search "${req.entity_name}"`);
  return {
    entity_name: best.BUSINESS_NAME ?? req.entity_name,
    state: "DC",
    entity_type: best.MODELTYPE ?? null,
    sos_status: status,
    formation_date: formation,
    last_filing_date: null,
    registered_agent: best.RA_NAME?.trim() || null,
    source_url: "https://corponline.dcra.dc.gov/Home.aspx/Landing",
    flags,
    raw_response: {
      _source: "dc_arcgis",
      _file_number: best.FILE_NUMBER ?? null,
      status_raw: best.ENTITY_STATUS ?? null,
      results: [{ officers: [] }],
    },
  };
}

// ── "FirstStop" SOS platform (ID, ND — shared PCC/Tyler backend) ─────────────
// Several states run the identical "firststop" filing system with an OPEN, no-auth
// JSON search API (verified live 2026-06-30, datacenter-IP-friendly). One adapter,
// keyed by host. Response: { rows: { [i]: { TITLE:[name, type], FILING_DATE, AGENT,
// STATUS, STANDING, ... } } }. (MT runs the same app but is Cloudflare-walled; NM
// is the same family but session-gated — those stay on Cobalt.)
const FIRSTSTOP_HOSTS: Record<string, { host: string; source: string; url: string }> = {
  ID: { host: "sosbiz.idaho.gov", source: "id_firststop", url: "https://sosbiz.idaho.gov/search/business" },
  ND: { host: "firststop.sos.nd.gov", source: "nd_firststop", url: "https://firststop.sos.nd.gov/search/business" },
};

// MM/DD/YYYY → YYYY-MM-DD (firststop + several other free feeds use US dates).
function usDateToIso(s?: string): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : isoDate(s);
}

function mapFirstStopStatus(status?: string, standing?: string): SOSLookupResult["sos_status"] {
  const s = (status ?? "").toLowerCase();
  const st = (standing ?? "").toLowerCase();
  if (!s) return "not_found";
  if (s.includes("active")) return st && !st.includes("good") ? "suspended" : "active";
  if (
    s.includes("dissolv") || s.includes("terminated") || s.includes("withdrawn") ||
    s.includes("revoked") || s.includes("expired") || s.includes("inactive") || s.includes("cancel")
  ) return "dissolved";
  return "active";
}

interface FirstStopRow {
  TITLE?: [string, string];
  FILING_DATE?: string;
  AGENT?: string;
  STATUS?: string;
  STANDING?: string;
  RECORD_NUM?: string;
}

async function lookupFirstStop(req: SOSLookupRequest, state: string): Promise<SOSLookupResult | null> {
  const cfg = FIRSTSTOP_HOSTS[state];
  if (!cfg) return null;
  const res = await fetch(`https://${cfg.host}/api/Records/businesssearch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ SEARCH_VALUE: req.entity_name, STARTS_WITH: "N", SEARCH_TYPE: "BUSINESS" }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    console.warn(`[sos-free] ${cfg.source} ${res.status} for "${req.entity_name}" — falling back`);
    return null;
  }
  const data = (await res.json()) as { rows?: Record<string, FirstStopRow> };
  // TITLE[0] is "NAME (recordnum)" — strip the trailing id for clean matching.
  const cleanName = (t?: string) => (t ?? "").replace(/\s*\(\d+\)\s*$/, "").trim();
  const cands = Object.values(data.rows ?? {}).map((r) => ({ ...r, _name: cleanName(r.TITLE?.[0]) }));
  const best = pickBest(cands, req.entity_name);
  if (!best) return null;
  const status = mapFirstStopStatus(best.STATUS, best.STANDING);
  if (status === "not_found") return null;
  const agent = best.AGENT && !/^no agent$/i.test(best.AGENT.trim()) ? best.AGENT.trim() : null;
  const flags: string[] = [];
  if (status !== "active") flags.push(`Entity status: ${best.STATUS ?? "inactive"}${best.STANDING ? ` (${best.STANDING})` : ""}`);
  return {
    entity_name: cleanName(best.TITLE?.[0]) || req.entity_name,
    state,
    entity_type: best.TITLE?.[1] ?? null,
    sos_status: status,
    formation_date: usDateToIso(best.FILING_DATE),
    last_filing_date: null,
    registered_agent: agent,
    source_url: cfg.url,
    flags,
    raw_response: {
      _source: cfg.source,
      _record_num: best.RECORD_NUM ?? null,
      status_raw: best.STATUS ?? null,
      standing_raw: best.STANDING ?? null,
      results: [{ officers: [] }],
    },
  };
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
    if (src) {
      const hit = await lookupSocrata(src, req);
      if (hit) return hit;
    }
    // NY: the Socrata export leaks (misses real active entities), so fall back to
    // the authoritative live DOS API — free, cookieless, and status-bearing.
    if (state === "NY") return await lookupNyDosLive(req);
    // TX: SOSDirect is paid, but the Comptroller's franchise-tax status search is
    // a free, keyless JSON API — de-rents Cobalt for TX (the 2nd-biggest ICC state).
    if (state === "TX") return await lookupTxComptroller(req);
    // DC: open ArcGIS FeatureServer — status + formation + registered agent.
    if (state === "DC") return await lookupDcArcgis(req);
    // ID / ND: the "firststop" SOS platform's open JSON search API.
    if (FIRSTSTOP_HOSTS[state]) return await lookupFirstStop(req, state);
  } catch (err) {
    console.warn(`[sos-free] ${state} lookup error:`, err instanceof Error ? err.message : err);
  }
  return null;
}

/** States covered by a free source (CALICO requires a key to actually fire). */
export const FREE_SOS_STATES = ["CA", "CO", "CT", "DC", "ID", "ND", "NY", "OR", "PA", "TX"] as const;
