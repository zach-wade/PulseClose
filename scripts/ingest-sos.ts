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

import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import SftpClient from "ssh2-sftp-client";
import { Open as unzipOpen } from "unzipper";
import { getClient } from "./_contractor-ingest";
import { upsertBatch, parseCsvFields, csvQuotesBalanced, type SosEntityRow } from "./_sos-ingest";
import { SOURCES, type SosSource, type FixedWidthSource, type CsvUrlSource } from "./sos-sources";

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

// Connect a fresh SFTP client (used for retries — a reset connection is dead).
async function connectSftp(src: FixedWidthSource): Promise<SftpClient> {
  const sftp = new SftpClient();
  await sftp.connect({
    host: src.sftp.host,
    port: src.sftp.port,
    username: src.sftp.username,
    password: src.sftp.password,
    readyTimeout: 60000,
  });
  return sftp;
}

// RESUMABLE download with reconnect + backoff. The FL cordata.zip is ~1.74 GB and
// the public SFTP endpoint resets long transfers (ECONNRESET) — and a rapid
// reconnect can transiently fail DNS (ENOTFOUND). A plain fastGet restarts from
// zero on every reset and never finishes. Instead we resume: on failure, keep the
// bytes already written and re-open a read stream from that offset (appending),
// with exponential backoff so DNS/network can settle.
async function fastGetWithRetry(src: FixedWidthSource, remote: string, localZip: string, attempts = 12): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    let start = existsSync(localZip) ? statSync(localZip).size : 0;
    let sftp: SftpClient | null = null;
    let ws: ReturnType<typeof createWriteStream> | null = null;
    try {
      sftp = await connectSftp(src);
      // Guard cross-run resume against a stale/complete partial: if the remote
      // size is known, a partial ≥ remote is either done (==) or stale (>) — in
      // the stale case restart from 0 so we never append to an outdated file.
      const remoteSize = await sftp.stat(remote).then((s) => s.size).catch(() => 0);
      if (remoteSize > 0 && start >= remoteSize) {
        if (start === remoteSize) { console.log(`  already complete (${(start / 1e6).toFixed(0)}MB)`); return; }
        console.warn(`  local partial ${(start / 1e6).toFixed(0)}MB > remote ${(remoteSize / 1e6).toFixed(0)}MB — restarting`);
        await rm(localZip, { force: true });
        start = 0;
      }
      ws = createWriteStream(localZip, { flags: start > 0 ? "a" : "w" });
      // ssh2-sftp-client.get() accepts a writable dst + readStreamOptions; `start`
      // makes the server read from that byte offset so we resume, not restart.
      await sftp.get(remote, ws, { readStreamOptions: { start } } as Parameters<SftpClient["get"]>[2]);
      // CRITICAL: fully flush + close the write stream and WAIT before measuring
      // size. If we don't, buffered tail bytes flush late and the next attempt's
      // append overlaps them, corrupting the zip's deflate stream ("too many
      // length or distance symbols" at unzip). Closing here makes statSync exact.
      await closeStream(ws);
      ws = null;
      const got = statSync(localZip).size;
      if (start > 0) console.log(`  resumed from ${(start / 1e6).toFixed(0)}MB → ${(got / 1e6).toFixed(0)}MB total`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Flush+close the partial write BEFORE the next attempt reads its size, so a
      // late buffer flush can't overlap the resumed append (the corruption bug).
      if (ws) await closeStream(ws).catch(() => {});
      const have = existsSync(localZip) ? statSync(localZip).size : 0;
      console.warn(`  download attempt ${i}/${attempts} failed at ${(have / 1e6).toFixed(0)}MB: ${msg}`);
      if (i === attempts) throw e;
      await sleep(Math.min(30000, 2000 * 2 ** Math.min(i, 4))); // backoff, cap 30s
    } finally {
      await sftp?.end().catch(() => {});
    }
  }
}

// End + fully flush a write stream, resolving only once its bytes are on disk
// (the 'close' event). Idempotent if the stream is already ended.
function closeStream(ws: ReturnType<typeof createWriteStream>): Promise<void> {
  return new Promise<void>((resolve) => {
    if (ws.closed) { resolve(); return; }
    ws.end(() => ws.close(() => resolve()));
  });
}

// Download each quarterly full zip (FL = one cordata.zip) and stream-unzip its
// single entry to a .txt the parser can read.
async function downloadFullParts(src: FixedWidthSource, workDir: string): Promise<string[]> {
  const txtPaths: string[] = [];
  // The full zip persists in a STABLE cache dir (not the ephemeral workDir that's
  // rm'd after each run) so a killed/blocked multi-GB download resumes on the next
  // invocation instead of restarting. The .txt still unzips into workDir.
  const cacheDir = join(tmpdir(), `pulseclose-sos-cache-${src.state}`);
  await mkdir(cacheDir, { recursive: true });
  {
    for (const zipName of src.fullFiles) {
      const remote = `${src.fullDir}/${zipName}`;
      const localZip = join(cacheDir, zipName);
      const outPath = join(workDir, `${zipName}.txt`);
      // Unzip the single entry to a .txt. If inflate fails, the cached zip is
      // corrupt (a bad resume) — discard it and re-download clean, ONCE. This is
      // the belt to the write-stream-close suspenders in fastGetWithRetry.
      let unzipped = false;
      for (let tryNum = 1; tryNum <= 2 && !unzipped; tryNum++) {
        console.log(`  downloading ${remote} …${tryNum > 1 ? " (clean re-download after corrupt zip)" : ""}`);
        await fastGetWithRetry(src, remote, localZip);
        try {
          const dir = await unzipOpen.file(localZip);
          const entry = dir.files.find((f) => f.type === "File");
          if (!entry) { console.warn(`  ${zipName}: no file entry, skipping`); break; }
          await pipeline(entry.stream(), createWriteStream(outPath));
          unzipped = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`  ${zipName}: unzip failed (${msg}) — discarding cached zip`);
          await rm(localZip, { force: true });
          if (tryNum === 2) throw new Error(`${zipName}: unzip failed after clean re-download — ${msg}`);
        }
      }
      if (unzipped) {
        txtPaths.push(outPath);
        await rm(localZip, { force: true });
      }
    }
  }
  return txtPaths;
}

// Stream a CSV-over-HTTPS bulk source (VA SCC). Downloads each file, parses it
// record-by-record (accumulating across lines for quoted newlines), maps + flushes
// in bounded batches so peak memory stays flat even on the 400 MB+ LLC file. No
// intermediate file on disk — we pipe the HTTP body straight through readline.
async function runCsvSource(
  supabase: ReturnType<typeof getClient>,
  src: CsvUrlSource,
  opts: Options,
): Promise<void> {
  let read = 0;
  let mapped = 0;
  let upserted = 0;
  let deduped = 0;
  for (const url of src.urls) {
    console.log(`  downloading ${url.split("/").pop()} …`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok || !res.body) {
      console.warn(`  ${url} → HTTP ${res.status} — skipping`);
      continue;
    }
    const rl = createInterface({
      input: Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
      crlfDelay: Infinity,
    });
    let header: string[] | null = null;
    let pending = "";
    let batch: SosEntityRow[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const r = await upsertBatch(supabase, batch);
      upserted += r.upserted;
      deduped += r.deduped;
      batch = [];
      if (upserted % 50000 === 0) console.log(`  …${upserted} upserted`);
    };
    for await (const line of rl) {
      pending = pending ? `${pending}\n${line}` : line;
      if (!csvQuotesBalanced(pending)) continue; // newline inside a quoted field
      let record = pending;
      pending = "";
      if (record.charCodeAt(0) === 0xfeff) record = record.slice(1); // strip BOM
      const fields = parseCsvFields(record).map((f) => f.trim());
      if (!header) {
        header = fields;
        continue;
      }
      read += 1;
      const rec: Record<string, string> = {};
      for (let i = 0; i < header.length; i += 1) rec[header[i]] = fields[i] ?? "";
      const row = src.map(rec);
      if (!row || !row.normalized_name) continue;
      if (opts.activeOnly && row.status !== "active") continue;
      mapped += 1;
      batch.push(row);
      if (batch.length >= 5000) await flush();
    }
    await flush();
    console.log(`  ${url.split("/").pop()}: read ${read}, mapped ${mapped}, upserted ${upserted}`);
  }
  console.log(`Done. ${src.state}: read ${read}, mapped ${mapped}, upserted ${upserted}, in-batch deduped ${deduped}.`);
}

async function runSource(
  supabase: ReturnType<typeof getClient>,
  src: SosSource,
  opts: Options,
): Promise<void> {
  console.log(`\n── ${src.state} (${src.source}) — ${opts.mode}${opts.activeOnly ? ", active-only" : ", all"} ──`);
  if (src.kind === "csv-url") {
    // CSV bulk files are full snapshots (hundreds of MB) — only pull on --full,
    // never on the small daily cron.
    if (opts.mode === "daily") {
      console.log("  (csv-url source — skipped in daily mode; runs on --full)");
      return;
    }
    await runCsvSource(supabase, src, opts);
    return;
  }
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
