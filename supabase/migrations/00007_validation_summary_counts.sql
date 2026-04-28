-- Cached aggregate counts on borrower_validations so the dashboard list
-- can render Properties + Flags columns without an N+1 query into
-- track_record_entries / litigation_checks / sanctions_checks.

alter table public.borrower_validations
  add column if not exists property_count integer not null default 0,
  add column if not exists flag_count integer not null default 0;
