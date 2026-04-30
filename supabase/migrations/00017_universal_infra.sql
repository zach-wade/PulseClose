-- 00017_universal_infra.sql
-- Universal infra (X1, X2, X3) per docs/ROADMAP.md Expansion Plan + DATA-MODEL.md.
--
--   X1 — `documents` table + Supabase storage bucket. Every uploaded or
--        generated file in the system goes through this one path. Avoids
--        per-feature file-handling code (handoff PDFs, photo verification,
--        bank statements, investor PDFs, share-link uploads etc.).
--   X2 — `notification_preferences` table. Per-user-per-event-type routing
--        layer. Email is the only channel implemented today; Slack/Teams/SMS
--        ride along when first feature requests them.
--   X3 — `activity_events` table. User-facing event log. Powers the
--        activity feed (B5), validation diff (B6), and "what changed"
--        deltas. NOT the same as audit_log (security/compliance). Both
--        coexist intentionally.

begin;

-- ─── X1 documents table ───────────────────────────────────────────────────

create table public.documents (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  uploaded_by_user_id      uuid references public.users(id) on delete set null,
  -- For borrower-side uploads via /share/[token], the user is unauthenticated;
  -- we record the share_token so RLS can check authorization at read time.
  share_token              text,
  storage_bucket           text not null default 'documents',
  storage_path             text not null,
  mime_type                text,
  file_size_bytes          integer,
  original_filename        text,
  -- discriminator — hard CHECK so we know every consumer
  purpose                  text not null check (purpose in (
    'borrower_doc_intake',
    'borrower_share_upload',
    'photo_verification',
    'bank_statement',
    'investor_pdf',
    'handoff_artifact',
    'inbox_submission',
    'borrower_capital_summary',
    'risk_methodology',
    'other'
  )),
  -- which domain entity this file belongs to (nullable — some files like
  -- inbox submissions don't have a related entity yet)
  related_entity_type      text check (related_entity_type in (
    'borrower','property','validation','investor','monitor_run','deal_evaluation'
  )),
  related_entity_id        uuid,
  ai_extraction_status     text not null default 'not_applicable' check (ai_extraction_status in (
    'pending','success','failed','not_applicable'
  )),
  ai_extraction            jsonb,
  schema_version           integer not null default 1,
  -- Privacy-sensitive docs (bank statements default 90d) auto-expire and
  -- get cleaned up by a future cron. Photos / handoffs etc. live forever.
  expires_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_documents_org_created on public.documents(org_id, created_at desc);
create index idx_documents_related on public.documents(related_entity_type, related_entity_id);
create index idx_documents_purpose on public.documents(purpose);
create index idx_documents_share_token on public.documents(share_token) where share_token is not null;
create index idx_documents_expires on public.documents(expires_at) where expires_at is not null;

create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

create policy "documents_select_own_org" on public.documents
  for select
  using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "documents_insert_own_org" on public.documents
  for insert
  with check (org_id = (select org_id from public.users where id = auth.uid()));

create policy "documents_update_own_org" on public.documents
  for update
  using (org_id = (select org_id from public.users where id = auth.uid()))
  with check (org_id = (select org_id from public.users where id = auth.uid()));

create policy "documents_delete_own_org" on public.documents
  for delete
  using (org_id = (select org_id from public.users where id = auth.uid()));

-- Borrower-side reads via share_token bypass auth.uid()-based policies.
-- The route that serves these files must check share_token validity before
-- returning the row; this policy just allows the read at the DB level when
-- the route's service-role client passes the token through.
-- (No SELECT bypass policy here — service role doesn't need RLS bypass since
--  it's superuser; we keep RLS strict and rely on app code to gate reads.)

-- Storage bucket for the actual files. Supabase storage objects live in
-- storage.objects with RLS scoped via the bucket_id. Create the bucket if
-- it doesn't exist; ON CONFLICT keeps the migration idempotent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,                                  -- private bucket
  10 * 1024 * 1024,                       -- 10MB cap, matches doc-ingest route
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp'
  ]
)
on conflict (id) do nothing;

-- Storage RLS — readers must own the org of the corresponding documents row.
-- We can't do this in a CREATE POLICY because storage.objects is owned by
-- the storage role; policies are added via storage.objects directly.
do $$
begin
  -- Drop any pre-existing policies of the same name so re-runs are idempotent
  drop policy if exists "documents_storage_select_own_org" on storage.objects;
  drop policy if exists "documents_storage_insert_own_org" on storage.objects;
  drop policy if exists "documents_storage_delete_own_org" on storage.objects;
exception when others then null;
end $$;

create policy "documents_storage_select_own_org"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.storage_bucket = 'documents'
        and d.org_id = (select org_id from public.users where id = auth.uid())
    )
  );

create policy "documents_storage_insert_own_org"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (auth.uid() is not null)
  );

create policy "documents_storage_delete_own_org"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.storage_bucket = 'documents'
        and d.org_id = (select org_id from public.users where id = auth.uid())
    )
  );

-- ─── X2 notification_preferences table ────────────────────────────────────

create table public.notification_preferences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  channel         text not null check (channel in ('email','slack','teams','sms','webhook')),
  event_type      text not null check (event_type in (
    'monitor_change',
    'tier_changed',
    'signal_applied',
    'deal_evaluated',
    'photo_uploaded',
    'bank_statement_uploaded',
    'inbox_submission',
    'handoff_sent',
    'expected_close_reminder',
    'consensus_match'
  )),
  enabled         boolean not null default true,
  target_address  text not null,           -- email | webhook URL | E.164 phone
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, channel, event_type, target_address)
);

create index idx_notification_prefs_user on public.notification_preferences(user_id);
create index idx_notification_prefs_event on public.notification_preferences(org_id, event_type) where enabled = true;

create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy "notification_prefs_own_user" on public.notification_preferences
  for all
  using (
    user_id = auth.uid()
    or org_id = (select org_id from public.users where id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and org_id = (select org_id from public.users where id = auth.uid())
  );

-- ─── X3 activity_events table ─────────────────────────────────────────────
-- User-facing event log. Distinct from audit_log (security/compliance).
-- - audit_log = immutable, includes auth events, IP addresses, regulatory
-- - activity_events = user-facing feed, "what happened" timeline
-- Both coexist; do not collapse them.

create table public.activity_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  -- null when system/cron emitted (e.g., monitor cron, expiry sweeps)
  actor_user_id   uuid references public.users(id) on delete set null,
  verb            text not null,
  subject_type    text not null,
  subject_id      uuid not null,
  metadata        jsonb not null default '{}',
  schema_version  integer not null default 1,
  created_at      timestamptz not null default now()
);

create index idx_activity_events_org_created on public.activity_events(org_id, created_at desc);
create index idx_activity_events_subject on public.activity_events(subject_type, subject_id, created_at desc);
create index idx_activity_events_actor on public.activity_events(actor_user_id, created_at desc) where actor_user_id is not null;

alter table public.activity_events enable row level security;

create policy "activity_events_select_own_org" on public.activity_events
  for select
  using (org_id = (select org_id from public.users where id = auth.uid()));

create policy "activity_events_insert_own_org" on public.activity_events
  for insert
  with check (org_id = (select org_id from public.users where id = auth.uid()));

-- No UPDATE/DELETE policy by design — events are append-only.

commit;
