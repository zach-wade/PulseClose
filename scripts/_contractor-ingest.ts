// Shared helpers for the per-state contractor-license ingest scripts. Each
// state script maps its source rows to ContractorRow[] and calls upsertBatch.
// Reference data → public.contractor_licenses (see migration 00046).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canonicalizeName } from "../src/lib/domain/upsert";

export interface ContractorRow {
  state: string;            // 2-letter, uppercase
  license_number: string;
  business_name: string;
  normalized_name: string | null;
  license_type: string | null;
  status: string;           // normalized
  status_raw: string | null;
  effective_date: string | null;  // YYYY-MM-DD
  expiration_date: string | null;
  city: string | null;
  zip: string | null;
  source: string;           // wa_lni | or_ccb | fl_dbpr | ca_cslb
  raw: Record<string, unknown>;
}

// Normalize a source's verbatim status into our small enum.
export function normStatus(raw: string | null | undefined): string {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return "unknown";
  if (s === "a" || s.includes("active") || s.includes("current") || s.includes("relicens") || s.includes("re-licens"))
    return "active";
  if (s.includes("expired") || s === "e") return "expired";
  if (s.includes("suspend")) return "suspended";
  if (s.includes("revok")) return "revoked";
  return "unknown";
}

// Canonical name for name-based lookup — mirrors the app's canonicalizeName so a
// borrower's GC name can match a license row without the exact license number.
export function normName(name: string | null | undefined): string | null {
  if (!name) return null;
  return canonicalizeName(name, { stripEntitySuffixes: true });
}

// Accepts ISO (YYYY-MM-DD, optionally with time) OR US MM/DD/YYYY. → YYYY-MM-DD.
export function isoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const str = String(input).trim();
  const iso = str.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const us = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  return createClient(url, key);
}

// Upsert rows in chunks. onConflict (state, license_number) → re-runs update in
// place. Dedupes within the batch (a source occasionally lists a license twice).
export async function upsertBatch(
  supabase: SupabaseClient,
  rows: ContractorRow[],
): Promise<{ upserted: number; skipped: number }> {
  const seen = new Set<string>();
  const deduped: ContractorRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (!r.license_number || !r.state) { skipped++; continue; }
    const k = `${r.state}|${r.license_number}`;
    if (seen.has(k)) { skipped++; continue; }
    seen.add(k);
    deduped.push(r);
  }
  const now = new Date().toISOString();
  let upserted = 0;
  for (let i = 0; i < deduped.length; i += 1000) {
    const chunk = deduped.slice(i, i + 1000).map((r) => ({ ...r, refreshed_at: now }));
    const { error } = await supabase
      .from("contractor_licenses")
      .upsert(chunk, { onConflict: "state,license_number" });
    if (error) {
      console.error("[contractor-ingest] upsert error:", error.message);
      throw error;
    }
    upserted += chunk.length;
    if (upserted % 10000 === 0) console.log(`  …${upserted} upserted`);
  }
  return { upserted, skipped };
}

// Parse delimited text into rows of fields. Handles quoted fields with embedded
// delimiters and "" escapes (FL DBPR / CSLB CSV; VA DPOR is tab-delimited).
// Assumes no embedded newlines inside quotes (true for these datasets).
export function parseDelimited(text: string, delimiter = ","): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (c === delimiter && !inQ) {
          out.push(cur); cur = "";
        } else cur += c;
      }
      out.push(cur);
      return out;
    });
}

// Socrata bulk pull with offset pagination (data.wa.gov, data.oregon.gov).
export async function fetchSocrata(
  base: string,
  pageSize = 50000,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = base.includes("?") ? "&" : "?";
    const url = `${base}${sep}$limit=${pageSize}&$offset=${offset}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`Socrata ${res.status} at offset ${offset}: ${await res.text().catch(() => "")}`);
    const page = (await res.json()) as Record<string, unknown>[];
    all.push(...page);
    console.log(`  fetched ${all.length} rows…`);
    if (page.length < pageSize) break;
  }
  return all;
}
