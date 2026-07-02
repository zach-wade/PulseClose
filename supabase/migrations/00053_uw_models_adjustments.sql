-- 00053_uw_models_adjustments.sql
--
-- UW-7 Tier-2 "structured core, open edges": the human override layer. The
-- deterministic engine sizes the loan (bridge `sizing` / `structured`); this
-- column stores the underwriter's named, reasoned ± dollar adjustments to that
-- sized number, producing a final APPROVED loan. This is the escape hatch that
-- keeps a bespoke, deal-specific tweak in-product instead of in Excel — and it's
-- override-and-rerun (already the product for the tier) extended to the amount.
-- AI never touches this; only the human applies overrides.
--
-- Zod: uwAdjustmentsV1 in src/lib/schemas/jsonb.ts. Nullable + additive: existing
-- rows and every non-adjusted model are unaffected.

alter table public.uw_models
  add column if not exists adjustments jsonb;

-- schema_version enforcement, mirroring the inputs/sizing/judgment/structured
-- CHECKs. Null (no adjustments) and non-objects are exempt.
alter table public.uw_models
  add constraint uw_models_adjustments_versioned
  check (adjustments is null or jsonb_typeof(adjustments) <> 'object' or (adjustments ? 'schema_version'));
