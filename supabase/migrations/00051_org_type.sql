-- 00051 — organizations.org_type: distinguish an ORIGINATOR (lender — runs
-- borrower validations, the default) from a FUND / capital provider (publishes
-- mandates, reviews verdicts across originators).
--
-- A fund doesn't "run its first validation" — its home is the Mandate Console
-- (the capital-provider's view of the verdict). Today every org lands on the
-- originator onboarding home, so the fund persona sees the wrong screen
-- (finding #29 — "make the Fund a first-class citizen"). This column is the
-- first-class marker; the dashboard routes funds to the Mandate Console.
--
-- The full Fund tenant (cross-originator sharing + RLS) stays deferred behind
-- the rep-and-warranty question — this is just the home-routing + identity bit.

alter table public.organizations
  add column if not exists org_type text not null default 'originator';

do $$
begin
  alter table public.organizations
    add constraint organizations_org_type_check check (org_type in ('originator', 'fund'));
exception when duplicate_object then null;
end $$;
