-- Automatically create org + user profile when a new auth user signs up
-- Reads full_name and org_name from auth.users.raw_user_meta_data (set during signUp)

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

  -- Generate a URL-safe slug from org name
  org_slug := lower(regexp_replace(
    coalesce(meta->>'org_name', 'org-' || substr(new.id::text, 1, 8)),
    '[^a-z0-9]+', '-', 'g'
  ));
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

-- Fire after insert on auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
