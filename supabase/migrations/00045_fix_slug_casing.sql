-- 00045_fix_slug_casing.sql
-- Fix org slug generation in handle_new_user. The original (00002) ran
-- regexp_replace(...,'[^a-z0-9]+','-') on the RAW org name BEFORE lower(), so
-- every uppercase letter (not in [a-z0-9]) was stripped as a separator:
--   "Test Bridge Capital" -> "-est-ridge-apital-<id>"
-- Lowercasing first preserves the letters:
--   "Test Bridge Capital" -> "test-bridge-capital-<id>"
-- Existing slugs are left as-is (they're unique and stable); only new signups
-- get the corrected form.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  new_org_id uuid;
  org_slug text;
  meta jsonb;
begin
  meta := new.raw_user_meta_data;

  -- Generate a URL-safe slug from org name. lower() FIRST, then strip — so
  -- capital letters become lowercase rather than being dropped.
  org_slug := regexp_replace(
    lower(coalesce(meta->>'org_name', 'org-' || substr(new.id::text, 1, 8))),
    '[^a-z0-9]+', '-', 'g'
  );
  -- Trim any leading/trailing separators left by the strip.
  org_slug := trim(both '-' from org_slug);
  -- Ensure uniqueness by appending short id suffix
  org_slug := org_slug || '-' || substr(new.id::text, 1, 6);

  -- Create organization
  insert into public.organizations (name, slug, plan)
  values (
    coalesce(meta->>'org_name', 'My Organization'),
    org_slug,
    'starter'
  )
  returning id into new_org_id;

  -- Create user profile
  insert into public.users (id, org_id, email, full_name, role)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(meta->>'full_name', split_part(new.email, '@', 1)),
    'owner'
  );

  return new;
end;
$$;
