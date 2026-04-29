-- Domain entities refactor (Session 1 of 3 in data-model refactor).
--
-- Adds first-class persistent records for borrowers, entities, properties,
-- lenders, plus the signal/override layer, plus risk_factors, plus Module 1
-- (Evaluate Deal) tables. Existing snapshot tables gain nullable FK columns
-- so they can reference these domain entities.
--
-- This migration is purely additive — no existing columns are dropped or
-- renamed. The next migration (00011) backfills data; a later migration
-- (after UI/API are updated) will make FKs non-null and drop redundant
-- text columns.
--
-- See docs/DATA-MODEL.md for the full architecture.

-- ── Helpers ──────────────────────────────────────────────────────────────

create or replace function public.normalize_text(input text)
returns text
language sql
immutable
as $$
  select case
    when input is null then null
    else lower(regexp_replace(trim(input), '\s+', ' ', 'g'))
  end;
$$;

create or replace function public.normalize_address(input text)
returns text
language sql
immutable
as $$
  -- Strip punctuation, collapse whitespace, lowercase. Does NOT canonicalize
  -- street suffixes (Street/St) or directionals — defer to a per-property
  -- enrichment if duplicates show up. Realie returns its own normalized
  -- form we can adopt over time.
  select case
    when input is null then null
    else lower(regexp_replace(regexp_replace(trim(input), '[,.\#]', '', 'g'), '\s+', ' ', 'g'))
  end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Domain entities ──────────────────────────────────────────────────────

-- Borrowers: real people seeking lending. Persistent across validations.
create table public.borrowers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  display_name    text not null,
  normalized_name text not null generated always as (public.normalize_text(display_name)) stored,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_borrowers_org on public.borrowers(org_id);
create index idx_borrowers_normalized on public.borrowers(org_id, normalized_name);

create trigger borrowers_updated_at
  before update on public.borrowers
  for each row execute function public.set_updated_at();

-- Legal entities (LLC, Corp, LP, Trust). Persistent across validations.
-- Cached SOS state lives here; per-check snapshots live on entity_checks.
create table public.entities (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  display_name             text not null,
  normalized_name          text not null generated always as (public.normalize_text(display_name)) stored,
  state                    text,
  entity_type              text,
  formation_date_known     date,
  dissolution_date_known   date,
  latest_sos_status        text,
  latest_sos_check_at      timestamptz,
  latest_registered_agent  text,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_entities_org on public.entities(org_id);
create index idx_entities_normalized on public.entities(org_id, normalized_name, state);

create trigger entities_updated_at
  before update on public.entities
  for each row execute function public.set_updated_at();

-- Borrower-Entity many-to-many with role + ownership %.
create table public.borrower_entities (
  id              uuid primary key default gen_random_uuid(),
  borrower_id     uuid not null references public.borrowers(id) on delete cascade,
  entity_id       uuid not null references public.entities(id) on delete cascade,
  role            text check (role in ('member', 'manager', 'agent', 'guarantor', 'officer', 'other')),
  ownership_pct   numeric(5,2),
  source          text not null default 'inferred' check (source in ('sos', 'user', 'inferred')),
  confidence      text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  created_at      timestamptz not null default now(),
  superseded_at   timestamptz
);

create index idx_borrower_entities_borrower on public.borrower_entities(borrower_id) where superseded_at is null;
create index idx_borrower_entities_entity on public.borrower_entities(entity_id) where superseded_at is null;

-- Lenders. May be org-scoped (per-org notes) or global (FDIC-derived classifiers).
create table public.lenders (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references public.organizations(id) on delete cascade,
  display_name     text not null,
  normalized_name  text not null generated always as (public.normalize_text(display_name)) stored,
  classification   text not null default 'unknown' check (classification in (
                     'bank', 'bridge', 'private_credit', 'unknown'
                   )),
  fdic_id          text,
  nmls_id          text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_lenders_org on public.lenders(org_id);
create index idx_lenders_normalized on public.lenders(org_id, normalized_name);
create index idx_lenders_fdic on public.lenders(fdic_id) where fdic_id is not null;

create trigger lenders_updated_at
  before update on public.lenders
  for each row execute function public.set_updated_at();

-- Properties. Persistent across validations and across borrowers who've
-- owned/may own them.
create table public.properties (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  address_display       text not null,
  address_normalized    text not null generated always as (public.normalize_address(address_display)) stored,
  city                  text,
  state                 text,
  zip                   text,
  apn                   text,
  latest_avm            numeric(14,2),
  latest_avm_check_at   timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_properties_org on public.properties(org_id);
create index idx_properties_normalized on public.properties(org_id, address_normalized);
create index idx_properties_state_city on public.properties(org_id, state, city);

create trigger properties_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- Property ownership history. One row per ownership episode (entity X owned
-- property Y from date A to date B with lender Z financing).
create table public.property_ownership (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references public.properties(id) on delete cascade,
  owning_entity_id    uuid references public.entities(id) on delete set null,
  owning_borrower_id  uuid references public.borrowers(id) on delete set null,
  acquired_at         date,
  disposed_at         date,
  acquisition_price   numeric(14,2),
  disposition_price   numeric(14,2),
  lender_id           uuid references public.lenders(id) on delete set null,
  lender_name_observed text,
  source              text not null default 'inferred' check (source in ('deed', 'user', 'inferred')),
  confidence          text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  created_at          timestamptz not null default now()
);

create index idx_property_ownership_property on public.property_ownership(property_id);
create index idx_property_ownership_entity on public.property_ownership(owning_entity_id);
create index idx_property_ownership_borrower on public.property_ownership(owning_borrower_id);
create index idx_property_ownership_active on public.property_ownership(property_id) where disposed_at is null;

-- ── Signal / override layer ──────────────────────────────────────────────

create table public.borrower_signals (
  id              uuid primary key default gen_random_uuid(),
  borrower_id     uuid not null references public.borrowers(id) on delete cascade,
  signal_key      text not null,
  signal_value    jsonb not null,
  source          text not null default 'user' check (source in ('user', 'derived', 'inferred')),
  confidence      text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  set_by_user_id  uuid references public.users(id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now(),
  superseded_at   timestamptz
);

create index idx_borrower_signals_active on public.borrower_signals(borrower_id, signal_key) where superseded_at is null;

create table public.property_signals (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id) on delete cascade,
  signal_key      text not null,
  signal_value    jsonb not null,
  source          text not null default 'user' check (source in ('user', 'derived', 'inferred')),
  confidence      text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  set_by_user_id  uuid references public.users(id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now(),
  superseded_at   timestamptz
);

create index idx_property_signals_active on public.property_signals(property_id, signal_key) where superseded_at is null;

create table public.borrower_property_signals (
  id              uuid primary key default gen_random_uuid(),
  borrower_id     uuid not null references public.borrowers(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  signal_key      text not null,
  signal_value    jsonb not null,
  source          text not null default 'user' check (source in ('user', 'derived', 'inferred')),
  confidence      text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  set_by_user_id  uuid references public.users(id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now(),
  superseded_at   timestamptz
);

create index idx_borrower_property_signals_active on public.borrower_property_signals(borrower_id, property_id, signal_key) where superseded_at is null;

create table public.entity_signals (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references public.entities(id) on delete cascade,
  signal_key      text not null,
  signal_value    jsonb not null,
  source          text not null default 'user' check (source in ('user', 'derived', 'inferred')),
  confidence      text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  set_by_user_id  uuid references public.users(id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now(),
  superseded_at   timestamptz
);

create index idx_entity_signals_active on public.entity_signals(entity_id, signal_key) where superseded_at is null;

-- ── Risk system ──────────────────────────────────────────────────────────

create table public.risk_factors (
  id                 uuid primary key default gen_random_uuid(),
  validation_id      uuid not null references public.borrower_validations(id) on delete cascade,
  factor_key         text not null,
  severity           text not null check (severity in ('critical', 'moderate', 'minor', 'informational', 'none')),
  excluded           boolean not null default false,
  exclusion_reason   text,
  contributing_data  jsonb not null default '{}',
  explanation        text,
  computed_at        timestamptz not null default now()
);

create index idx_risk_factors_validation on public.risk_factors(validation_id);
create index idx_risk_factors_active on public.risk_factors(validation_id, factor_key) where excluded = false;

-- ── Module 1: Evaluate Deal ──────────────────────────────────────────────

create table public.investors (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  display_name  text not null,
  type          text check (type in ('balance_sheet', 'table_funded', 'securitizer')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_investors_org on public.investors(org_id);

create trigger investors_updated_at
  before update on public.investors
  for each row execute function public.set_updated_at();

create table public.investor_criteria (
  id              uuid primary key default gen_random_uuid(),
  investor_id     uuid not null references public.investors(id) on delete cascade,
  criteria_key    text not null,
  criteria_value  jsonb not null,
  effective_from  date not null default current_date,
  effective_to    date,
  source          text not null default 'user_input' check (source in ('pdf_parse', 'user_input')),
  source_doc_url  text,
  created_at      timestamptz not null default now()
);

create index idx_investor_criteria_active on public.investor_criteria(investor_id, criteria_key) where effective_to is null;

create table public.deal_evaluations (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  validation_id            uuid references public.borrower_validations(id) on delete set null,
  borrower_id              uuid references public.borrowers(id) on delete set null,
  property_id              uuid references public.properties(id) on delete set null,
  purchase_price           numeric(14,2),
  arv                      numeric(14,2),
  rehab_budget             numeric(14,2),
  loan_amount              numeric(14,2),
  loan_type                text,
  property_type            text,
  location                 text,
  sponsor_experience_tier  integer check (sponsor_experience_tier between 1 and 4),
  fico                     integer,
  additional_params        jsonb not null default '{}',
  evaluated_at             timestamptz not null default now(),
  evaluated_by_user_id     uuid references public.users(id) on delete set null
);

create index idx_deal_evaluations_org on public.deal_evaluations(org_id);
create index idx_deal_evaluations_validation on public.deal_evaluations(validation_id);
create index idx_deal_evaluations_borrower on public.deal_evaluations(borrower_id);

create table public.deal_eligibility_results (
  id                  uuid primary key default gen_random_uuid(),
  deal_evaluation_id  uuid not null references public.deal_evaluations(id) on delete cascade,
  investor_id         uuid not null references public.investors(id) on delete cascade,
  result              text not null check (result in ('pass', 'conditional', 'fail')),
  computed_terms      jsonb not null default '{}',
  reasoning           text,
  computed_at         timestamptz not null default now()
);

create index idx_deal_eligibility_evaluation on public.deal_eligibility_results(deal_evaluation_id);
create index idx_deal_eligibility_investor on public.deal_eligibility_results(investor_id);

-- ── Nullable FK columns on existing snapshot tables ──────────────────────

alter table public.borrower_validations
  add column if not exists primary_borrower_id    uuid references public.borrowers(id) on delete set null,
  add column if not exists primary_entity_id      uuid references public.entities(id) on delete set null,
  add column if not exists guarantor_borrower_id  uuid references public.borrowers(id) on delete set null;

create index if not exists idx_validations_primary_borrower on public.borrower_validations(primary_borrower_id);
create index if not exists idx_validations_primary_entity on public.borrower_validations(primary_entity_id);

alter table public.entity_checks
  add column if not exists entity_id uuid references public.entities(id) on delete set null;

create index if not exists idx_entity_checks_entity on public.entity_checks(entity_id);

alter table public.track_record_entries
  add column if not exists property_id          uuid references public.properties(id) on delete set null,
  add column if not exists owning_entity_id     uuid references public.entities(id) on delete set null,
  add column if not exists owning_borrower_id   uuid references public.borrowers(id) on delete set null,
  add column if not exists lender_id            uuid references public.lenders(id) on delete set null,
  add column if not exists active_ownership_id  uuid references public.property_ownership(id) on delete set null;

create index if not exists idx_track_record_property on public.track_record_entries(property_id);
create index if not exists idx_track_record_owning_entity on public.track_record_entries(owning_entity_id);
create index if not exists idx_track_record_owning_borrower on public.track_record_entries(owning_borrower_id);
create index if not exists idx_track_record_lender on public.track_record_entries(lender_id);

alter table public.verified_flips
  add column if not exists property_id         uuid references public.properties(id) on delete set null,
  add column if not exists owning_entity_id    uuid references public.entities(id) on delete set null,
  add column if not exists owning_borrower_id  uuid references public.borrowers(id) on delete set null;

create index if not exists idx_verified_flips_property on public.verified_flips(property_id);

alter table public.litigation_checks
  add column if not exists target_borrower_id  uuid references public.borrowers(id) on delete set null,
  add column if not exists target_entity_id    uuid references public.entities(id) on delete set null;

create index if not exists idx_litigation_target_borrower on public.litigation_checks(target_borrower_id);
create index if not exists idx_litigation_target_entity on public.litigation_checks(target_entity_id);

alter table public.sanctions_checks
  add column if not exists primary_borrower_id  uuid references public.borrowers(id) on delete set null,
  add column if not exists primary_entity_id    uuid references public.entities(id) on delete set null;

create index if not exists idx_sanctions_primary_borrower on public.sanctions_checks(primary_borrower_id);
create index if not exists idx_sanctions_primary_entity on public.sanctions_checks(primary_entity_id);

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.borrowers enable row level security;
alter table public.entities enable row level security;
alter table public.borrower_entities enable row level security;
alter table public.lenders enable row level security;
alter table public.properties enable row level security;
alter table public.property_ownership enable row level security;
alter table public.borrower_signals enable row level security;
alter table public.property_signals enable row level security;
alter table public.borrower_property_signals enable row level security;
alter table public.entity_signals enable row level security;
alter table public.risk_factors enable row level security;
alter table public.investors enable row level security;
alter table public.investor_criteria enable row level security;
alter table public.deal_evaluations enable row level security;
alter table public.deal_eligibility_results enable row level security;

-- Direct org-scoped tables
create policy "borrowers_own_org" on public.borrowers
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "entities_own_org" on public.entities
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

-- Lenders may be global (org_id null) — readable by all; only org-owned mutable
create policy "lenders_read" on public.lenders
  for select using (
    org_id is null
    or org_id = (select org_id from public.users where id = auth.uid())
  );

create policy "lenders_write_own_org" on public.lenders
  for insert with check (org_id = (select org_id from public.users where id = auth.uid()));

create policy "lenders_update_own_org" on public.lenders
  for update using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "lenders_delete_own_org" on public.lenders
  for delete using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "properties_own_org" on public.properties
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "investors_own_org" on public.investors
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "deal_evaluations_own_org" on public.deal_evaluations
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

-- Tables scoped via parent
create policy "borrower_entities_via_borrower" on public.borrower_entities
  for all using (borrower_id in (
    select id from public.borrowers
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "property_ownership_via_property" on public.property_ownership
  for all using (property_id in (
    select id from public.properties
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "borrower_signals_via_borrower" on public.borrower_signals
  for all using (borrower_id in (
    select id from public.borrowers
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "property_signals_via_property" on public.property_signals
  for all using (property_id in (
    select id from public.properties
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "borrower_property_signals_via_borrower" on public.borrower_property_signals
  for all using (borrower_id in (
    select id from public.borrowers
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "entity_signals_via_entity" on public.entity_signals
  for all using (entity_id in (
    select id from public.entities
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "risk_factors_via_validation" on public.risk_factors
  for all using (validation_id in (
    select id from public.borrower_validations
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "investor_criteria_via_investor" on public.investor_criteria
  for all using (investor_id in (
    select id from public.investors
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "deal_eligibility_via_evaluation" on public.deal_eligibility_results
  for all using (deal_evaluation_id in (
    select id from public.deal_evaluations
    where org_id = (select org_id from public.users where id = auth.uid())
  ));
