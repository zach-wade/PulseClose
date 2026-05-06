-- 00030_public_profiles.sql
-- E4 — Public borrower profile (schema only).
--
-- A borrower with strong PulseClose history can opt in to publishing a
-- verified track record at pulseclose.com/borrower/{slug}. This is
-- post-density-only (needs 10+ lenders to make consensus meaningful)
-- but the schema lands now so the data accumulates.
--
-- Per-element opt-in via profile_data JSONB → which fields the
-- borrower has explicitly authorized to display. Defaults to nothing
-- visible; the borrower toggles individual elements (validations
-- count, tier history, outcome counts, named lenders) before the
-- profile becomes live.
--
-- slug is the public URL component — uniquely indexed, lowercase
-- ASCII, generated from display_name + a random suffix at creation.

begin;

create table public.borrower_public_profiles (
  id              uuid primary key default gen_random_uuid(),
  borrower_id     uuid not null unique references public.borrowers(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$' and length(slug) between 4 and 80),
  is_published    boolean not null default false,
  -- Per-element opt-ins. Each key is a flag the borrower toggles in
  -- their share-link UI; the public renderer hides anything not
  -- explicitly enabled. JSONB so we can add new elements without a
  -- migration. schema_version stamped per cross-cutting principle 7.
  profile_data    jsonb not null default '{"schema_version": 1, "show_validation_count": false, "show_tier_history": false, "show_outcome_counts": false, "show_lender_names": false, "show_property_count": false}',
  consent_signed_at timestamptz,
  consent_ip      text,
  published_at    timestamptz,
  unpublished_at  timestamptz,
  view_count      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint borrower_public_profiles_data_versioned check (
    (profile_data ? 'schema_version') and ((profile_data ->> 'schema_version')::int = 1)
  )
);

create index idx_borrower_public_profiles_org on public.borrower_public_profiles(org_id);
create index idx_borrower_public_profiles_published on public.borrower_public_profiles(is_published) where is_published = true;

create trigger borrower_public_profiles_updated_at
  before update on public.borrower_public_profiles
  for each row execute function public.set_updated_at();

alter table public.borrower_public_profiles enable row level security;

-- Org-scoped read/write for the lending side. The public reader runs
-- under an admin client gated by slug + is_published + a SELECT query.
create policy "borrower_public_profiles_own_org" on public.borrower_public_profiles
  for all
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

commit;
