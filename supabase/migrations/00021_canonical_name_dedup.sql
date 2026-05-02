-- 00021_canonical_name_dedup.sql
--
-- Fix a silent data-integrity bug in the borrower/entity/lender domain dedup
-- key. The existing `normalized_name` column (a generated column computed
-- from `public.normalize_text(display_name)`) just lowercases + collapses
-- whitespace. That makes "Kim An Truong" and "TRUONG, KIM AN" produce
-- DIFFERENT keys ("kim an truong" vs "truong, kim an"), so two upserts of
-- the same person from different sources create two domain rows. Path B
-- treats borrowers as canonical, but the canonical key was format-fragile.
--
-- The same bug affects entities ("TT Investment Properties, LLC" vs
-- "TT INVESTMENT PROPERTIES LLC") and lenders ("Rocket Mortgage LLC" vs
-- "Rocket Mortgage, LLC").
--
-- Fix: add a `canonicalize_name(text)` SQL function that tokenizes on
-- non-alphanumeric, drops short noise tokens + LLC/Inc/etc. suffixes, sorts
-- the remaining tokens, and joins. "Kim An Truong" → "an kim truong".
-- "TRUONG, KIM AN" → "an kim truong". "TT Investment Properties, LLC" →
-- "investment properties tt". Same shape regardless of input ordering or
-- punctuation.
--
-- Adds `normalized_canonical` as a NEW generated column (alongside the
-- existing `normalized_name` for any callers that depend on its current
-- semantics) and creates partial unique indexes on it. The application
-- upsert layer (src/lib/domain/upsert.ts) is updated in the same PR to
-- look up by canonical first; existing `normalized_name` indexes stay as
-- secondary lookup paths.
--
-- Properties' `address_normalized` has a similar fragility but addresses
-- need USPS-style parsing (suffix expansion, directional handling) which
-- is a bigger lift; deferred to a follow-up. See ROADMAP.md "Data integrity
-- — canonical keys".

begin;

-- ── canonicalize_name ────────────────────────────────────────────────────
--
-- Pure SQL implementation matching the JS `canonicalizeName` helper in
-- src/lib/domain/upsert.ts. They MUST stay in lockstep — the application
-- queries by `WHERE normalized_canonical = $jsCanonical`, so any drift
-- creates infinite duplicates instead of dedupes.
--
-- Logic:
--   1. lowercase
--   2. split on non-alphanumeric
--   3. drop tokens shorter than 2 chars
--   4. drop entity-suffix tokens (llc, inc, etc.) — caller chooses
--   5. sort remaining tokens
--   6. join with single space

create or replace function public.canonicalize_name(input text, strip_entity_suffixes boolean default false)
returns text
language sql
immutable
as $$
  -- Keep tokens of length >= 1 — single-letter prefixes ("S&T Bank",
  -- "F&M Bank", "J.P. Morgan") are meaningful and would silently collapse
  -- distinct entities together at length >= 2 (which the first version
  -- of this function used and which produced 4 false-positive bank merges
  -- on the FDIC dataset). For person names, set-inclusion remains an
  -- imperfect heuristic — names like "Kim An" can still false-match a
  -- larger superset like "An Soon Kim" — that's a known limit of fuzzy
  -- matching without DOB / SSN.
  select case
    when input is null then null
    else (
      select string_agg(t, ' ' order by t)
      from unnest(regexp_split_to_array(lower(input), '[^a-z0-9]+')) as t
      where length(t) >= 1
        and (
          not strip_entity_suffixes
          or t not in (
            'llc', 'inc', 'incorporated', 'corp', 'corporation',
            'ltd', 'limited', 'lp', 'llp', 'trust', 'company', 'co'
          )
        )
    )
  end;
$$;

-- ── borrowers ────────────────────────────────────────────────────────────

alter table public.borrowers
  add column if not exists normalized_canonical text
    generated always as (public.canonicalize_name(display_name, false)) stored;

create unique index if not exists borrowers_canonical_uidx
  on public.borrowers (org_id, normalized_canonical)
  where normalized_canonical is not null;

-- ── entities ─────────────────────────────────────────────────────────────
-- Entities dedup by (org_id, canonical, state). State separates a CA LLC
-- from a same-named NV LLC.

alter table public.entities
  add column if not exists normalized_canonical text
    generated always as (public.canonicalize_name(display_name, true)) stored;

create unique index if not exists entities_canonical_uidx
  on public.entities (org_id, normalized_canonical, state)
  where normalized_canonical is not null;

-- ── lenders ──────────────────────────────────────────────────────────────
-- Lenders are a special case: rows can be either org-scoped (org_id IS NOT
-- NULL — manually added per-tenant) or global (org_id IS NULL — FDIC-
-- ingested rows shared across tenants). Dedup separately for each.

alter table public.lenders
  add column if not exists normalized_canonical text
    generated always as (public.canonicalize_name(display_name, true)) stored;

create unique index if not exists lenders_canonical_org_uidx
  on public.lenders (org_id, normalized_canonical)
  where normalized_canonical is not null and org_id is not null;

-- Global lenders (org_id IS NULL — FDIC-ingested) are NOT uniqueness-constrained
-- on canonical name. FDIC's institution database legitimately contains multiple
-- distinct banks with similar names (e.g., "Security Bank and Trust" in TX vs.
-- "Security Bank and Loan" in IA — different cert numbers, different states,
-- different institutions). The authoritative dedup key for global rows is the
-- FDIC cert number (`fdic_id`), which 00010 already indexes. Application
-- lookups for global rows should prefer fdic_id when present and fall back to
-- a fuzzy normalized_canonical match accepting multiple matches.
create index if not exists lenders_canonical_global_idx
  on public.lenders (normalized_canonical)
  where normalized_canonical is not null and org_id is null;

-- ── verification helpers ─────────────────────────────────────────────────
-- These selects are read-only diagnostics the verify script can run after
-- apply. They surface any pre-existing duplicates that violated the new
-- canonical uniqueness — typically zero on a fresh install but useful when
-- re-applying to a tenant that has accumulated dirty rows.

do $$
declare
  borrower_dupes int;
  entity_dupes int;
  lender_dupes int;
begin
  select count(*) into borrower_dupes from (
    select org_id, normalized_canonical
    from public.borrowers
    where normalized_canonical is not null
    group by 1, 2
    having count(*) > 1
  ) d;
  select count(*) into entity_dupes from (
    select org_id, normalized_canonical, state
    from public.entities
    where normalized_canonical is not null
    group by 1, 2, 3
    having count(*) > 1
  ) d;
  select count(*) into lender_dupes from (
    select org_id, normalized_canonical
    from public.lenders
    where normalized_canonical is not null
    group by 1, 2
    having count(*) > 1
  ) d;

  if borrower_dupes > 0 or entity_dupes > 0 or lender_dupes > 0 then
    raise notice '00021: post-apply duplicates detected — borrowers=%, entities=%, lenders=%. The unique indexes above will have failed to create. Run scripts/cleanup-canonical-duplicates.ts to merge before retrying.', borrower_dupes, entity_dupes, lender_dupes;
  else
    raise notice '00021: canonical-name dedup applied cleanly (no duplicates).';
  end if;
end $$;

commit;
