-- Corrective migration: fix borrower_validations.primary_entity_id pointing
-- at shell entities created by the 00011 fallback path.
--
-- Bug: 00011 step 5's primary update required strict normalize_text-equality
-- between entity_check.entity_name and validation.borrower_entity_name. When
-- the user-submitted name differs from the SOS-returned name (common: user
-- types "TT Investment Properties", Cobalt returns "TT INVESTMENT PROPERTIES,
-- LLC"), the strict match failed, the fallback created a shell entity row,
-- and the validation FK pointed at the shell instead of the entity_check's
-- authoritative record.
--
-- Fix: re-derive primary_entity_id from the entity_check's entity_id link
-- (entity_checks.entity_id was correctly populated in 00011 step 6, since it
-- matched by entity_check's own name → entity created from that same name).
--
-- Shell entity rows that nothing points to are left in place (harmless;
-- admin merge tool will clean them up via human review later).

-- Re-derive primary_entity_id from the entity_check's authoritative link.
-- This overwrites the shell-pointing FKs from 00011 with the correct entity_id.
update public.borrower_validations v
set primary_entity_id = ec.entity_id
from public.entity_checks ec
where ec.validation_id = v.id
  and ec.entity_id is not null;
