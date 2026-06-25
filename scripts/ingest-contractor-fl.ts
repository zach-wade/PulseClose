// Ingest Florida DBPR construction licensees → public.contractor_licenses.
// Source: CONSTRUCTIONLICENSE_1.csv (active/inactive/voluntarily-inactive),
// weekly, Ch.119 public records. Headerless, positional, quote/comma delimited.
// Run:  set -a; source .env.local; set +a; npx tsx scripts/ingest-contractor-fl.ts
//
// Column layout (0-indexed), verified from the live file:
//  0 board  1 typeCode(CGC/CBC/CRC/RG…)  2 personName  3 dbaName  4 -  5 addr1
//  6 - 7 -  8 city  9 state 10 zip 11 county 12 shortLicNum 13 classCode
//  14 primaryStatus(A/I) 15 origLicensure 16 effective 17 expiration
//  18 - 19 -  20 fullLicenseNumber(e.g. CGC006231)  21 -

import { getClient, upsertBatch, parseCsv, normName, isoDate, type ContractorRow } from "./_contractor-ingest";

const FL_URL = "https://www2.myfloridalicense.com/sto/file_download/extracts/CONSTRUCTIONLICENSE_1.csv";

// Florida construction license-type codes → readable. Certified (state-wide) +
// Registered (local-scope). "General" = CGC/RG; we keep all construction types.
const TYPE_DESC: Record<string, string> = {
  CGC: "Certified General Contractor",
  CBC: "Certified Building Contractor",
  CRC: "Certified Residential Contractor",
  RG: "Registered General Contractor",
  RB: "Registered Building Contractor",
  RR: "Registered Residential Contractor",
};

function mapRow(f: string[]): ContractorRow | null {
  const g = (i: number) => (f[i] ?? "").trim();
  const license = g(20) || g(12);
  if (!license) return null;
  const dba = g(3);
  const person = g(2);
  const name = dba || person;
  if (!name) return null;
  const typeCode = g(1);
  const primary = g(14).toUpperCase();
  const status = primary === "A" ? "active" : primary === "I" ? "inactive" : "unknown";
  return {
    state: "FL",
    license_number: license,
    business_name: name,
    normalized_name: normName(name),
    license_type: TYPE_DESC[typeCode] ?? (typeCode || null),
    status,
    status_raw: primary || null,
    effective_date: isoDate(g(16)),
    expiration_date: isoDate(g(17)),
    city: g(8) || null,
    zip: g(10) || null,
    source: "fl_dbpr",
    raw: { typeCode, person, dba, classCode: g(13) },
  };
}

async function main() {
  console.log("Ingesting FL DBPR construction licensees (CONSTRUCTIONLICENSE_1.csv)…");
  const supabase = getClient();
  const res = await fetch(FL_URL, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`FL download ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  console.log(`Downloaded ${rows.length} CSV rows; mapping…`);
  const mapped = rows.map(mapRow).filter((x): x is ContractorRow => x !== null);
  console.log(`Mapped ${mapped.length}; upserting…`);
  const { upserted, skipped } = await upsertBatch(supabase, mapped);
  console.log(`Done. FL: ${upserted} upserted, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
