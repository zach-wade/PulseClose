// Probe what real data we can actually validate right now: FL Sunbiz entities
// (partial bulk) + FL DBPR GC licenses (full bulk) + confirm CO/NY live SOS.
// Run: set -a; source .env.local; set +a; npx tsx scripts/probe-coverage-data.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // FL entities actually ingested (source fl_sunbiz)
  const { data: flEnt, count: flEntCount } = await supabase
    .from("sos_entities")
    .select("entity_name, state, status, source", { count: "exact" })
    .eq("state", "FL")
    .eq("source", "fl_sunbiz")
    .limit(8);
  console.log(`\n=== FL sos_entities (fl_sunbiz): ${flEntCount} rows ===`);
  for (const e of flEnt ?? []) console.log(`  • ${e.entity_name}  [${e.status}]`);

  // FL GC licenses
  const { data: flGc, count: flGcCount } = await supabase
    .from("contractor_licenses")
    .select("business_name, license_number, status, license_type", { count: "exact" })
    .eq("state", "FL")
    .limit(6);
  console.log(`\n=== FL contractor_licenses: ${flGcCount} rows ===`);
  for (const g of flGc ?? []) console.log(`  • ${g.business_name}  #${g.license_number}  [${g.status}]`);

  // How much total sos_entities + by source
  const { data: bySource } = await supabase.from("sos_entities").select("source");
  const counts: Record<string, number> = {};
  for (const r of bySource ?? []) counts[r.source] = (counts[r.source] ?? 0) + 1;
  console.log(`\n=== sos_entities by source ===`);
  for (const [s, n] of Object.entries(counts)) console.log(`  ${s}: ${n}`);

  // contractor_licenses by state
  const { data: gcByState } = await supabase.from("contractor_licenses").select("state");
  const gcCounts: Record<string, number> = {};
  for (const r of gcByState ?? []) gcCounts[r.state] = (gcCounts[r.state] ?? 0) + 1;
  console.log(`\n=== contractor_licenses by state ===`);
  for (const [s, n] of Object.entries(gcCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
