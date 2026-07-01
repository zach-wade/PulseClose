// DB-first SOS entity lookup — de-rents Cobalt (the only SOS source, ~$2/lookup,
// no fallback). Checks the shared `sos_entities` table (00050) first; on a miss
// or a stale row it calls the live adapter (Cobalt) and writes the result back,
// so the next lookup of the same entity is free. Free-state bulk ingest (FL/CA/…)
// lands rows in the same table with source != 'cobalt_cache', so bulk-loaded
// states never hit Cobalt at all.
//
// SOS data is public business-registry data → a SHARED cache (any org's lookup
// warms it for every org). Mirrors the GC pattern (src/lib/gc/lookup.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SOSLookupRequest, SOSLookupResult, ValidationAdapter } from "../adapters/types";
import { canonicalizeName } from "../domain/upsert";

// Status rarely changes; a row older than this is re-fetched live. The monitor
// cron catches changes in between, and overrides force a fresh validation.
const CACHE_TTL_DAYS = 60;

// Sources that are bulk-ingested (refreshed by their own cron — scripts/
// ingest-sos.ts) and therefore always considered fresh regardless of age, so a
// bulk-loaded row never triggers a needless live Cobalt re-fetch after the TTL.
// The free-state sources (ca_calico, co_socrata, ny_socrata) are LIVE-fetched
// single lookups, so — like cobalt_cache — they respect the TTL above and
// re-fetch (still $0) when stale.
const ALWAYS_FRESH_SOURCES = new Set<string>(["fl_sunbiz", "va_scc"]);

interface SosRow {
  state: string;
  normalized_name: string;
  entity_name: string;
  entity_type: string | null;
  status: string;
  formation_date: string | null;
  last_filing_date: string | null;
  registered_agent: string | null;
  officers: unknown;
  source: string;
  source_url: string | null;
  raw: Record<string, unknown> | null;
  fetched_at: string;
}

function rowToResult(row: SosRow): SOSLookupResult {
  const status = (["active", "suspended", "dissolved", "not_found"].includes(row.status)
    ? row.status
    : "not_found") as SOSLookupResult["sos_status"];
  return {
    entity_name: row.entity_name,
    state: row.state,
    entity_type: row.entity_type,
    sos_status: status,
    formation_date: row.formation_date,
    last_filing_date: row.last_filing_date,
    registered_agent: row.registered_agent,
    source_url: row.source_url,
    flags: [],
    raw_response: {
      ...(row.raw ?? {}),
      // Preserve officers for the downstream sanctions screen + reconstruct the
      // Cobalt-shaped `results[0].officers` the pipeline reads for additional_persons.
      results: [{ officers: Array.isArray(row.officers) ? row.officers : [] }],
      _source: row.source,
      _cache_fetched_at: row.fetched_at,
    },
  };
}

function isFresh(fetchedAt: string): boolean {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// Pull the officer names from a live SOSLookupResult's raw_response (Cobalt
// shapes them at results[0].officers[].name) so we can persist them.
function extractOfficers(result: SOSLookupResult): unknown[] {
  const results = (result.raw_response as { results?: Array<{ officers?: unknown[] }> } | null)?.results;
  return results?.[0]?.officers ?? [];
}

/**
 * DB-first entity lookup. Returns a cached/bulk-ingested row when one exists and
 * is fresh; otherwise calls the live adapter and caches a resolved result.
 * Never caches `not_found` or errored lookups (a name-format miss must not be
 * persisted as a permanent negative).
 */
export async function lookupEntityCached(
  supabase: SupabaseClient,
  adapter: ValidationAdapter,
  req: SOSLookupRequest,
): Promise<SOSLookupResult> {
  const state = (req.state ?? "").toUpperCase();
  const norm = canonicalizeName(req.entity_name, { stripEntitySuffixes: true });

  // 1) DB hit (bulk-ingested rows are always fresh enough; cobalt_cache rows
  //    respect the TTL).
  if (state && norm) {
    const { data } = await supabase
      .from("sos_entities")
      .select(
        "state, normalized_name, entity_name, entity_type, status, formation_date, last_filing_date, registered_agent, officers, source, source_url, raw, fetched_at",
      )
      .eq("state", state)
      .eq("normalized_name", norm)
      .maybeSingle();
    if (data) {
      const row = data as SosRow;
      if (ALWAYS_FRESH_SOURCES.has(row.source) || isFresh(row.fetched_at)) {
        return rowToResult(row);
      }
    }
  }

  // 2) Live lookup. The adapter tries the free official sources (CALICO/Socrata)
  //    before Cobalt; whichever resolved it stamps `_source` in raw_response so we
  //    cache the row under the real provider (ca_calico / co_socrata / ny_socrata /
  //    cobalt_cache) for honest de-rent telemetry. Cache only resolved, non-errored.
  const live = await adapter.lookupEntity(req);
  const errored = (live.raw_response as { _error?: boolean } | null)?._error === true;
  const liveSource = (live.raw_response as { _source?: string } | null)?._source ?? "cobalt_cache";
  const resolved = live.sos_status === "active" || live.sos_status === "suspended" || live.sos_status === "dissolved";
  if (state && norm && resolved && !errored) {
    await supabase
      .from("sos_entities")
      .upsert(
        {
          state,
          normalized_name: norm,
          entity_name: live.entity_name,
          entity_type: live.entity_type,
          status: live.sos_status,
          formation_date: live.formation_date,
          last_filing_date: live.last_filing_date,
          registered_agent: live.registered_agent,
          officers: extractOfficers(live),
          source: liveSource,
          source_url: live.source_url,
          raw: (live.raw_response as Record<string, unknown> | null) ?? {},
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "state,normalized_name" },
      )
      .then(({ error }) => {
        if (error) console.warn(`[sos/lookup] cache write failed (${state}/${norm}):`, error.message);
      });
  }
  return live;
}
