# Continuous Monitoring — Implementation Plan

## Why this exists

A bridge loan averages 12-18 months. A clean borrower validation at origination
doesn't stay clean — entities get suspended, lawsuits get filed, contractor
licenses lapse. PulseClose today is a one-shot snapshot. Adding continuous
monitoring is the obvious lock-in feature: once a lender knows we'll alert them
on changes, they have a real reason to keep paying past the first deal.

## End-state UX

Per-validation toggle: "Monitor this borrower" — on by default for paid plans,
opt-in for free trial. Per-org settings page: choose alert email recipients
and notification thresholds.

When something changes, the lender gets:
- An email (Resend) within 24 hours
- A new entry on the validation detail page under "Monitoring History" showing
  the diff (was: ACTIVE, now: SUSPENDED — with date and source)
- A red dot on the dashboard list row for any validation with unread changes

## Cadence

- **Entity SOS**: weekly. Status changes are slow, weekly is plenty. Cobalt cost.
- **Litigation (CourtListener)**: weekly. Free.
- **Sanctions/PEP**: weekly. Free (OFAC) / cheap (OpenSanctions).
- **GC license (CSLB CA)**: monthly. License changes are slow, monthly cap on
  scrape cost.
- **Track record (Realie)**: not monitored — too expensive per call,
  property changes don't have material risk impact within the loan term.

## Data model

```sql
create table public.monitor_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  validation_id   uuid not null references public.borrower_validations(id) on delete cascade,
  enabled         boolean not null default true,
  cadence         text not null default 'weekly' check (cadence in ('daily','weekly','monthly')),
  next_run_at     timestamptz not null default now(),
  last_run_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table public.monitor_runs (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.monitor_subscriptions(id) on delete cascade,
  ran_at          timestamptz not null default now(),
  changes         jsonb not null default '[]', -- array of MonitorChange records
  status          text not null check (status in ('clean','changes_found','error')),
  error_message   text,
  cost_cents      integer not null default 0
);
```

A `MonitorChange` record:
```ts
{
  field: "entity.sos_status" | "litigation.new_case" | "sanctions.new_match" | ...,
  before: unknown,
  after: unknown,
  source: "Cobalt" | "CourtListener" | "OpenSanctions" | "CSLB",
  detected_at: ISO string,
  severity: "info" | "warning" | "critical"
}
```

## Scheduled execution

Two options, both are real:

1. **Vercel Cron** — declare in `vercel.json`, hit a route like `POST /api/cron/monitor`
   on a schedule (e.g. `0 9 * * *` daily at 9 UTC). The route picks up
   `monitor_subscriptions` whose `next_run_at < now()`, runs each, persists.
   Authenticated by Vercel Cron's bearer token (env `CRON_SECRET`).
2. **Supabase pg_cron** — schedule SQL functions inside Postgres. Cleaner if
   the work is database-only; awkward when we need to call external APIs
   (Cobalt, CourtListener) which is the bulk of monitoring.

Pick (1). Vercel Cron is the natural fit for HTTP-API-driven workloads.

## Comparing snapshots — change detection

For each subscription, we re-run the relevant adapter calls and diff against
the *previous* result. The previous result lives in the existing per-check
tables (`entity_checks.raw_response`, `litigation_checks.raw_response`, etc.)
or we snapshot fresh into a `monitor_snapshots` table.

The cleanest approach: each cron run inserts a fresh `entity_checks` /
`sanctions_checks` / `litigation_checks` row tied to the same `validation_id`
but with a `monitor_run_id` reference. Diffs are computed comparing the latest
two rows for each (validation, check_type) pair.

That keeps the data model honest: the validation has a rolling history of
checks, not just a single snapshot at origination.

## Diff rules per check type

| Check | What counts as a "change worth alerting on" |
|--|--|
| Entity SOS | sos_status changed; new agent; new flags from Cobalt |
| Litigation | new docket appearing in CourtListener results; status change on existing case |
| Sanctions/PEP | new match; resolved match (informational) |
| GC license | license_status changed; new disciplinary action; expiration within 60 days |

Quiet noise: re-runs of the same data shouldn't generate notifications. Use
content-hash comparison on `raw_response` to skip "no real change."

## Notification

Resend already configured (env `RESEND_API_KEY` per pickup). Send one email
per validation per run when changes_found > 0. Include:
- Borrower + entity name
- List of changes (was/now/source)
- Link to the validation detail page

Email template: simple HTML, branded header, one line per change.

## Pricing implications

Each weekly entity check = 1 Cobalt credit. Per-validation monitoring cost
on a Pro tier (~$499/mo for 100 checks) needs to be sized:
- 100 monitored validations × 4 weeks/mo = 400 entity calls/mo
- 100 × 4 = 400 litigation calls/mo (free)
- 100 × 4 = 400 sanctions calls/mo (free OFAC + OpenSanctions per-call)
- 100 monthly GC = 100 calls/mo (mostly free CSLB)
- Roughly 400 Cobalt credits/mo for monitoring 100 borrowers

Either fold monitoring cost into the subscription tier or surcharge per
monitored validation. Recommend folding in for first 100, then surcharge.

## Phases

| Phase | Scope | Effort |
|--|--|--|
| 1 | `monitor_subscriptions` table + Vercel Cron route hitting one validation | half day |
| 2 | Re-run adapters, snapshot to existing check tables, compute diff | 1 day |
| 3 | Resend email template + send on changes_found | half day |
| 4 | UI: monitoring toggle on validation detail; settings page for recipients | half day |
| 5 | Dashboard row red-dot indicator; "Monitoring History" section | half day |
| 6 | Pricing surfacing + plan limits | half day |

## Open questions

- **Snooze / acknowledge.** Should analysts be able to acknowledge a change
  so it stops surfacing on the dashboard? Probably yes, but not v1.
- **Slack/Teams instead of email.** Some lenders will want it in Slack.
  Webhook integration is a phase-2 item.
- **Loan payoff.** When the loan closes, monitoring should auto-disable.
  Need a "mark as completed" action on validations that pauses the
  subscription.
- **Multi-tenant fan-out.** A single Cron run iterating sequentially is fine
  up to ~1000 validations. Beyond that, queue-based worker.
