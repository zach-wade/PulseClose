// Ingest Washington L&I contractor licenses → public.contractor_licenses.
// Source: data.wa.gov Socrata dataset m8qx-ubtq (PDDL public domain, 3x/day).
// Run:  set -a; source .env.local; set +a; npx tsx scripts/ingest-contractor-wa.ts
// Idempotent — (state, license_number) PK upserts every run.

import { getClient, upsertBatch, fetchSocrata, normStatus, normName, isoDate, type ContractorRow } from "./_contractor-ingest";

const WA_URL = "https://data.wa.gov/resource/m8qx-ubtq.json";

function mapRow(r: Record<string, unknown>): ContractorRow | null {
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : null);
  const license = s("contractorlicensenumber");
  const name = s("businessname");
  if (!license || !name) return null;
  return {
    state: "WA",
    license_number: license,
    business_name: name,
    normalized_name: normName(name),
    // specialtycode1desc is the trade ("GENERAL", "PLUMBING"…); type desc is the
    // license class (CONSTRUCTION CONTRACTOR / SPECIALTY CONTRACTOR).
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
}

async function main() {
  console.log("Ingesting WA L&I contractor licenses (data.wa.gov m8qx-ubtq)…");
  const supabase = getClient();
  const rows = await fetchSocrata(WA_URL);
  const mapped = rows.map(mapRow).filter((x): x is ContractorRow => x !== null);
  console.log(`Mapped ${mapped.length}/${rows.length} rows; upserting…`);
  const { upserted, skipped } = await upsertBatch(supabase, mapped);
  console.log(`Done. WA: ${upserted} upserted, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
