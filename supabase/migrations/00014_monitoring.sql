-- Continuous monitoring subscriptions + run history.
-- See CONTINUOUS_MONITORING_PLAN.md for the broader design.
--
-- Each validation can have at most one subscription. The cron route
-- iterates due subscriptions, re-runs the relevant adapters, computes
-- diffs against the latest existing entity/litigation/sanctions check
-- rows, persists fresh check rows, and emails on changes_found.

create table public.monitor_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  validation_id   uuid not null unique references public.borrower_validations(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  enabled         boolean not null default true,
  cadence         text not null default 'weekly' check (cadence in ('daily', 'weekly', 'monthly')),
  next_run_at     timestamptz not null default now(),
  last_run_at     timestamptz,
  notify_emails   text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_monitor_subs_due on public.monitor_subscriptions(next_run_at) where enabled = true;
create index idx_monitor_subs_org on public.monitor_subscriptions(org_id);

create trigger monitor_subscriptions_updated_at
  before update on public.monitor_subscriptions
  for each row execute function public.set_updated_at();

create table public.monitor_runs (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.monitor_subscriptions(id) on delete cascade,
  validation_id   uuid not null references public.borrower_validations(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  ran_at          timestamptz not null default now(),
  changes         jsonb not null default '[]',
  status          text not null check (status in ('clean', 'changes_found', 'error')),
  error_message   text,
  cost_cents      integer not null default 0,
  notified_at     timestamptz
);

create index idx_monitor_runs_validation on public.monitor_runs(validation_id, ran_at desc);
create index idx_monitor_runs_subscription on public.monitor_runs(subscription_id, ran_at desc);

alter table public.monitor_subscriptions enable row level security;
alter table public.monitor_runs enable row level security;

create policy "monitor_subscriptions_own_org" on public.monitor_subscriptions
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "monitor_runs_own_org" on public.monitor_runs
  for all using (org_id = (select org_id from public.users where id = auth.uid()));
