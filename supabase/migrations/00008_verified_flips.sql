-- Verified flips: borrower-submitted addresses verified against deed records.
-- Separate from track_record_entries because track_record is "current
-- portfolio" (what they own now) and verified_flips is "claimed history"
-- (what they say they've owned, fact-checked against the deed chain).

create table public.verified_flips (
  id                    uuid primary key default gen_random_uuid(),
  validation_id         uuid not null references public.borrower_validations(id) on delete cascade,
  submitted_address     text not null,
  resolved_address      text,
  match_status          text not null default 'pending' check (match_status in (
                          'owned_and_sold', 'owned_and_held', 'never_owned',
                          'not_found', 'pending'
                        )),
  acquisition_date      date,
  acquisition_price     numeric(14,2),
  disposition_date      date,
  disposition_price     numeric(14,2),
  hold_months           integer,
  profit                numeric(14,2),
  current_owner         text,                    -- who owns it now per deed
  grantor_chain         jsonb not null default '[]', -- full transfer history we found
  source                text not null default 'Realie',
  raw_response          jsonb,
  created_at            timestamptz not null default now()
);

create index idx_verified_flips_validation on public.verified_flips(validation_id);
create index idx_verified_flips_status on public.verified_flips(match_status);

alter table public.verified_flips enable row level security;

create policy "verified_flips_via_validation" on public.verified_flips
  for all using (validation_id in (
    select id from public.borrower_validations
    where org_id = (select org_id from public.users where id = auth.uid())
  ));
