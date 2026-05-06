-- 00028_api_keys.sql
-- D5 — Public REST API auth substrate. Hashed-at-rest API keys scoped
-- to an org. The plain key is only ever shown to the user once at
-- creation time; we store sha256(key) + a 12-char prefix for display.
--
-- Keys carry a `name` so a lender can rotate "Slack workflow key" or
-- "internal LOS bridge key" independently. last_used_at lets the UI
-- flag stale keys for revocation.
--
-- Authorization model: every public endpoint reads the bearer token,
-- hashes it, looks up the row, asserts revoked_at IS NULL, then scopes
-- all queries to the matching org_id. RLS on api_keys is org-scoped,
-- but the public endpoints use the admin client to bypass RLS during
-- the auth lookup itself (the lookup never returns a key from another
-- org — it filters by sha256 globally and the row IS the org pointer).

begin;

create table public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  created_by      uuid references public.users(id) on delete set null,
  name            text not null,
  key_prefix      text not null,
  key_hash        text not null unique,
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_api_keys_org on public.api_keys(org_id) where revoked_at is null;
create index idx_api_keys_hash_active on public.api_keys(key_hash) where revoked_at is null;

create trigger api_keys_updated_at
  before update on public.api_keys
  for each row execute function public.set_updated_at();

alter table public.api_keys enable row level security;

create policy "api_keys_own_org" on public.api_keys
  for all
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

commit;
