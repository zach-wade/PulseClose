// Smoke test for the free-SOS de-rent layer (src/lib/adapters/sos-free.ts).
// Hits live CO/NY Socrata (no key needed) + confirms CALICO is gated on a key.
// Run: npx tsx scripts/verify-sos-free.ts
import { lookupEntityFreeSOS } from "../src/lib/adapters/sos-free";

async function main() {
  const cases: { label: string; req: { entity_name: string; state: string }; expect: string }[] = [
    { label: "CO active (canonical match, suffix-insensitive)", req: { entity_name: "Pearl Street Lofts Condominium Association LLC", state: "CO" }, expect: "active" },
    { label: "CO unknown name → null (fall back to Cobalt)", req: { entity_name: "Zzqx Nonexistent Holdings LLC", state: "CO" }, expect: "null" },
    { label: "NY active feed", req: { entity_name: "Goldman Sachs Group Inc", state: "NY" }, expect: "active-or-null" },
    { label: "CA without key → null (gated)", req: { entity_name: "Apple Inc", state: "CA" }, expect: "null" },
    { label: "TX unsupported → null", req: { entity_name: "Anything LLC", state: "TX" }, expect: "null" },
  ];
  for (const c of cases) {
    const r = await lookupEntityFreeSOS(c.req, {}); // no CALICO key
    const summary = r
      ? `${r.sos_status} | ${r.entity_name} | agent=${r.registered_agent ?? "—"} | formed=${r.formation_date ?? "—"} | src=${(r.raw_response as { _source?: string })?._source}`
      : "null";
    console.log(`\n• ${c.label}\n   expect=${c.expect}\n   got=   ${summary}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
