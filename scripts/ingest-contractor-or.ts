// Ingest Oregon CCB contractor licenses → public.contractor_licenses.
// Source: data.oregon.gov Socrata dataset g77e-6bhs ("CCB Active Licenses",
// public domain, daily). This dataset is ACTIVE licenses only.
// Run:  set -a; source .env.local; set +a; npx tsx scripts/ingest-contractor-or.ts

import { getClient, upsertBatch, fetchSocrata, normName, isoDate, type ContractorRow } from "./_contractor-ingest";

const OR_URL = "https://data.oregon.gov/resource/g77e-6bhs.json";

function mapRow(r: Record<string, unknown>): ContractorRow | null {
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : null);
  const license = s("license_number");
  const name = s("full_name");
  if (!license || !name) return null;
  return {
    state: "OR",
    license_number: license,
    business_name: name,
    normalized_name: normName(name),
    // license_type e.g. "RGC" (Residential General Contractor); endorsement_text
    // is the readable form ("Residential General Contractor").
    license_type: s("endorsement_text") ?? s("license_type"),
    // The dataset is "CCB Active Licenses" — every row is an active registration.
    status: "active",
    status_raw: s("license_type"),
    effective_date: isoDate(s("orig_regis_date")),
    expiration_date: isoDate(s("lic_exp_date")),
    city: s("city"),
    zip: s("zip_code"),
    source: "or_ccb",
    raw: r,
  };
}

async function main() {
  console.log("Ingesting OR CCB contractor licenses (data.oregon.gov g77e-6bhs)…");
  const supabase = getClient();
  const rows = await fetchSocrata(OR_URL);
  const mapped = rows.map(mapRow).filter((x): x is ContractorRow => x !== null);
  console.log(`Mapped ${mapped.length}/${rows.length} rows; upserting…`);
  const { upserted, skipped } = await upsertBatch(supabase, mapped);
  console.log(`Done. OR: ${upserted} upserted, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
