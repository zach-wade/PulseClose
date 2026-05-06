-- 00029_address_canonical.sql
-- USPS-style canonicalization for properties.address_normalized.
--
-- The original normalize_address() (00010) only lowercased + stripped
-- punctuation, so "1310 Rosalia Ave" and "1310 ROSALIA AVENUE" produced
-- different keys and a property could end up with two `properties` rows
-- depending on how the source typed it.
--
-- This rewrite adds:
--   - street-suffix expansion (st/str → street, ave/av → avenue, etc.)
--   - directional collapse (north → n, southwest → sw)
--   - unit-separator normalization (Apt 5 / #5 / Unit 5 → unit 5)
--   - whitespace + punctuation cleanup (unchanged)
--
-- The JS mirror lives in src/lib/domain/upsert.ts normalizeAddress().
-- ROADMAP cross-cutting principle 9 — drift between the two creates
-- duplicate property rows that the JS query never finds.
--
-- Backfill plan:
--   - properties.address_normalized is GENERATED ALWAYS AS STORED, so
--     redefining the function automatically recomputes the column.
--   - Postgres re-fires the generation expression on UPDATE; we do a
--     no-op UPDATE on every property row at the end to force recompute.
--   - If two rows now share the same normalized value, the next ingest
--     would have created the dupe regardless. We surface them via
--     RAISE NOTICE so the operator can run the dedup script.

begin;

create or replace function public.normalize_address(input text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  if input is null then
    return null;
  end if;

  -- Step 1: lowercase, strip punctuation we don't care about.
  -- Hyphen is preserved inside tokens (e.g., "South-West") — Step 4
  -- collapses both spelled-out + abbreviated directionals.
  s := lower(input);
  s := regexp_replace(s, '[.,#]', '', 'g');

  -- Step 2: collapse the unit-separator family. "apt 5" / "apartment 5"
  -- / "unit 5" / "ste 5" / "suite 5" / "# 5" all become "unit 5".
  s := regexp_replace(s, '\s+(?:apartment|apt|aptmt|ste|suite|unit|rm|room|fl|floor|bldg|building|trlr|trailer)\s+', ' unit ', 'g');
  s := regexp_replace(s, '\s+#\s*', ' unit ', 'g');

  -- Step 3: street-suffix expansion. The list covers the common
  -- abbreviations the USPS publishes. Anchored on word boundary so
  -- "fst" inside "first" doesn't get rewritten.
  s := regexp_replace(s, '\m(st|str)\M', 'street', 'g');
  s := regexp_replace(s, '\m(ave|av)\M', 'avenue', 'g');
  s := regexp_replace(s, '\mblvd\M', 'boulevard', 'g');
  s := regexp_replace(s, '\m(rd)\M', 'road', 'g');
  s := regexp_replace(s, '\m(dr)\M', 'drive', 'g');
  s := regexp_replace(s, '\m(ln)\M', 'lane', 'g');
  s := regexp_replace(s, '\m(ct)\M', 'court', 'g');
  s := regexp_replace(s, '\m(pl)\M', 'place', 'g');
  s := regexp_replace(s, '\m(pkwy|pky)\M', 'parkway', 'g');
  s := regexp_replace(s, '\m(hwy)\M', 'highway', 'g');
  s := regexp_replace(s, '\m(ter|terr)\M', 'terrace', 'g');
  s := regexp_replace(s, '\m(cir)\M', 'circle', 'g');
  s := regexp_replace(s, '\m(trl|tr)\M', 'trail', 'g');
  s := regexp_replace(s, '\m(way|wy)\M', 'way', 'g');

  -- Step 4: directional canonicalization → single letter form.
  s := regexp_replace(s, '\m(north)\M', 'n', 'g');
  s := regexp_replace(s, '\m(south)\M', 's', 'g');
  s := regexp_replace(s, '\m(east)\M', 'e', 'g');
  s := regexp_replace(s, '\m(west)\M', 'w', 'g');
  s := regexp_replace(s, '\m(northeast|ne\.)\M', 'ne', 'g');
  s := regexp_replace(s, '\m(northwest|nw\.)\M', 'nw', 'g');
  s := regexp_replace(s, '\m(southeast|se\.)\M', 'se', 'g');
  s := regexp_replace(s, '\m(southwest|sw\.)\M', 'sw', 'g');

  -- Step 5: collapse repeated whitespace and trim.
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := trim(s);

  return s;
end;
$$;

-- Force regeneration of every existing properties.address_normalized
-- value so the new canonical key applies to legacy data. UPDATE writes
-- the same row back; the GENERATED column re-derives from the new
-- function. Idempotent.
update public.properties
   set address_display = address_display
 where address_display is not null;

-- Surface conflicts. After the recompute, count duplicates within an
-- org so an operator can run scripts/cleanup-broken-validations.ts (or
-- a future address-merge script) on them.
do $$
declare
  dup_count int;
begin
  select count(*) into dup_count
  from (
    select org_id, address_normalized
    from public.properties
    group by org_id, address_normalized
    having count(*) > 1
  ) as g;
  if dup_count > 0 then
    raise notice 'address canonicalization: % org/address pairs now collide. Run a property-merge audit before adding a UNIQUE index.', dup_count;
  end if;
end$$;

commit;
