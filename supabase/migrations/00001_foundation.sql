-- PulseClose Foundation Schema
-- Borrower validation for bridge lenders

-- ── Organizations ──

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  plan        text not null default 'starter' check (plan in ('starter', 'pro', 'enterprise')),
  settings    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Users ──

create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  full_name   text not null,
  role        text not null default 'analyst' check (role in ('owner', 'admin', 'analyst', 'viewer')),
  created_at  timestamptz not null default now()
);

create index idx_users_org on public.users(org_id);

-- ── Borrower Validations (top-level record per validation run) ──

create table public.borrower_validations (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  borrower_name         text not null,
  borrower_entity_name  text,
  guarantor_name        text,
  overall_status        text not null default 'pending' check (overall_status in ('pending', 'verified', 'partial', 'flagged')),
  confidence_score      integer not null default 0 check (confidence_score between 0 and 100),
  experience_tier       integer check (experience_tier between 1 and 4),
  validation_date       timestamptz,
  created_by            uuid references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_validations_org on public.borrower_validations(org_id);

-- ── Entity Checks ──

create table public.entity_checks (
  id                uuid primary key default gen_random_uuid(),
  validation_id     uuid not null references public.borrower_validations(id) on delete cascade,
  entity_name       text not null,
  state             text not null,
  entity_type       text, -- LLC, Corp, LP, Trust
  sos_status        text not null default 'pending' check (sos_status in ('active', 'suspended', 'dissolved', 'not_found', 'pending')),
  formation_date    date,
  last_filing_date  date,
  registered_agent  text,
  source_url        text,
  check_date        timestamptz not null default now(),
  confidence        text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  flags             jsonb not null default '[]',
  raw_response      jsonb -- full vendor API response for audit trail
);

create index idx_entity_checks_validation on public.entity_checks(validation_id);

-- ── Track Record Entries ──

create table public.track_record_entries (
  id                uuid primary key default gen_random_uuid(),
  validation_id     uuid not null references public.borrower_validations(id) on delete cascade,
  property_address  text not null,
  acquisition_date  date,
  disposition_date  date,
  acquisition_price numeric(14,2),
  disposition_price numeric(14,2),
  rehab_cost        numeric(14,2),
  project_type      text check (project_type in ('flip', 'ground_up', 'hold', 'rehab')),
  outcome           text check (outcome in ('completed', 'in_progress', 'distressed', 'foreclosed')),
  hold_months       integer,
  profit            numeric(14,2),
  source            text not null default 'manual',
  confidence        text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  verified          boolean not null default false,
  raw_response      jsonb
);

create index idx_track_record_validation on public.track_record_entries(validation_id);

-- ── GC Validations ──

create table public.gc_validations (
  id                      uuid primary key default gen_random_uuid(),
  validation_id           uuid not null references public.borrower_validations(id) on delete cascade,
  gc_name                 text not null,
  license_number          text,
  license_state           text not null,
  license_status          text not null default 'active' check (license_status in ('active', 'expired', 'suspended', 'revoked')),
  license_classification  text,
  expiration_date         date,
  disciplinary_actions    jsonb not null default '[]',
  related_party_flag      boolean not null default false,
  insurance_verified      boolean not null default false,
  source_url              text,
  confidence              text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  raw_response            jsonb
);

create index idx_gc_validations_validation on public.gc_validations(validation_id);

-- ── Litigation Checks ──

create table public.litigation_checks (
  id              uuid primary key default gen_random_uuid(),
  validation_id   uuid not null references public.borrower_validations(id) on delete cascade,
  search_type     text not null check (search_type in ('bankruptcy', 'foreclosure', 'lawsuit', 'lis_pendens')),
  entity_name     text not null,
  result          text not null default 'pending' check (result in ('clear', 'found', 'pending')),
  details         text,
  case_number     text,
  source          text not null default 'manual',
  check_date      timestamptz not null default now(),
  confidence      text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  raw_response    jsonb
);

create index idx_litigation_checks_validation on public.litigation_checks(validation_id);

-- ── Usage Metering (billing, cost tracking) ──

create table public.usage_records (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  validation_id   uuid references public.borrower_validations(id) on delete set null,
  check_type      text not null, -- 'sos_lookup', 'property_search', 'pacer_search', etc.
  data_source     text not null, -- 'cobalt', 'attom', 'pacer', etc.
  cost_cents      integer not null default 0,
  response_status text not null default 'success' check (response_status in ('success', 'error', 'partial')),
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create index idx_usage_org on public.usage_records(org_id);
create index idx_usage_created on public.usage_records(created_at);

-- ── Audit Log ──

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references public.users(id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index idx_audit_org on public.audit_log(org_id);
create index idx_audit_created on public.audit_log(created_at);

-- ── Row Level Security ──

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.borrower_validations enable row level security;
alter table public.entity_checks enable row level security;
alter table public.track_record_entries enable row level security;
alter table public.gc_validations enable row level security;
alter table public.litigation_checks enable row level security;
alter table public.usage_records enable row level security;
alter table public.audit_log enable row level security;

-- Users can only see their own org's data
create policy "users_own_org" on public.users
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "org_members" on public.organizations
  for select using (id in (select org_id from public.users where id = auth.uid()));

create policy "validations_own_org" on public.borrower_validations
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "entity_checks_via_validation" on public.entity_checks
  for all using (validation_id in (
    select id from public.borrower_validations
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "track_record_via_validation" on public.track_record_entries
  for all using (validation_id in (
    select id from public.borrower_validations
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "gc_via_validation" on public.gc_validations
  for all using (validation_id in (
    select id from public.borrower_validations
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "litigation_via_validation" on public.litigation_checks
  for all using (validation_id in (
    select id from public.borrower_validations
    where org_id = (select org_id from public.users where id = auth.uid())
  ));

create policy "usage_own_org" on public.usage_records
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "audit_own_org" on public.audit_log
  for all using (org_id = (select org_id from public.users where id = auth.uid()));
