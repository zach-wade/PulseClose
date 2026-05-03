-- 00024_investor_extractions.sql
-- Audit trail for A1 — investor criteria PDF parser. Each extraction
-- attempt persists the raw Claude output so we can:
--   - Track Claude cost per investor (input/output tokens × model).
--   - Diff what Claude proposed vs what the lender accepted (for prompt
--     iteration without a rebuild).
--   - Restore from history if a saved criteria set turns out wrong.
--
-- The actual investor_criteria rows still live in their existing table
-- (00010_domain_entities.sql). This is purely the trace of where they
-- came from. source='pdf_parse' on investor_criteria already exists.

begin;

create table public.investor_criteria_extractions (
  id                   uuid primary key default gen_random_uuid(),
  investor_id          uuid not null references public.investors(id) on delete cascade,
  org_id               uuid not null references public.organizations(id) on delete cascade,
  document_id          uuid references public.documents(id) on delete set null,
  raw_extraction       jsonb not null,
  accepted_rows        jsonb not null default '[]',
  accepted_by_user_id  uuid references public.users(id),
  accepted_at          timestamptz,
  claude_model         text not null,
  input_tokens         integer,
  output_tokens        integer,
  stop_reason          text,
  created_at           timestamptz not null default now()
);

create index idx_investor_extractions_investor on public.investor_criteria_extractions(investor_id, created_at desc);
create index idx_investor_extractions_org on public.investor_criteria_extractions(org_id);

alter table public.investor_criteria_extractions enable row level security;

create policy "investor_extractions_own_org" on public.investor_criteria_extractions
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

commit;
