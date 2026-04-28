-- Sanctions / PEP screening
-- Stores OFAC SDN + global sanctions + PEP results per validation.
-- One row per validation (the screen produces a single combined result).

create table public.sanctions_checks (
  id                uuid primary key default gen_random_uuid(),
  validation_id     uuid not null references public.borrower_validations(id) on delete cascade,
  borrower_name     text not null,
  entity_name       text,
  guarantor_name    text,
  result            text not null default 'pending' check (result in ('clear', 'potential_match', 'not_run', 'pending')),
  match_count       integer not null default 0,
  matches           jsonb not null default '[]',     -- array of SanctionsMatch records
  sources_searched  jsonb not null default '[]',     -- array of list names
  source            text not null default 'unknown', -- adapter used: "OpenSanctions" | "OFAC SDN (direct)" | "stub"
  check_date        timestamptz not null default now(),
  raw_response      jsonb
);

create index idx_sanctions_checks_validation on public.sanctions_checks(validation_id);
create index idx_sanctions_checks_result on public.sanctions_checks(result) where result = 'potential_match';

alter table public.sanctions_checks enable row level security;

create policy "sanctions_via_validation" on public.sanctions_checks
  for all using (validation_id in (
    select id from public.borrower_validations
    where org_id = (select org_id from public.users where id = auth.uid())
  ));
