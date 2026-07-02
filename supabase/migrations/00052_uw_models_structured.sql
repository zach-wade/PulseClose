-- 00052_uw_models_structured.sql
--
-- UX-2 / UW-7: persist the deal-type-aware STRUCTURED sizing result alongside the
-- existing bridge `sizing`. The dispatcher (src/lib/underwriting/dispatch.ts)
-- routes a deal's loan_type -> one of {rtl, construction, dscr, bridge}; RTL /
-- ground-up construction / DSCR produce a structured deal (proceeds waterfall,
-- Sources/Uses, constraint ladder with cushion) that does NOT fit the bridge-shaped
-- `sizing` column. Store it in its own nullable column, mode-tagged.
--
-- Zod: uwStructuredResultV1 (discriminated union on `mode`) in src/lib/schemas/jsonb.ts.
-- Nullable + additive: existing rows and the bridge path are unaffected.

alter table public.uw_models
  add column if not exists structured jsonb;

-- A structured-only model (fix&flip / ground-up / DSCR) has no bridge NOI/cap-rate,
-- so it produces neither a bridge-shaped `sizing` NOR bridge-shaped `inputs` (both
-- require currentNOI + goingInCapRate). It carries its own inputs+result inside the
-- `structured` envelope instead. So a row is EITHER a bridge model (inputs + sizing)
-- OR a structured model (structured) — relax both bridge columns to nullable and
-- require one complete side to be present, never neither.
alter table public.uw_models alter column inputs drop not null;
alter table public.uw_models alter column sizing drop not null;

alter table public.uw_models
  add constraint uw_models_has_a_result
  check (structured is not null or (inputs is not null and sizing is not null));

-- schema_version enforcement, mirroring the inputs/sizing/judgment CHECKs above
-- (00040). Null (bridge-only models) and non-objects are exempt.
alter table public.uw_models
  add constraint uw_models_structured_versioned
  check (structured is null or jsonb_typeof(structured) <> 'object' or (structured ? 'schema_version'));
