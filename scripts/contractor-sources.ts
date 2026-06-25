// Registry of state contractor-license bulk sources. Adding a state = add one
// entry here (URL + field mapper); the generic runner (ingest-contractors.ts)
// handles fetch + upsert. See docs/RESEARCH-GC-VALIDATION.md.
//
// kind "socrata" → JSON object rows (data.wa.gov, data.oregon.gov, …).
// kind "csv"     → positional/quoted CSV string[] rows (board file downloads).

import { normStatus, normName, isoDate, type ContractorRow } from "./_contractor-ingest";

export interface SocrataSource {
  state: string;
  source: string;
  kind: "socrata";
  url: string;
  map: (r: Record<string, unknown>) => ContractorRow | null;
}
export interface CsvSource {
  state: string;
  source: string;
  kind: "csv";
  url: string;
  map: (r: string[]) => ContractorRow | null;
}
export type StateSource = SocrataSource | CsvSource;

// ── WA — L&I Socrata (m8qx-ubtq), PDDL public domain, 3x/day ──────────────────
const WA: SocrataSource = {
  state: "WA",
  source: "wa_lni",
  kind: "socrata",
  url: "https://data.wa.gov/resource/m8qx-ubtq.json",
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
const FL: CsvSource = {
  state: "FL",
  source: "fl_dbpr",
  kind: "csv",
  url: "https://www2.myfloridalicense.com/sto/file_download/extracts/CONSTRUCTIONLICENSE_1.csv",
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

export const SOURCES: StateSource[] = [WA, OR, FL];
