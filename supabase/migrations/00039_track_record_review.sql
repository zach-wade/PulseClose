-- 00039_track_record_review.sql
-- Verify-tray architecture. Splits track_record_entries into two display
-- buckets:
--
--   * auto_accepted / confirmed → headline track record table
--   * pending_review            → "We also found these — confirm or reject"
--                                  verify tray
--   * rejected                  → hidden by default
--
-- Per-address verify (Flow A, lookupPropertyByAddress against borrower's
-- xlsx) inserts as auto_accepted. The statewide owner-name search (Flow B,
-- searchPropertiesRealie) inserts as pending_review — that's where Noah's
-- false-positives leaked in (Truong's xlsx is all Santa Clara County but
-- the statewide name match dragged in Fullerton/Cypress "Kim Truong"
-- collisions).
--
-- Confidence score is a 0-100 hint shown in the tray. Server computes it
-- from: SOS officer name match + geographic cluster fit + transfer-history
-- corroboration + date corroboration + entity filing-ID match. See
-- src/lib/track-record/review.ts.

begin;

alter table public.track_record_entries
  add column if not exists review_status text not null default 'auto_accepted'
    check (review_status in ('auto_accepted','pending_review','confirmed','rejected'));

-- Persist the per-row score so we don't recompute on every render. Null
-- when not yet scored (legacy rows backfilled to auto_accepted skip the
-- scoring pass).
alter table public.track_record_entries
  add column if not exists review_confidence smallint
    check (review_confidence is null or (review_confidence >= 0 and review_confidence <= 100));

-- Store the named reasons that fed the score so the tray can explain
-- WHY a row scored low (Noah's drill-down principle).
alter table public.track_record_entries
  add column if not exists review_signals jsonb not null default '{}'::jsonb;

-- When a lender confirms / rejects a row we want the audit trail. The
-- existing data_edits table handles per-field changes but the review
-- transition is a row-level state change worth its own column for
-- query speed.
alter table public.track_record_entries
  add column if not exists reviewed_at timestamptz;

alter table public.track_record_entries
  add column if not exists reviewed_by_user_id uuid references public.users(id);

create index if not exists idx_track_record_entries_review_status
  on public.track_record_entries(validation_id, review_status);

commit;
