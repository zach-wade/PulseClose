-- 00033_photo_verification.sql
-- C1 — Geo-tagged photo verification substrate.
--
-- The borrower uploads a per-property photo via share link. We extract:
--   1. EXIF GPS coordinates (deterministic; no Claude call)
--   2. A Claude vision check confirming the photo plausibly depicts a
--      U.S. property (not a stock image, not a screenshot, plausibly a
--      single-family / multifamily / under-construction site).
--   3. Distance from the property's geocoded address (when both
--      coordinates are available — geocoding lives outside this table).
--
-- A `photo_verified` informational signal lights up at the borrower-
-- property scope when verification passes (separate factor work — not
-- in this migration).
--
-- Photos themselves go through the universal `documents` table
-- (X1) — this row references that document_id and adds the
-- verification metadata.

begin;

create table public.property_photo_verifications (
  id              uuid primary key default gen_random_uuid(),
  validation_id   uuid not null references public.borrower_validations(id) on delete cascade,
  property_id     uuid references public.properties(id) on delete set null,
  document_id     uuid not null references public.documents(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  -- EXIF extraction
  exif_lat        double precision,
  exif_lng        double precision,
  exif_timestamp  timestamptz,
  exif_camera_model text,
  -- Claude vision verdict
  vision_verdict  text check (vision_verdict in ('plausible_property','stock_or_synthetic','indoor_only','unknown')),
  vision_notes    text,
  vision_input_tokens   integer,
  vision_output_tokens  integer,
  -- Distance from the address-geocoded location, in meters. Populated
  -- only when both EXIF GPS and a property geocode are available; null
  -- otherwise. > ~150m typically means the photo wasn't taken at the
  -- property.
  distance_from_property_m  integer,
  verified_at     timestamptz not null default now(),
  created_by_user_id uuid references public.users(id) on delete set null
);

create index idx_photo_verifications_validation on public.property_photo_verifications(validation_id);
create index idx_photo_verifications_property on public.property_photo_verifications(property_id);

alter table public.property_photo_verifications enable row level security;

create policy "photo_verifications_own_org" on public.property_photo_verifications
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

commit;
