-- Contractor licenses — multi-state GC license reference data, ingested from
-- official state bulk datasets (the durable path; see docs/RESEARCH-GC-VALIDATION.md).
-- One row per (state, license_number). Refreshed per-source via
-- scripts/ingest-contractor-licenses-*.ts:
--   WA  — L&I Socrata (data.wa.gov, m8qx-ubtq), public domain (PDDL), 3x/day
--   OR  — CCB open data (data.oregon.gov, g77e-6bhs), public domain, daily
--   FL  — DBPR construction CSV (myfloridalicense.com), weekly
--   CA  — CSLB master-list download (cslb.ca.gov data portal)
--
-- No statewide GC license exists in TX/NY/PA (municipal/registration only), so
-- they're intentionally absent. Public reference data — same row for all orgs.

create table public.contractor_licenses (
  state            text not null,             -- 2-letter, uppercase
  license_number   text not null,
  business_name    text not null,
  -- Canonicalized business name for name-based lookup (tokenize-and-set; mirror
  -- of canonicalizeName so a name search can match without the exact license #).
  normalized_name  text,
  license_type     text,                      -- classification / specialty (e.g. "GENERAL", "B")
  status           text not null default 'unknown', -- active | expired | suspended | revoked | unknown
  status_raw       text,                      -- the source's verbatim status
  effective_date   date,
  expiration_date  date,
  city             text,
  zip              text,
  source           text not null,             -- wa_lni | or_ccb | fl_dbpr | ca_cslb
  raw              jsonb not null default '{}'::jsonb,
  refreshed_at     timestamptz not null default now(),
  primary key (state, license_number)
);

-- Name lookup (when no license number is supplied) — scoped by state.
create index idx_contractor_lic_name on public.contractor_licenses(state, normalized_name);
-- Status filtering / freshness sweeps.
create index idx_contractor_lic_source on public.contractor_licenses(source);

-- Public read — license data is a public record and the same row applies across
-- all orgs (same posture as zhvi_zips / fdic reference tables). Writes are
-- service-role only (the ingest scripts), which bypasses RLS.
alter table public.contractor_licenses enable row level security;
create policy "contractor_licenses_public_read"
  on public.contractor_licenses for select using (true);
