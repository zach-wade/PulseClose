-- 00034_lender_overrides.sql
-- Lender override + edit substrate.
--
-- Three new pieces, one purpose: let the lender's domain knowledge
-- be a first-class input alongside vendor data, with an audit trail
-- the receiving investor can see.
--
-- 1. data_edits — append-only audit log of every lender edit to
--    vendor-returned data. Per-row, per-field, before+after value.
--    Investor handoff renders this so they know which fields are
--    pure vendor truth vs. lender-corrected.
--
-- 2. factor_overrides — manual exclusion of a derived risk factor
--    with a free-text reason. The factors engine reads this at
--    compute time and applies the exclusion alongside the
--    deterministic exclusions (primary_residence etc.). Independent
--    from signals (which override at the property/borrower level).
--
-- 3. Adds source columns to litigation_cases so manually-added
--    cases (vendors missed it) can be distinguished from automated
--    CourtListener results. track_record_entries already has source.

begin;

-- ── data_edits ─────────────────────────────────────────────────────────
create table public.data_edits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  validation_id   uuid not null references public.borrower_validations(id) on delete cascade,
  table_name      text not null check (table_name in (
    'track_record_entries','litigation_cases','entity_checks','sanctions_checks','gc_validations'
  )),
  row_id          uuid not null,
  field_name      text not null,
  value_before    jsonb,
  value_after     jsonb,
  edit_kind       text not null default 'update' check (edit_kind in ('update','add','delete')),
  reason          text,
  edited_by_user_id uuid not null references public.users(id),
  edited_at       timestamptz not null default now()
);

create index idx_data_edits_validation on public.data_edits(validation_id, edited_at desc);
create index idx_data_edits_org on public.data_edits(org_id);

alter table public.data_edits enable row level security;
create policy "data_edits_own_org" on public.data_edits
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

-- ── factor_overrides ───────────────────────────────────────────────────
create table public.factor_overrides (
  id              uuid primary key default gen_random_uuid(),
  validation_id   uuid not null references public.borrower_validations(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  factor_key      text not null,
  excluded        boolean not null default true,
  exclusion_reason text not null,
  set_by_user_id  uuid not null references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (validation_id, factor_key)
);

create index idx_factor_overrides_validation on public.factor_overrides(validation_id);

create trigger factor_overrides_updated_at
  before update on public.factor_overrides
  for each row execute function public.set_updated_at();

alter table public.factor_overrides enable row level security;
create policy "factor_overrides_own_org" on public.factor_overrides
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

-- ── Source columns ─────────────────────────────────────────────────────
-- track_record_entries already has `source` (realie/regrid/attom/manual).
-- litigation_cases needs one for manual additions vs. CourtListener.
alter table public.litigation_cases
  add column if not exists source text not null default 'courtlistener'
    check (source in ('courtlistener','manual','other'));

-- A free-text notes column on litigation_cases — lender annotations
-- the receiving investor will see. Distinct from the lender-edit log
-- (this is one stable field, edits are append-only history).
alter table public.litigation_cases
  add column if not exists lender_notes text;

-- Same on track_record_entries — lender's per-property note.
alter table public.track_record_entries
  add column if not exists lender_notes text;

commit;
