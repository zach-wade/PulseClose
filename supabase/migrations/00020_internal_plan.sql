-- 00020_internal_plan.sql
-- Add `internal` to the organizations.plan CHECK constraint. Internal is
-- a non-billable plan tier for founder / QA / demo orgs; bypasses both
-- the monthly check cap and the pre-subscription 3-check trial gate.
-- Set via SQL only — not exposed in /dashboard/settings (see settings
-- page UI logic which hides the upgrade matrix for plan='internal').
--
-- Also normalizes the existing pre-shipped `pro` value to match the
-- PLANS config in src/lib/stripe/server.ts (which uses `professional`).
-- The mismatch was a pre-existing inconsistency between the foundation
-- CHECK and the runtime config; we align them here while we're already
-- modifying the constraint.

begin;

-- Migrate any rows that landed on the legacy `pro` literal.
update public.organizations
  set plan = 'professional'
  where plan = 'pro';

alter table public.organizations
  drop constraint if exists organizations_plan_check;

alter table public.organizations
  add constraint organizations_plan_check
  check (plan in ('starter', 'professional', 'enterprise', 'internal'));

commit;
