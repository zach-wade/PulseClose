// Generic contractor-license ingest runner. Reads the source registry
// (contractor-sources.ts) and ingests one state or all.
//
// Run:  set -a; source .env.local; set +a; npx tsx scripts/ingest-contractors.ts [STATE|all]
//   npx tsx scripts/ingest-contractors.ts WA      # one state
//   npx tsx scripts/ingest-contractors.ts all     # every registered source
//
// Idempotent — (state, license_number) PK upserts. Adding a state is a one-entry
// change in contractor-sources.ts; no new script.

import { getClient, upsertBatch, fetchSocrata, parseCsv, type ContractorRow } from "./_contractor-ingest";
import { SOURCES, type StateSource } from "./contractor-sources";

async function runSource(supabase: ReturnType<typeof getClient>, src: StateSource): Promise<void> {
  console.log(`\n── ${src.state} (${src.source}) ──`);
  let mapped: ContractorRow[];
  if (src.kind === "socrata") {
    const rows = await fetchSocrata(src.url);
    mapped = rows.map(src.map).filter((x): x is ContractorRow => x !== null);
    console.log(`Mapped ${mapped.length}/${rows.length}; upserting…`);
  } else {
    const res = await fetch(src.url, { signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`${src.state} download ${res.status}`);
    const rows = parseCsv(await res.text());
    mapped = rows.map(src.map).filter((x): x is ContractorRow => x !== null);
    console.log(`Downloaded ${rows.length} rows; mapped ${mapped.length}; upserting…`);
  }
  const { upserted, skipped } = await upsertBatch(supabase, mapped);
  console.log(`Done. ${src.state}: ${upserted} upserted, ${skipped} skipped.`);
}

async function main() {
  const arg = (process.argv[2] ?? "all").toLowerCase();
  const targets =
    arg === "all" ? SOURCES : SOURCES.filter((s) => s.state.toLowerCase() === arg);
  if (targets.length === 0) {
    console.error(`No source for "${arg}". Registered: ${SOURCES.map((s) => s.state).join(", ")}`);
    process.exit(1);
  }
  const supabase = getClient();
  for (const src of targets) {
    try {
      await runSource(supabase, src);
    } catch (e) {
      console.error(`${src.state} FAILED:`, e instanceof Error ? e.message : e);
    }
  }
  console.log("\nAll done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
