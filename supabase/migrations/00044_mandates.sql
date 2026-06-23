-- 00044_mandates.sql
-- Capital-provider mandates (Item 4) — the encoding of a fund's borrower-
-- validation standard, and the per-validation assessment against it.
--
-- A mandate is owned by an investor (the fund/capital provider already
-- modeled in `investors`) and holds DILIGENCE gates — fund risk policy that a
-- borrower validation must clear (max risk tier, no active litigation, no
-- sanctions hit, SOS active, experience/confidence floors, GC active). The
-- deal-eligibility half is NOT duplicated here: an optional gate references
-- the existing evaluate result (deal_eligibility_results) for the investor.
--
-- mandate_assessments is the per-(validation, mandate) result — persisted so
-- the stamp is auditable, fast to read on the detail page + handoff, and
-- emittable as a mandate.assessed webhook. Auto-assessed on validation
-- completion and re-assessable on demand; the unique (validation_id,
-- mandate_id) lets a re-assessment upsert in place.

begin;

create table if not exists public.investor_mandates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  investor_id   uuid not null references public.investors(id) on delete cascade,
  name          text not null,
  -- Diligence gates (mandateGatesV1 in src/lib/schemas/jsonb.ts).
  gates         jsonb not null,
  enabled       boolean not null default true,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_investor_mandates_org on public.investor_mandates(org_id) where enabled;
create index if not exists idx_investor_mandates_investor on public.investor_mandates(investor_id);

alter table public.investor_mandates
  add constraint investor_mandates_gates_versioned
  check (jsonb_typeof(gates) <> 'object' or (gates ? 'schema_version'));

create trigger investor_mandates_updated_at
  before update on public.investor_mandates
  for each row execute function public.set_updated_at();

alter table public.investor_mandates enable row level security;

create policy "investor_mandates_own_org" on public.investor_mandates
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

-- ── mandate_assessments — per-validation stamp ───────────────────────────
create table if not exists public.mandate_assessments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  validation_id uuid not null references public.borrower_validations(id) on delete cascade,
  mandate_id    uuid not null references public.investor_mandates(id) on delete cascade,
  investor_id   uuid not null references public.investors(id) on delete cascade,
  result        text not null check (result in ('pass', 'conditional', 'fail')),
  -- Failure reasons (mandateAssessmentDetailV1) — [] on a clean pass.
  failures      jsonb not null default '[]'::jsonb,
  assessed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (validation_id, mandate_id)
);

create index if not exists idx_mandate_assessments_validation on public.mandate_assessments(validation_id);
create index if not exists idx_mandate_assessments_mandate on public.mandate_assessments(mandate_id);
create index if not exists idx_mandate_assessments_org_assessed on public.mandate_assessments(org_id, assessed_at desc);

create trigger mandate_assessments_updated_at
  before update on public.mandate_assessments
  for each row execute function public.set_updated_at();

alter table public.mandate_assessments enable row level security;

create policy "mandate_assessments_own_org" on public.mandate_assessments
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

commit;
