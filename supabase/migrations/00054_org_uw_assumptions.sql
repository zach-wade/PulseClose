-- 00054_org_uw_assumptions.sql
--
-- UW-7 / principle 14 (parameterize, don't hardcode): the house underwriting
-- defaults an org sets once — sizing caps/floors, exit/takeout terms, DSCR target
-- — become per-org CONFIG instead of code literals. Set in Settings, applied as
-- the fallbacks in /api/underwrite when a deal doesn't override them. This is the
-- last "replace the Excel" commitment and what lets us onboard lender #2 without a
-- code change (their box differs from ICC's).
--
-- Zod: orgUnderwritingAssumptionsV1 in src/lib/schemas/jsonb.ts; app-level defaults
-- + merge in src/lib/underwriting/org-assumptions.ts. Nullable + additive.

alter table public.organizations
  add column if not exists underwriting_assumptions jsonb;

-- schema_version enforcement, mirroring the uw_models jsonb CHECKs (00040/00052/00053).
-- Null (org on app defaults) and non-objects are exempt.
alter table public.organizations
  add constraint organizations_uw_assumptions_versioned
  check (underwriting_assumptions is null
         or jsonb_typeof(underwriting_assumptions) <> 'object'
         or (underwriting_assumptions ? 'schema_version'));
