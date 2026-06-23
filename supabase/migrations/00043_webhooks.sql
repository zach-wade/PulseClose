-- 00043_webhooks.sql
-- D6 item 1 — outbound domain webhooks (the "wire it into our LOS" answer).
--
-- A webhook_endpoint is a per-org subscription: a URL + a signing secret +
-- the set of event types it wants. When a subscribed event fires
-- (validation.completed / tier.changed / outcome.reported), the dispatcher
-- builds a versioned payload, signs it (HMAC-SHA256 over the raw body with
-- the endpoint's secret, sent as X-PulseClose-Signature), POSTs it, and
-- records a webhook_deliveries row. Failed deliveries (network / 5xx /
-- timeout) are retried by a cron with exponential backoff until exhausted.
--
-- Secrets are stored in plaintext on purpose — the server must have the key
-- to sign, and the consumer needs the same key to verify (standard webhook
-- model, e.g. Stripe's whsec_). RLS scopes them per-org; the secret is only
-- ever returned to the owning org's authenticated users.
--
-- SSRF defense (src/lib/notifications/ssrf.ts) is enforced at registration
-- AND re-checked at delivery time (DNS-rebinding defense), same as the
-- notification webhook channel.

begin;

-- ── webhook_endpoints — per-org subscriptions ────────────────────────────
create table if not exists public.webhook_endpoints (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  url           text not null,
  -- Subscribed event types. Validated in the API layer against the canonical
  -- set (src/lib/webhooks/events.ts). Stored as an array so one endpoint can
  -- subscribe to several events.
  event_types   text[] not null default '{}',
  -- HMAC-SHA256 signing secret (whsec_…). Generated server-side.
  secret        text not null,
  description   text,
  enabled       boolean not null default true,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_webhook_endpoints_org
  on public.webhook_endpoints(org_id) where enabled;

create trigger webhook_endpoints_updated_at
  before update on public.webhook_endpoints
  for each row execute function public.set_updated_at();

alter table public.webhook_endpoints enable row level security;

create policy "webhook_endpoints_own_org" on public.webhook_endpoints
  for all using (org_id = (select org_id from public.users where id = auth.uid()));

-- ── webhook_deliveries — audit trail + retry queue ───────────────────────
create table if not exists public.webhook_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  webhook_endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_type          text not null,
  -- Versioned payload (schema_version present), per the JSONB convention.
  payload             jsonb not null,
  -- pending → retriable (network/5xx/timeout); succeeded → 2xx; exhausted →
  -- gave up after max attempts; dead → permanent (4xx, won't retry).
  status              text not null default 'pending'
                        check (status in ('pending', 'succeeded', 'exhausted', 'dead')),
  attempts            integer not null default 0,
  http_status         integer,
  error_message       text,
  next_retry_at       timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_webhook_deliveries_org_created
  on public.webhook_deliveries(org_id, created_at desc);
create index if not exists idx_webhook_deliveries_endpoint
  on public.webhook_deliveries(webhook_endpoint_id);
-- Drives the retry cron: find pending rows whose backoff window has elapsed.
create index if not exists idx_webhook_deliveries_retry
  on public.webhook_deliveries(next_retry_at) where status = 'pending';

alter table public.webhook_deliveries
  add constraint webhook_deliveries_payload_versioned
  check (jsonb_typeof(payload) <> 'object' or (payload ? 'schema_version'));

create trigger webhook_deliveries_updated_at
  before update on public.webhook_deliveries
  for each row execute function public.set_updated_at();

alter table public.webhook_deliveries enable row level security;

-- Deliveries are system-written (admin client) and read-only to the org.
create policy "webhook_deliveries_own_org_read" on public.webhook_deliveries
  for select using (org_id = (select org_id from public.users where id = auth.uid()));

commit;
