-- 00016_p0_corrections.sql
-- P0 corrections from the 2026-04-30 audit. See docs/ROADMAP.md → P0 — Corrections.
--
-- Sequenced sections (each idempotent within a single run):
--   §1 org_id denormalization on snapshot tables (entity_checks,
--      track_record_entries, gc_validations, litigation_checks). Swap RLS
--      from validation_id-subquery to direct org_id comparison.
--   §2 Missing timestamps on track_record_entries + gc_validations.
--   §3 Pre-flight duplicate guard for the unique-index conversion.
--   §4 Convert plain partial indexes (00010) to UNIQUE partial indexes on
--      signal/link tables.
--   §5 risk_factors.expires_at (per-factor staleness model).
--   §6 schema_version key inside object-shaped JSONB columns + CHECK
--      constraints. Array-shaped JSONB (input_warnings) is exempt.
--   §7 Lenders org→null escalation guard trigger.
--   §8 monitor_runs.adapter_results + email_status (used by PR 1 once
--      MONITOR_RUN_RESULTS_ENABLED env flips to true).
--   §9 recompute_risk_factors_atomic() RPC for atomic risk-factor recompute.
--
-- Pre-flight on 2026-04-30 confirmed: 0 orphan snapshot rows, 0 duplicate
-- active signal rows. Migration applies cleanly.

begin;

-- ─── §1 org_id denormalization on snapshot tables ─────────────────────────
-- Adds org_id NOT NULL with FK + index, swaps RLS to direct comparison.
-- All four snapshot tables previously inherited org via FK to
-- borrower_validations(id) which forced an expensive subquery in RLS.

alter table public.entity_checks
  add column if not exists org_id uuid;
update public.entity_checks ec
  set org_id = bv.org_id
  from public.borrower_validations bv
  where ec.validation_id = bv.id and ec.org_id is null;
alter table public.entity_checks
  alter column org_id set not null,
  add constraint entity_checks_org_fk foreign key (org_id)
    references public.organizations(id) on delete cascade;
-- entity_checks uses `check_date` (not created_at) per 00001_foundation.sql.
create index if not exists idx_entity_checks_org_checked
  on public.entity_checks(org_id, check_date desc);
drop policy if exists entity_checks_via_validation on public.entity_checks;
create policy "entity_checks_own_org" on public.entity_checks
  for all
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

alter table public.track_record_entries
  add column if not exists org_id uuid;
update public.track_record_entries tre
  set org_id = bv.org_id
  from public.borrower_validations bv
  where tre.validation_id = bv.id and tre.org_id is null;
alter table public.track_record_entries
  alter column org_id set not null,
  add constraint track_record_entries_org_fk foreign key (org_id)
    references public.organizations(id) on delete cascade;
create index if not exists idx_track_record_entries_org_created
  on public.track_record_entries(org_id);
drop policy if exists track_record_via_validation on public.track_record_entries;
create policy "track_record_entries_own_org" on public.track_record_entries
  for all
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

alter table public.gc_validations
  add column if not exists org_id uuid;
update public.gc_validations gv
  set org_id = bv.org_id
  from public.borrower_validations bv
  where gv.validation_id = bv.id and gv.org_id is null;
alter table public.gc_validations
  alter column org_id set not null,
  add constraint gc_validations_org_fk foreign key (org_id)
    references public.organizations(id) on delete cascade;
create index if not exists idx_gc_validations_org
  on public.gc_validations(org_id);
drop policy if exists gc_via_validation on public.gc_validations;
create policy "gc_validations_own_org" on public.gc_validations
  for all
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

alter table public.litigation_checks
  add column if not exists org_id uuid;
update public.litigation_checks lc
  set org_id = bv.org_id
  from public.borrower_validations bv
  where lc.validation_id = bv.id and lc.org_id is null;
alter table public.litigation_checks
  alter column org_id set not null,
  add constraint litigation_checks_org_fk foreign key (org_id)
    references public.organizations(id) on delete cascade;
-- litigation_checks uses `check_date` (not created_at) per 00001_foundation.sql.
create index if not exists idx_litigation_checks_org_checked
  on public.litigation_checks(org_id, check_date desc);
drop policy if exists litigation_via_validation on public.litigation_checks;
create policy "litigation_checks_own_org" on public.litigation_checks
  for all
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

-- ─── §2 Missing timestamps ────────────────────────────────────────────────

alter table public.track_record_entries
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_track_record_entries_updated_at on public.track_record_entries;
create trigger set_track_record_entries_updated_at
  before update on public.track_record_entries
  for each row execute function public.set_updated_at();

alter table public.gc_validations
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_gc_validations_updated_at on public.gc_validations;
create trigger set_gc_validations_updated_at
  before update on public.gc_validations
  for each row execute function public.set_updated_at();

-- ─── §3 Pre-flight duplicate guard ────────────────────────────────────────
-- Re-checks what scripts/cleanup-active-duplicates.ts already ran. Belt
-- and suspenders: a duplicate sneaking in between the cleanup and this
-- migration's apply would otherwise fail §4 with an opaque error.

do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count from (
    select borrower_id, signal_key
    from public.borrower_signals where superseded_at is null
    group by 1, 2 having count(*) > 1
  ) x;
  if dup_count > 0 then
    raise exception 'borrower_signals has % duplicate active groups — run scripts/cleanup-active-duplicates.ts first', dup_count;
  end if;

  select count(*) into dup_count from (
    select property_id, signal_key
    from public.property_signals where superseded_at is null
    group by 1, 2 having count(*) > 1
  ) x;
  if dup_count > 0 then
    raise exception 'property_signals has % duplicate active groups', dup_count;
  end if;

  select count(*) into dup_count from (
    select borrower_id, property_id, signal_key
    from public.borrower_property_signals where superseded_at is null
    group by 1, 2, 3 having count(*) > 1
  ) x;
  if dup_count > 0 then
    raise exception 'borrower_property_signals has % duplicate active groups', dup_count;
  end if;

  select count(*) into dup_count from (
    select entity_id, signal_key
    from public.entity_signals where superseded_at is null
    group by 1, 2 having count(*) > 1
  ) x;
  if dup_count > 0 then
    raise exception 'entity_signals has % duplicate active groups', dup_count;
  end if;

  select count(*) into dup_count from (
    select borrower_id, entity_id
    from public.borrower_entities where superseded_at is null
    group by 1, 2 having count(*) > 1
  ) x;
  if dup_count > 0 then
    raise exception 'borrower_entities has % duplicate active groups', dup_count;
  end if;
end $$;

-- ─── §4 UNIQUE partial indexes on signal/link tables ──────────────────────
-- Drop the plain partial indexes from 00010 and recreate as UNIQUE so the
-- DB enforces "one active row per logical key" instead of relying on app
-- code's pre-check + insert (which is racey).

drop index if exists public.idx_borrower_signals_active;
create unique index borrower_signals_active_uidx
  on public.borrower_signals(borrower_id, signal_key)
  where superseded_at is null;

drop index if exists public.idx_property_signals_active;
create unique index property_signals_active_uidx
  on public.property_signals(property_id, signal_key)
  where superseded_at is null;

drop index if exists public.idx_borrower_property_signals_active;
create unique index borrower_property_signals_active_uidx
  on public.borrower_property_signals(borrower_id, property_id, signal_key)
  where superseded_at is null;

drop index if exists public.idx_entity_signals_active;
create unique index entity_signals_active_uidx
  on public.entity_signals(entity_id, signal_key)
  where superseded_at is null;

drop index if exists public.idx_borrower_entities_active;
create unique index borrower_entities_active_uidx
  on public.borrower_entities(borrower_id, entity_id)
  where superseded_at is null;

-- ─── §5 risk_factors.expires_at ───────────────────────────────────────────
-- Per-factor staleness model. e.g. active_litigation should expire 5 years
-- after case_filed_at if no disposition; sanctions_hit never expires.
-- App-side computes the value when emitting factors (PR 5+).

alter table public.risk_factors
  add column if not exists expires_at timestamptz;
create index if not exists idx_risk_factors_expires
  on public.risk_factors(expires_at)
  where expires_at is not null;

-- ─── §6 schema_version inside JSONB ───────────────────────────────────────
-- Object-shaped JSONB columns get a schema_version key + CHECK requiring
-- presence. Array-shaped columns (input_warnings) are exempt — wrapping
-- them would change reader contracts; deferred to a future schema change.
--
-- Strategy: backfill existing rows first, then add CHECK. Existing rows
-- with NULL stay NULL (the CHECK allows null OR `? schema_version`).

update public.borrower_validations
  set ai_analysis = ai_analysis || jsonb_build_object('schema_version', 1)
  where ai_analysis is not null
    and jsonb_typeof(ai_analysis) = 'object'
    and not (ai_analysis ? 'schema_version');

alter table public.borrower_validations
  add constraint borrower_validations_ai_analysis_versioned
  check (
    ai_analysis is null
    or jsonb_typeof(ai_analysis) <> 'object'
    or (ai_analysis ? 'schema_version')
  );

update public.borrower_validations
  set handoff_data = handoff_data || jsonb_build_object('schema_version', 1)
  where handoff_data is not null
    and jsonb_typeof(handoff_data) = 'object'
    and not (handoff_data ? 'schema_version');

alter table public.borrower_validations
  add constraint borrower_validations_handoff_data_versioned
  check (
    handoff_data is null
    or jsonb_typeof(handoff_data) <> 'object'
    or (handoff_data ? 'schema_version')
  );

-- investor_criteria.criteria_value: per-row JSONB whose shape is determined
-- by criteria_key. Some shapes are scalars/arrays (e.g. min_fico = 680,
-- loan_types = [...]), so we DO NOT add a schema_version key here. Schema
-- evolution happens at the criteria_key registry level.

-- *_signals.signal_value: same story — value shape varies by signal_key
-- (boolean for is_primary_residence, enum for occupancy_role, etc.).
-- Skip the schema_version stamp on these columns.

-- risk_factors.contributing_data: object-shaped per factor_key. Stamp it.
update public.risk_factors
  set contributing_data = contributing_data || jsonb_build_object('schema_version', 1)
  where contributing_data is not null
    and jsonb_typeof(contributing_data) = 'object'
    and not (contributing_data ? 'schema_version');

alter table public.risk_factors
  add constraint risk_factors_contributing_data_versioned
  check (
    contributing_data is null
    or jsonb_typeof(contributing_data) <> 'object'
    or (contributing_data ? 'schema_version')
  );

-- ─── §7 Lenders org→null escalation guard ─────────────────────────────────
-- An org-scoped lender (org_id = <uuid>) MUST NOT be UPDATEd to org_id =
-- NULL because that escalates it to a global classifier visible to every
-- tenant. INSERTs of global rows from FDIC ingest are still allowed.

create or replace function public.guard_lender_org_escalation()
returns trigger language plpgsql as $$
begin
  if old.org_id is not null and new.org_id is null then
    raise exception 'Cannot escalate org-scoped lender to global (org_id NULL). Lender id=%', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists lenders_org_guard on public.lenders;
create trigger lenders_org_guard
  before update on public.lenders
  for each row execute function public.guard_lender_org_escalation();

-- ─── §8 monitor_runs new columns ──────────────────────────────────────────
-- Used by PR 1's runner refactor once MONITOR_RUN_RESULTS_ENABLED=true
-- env var is set. adapter_results captures per-vendor status (ok |
-- rate_limited | failed | skipped) so the dashboard can show partial
-- monitoring runs honestly. email_status closes the silent-failure gap
-- where Resend went down and the run was marked complete anyway.

alter table public.monitor_runs
  add column if not exists adapter_results jsonb default '{}'::jsonb,
  add column if not exists email_status text
    check (email_status in ('sent', 'failed', 'skipped'));

create index if not exists idx_monitor_runs_email_status
  on public.monitor_runs(email_status)
  where email_status = 'failed';

-- ─── §9 Atomic risk-factor recompute RPC ──────────────────────────────────
-- Called from src/lib/risk/persist.ts (post-deploy of this migration).
-- Replaces the non-transactional delete + insert. security definer so RLS
-- doesn't get in the way; the function only writes into risk_factors and
-- borrower_validations.flag_count, both of which the caller already has
-- update access to via app-side checks.

create or replace function public.recompute_risk_factors_atomic(
  p_validation_id uuid,
  p_factors jsonb,           -- array of factor objects
  p_flag_count int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.risk_factors where validation_id = p_validation_id;

  if jsonb_array_length(p_factors) > 0 then
    insert into public.risk_factors (
      validation_id,
      factor_key,
      severity,
      excluded,
      exclusion_reason,
      contributing_data,
      explanation,
      expires_at
    )
    select
      p_validation_id,
      f->>'factor_key',
      f->>'severity',
      coalesce((f->>'excluded')::boolean, false),
      f->>'exclusion_reason',
      coalesce(f->'contributing_data', '{}'::jsonb)
        || jsonb_build_object('schema_version', 1),
      f->>'explanation',
      case when f ? 'expires_at' then (f->>'expires_at')::timestamptz else null end
    from jsonb_array_elements(p_factors) f;
  end if;

  update public.borrower_validations
    set flag_count = p_flag_count, updated_at = now()
    where id = p_validation_id;
end;
$$;

revoke all on function public.recompute_risk_factors_atomic(uuid, jsonb, int) from public;
grant execute on function public.recompute_risk_factors_atomic(uuid, jsonb, int) to authenticated, service_role;

commit;
