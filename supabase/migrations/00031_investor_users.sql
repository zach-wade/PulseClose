-- 00031_investor_users.sql
-- F3 — Investor-side deal queue (schema only).
--
-- A capital provider (the "investor" side of the marketplace) gets a
-- separate login from the lender side. They see deals routed to their
-- shop, can accept/decline/comment, and the lender sees the response.
--
-- Two pieces:
--
--   investor_users — login row tied to an investor record. RLS lets
--   them see only the deals routed to their investor_id. Auth identity
--   lives in supabase.auth.users like our existing `users` table; we
--   shadow that with role=investor + investor_id pointer so the same
--   email can't be both a lender and an investor.
--
--   investor_deal_queue — append-on-route, status updated by investor.
--   When a lender's evaluation produces a `pass` or `conditional`
--   verdict, an entry CAN be queued (lender opts in per deal —
--   automatic queueing waits on F3 full ship). Investor reads via
--   investor_user_id → investor_id → queue rows.

begin;

-- Investor-side login. One row per investor-user; email unique system-wide.
create table public.investor_users (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique,         -- references auth.users via FK below
  investor_id     uuid not null references public.investors(id) on delete cascade,
  email           text not null unique,
  full_name       text not null,
  role            text not null default 'analyst' check (role in ('analyst', 'admin')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auth FK to supabase.auth.users (matches the pattern used by our
-- existing users table — see handle_new_user trigger).
alter table public.investor_users
  add constraint investor_users_auth_fk
  foreign key (auth_user_id) references auth.users(id) on delete cascade;

create index idx_investor_users_investor on public.investor_users(investor_id);

create trigger investor_users_updated_at
  before update on public.investor_users
  for each row execute function public.set_updated_at();

alter table public.investor_users enable row level security;

-- Self-read.
create policy "investor_users_self" on public.investor_users
  for select using (auth_user_id = auth.uid());

-- The investor's queue. Lender posts; investor reads + updates status
-- + comment; both sides see the audit trail.
create table public.investor_deal_queue (
  id                    uuid primary key default gen_random_uuid(),
  investor_id           uuid not null references public.investors(id) on delete cascade,
  validation_id         uuid not null references public.borrower_validations(id) on delete cascade,
  deal_evaluation_id    uuid references public.deal_evaluations(id) on delete set null,
  org_id                uuid not null references public.organizations(id) on delete cascade,
  routed_by_user_id     uuid not null references public.users(id),
  status                text not null default 'queued' check (status in (
    'queued','viewed','accepted','declined','withdrawn'
  )),
  investor_comment      text,
  acted_at              timestamptz,
  acted_by_investor_user_id uuid references public.investor_users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Idempotent route key — same (investor_id, validation_id) only routed
-- once. A re-route after withdrawal needs an explicit operator action
-- (delete + re-insert), kept simple for v1.
create unique index investor_deal_queue_route_uidx
  on public.investor_deal_queue(investor_id, validation_id);

create index idx_investor_deal_queue_investor on public.investor_deal_queue(investor_id, status);
create index idx_investor_deal_queue_org on public.investor_deal_queue(org_id);

create trigger investor_deal_queue_updated_at
  before update on public.investor_deal_queue
  for each row execute function public.set_updated_at();

alter table public.investor_deal_queue enable row level security;

-- Lender-side: org-scoped read/write (route + observe).
create policy "investor_deal_queue_lender_org" on public.investor_deal_queue
  for all
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

-- Investor-side: read/update queue rows for their investor_id.
create policy "investor_deal_queue_investor_self" on public.investor_deal_queue
  for select
  using (
    investor_id in (
      select investor_id from public.investor_users where auth_user_id = auth.uid()
    )
  );

create policy "investor_deal_queue_investor_update" on public.investor_deal_queue
  for update
  using (
    investor_id in (
      select investor_id from public.investor_users where auth_user_id = auth.uid()
    )
  );

commit;
