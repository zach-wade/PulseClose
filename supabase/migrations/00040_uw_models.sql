-- 00040_uw_models.sql
-- Underwriting Workbench (Module 10) + AI UW Copilot (Module 6).
--
-- A uw_model is one loan-sizing analysis for a deal: the lender's sizing
-- inputs (income / value / cost / terms / constraints), the engine's sized
-- result (max loan = MIN across LTV/LTC/LTARV/DSCR/debt-yield + the binding
-- constraint), and an optional AI judgment (Damon's 5-dimension framework +
-- 5-concept lens + deal-killers + stance).
--
-- The sizing engine is deterministic (src/lib/underwriting/sizing.ts); the AI
-- only narrates/judges structure — it never sets the loan amount (same
-- discipline as the risk memo, where the deterministic tier wins).
--
-- Links (both nullable — the workbench is standalone-capable):
--   * deal_evaluation_id → the eligibility run it was sized alongside
--   * validation_id       → the borrower validation it belongs to (if any)
--
-- JSONB columns carry schema_version (Zod schemas in src/lib/schemas/jsonb.ts:
-- uwSizingInputsV1 / uwSizingResultV1 / uwJudgmentV1) + CHECK constraints, per
-- the repo's JSONB convention. judgment is null until the lender runs the AI
-- pass; judgment_version increments on each regeneration.

begin;

create table if not exists public.uw_models (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  deal_evaluation_id  uuid references public.deal_evaluations(id) on delete cascade,
  validation_id       uuid references public.borrower_validations(id) on delete set null,
  template            text not null default 'bridge_value_add',
  inputs              jsonb not null,
  sizing              jsonb not null,
  per_investor        jsonb not null default '[]'::jsonb,
  judgment            jsonb,
  judgment_version    integer not null default 0,
  judgment_model      text,
  created_by_user_id  uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_uw_models_org on public.uw_models(org_id);
create index if not exists idx_uw_models_deal_evaluation on public.uw_models(deal_evaluation_id);
create index if not exists idx_uw_models_validation on public.uw_models(validation_id);

-- schema_version enforcement on the object-shaped JSONB columns (mirrors the
-- ai_analysis CHECK in 00016). per_investor is an array — exempt.
alter table public.uw_models
  add constraint uw_models_inputs_versioned
  check (jsonb_typeof(inputs) <> 'object' or (inputs ? 'schema_version'));

alter table public.uw_models
  add constraint uw_models_sizing_versioned
  check (jsonb_typeof(sizing) <> 'object' or (sizing ? 'schema_version'));

alter table public.uw_models
  add constraint uw_models_judgment_versioned
  check (judgment is null or jsonb_typeof(judgment) <> 'object' or (judgment ? 'schema_version'));

alter table public.uw_models enable row level security;

create policy "uw_models_own_org" on public.uw_models
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

commit;
