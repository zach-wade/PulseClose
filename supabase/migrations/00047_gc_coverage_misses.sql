-- GC coverage misses — every time a borrower supplies a GC in a state we can't
-- yet validate (no ingested dataset, not CA-scrapeable). Drives data-driven
-- prioritization of which state to ingest next (rank by miss volume). See
-- docs/RESEARCH-GC-VALIDATION.md (nationwide-coverage plan, Tier-1 ordering).

create table public.gc_coverage_misses (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  validation_id      uuid references public.borrower_validations(id) on delete set null,
  gc_state           text,
  had_license_number boolean not null default false,
  gc_name            text,
  created_at         timestamptz not null default now()
);

create index idx_gc_misses_state on public.gc_coverage_misses(gc_state);
create index idx_gc_misses_created on public.gc_coverage_misses(created_at);

-- Prioritization query (run as service role / admin):
--   select gc_state, count(*) from public.gc_coverage_misses
--   group by gc_state order by 2 desc;

alter table public.gc_coverage_misses enable row level security;
create policy "gc_misses_own_org" on public.gc_coverage_misses
  for select using (org_id = (select org_id from public.users where id = auth.uid()));
