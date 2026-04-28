-- Borrower-facing share link: lender generates a tokenized URL the
-- borrower can use to self-submit their claimed flip addresses without
-- needing to log in to PulseClose.

alter table public.borrower_validations
  add column if not exists share_token text unique;

create index if not exists idx_validations_share_token
  on public.borrower_validations(share_token)
  where share_token is not null;
