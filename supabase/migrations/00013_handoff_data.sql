-- Investor handoff manual data (rehab spend per property, GC details,
-- project narrative). Auto-pulled fields (deeds, sales prices,
-- ownership, court records, sanctions) come from existing tables; this
-- column captures the lender-input fields that aren't in public records.
--
-- Shape (validated in app code, not the DB):
-- {
--   "overall_narrative": "string",
--   "preparer_name": "string",
--   "preparer_email": "string",
--   "properties": {
--     "<property_id>": {
--       "rehab_spend": number,
--       "gc_name": "string",
--       "gc_license": "string",
--       "narrative": "string"
--     }
--   }
-- }

alter table public.borrower_validations
  add column if not exists handoff_data jsonb;
