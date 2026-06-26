// Analyze the ICC Nexys export: formation-state distribution across the whole
// book → what SOS coverage gets us to 90% free, and which loans run free today.
// Run: npx tsx scripts/analyze-icc-coverage.ts "/Users/zachwade/Downloads/Loan Report - All Loan Report.csv"
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "/Users/zachwade/Downloads/Loan Report - All Loan Report.csv";

// Minimal RFC-4180 CSV line parser (handles quoted fields w/ commas).
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const raw = readFileSync(path, "utf8").split(/\r?\n/);
const headerIdx = raw.findIndex((l) => l.startsWith('"Loan #"') || l.startsWith("Loan #"));
const header = parseLine(raw[headerIdx]);
const col = (name: string) => header.findIndex((h) => h.trim() === name);

const C = {
  loan: col("Loan #"),
  borrower: col("Borrower"),
  propState: col("State"),
  status: col("Status"),
  product: col("Product"),
  entL1: col("B1 - Layer 1 - Entity Name"),
  stateL1: col("B1 - Layer 1 - State of Entity"),
  entL2name: col("B1 - Layer 2 - Entity Name"),
  stateL2: col("B1 - Layer 2 - State of Entity"),
  beState: col("Borrowing Entity-State"),
  contractor: col("Contractor-Company"),
  contractorState: col("Contractor-State"),
};

const rows = raw.slice(headerIdx + 1).filter((l) => l.trim()).map(parseLine);

// Free-coverage tiers (from src/lib/coverage/map.ts).
const SOS_FREE_LIVE = new Set(["CO", "NY"]); // Socrata, live now
const SOS_FREE_BULK = new Set(["FL"]); // Sunbiz (needs full ingest for arbitrary entity)
const SOS_FREE_PENDING = new Set(["CA"]); // CALICO, key pending
const norm = (s: string) => (s || "").trim().toUpperCase().slice(0, 2);

let total = 0;
const formationCounts: Record<string, number> = {};
const propCounts: Record<string, number> = {};
let runnableNow = 0; // entity state in CO/NY (live) or FL-if-ingested
let pendingCalico = 0; // CA
let blankFormation = 0;
const closedFunded: string[] = [];

for (const r of rows) {
  const loan = r[C.loan];
  if (!loan || /testing/i.test(r[C.borrower] ?? "")) continue;
  total++;
  // formation state = layer-1 entity state, else borrowing-entity state, else property state
  const fState = norm(r[C.stateL1]) || norm(r[C.beState]) || "";
  if (!fState) blankFormation++;
  const key = fState || "(blank)";
  formationCounts[key] = (formationCounts[key] ?? 0) + 1;
  const pState = norm(r[C.propState]);
  if (pState) propCounts[pState] = (propCounts[pState] ?? 0) + 1;

  if (SOS_FREE_LIVE.has(fState) || SOS_FREE_BULK.has(fState)) runnableNow++;
  if (SOS_FREE_PENDING.has(fState)) pendingCalico++;

  const status = (r[C.status] ?? "").toLowerCase();
  if (status.includes("closed") || status.includes("funded") || status.includes("servicing") || status.includes("paid")) {
    closedFunded.push(`${loan}\t${(r[C.borrower] ?? "").trim()}\tent=${(r[C.entL1] ?? r[C.borrower] ?? "").trim()}\tformedIn=${fState || "?"}\tprop=${pState}\tGC=${(r[C.contractor] ?? "").trim() || "-"}`);
  }
}

function ranked(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

console.log(`\n=== ICC book: ${total} loans ===`);
console.log(`Formation-state field blank on ${blankFormation} loans (will fall back to property state).`);

console.log(`\n=== Formation state (B1 Layer-1 State of Entity) — ranked, with cumulative % ===`);
let cum = 0;
const freeTierLabel = (s: string) =>
  SOS_FREE_LIVE.has(s) ? "FREE live" : SOS_FREE_BULK.has(s) ? "FREE bulk" : SOS_FREE_PENDING.has(s) ? "FREE pending(CALICO)" : s === "DE" ? "HARD/paid (DE)" : s === "TX" ? "HARD/paid (TX)" : "needs scraper";
for (const [s, n] of ranked(formationCounts)) {
  cum += n;
  console.log(`  ${s.padEnd(8)} ${String(n).padStart(3)}  ${((n / total) * 100).toFixed(1).padStart(5)}%  cum ${((cum / total) * 100).toFixed(1).padStart(5)}%   ${freeTierLabel(s)}`);
}

console.log(`\n=== Property state (for comparison) — ranked ===`);
console.log("  " + ranked(propCounts).map(([s, n]) => `${s}:${n}`).join("  "));

console.log(`\n=== Free-coverage today ===`);
console.log(`  Runnable FREE now (entity formed in CO/NY/FL): ${runnableNow}`);
console.log(`  Unlocks with CALICO key (entity formed in CA):  ${pendingCalico}`);
console.log(`  → ${runnableNow + pendingCalico} of ${total} (${(((runnableNow + pendingCalico) / total) * 100).toFixed(0)}%) free once CALICO is set.`);

console.log(`\n=== Closed/Funded loans (candidates to run) — ${closedFunded.length} ===`);
for (const l of closedFunded.slice(0, 25)) console.log("  " + l);
if (closedFunded.length > 25) console.log(`  …and ${closedFunded.length - 25} more`);
