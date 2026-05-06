-- 00032_bank_statements.sql
-- C5 — Bank statement parser substrate.
--
-- Borrower uploads a statement via share link → Claude extracts ending
-- balance, average daily balance, NSF count, monthly inflow total.
-- Summary persists per-validation for 90 days (privacy-sensitive: a
-- borrower's bank balance shouldn't sit in the database forever).
--
-- A liquidity risk factor that reads this row ships in a follow-up
-- once we have data to calibrate the thresholds.

begin;

create table public.bank_statement_summaries (
  id              uuid primary key default gen_random_uuid(),
  validation_id   uuid not null references public.borrower_validations(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  document_id     uuid references public.documents(id) on delete set null,
  -- Numeric extraction; nulls are explicit "model couldn't find".
  ending_balance_cents       bigint,
  avg_daily_balance_cents    bigint,
  monthly_inflow_cents       bigint,
  monthly_outflow_cents      bigint,
  nsf_count                  integer,
  statement_period_start     date,
  statement_period_end       date,
  -- Token + cost trail mirroring investor_criteria_extractions.
  raw_extraction             jsonb not null default '{}',
  input_tokens               integer,
  output_tokens              integer,
  expires_at                 timestamptz not null default (now() + interval '90 days'),
  created_by_user_id         uuid references public.users(id) on delete set null,
  created_at                 timestamptz not null default now()
);

create index idx_bank_statement_summaries_validation
  on public.bank_statement_summaries(validation_id);
create index idx_bank_statement_summaries_expires
  on public.bank_statement_summaries(expires_at);

alter table public.bank_statement_summaries enable row level security;

create policy "bank_statement_summaries_own_org" on public.bank_statement_summaries
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

commit;
