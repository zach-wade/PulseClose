-- 00018_litigation_cases.sql
-- Tier S3 — materialized litigation case rows so the validation detail page
-- can render expandable case cards (case name, court, year, nature, status,
-- CourtListener link) instead of a raw "3 cases found" summary.
--
-- Source of truth stays litigation_checks.raw_response. This table is a
-- denormalized projection that the UI reads directly; it's recomputed by
-- src/lib/litigation/materialize.ts on validation create + monitor cron, and
-- by scripts/backfill-litigation-cases.ts for historical rows. Idempotent
-- via UNIQUE (validation_id, case_number).

begin;

create table public.litigation_cases (
  id                       uuid primary key default gen_random_uuid(),
  validation_id            uuid not null references public.borrower_validations(id) on delete cascade,
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  case_name                text not null,
  case_number              text,
  court                    text,
  court_id                 text,
  filed_at                 date,
  terminated_at            date,
  nature_of_suit           text,
  -- Higher-level grouping for UI filter chips (Bankruptcy / Civil / Lien / etc.)
  category                 text not null check (category in (
    'bankruptcy','civil','lien','tax','foreclosure','other'
  )),
  -- Coarse status derived from terminated_at + court_id
  status                   text not null check (status in (
    'pending','closed','discharged','dismissed','judgment','unknown'
  )),
  dollar_amount_estimated  numeric(14,2),
  source_doc_url           text,
  raw                      jsonb not null default '{}'::jsonb,
  schema_version           integer not null default 1,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Idempotent upsert key — same (validation_id, case_number) gets re-derived
-- on every monitor run and on backfill re-runs without dupes.
create unique index litigation_cases_validation_case_uidx
  on public.litigation_cases(validation_id, case_number)
  where case_number is not null;

-- For cases with no docket number (rare but possible), fall back to a
-- (validation_id, case_name) uniqueness so backfill can ON CONFLICT cleanly.
create unique index litigation_cases_validation_name_uidx
  on public.litigation_cases(validation_id, case_name)
  where case_number is null;

create index idx_litigation_cases_org_filed on public.litigation_cases(org_id, filed_at desc);
create index idx_litigation_cases_validation on public.litigation_cases(validation_id);
create index idx_litigation_cases_category on public.litigation_cases(org_id, category);

create trigger litigation_cases_updated_at
  before update on public.litigation_cases
  for each row execute function public.set_updated_at();

alter table public.litigation_cases enable row level security;

create policy "litigation_cases_own_org" on public.litigation_cases
  for all
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

commit;
