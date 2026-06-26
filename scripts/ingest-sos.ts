// Secretary-of-State business-entity bulk ingest runner. Reads the source
// registry (sos-sources.ts) and lands rows in public.sos_entities (00050) to
// de-rent Cobalt. Mirrors ingest-contractors.ts.
//
// Run:  set -a; source .env.local; set +a; npx tsx scripts/ingest-sos.ts [flags]
//   --daily        download the most-recent work-day update file (SMALL — use to
//                  verify column offsets + DB write). Default if no mode flag.
//   --full         download cordata.zip 10-way split, unzip, parse all (HEAVY —
//                  millions of rows; run from cron, not interactively).
//   --active-only  skip status-I (inactive) records — DEFAULT (halves storage).
//   --all          include inactive records (overrides --active-only).
//   --state FL     limit to one source (default: every registered source).
//
// FL Sunbiz SFTP creds are hardcoded constants in sos-sources.ts (public access),
// NOT env vars — only the Supabase service key comes from .env.local.

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import SftpClient from "ssh2-sftp-client";
import { Open as unzipOpen } from "unzipper";
import { getClient } from "./_contractor-ingest";
import { upsertBatch, type SosEntityRow } from "./_sos-ingest";
import { SOURCES, type SosSource, type FixedWidthSource } from "./sos-sources";

interface Options {
  mode: "daily" | "full";
  activeOnly: boolean;
  state: string | null;
}

function parseArgs(): Options {
  const args = process.argv.slice(2).map((a) => a.toLowerCase());
  const stateIdx = args.indexOf("--state");
  return {
    mode: args.includes("--full") ? "full" : "daily",
    // --active-only is default; --all opts inactive records back in.
    activeOnly: !args.includes("--all"),
    state: stateIdx !== -1 ? (args[stateIdx + 1] ?? null) : null,
  };
}

// Parse a downloaded fixed-width file line-by-line (streamed — daily files are
// small but full split-parts are large). Returns mapped + (optionally) filtered
// rows, accumulating into `sink`. Records shorter than the layout minimum or
// failing the mapper are skipped.
// Stream the fixed-width file line-by-line, flushing rows to `onFlush` every
// FLUSH_SIZE so peak memory stays bounded regardless of file size. The full FL
// cordata.zip unzips to a multi-GB file with millions of records — accumulating
// every row before a single upsert would OOM, so we never hold more than one
// flush window at a time. Cross-flush (state, normalized_name) collisions are
// resolved by the DB upsert's onConflict (later row wins — fine for a refresh).
const FLUSH_SIZE = 20000;

async function parseFixedWidthFile(
  localPath: string,
  src: FixedWidthSource,
  activeOnly: boolean,
  onFlush: (rows: SosEntityRow[]) => Promise<{ upserted: number; deduped: number }>,
): Promise<{ read: number; mapped: number; upserted: number; deduped: number }> {
  const rl = createInterface({
    input: createReadStream(localPath, { encoding: "latin1" }),
    crlfDelay: Infinity,
  });
  let read = 0;
  let mapped = 0;
  let upserted = 0;
  let deduped = 0;
  let buffer: SosEntityRow[] = [];
  const flush = async () => {
    if (buffer.length === 0) return;
    const res = await onFlush(buffer);
    upserted += res.upserted;
    deduped += res.deduped;
    buffer = [];
  };
  for await (const line of rl) {
    if (!line.trim()) continue;
    read++;
    const row = src.map(line);
    if (!row || !row.normalized_name) continue;
    if (activeOnly && row.status !== "active") continue;
    buffer.push(row);
    mapped++;
    if (buffer.length >= FLUSH_SIZE) await flush();
  }
  await flush();
  return { read, mapped, upserted, deduped };
}

// Connect, find the most-recent daily update file in dailyDir, download it.
async function downloadDaily(src: FixedWidthSource, workDir: string): Promise<string | null> {
  const sftp = new SftpClient();
  await sftp.connect({
    host: src.sftp.host,
    port: src.sftp.port,
    username: src.sftp.username,
    password: src.sftp.password,
    readyTimeout: 60000,
  });
  try {
    const listing = await sftp.list(src.dailyDir);
    // Daily files are yyyymmddc.txt — pick the lexically-latest (dates sort).
    const candidates = listing
      .filter((f) => f.type === "-" && /^\d{8}c\.txt$/i.test(f.name))
      .map((f) => f.name)
      .sort();
    const latest = candidates[candidates.length - 1];
    if (!latest) {
      console.warn(`  no daily file found in ${src.dailyDir}`);
      return null;
    }
    const local = join(workDir, latest);
    console.log(`  downloading ${src.dailyDir}/${latest} …`);
    await sftp.fastGet(`${src.dailyDir}/${latest}`, local);
    return local;
  } finally {
    await sftp.end();
  }
}

// Download each quarterly full zip (FL = one cordata.zip) and stream-unzip its
// single entry to a .txt the parser can read.
async function downloadFullParts(src: FixedWidthSource, workDir: string): Promise<string[]> {
  const sftp = new SftpClient();
  await sftp.connect({
    host: src.sftp.host,
    port: src.sftp.port,
    username: src.sftp.username,
    password: src.sftp.password,
    readyTimeout: 60000,
  });
  const txtPaths: string[] = [];
  try {
    for (const zipName of src.fullFiles) {
      const remote = `${src.fullDir}/${zipName}`;
      const localZip = join(workDir, zipName);
      console.log(`  downloading ${remote} …`);
      await sftp.fastGet(remote, localZip);
      // Unzip the single entry to a .txt and record its path.
      const dir = await unzipOpen.file(localZip);
      const entry = dir.files.find((f) => f.type === "File");
      if (!entry) {
        console.warn(`  ${zipName}: no file entry, skipping`);
        continue;
      }
      const outPath = join(workDir, `${zipName}.txt`);
      await pipeline(entry.stream(), createWriteStream(outPath));
      txtPaths.push(outPath);
      await rm(localZip, { force: true });
    }
  } finally {
    await sftp.end();
  }
  return txtPaths;
}

async function runSource(
  supabase: ReturnType<typeof getClient>,
  src: SosSource,
  opts: Options,
): Promise<void> {
  console.log(`\n── ${src.state} (${src.source}) — ${opts.mode}${opts.activeOnly ? ", active-only" : ", all"} ──`);
  const workDir = join(tmpdir(), `sos-ingest-${src.state}-${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  try {
    const files =
      opts.mode === "daily"
        ? [await downloadDaily(src, workDir)].filter((p): p is string => p !== null)
        : await downloadFullParts(src, workDir);
    if (files.length === 0) {
      console.warn(`  nothing downloaded for ${src.state}`);
      return;
    }

    let totalRead = 0;
    let totalUpserted = 0;
    let totalDeduped = 0;
    // Parse + upsert each file by streaming flushes so peak memory stays bounded
    // even for the multi-GB full file; the (state, normalized_name) PK makes
    // cross-flush collisions idempotent (later row overwrites — fine for refresh).
    for (const file of files) {
      const { read, mapped, upserted, deduped } = await parseFixedWidthFile(
        file,
        src,
        opts.activeOnly,
        (rows) => upsertBatch(supabase, rows),
      );
      totalRead += read;
      totalUpserted += upserted;
      totalDeduped += deduped;
      console.log(
        `  ${file.split("/").pop()}: read ${read}, mapped ${mapped}, in-batch deduped ${deduped}, upserted ${upserted}`,
      );
    }
    console.log(
      `Done. ${src.state}: read ${totalRead}, upserted ${totalUpserted}, in-batch deduped ${totalDeduped}.`,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const opts = parseArgs();
  const targets = opts.state
    ? SOURCES.filter((s) => s.state.toLowerCase() === opts.state)
    : SOURCES;
  if (targets.length === 0) {
    console.error(`No matching source. Registered: ${SOURCES.map((s) => s.state).join(", ")}`);
    process.exit(1);
  }
  const supabase = getClient();
  for (const src of targets) {
    try {
      await runSource(supabase, src, opts);
    } catch (e) {
      console.error(`${src.state} FAILED:`, e instanceof Error ? e.message : e);
    }
  }
  console.log("\nAll done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
