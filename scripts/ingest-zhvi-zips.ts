// Ingest the latest Zillow ZHVI by-zip CSV into public.zhvi_zips.
// Refresh monthly — Zillow publishes around the 16th of each month.
//
// Run:
//   npx tsx scripts/ingest-zhvi-zips.ts
//
// Idempotent: zip is the PK, every run upserts.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const ZHVI_URL =
  "https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv";

interface ParsedRow {
  zip: string;
  city: string | null;
  state: string | null;
  metro: string | null;
  asOf: string; // YYYY-MM-DD (1st of the month for ZHVI)
  median: number;
}

// Naive CSV parser — fields can be quoted with commas inside, but the
// ZHVI files are simple (no embedded quotes/newlines in our columns).
function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  return lines
    .filter((l) => l.length > 0)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === "," && !inQuotes) {
          out.push(cur);
          cur = "";
        } else {
          cur += c;
        }
      }
      out.push(cur);
      return out;
    });
}

function parseZhvi(csv: string): ParsedRow[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const header = rows[0];
  const findIdx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const idxZip = findIdx("RegionName");
  const idxCity = findIdx("City");
  const idxState = findIdx("State");
  const idxMetro = findIdx("Metro");

  // Identify date columns — they look like "2024-12-31" or "2024-12-01"
  const dateCols: { idx: number; date: string }[] = [];
  header.forEach((h, i) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(h)) dateCols.push({ idx: i, date: h });
  });
  if (dateCols.length === 0) {
    console.warn("No date columns found in ZHVI CSV");
    return [];
  }
  // Walk dates from latest backwards to find the most recent column with
  // any non-empty values for this row.
  dateCols.sort((a, b) => (a.date < b.date ? 1 : -1));

  const out: ParsedRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const zipRaw = (row[idxZip] ?? "").trim();
    if (!zipRaw) continue;
    const zip = zipRaw.padStart(5, "0");

    let median: number | null = null;
    let asOf: string | null = null;
    for (const dc of dateCols) {
      const v = row[dc.idx]?.trim();
      if (!v) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        median = n;
        asOf = dc.date;
        break;
      }
    }
    if (median == null || asOf == null) continue;

    out.push({
      zip,
      city: row[idxCity]?.trim() || null,
      state: row[idxState]?.trim() || null,
      metro: row[idxMetro]?.trim() || null,
      asOf,
      median,
    });
  }
  return out;
}

async function upsertBatch(rows: ParsedRow[]): Promise<{ upserted: number; failed: number }> {
  const payload = rows.map((r) => ({
    zip: r.zip,
    median_value: r.median,
    as_of: r.asOf,
    city: r.city,
    state: r.state,
    metro: r.metro,
  }));
  const { error } = await supabase.from("zhvi_zips").upsert(payload, { onConflict: "zip" });
  if (error) {
    console.warn(`  ! batch failed: ${error.message}`);
    return { upserted: 0, failed: payload.length };
  }
  return { upserted: payload.length, failed: 0 };
}

async function main() {
  console.log(`Downloading ZHVI from ${ZHVI_URL}…`);
  const res = await fetch(ZHVI_URL);
  if (!res.ok) {
    console.error(`Download failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const csv = await res.text();
  console.log(`  ${csv.length.toLocaleString()} bytes received`);

  const rows = parseZhvi(csv);
  console.log(`Parsed ${rows.length.toLocaleString()} zips`);

  const BATCH = 500;
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const r = await upsertBatch(slice);
    upserted += r.upserted;
    failed += r.failed;
    process.stdout.write(`  ${upserted.toLocaleString()} upserted${failed > 0 ? ` (${failed} failed)` : ""}\r`);
  }
  console.log("");
  console.log(`Done. upserted=${upserted} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
