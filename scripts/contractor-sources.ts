// Registry of state contractor-license bulk sources. Adding a state = add one
// entry here (URL + field mapper); the generic runner (ingest-contractors.ts)
// handles fetch + upsert. See docs/RESEARCH-GC-VALIDATION.md.
//
// kind "socrata" → JSON object rows (data.wa.gov, data.oregon.gov, …).
// kind "csv"     → positional/quoted CSV string[] rows (board file downloads).

import { normStatus, normName, isoDate, type ContractorRow } from "./_contractor-ingest";

// How often the upstream source refreshes — drives which scheduled job runs it.
// Adding a state with a `refresh` value auto-joins the matching cron (the runner
// filters by it); no schedule edit needed. Map source cadence → our buckets:
// WA is 3×/day and OR daily → "daily"; FL weekly and VA ~weekly → "weekly".
export type RefreshCadence = "daily" | "weekly";

export interface SocrataSource {
  state: string;
  source: string;
  kind: "socrata";
  url: string;
  refresh: RefreshCadence;
  map: (r: Record<string, unknown>) => ContractorRow | null;
}
export interface DelimitedSource {
  state: string;
  source: string;
  kind: "delimited";
  urls: string[];          // one or more files (VA splits Class A/B/C into separate files)
  delimiter: string;       // "," (FL) | "\t" (VA)
  header: boolean;         // skip the first row?
  refresh: RefreshCadence;
  map: (r: string[]) => ContractorRow | null;
}
export type StateSource = SocrataSource | DelimitedSource;

// ── WA — L&I Socrata (m8qx-ubtq), PDDL public domain, 3x/day ──────────────────
const WA: SocrataSource = {
  state: "WA",
  source: "wa_lni",
  kind: "socrata",
  url: "https://data.wa.gov/resource/m8qx-ubtq.json",
  refresh: "daily", // L&I updates 3x/day
  map(r) {
    const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : null);
    const license = s("contractorlicensenumber");
    const name = s("businessname");
    if (!license || !name) return null;
    return {
      state: "WA",
      license_number: license,
      business_name: name,
      normalized_name: normName(name),
      license_type: s("specialtycode1desc") ?? s("contractorlicensetypecodedesc"),
      status: normStatus(s("contractorlicensestatus") ?? s("statuscode")),
      status_raw: s("contractorlicensestatus"),
      effective_date: isoDate(s("licenseeffectivedate")),
      expiration_date: isoDate(s("licenseexpirationdate")),
      city: s("city"),
      zip: s("zip"),
      source: "wa_lni",
      raw: r,
    };
  },
};

// ── OR — CCB Socrata (g77e-6bhs), public domain, daily; active-only dataset ───
const OR: SocrataSource = {
  state: "OR",
  source: "or_ccb",
  kind: "socrata",
  url: "https://data.oregon.gov/resource/g77e-6bhs.json",
  refresh: "daily", // CCB open data daily
  map(r) {
    const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : null);
    const license = s("license_number");
    const name = s("full_name");
    if (!license || !name) return null;
    return {
      state: "OR",
      license_number: license,
      business_name: name,
      normalized_name: normName(name),
      license_type: s("endorsement_text") ?? s("license_type"),
      status: "active", // "CCB Active Licenses" dataset — all rows are active
      status_raw: s("license_type"),
      effective_date: isoDate(s("orig_regis_date")),
      expiration_date: isoDate(s("lic_exp_date")),
      city: s("city"),
      zip: s("zip_code"),
      source: "or_ccb",
      raw: r,
    };
  },
};

// ── FL — DBPR CONSTRUCTIONLICENSE_1.csv, weekly, Ch.119 public ────────────────
// Headerless positional: 1 typeCode 2 person 3 dba 5 addr1 8 city 10 zip
// 12 shortLic 14 status(A/I) 16 effective 17 expiration 20 fullLicenseNumber
const FL_TYPE_DESC: Record<string, string> = {
  CGC: "Certified General Contractor",
  CBC: "Certified Building Contractor",
  CRC: "Certified Residential Contractor",
  RG: "Registered General Contractor",
  RB: "Registered Building Contractor",
  RR: "Registered Residential Contractor",
};
const FL: DelimitedSource = {
  state: "FL",
  source: "fl_dbpr",
  kind: "delimited",
  urls: ["https://www2.myfloridalicense.com/sto/file_download/extracts/CONSTRUCTIONLICENSE_1.csv"],
  delimiter: ",",
  header: false,
  refresh: "weekly", // DBPR weekly
  map(f) {
    const g = (i: number) => (f[i] ?? "").trim();
    const license = g(20) || g(12);
    const name = g(3) || g(2);
    if (!license || !name) return null;
    const typeCode = g(1);
    const primary = g(14).toUpperCase();
    const status = primary === "A" ? "active" : primary === "I" ? "inactive" : "unknown";
    return {
      state: "FL",
      license_number: license,
      business_name: name,
      normalized_name: normName(name),
      license_type: FL_TYPE_DESC[typeCode] ?? (typeCode || null),
      status,
      status_raw: primary || null,
      effective_date: isoDate(g(16)),
      expiration_date: isoDate(g(17)),
      city: g(8) || null,
      zip: g(10) || null,
      source: "fl_dbpr",
      raw: { typeCode, person: g(2), dba: g(3), classCode: g(13) },
    };
  },
};

// ── VA — DPOR Board for Contractors regulant lists, tab-delimited .txt, free,
// refreshed every 5 business days. Class A/B/C split across files; all are
// "__crnt" (current = active) lists. 20-col header. Path: "Regulant List".
// Cols: 2 CERTIFICATE#  3 INDIVIDUAL NAME  4 BUSINESS NAME  8 CITY  9 STATE
// 10 ZIP  15 EXPIRATION  16 CERTIFICATION  17 RANK(A/B/C)  18 SPECIALTY
const VA_BASE = "https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List";
const VA: DelimitedSource = {
  state: "VA",
  source: "va_dpor",
  kind: "delimited",
  urls: ["2701", "2705a", "2705b", "2705c"].map((c) => `${VA_BASE}/${c}__crnt.txt`),
  delimiter: "\t",
  header: true,
  refresh: "weekly", // DPOR every 5 business days
  map(f) {
    const g = (i: number) => (f[i] ?? "").trim();
    const license = g(2);
    const name = g(4) || g(3);
    if (!license || !name) return null;
    const rank = g(17);
    const specialty = g(18);
    return {
      state: "VA",
      license_number: license,
      business_name: name,
      normalized_name: normName(name),
      license_type: [rank ? `Class ${rank}` : null, specialty || null].filter(Boolean).join(" — ") || null,
      // "__crnt" files are the current/active regulant lists.
      status: "active",
      status_raw: rank || null,
      effective_date: isoDate(g(16)),
      expiration_date: isoDate(g(15)),
      city: g(8) || null,
      zip: g(10) || null,
      source: "va_dpor",
      raw: { rank, specialty, occupation: g(1), individual: g(3) },
    };
  },
};

export const SOURCES: StateSource[] = [WA, OR, FL, VA];
