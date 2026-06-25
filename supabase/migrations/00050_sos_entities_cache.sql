-- 00050 — sos_entities: a shared cache / reference table for Secretary-of-State
-- entity lookups, to DE-RENT Cobalt (the only SOS source in our stack, ~$2/lookup
-- with no fallback — RESEARCH-SOS-REPLACEMENT.md).
--
-- SOS data is PUBLIC business-registry data, not org-specific — so this is a
-- SHARED reference table (public read, like contractor_licenses), and org A's
-- lookup of "Acme LLC / CA" benefits org B. The pipeline checks this table FIRST;
-- on a miss it calls Cobalt and writes the result back here. Repeat lookups,
-- override re-runs, and (warm) re-validations then cost $0 instead of $2.
--
-- Free-state BULK ingest (FL Sunbiz, CA CALICO, WA/CO/OR) lands rows in this SAME
-- table with source != 'cobalt_cache', so once a state is bulk-loaded Cobalt is
-- never hit for it. This migration ships the table + the cobalt-cache path; the
-- bulk-ingest scripts populate it incrementally.

create table public.sos_entities (
  state            text not null,             -- 2-letter, uppercase
  -- Canonicalized name (tokenize-and-set; mirror of canonicalizeName) — the
  -- lookup key alongside state. Dual-coded dedup, ROADMAP principle 8.
  normalized_name  text not null,
  entity_name      text not null,             -- display name as returned by the source
  entity_type      text,                      -- LLC | Corp | LP | Trust | ...
  status           text not null,             -- active | suspended | dissolved (not_found NOT cached)
  formation_date   date,
  last_filing_date date,
  registered_agent text,
  officers         jsonb not null default '[]'::jsonb,
  source           text not null,             -- cobalt_cache | fl_sunbiz | ca_calico | wa_sos | ...
  source_url       text,
  raw              jsonb not null default '{}'::jsonb,
  fetched_at       timestamptz not null default now(),
  primary key (state, normalized_name)
);

create index idx_sos_entities_source on public.sos_entities(source);
create index idx_sos_entities_fetched on public.sos_entities(fetched_at);

-- Public business-registry reference data — readable by any authenticated user
-- (same posture as contractor_licenses). No org scoping; no PII.
alter table public.sos_entities enable row level security;
create policy "sos_entities_public_read"
  on public.sos_entities for select using (true);
