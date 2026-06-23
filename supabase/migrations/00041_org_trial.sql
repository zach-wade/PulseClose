-- 00041_org_trial.sql
-- Self-serve trial. Replaces the 3-check pre-subscription gate with a 14-day
-- free trial (capped at 50 checks to bound vendor cost) so a referred lender
-- can run real deals before the paywall.
--
-- trial_ends_at carries a column default of now() + 14 days, so:
--   * NEW orgs (created by handle_new_user) auto-get a fresh 14-day window
--     without touching the trigger.
--   * EXISTING orgs are backfilled at migration time with now() + 14 days, so
--     nobody currently using the product gets locked out the moment this ships.
--
-- Enforcement lives in src/lib/stripe/server.ts (getEffectiveCheckLimit) and is
-- read by api/validations (the gate) + api/usage (the dashboard meter).
-- internal/paid orgs ignore trial_ends_at entirely.

begin;

alter table public.organizations
  add column if not exists trial_ends_at timestamptz not null
    default (now() + interval '14 days');

commit;
