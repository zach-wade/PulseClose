// Shared helpers for the Secretary-of-State business-entity bulk ingest.
// Sources map their records to SosEntityRow[] and call upsertBatch.
// Reference data → public.sos_entities (see migration 00050). Mirrors the GC
// contractor ingest (_contractor-ingest.ts), whose generic getClient/isoDate
// we reuse rather than duplicate.

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalizeName } from "../src/lib/domain/upsert";

// Status enum mirrors what src/lib/sos/lookup.ts reads back (active | suspended
// | dissolved; not_found is never cached). FL has no "suspended" concept in the
// bulk file — A=active, everything else maps to dissolved.
export type SosStatus = "active" | "suspended" | "dissolved";

// An officer as stored in sos_entities.officers (jsonb array). lookup.ts and the
// downstream sanctions screen read {name,title}.
export interface SosOfficer {
  name: string;
  title: string;
}

export interface SosEntityRow {
  state: string;            // 2-letter, uppercase
  normalized_name: string;  // canonicalizeName(name, {stripEntitySuffixes:true})
  entity_name: string;      // display name as filed
  entity_type: string | null;
  status: SosStatus;
  formation_date: string | null;   // YYYY-MM-DD
  last_filing_date: string | null; // YYYY-MM-DD
  registered_agent: string | null;
  officers: SosOfficer[];
  source: string;           // fl_sunbiz | ...
  source_url: string | null;
  raw: Record<string, unknown>;    // minimal — do NOT store the whole record
}

// Canonical name key — mirror of the app's canonicalizeName so a borrower's
// entity name matches a cached row without the exact document number. Returns
// null for empty/garbage names (caller skips the record).
export function normName(name: string | null | undefined): string | null {
  if (!name) return null;
  return canonicalizeName(name, { stripEntitySuffixes: true });
}

// FL Sunbiz dates are 8-char MMDDYYYY (e.g. "07151998"). A few legacy records
// carry YYYYMMDD; detect both. Returns YYYY-MM-DD or null if unparseable / a
// zero-filled placeholder.
export function sunbizDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!/^\d{8}$/.test(s)) return null;
  if (s === "00000000") return null;
  // MMDDYYYY (the documented Sunbiz format).
  let mm = s.slice(0, 2);
  let dd = s.slice(2, 4);
  let yyyy = s.slice(4, 8);
  // If that doesn't yield a plausible date but YYYYMMDD does, swap interpretation.
  const plausible = (m: string, d: string, y: string) =>
    +y >= 1800 && +y <= 2100 && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31;
  if (!plausible(mm, dd, yyyy)) {
    yyyy = s.slice(0, 4);
    mm = s.slice(4, 6);
    dd = s.slice(6, 8);
    if (!plausible(mm, dd, yyyy)) return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

// Parse M/D/YYYY (VA SCC) or YYYY-MM-DD (mixed in the same VA file) → YYYY-MM-DD.
// Rejects blanks and out-of-range placeholders (VA uses "12/31/9999" for "no end").
export function usOrIsoDate(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = +m[1];
    return y >= 1800 && y <= 2100 ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const y = +m[3];
    return y >= 1800 && y <= 2100 ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
  }
  return null;
}

// Split one CSV record into fields — RFC-4180 quoting: quoted fields, '""' = a
// literal quote, commas inside quotes aren't separators. VA space-pads every
// field, so callers .trim() the results.
export function parseCsvFields(record: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < record.length; i += 1) {
    const c = record[i];
    if (inQ) {
      if (c === '"') {
        if (record[i + 1] === '"') { cur += '"'; i += 1; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// A CSV record is complete only when its quotes balance — a quoted field may
// contain a newline, so the streaming reader accumulates lines until this is true.
export function csvQuotesBalanced(s: string): boolean {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) if (s[i] === '"') n += 1;
  return n % 2 === 0;
}

// Within a single ingest run multiple records can share a canonical name (FL has
// many name collisions). The PK is (state, normalized_name), so we must collapse
// them BEFORE upsert. Rule: ACTIVE beats inactive; among same status, the most
// recent formation_date wins. Returns the survivor for each normalized_name.
export function dedupeByNormalizedName(rows: SosEntityRow[]): SosEntityRow[] {
  const best = new Map<string, SosEntityRow>();
  for (const r of rows) {
    if (!r.state || !r.normalized_name || !r.entity_name) continue;
    const key = `${r.state}|${r.normalized_name}`;
    const prev = best.get(key);
    if (!prev || winsOver(r, prev)) best.set(key, r);
  }
  return [...best.values()];
}

// True if `a` should replace `b` under the collision rule.
function winsOver(a: SosEntityRow, b: SosEntityRow): boolean {
  const aActive = a.status === "active";
  const bActive = b.status === "active";
  if (aActive !== bActive) return aActive; // active beats inactive
  // Same active-ness → most recent formation date wins (null sorts oldest).
  const aDate = a.formation_date ?? "";
  const bDate = b.formation_date ?? "";
  return aDate > bDate;
}

// Upsert rows to sos_entities in chunks of 1000, onConflict (state,
// normalized_name). Dedupes within the batch first (collision rule above).
export async function upsertBatch(
  supabase: SupabaseClient,
  rows: SosEntityRow[],
): Promise<{ upserted: number; deduped: number }> {
  const survivors = dedupeByNormalizedName(rows);
  const deduped = rows.length - survivors.length;
  const now = new Date().toISOString();
  let upserted = 0;
  for (let i = 0; i < survivors.length; i += 1000) {
    const chunk = survivors.slice(i, i + 1000).map((r) => ({ ...r, fetched_at: now }));
    const { error } = await supabase
      .from("sos_entities")
      .upsert(chunk, { onConflict: "state,normalized_name" });
    if (error) {
      console.error("[sos-ingest] upsert error:", error.message);
      throw error;
    }
    upserted += chunk.length;
    if (upserted % 50000 === 0) console.log(`  …${upserted} upserted`);
  }
  return { upserted, deduped };
}
