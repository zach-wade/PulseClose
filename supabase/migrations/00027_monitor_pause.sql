-- 00027_monitor_pause.sql
-- G7.3 filler — "Pause monitoring during demo" toggle.
--
-- Per-org pause timestamp. When set to a future timestamptz, the
-- monitor cron filters out every subscription belonging to that org
-- via a join on the org column. Past or NULL = monitoring runs as
-- usual. Lets the lender hit "pause for 2 hours" before a Damon demo
-- without having to remember which subscriptions to disable.

begin;

alter table public.organizations
  add column if not exists monitor_paused_until timestamptz;

comment on column public.organizations.monitor_paused_until is
  'When set to a future timestamp, the monitor cron skips this org. Used to silence change emails during live demos.';

commit;
