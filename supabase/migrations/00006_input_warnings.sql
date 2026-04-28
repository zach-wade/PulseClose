-- Input-level sanity checks on submitted validation data.
-- Surfaced in the UI so analysts know when borrower/entity inputs look off
-- (e.g. borrower name has LLC suffix, borrower not in entity filings).

alter table public.borrower_validations
  add column if not exists input_warnings jsonb not null default '[]';
