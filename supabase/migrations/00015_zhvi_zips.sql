-- ZHVI (Zillow Home Value Index) by zip — typical-home value, monthly.
-- Free bulk CSV from Zillow Research:
--   https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
-- Used as a sanity check on per-property Realie AVMs — properties that
-- deviate dramatically from their zip's typical value get an
-- informational `market_outlier` risk factor.
--
-- One row per zip. Refreshed monthly via scripts/ingest-zhvi-zips.ts.

create table public.zhvi_zips (
  zip          text primary key,
  median_value numeric(14,2) not null,
  as_of        date not null,
  city         text,
  state        text,
  metro        text,
  updated_at   timestamptz not null default now()
);

create index idx_zhvi_state on public.zhvi_zips(state);

-- Public read access — ZHVI data is public domain, and the same
-- median row applies across all orgs.
alter table public.zhvi_zips enable row level security;
create policy "zhvi_public_read" on public.zhvi_zips for select using (true);
