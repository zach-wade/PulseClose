-- 00025_borrower_monitor.sql
-- B1 — Borrower watchlist. Adds borrower_id and critical_only to
-- monitor_subscriptions, makes validation_id nullable, and enforces
-- mutually-exclusive scope (a sub is EITHER per-validation OR per-
-- borrower, never both).
--
-- Why borrower-level subs: today's per-validation toggle (G7.1)
-- evaporates the lock-in moment if the lender forgets — and a NEW
-- validation for a borrower we've already validated doesn't inherit
-- the prior monitoring posture. With borrower-level subs, the cron
-- (and the validations POST hook) can re-attach automatically.
--
-- The cron does NOT iterate borrower-level subs directly — instead, on
-- new-validation create, the validations POST handler reads the
-- borrower-level row and creates a matching validation-level sub. This
-- keeps the runner's per-validation iteration unchanged.

begin;

alter table public.monitor_subscriptions
  add column if not exists borrower_id uuid references public.borrowers(id) on delete cascade,
  add column if not exists critical_only boolean not null default false;

alter table public.monitor_subscriptions
  alter column validation_id drop not null;

-- Drop the old unique constraint on validation_id (was NOT NULL UNIQUE)
-- and replace with a partial unique index that only enforces uniqueness
-- when validation_id is set. Same idea for borrower_id.
alter table public.monitor_subscriptions
  drop constraint if exists monitor_subscriptions_validation_id_key;

create unique index if not exists idx_monitor_subs_validation_unique
  on public.monitor_subscriptions(validation_id)
  where validation_id is not null;

create unique index if not exists idx_monitor_subs_borrower_org_unique
  on public.monitor_subscriptions(org_id, borrower_id)
  where borrower_id is not null;

-- Mutually exclusive scope. A row is either validation-level or
-- borrower-level — never both, never neither.
alter table public.monitor_subscriptions
  drop constraint if exists monitor_subscriptions_scope_check;

alter table public.monitor_subscriptions
  add constraint monitor_subscriptions_scope_check check (
    (validation_id is not null and borrower_id is null) or
    (validation_id is null and borrower_id is not null)
  );

create index if not exists idx_monitor_subs_borrower
  on public.monitor_subscriptions(borrower_id)
  where borrower_id is not null;

commit;
