-- 00042_trial_email_flags.sql
-- Dedupe flags for the trial drip emails (sent by the /api/cron/trial-emails
-- daily cron). Without these the cron would re-send every day a trial sits in
-- the "ending soon" window. Set once when the corresponding email is sent.

begin;

alter table public.organizations
  add column if not exists trial_ending_email_sent_at timestamptz;

alter table public.organizations
  add column if not exists trial_ended_email_sent_at timestamptz;

commit;
