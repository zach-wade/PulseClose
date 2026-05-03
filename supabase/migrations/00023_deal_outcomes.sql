-- 00023_deal_outcomes.sql
-- Deal outcome capture (E1) — the missing measurement substrate. Without
-- this, every Stage 5 (route) and Stage 6 (handoff) output is
-- unmeasurable. Unlocks E2 (borrower reputation), E3 (cross-tenant
-- consensus), A4 (investor performance dashboard), A5 (originator
-- scorecard).
--
-- One row per validation. Last status wins via UPSERT — outcome is a
-- lender observation that can change (deal Withdrawn → re-engaged →
-- Funded → later Defaulted), so we replace rather than append. If we
-- ever need outcome history, that's a separate `deal_outcome_events`
-- append-only log; for v1, current state is sufficient.
--
-- Per-status optional fields live in outcome_data JSONB. Schema-versioned
-- with CHECK constraint per the JSONB principle (jsonb.ts mirror).

begin;

create table public.deal_outcomes (
  id              uuid primary key default gen_random_uuid(),
  validation_id   uuid not null unique references public.borrower_validations(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  status          text not null check (status in ('withdrawn', 'funded', 'extended', 'repaid', 'defaulted')),
  outcome_data    jsonb not null default '{"schema_version": 1}',
  lender_user_id  uuid not null references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint deal_outcomes_data_versioned check (
    (outcome_data ? 'schema_version') and ((outcome_data ->> 'schema_version')::int = 1)
  )
);

create index idx_deal_outcomes_org on public.deal_outcomes(org_id);
create index idx_deal_outcomes_status on public.deal_outcomes(org_id, status);

create trigger deal_outcomes_updated_at
  before update on public.deal_outcomes
  for each row execute function public.set_updated_at();

alter table public.deal_outcomes enable row level security;

create policy "deal_outcomes_own_org" on public.deal_outcomes
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

commit;
