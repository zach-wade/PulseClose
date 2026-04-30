-- 00019_gc_summary.sql
-- Tier S4 — cached GC summary on borrower_validations so the dashboard
-- list can render an inline GC status chip without joining gc_validations.
--
-- Shape (jsonb, schema_version=1):
--   {
--     schema_version: 1,
--     status: 'active' | 'active_with_discipline' | 'manual_review'
--           | 'expired' | 'suspended' | 'revoked' | 'none',
--     license_id: string | null,        // license_number
--     state: string | null,             // 'CA', 'TX', etc.
--     classifications: string[],
--     expires_at: string | null,        // ISO date
--     has_discipline: boolean
--   }
--
-- Populated by api/checks/gc and api/validations on creation; backfilled
-- inside this migration for any pre-existing rows.

begin;

alter table public.borrower_validations
  add column if not exists gc_summary jsonb;

-- Backfill: derive gc_summary for rows that have a gc_validations record.
-- Pure SQL — no JSON Zod here, but we stamp schema_version=1 for the
-- 00016 §6 CHECK constraint regime.
update public.borrower_validations bv
set gc_summary = jsonb_build_object(
  'schema_version', 1,
  'status',
    case
      when gv.license_status = 'active' and jsonb_array_length(gv.disciplinary_actions) > 0
        then 'active_with_discipline'
      when gv.license_status = 'active' then 'active'
      when gv.license_status in ('expired','suspended','revoked')
        then gv.license_status
      else 'manual_review'
    end,
  'license_id', gv.license_number,
  'state', gv.license_state,
  'classifications',
    case
      when gv.license_classification is not null
        then jsonb_build_array(gv.license_classification)
      else '[]'::jsonb
    end,
  'expires_at', gv.expiration_date,
  'has_discipline', coalesce(jsonb_array_length(gv.disciplinary_actions) > 0, false)
)
from public.gc_validations gv
where gv.validation_id = bv.id
  and bv.gc_summary is null;

-- Existing JSONB CHECK regime (00016 §6) — gc_summary must carry
-- schema_version when present and object-typed.
alter table public.borrower_validations
  add constraint borrower_validations_gc_summary_versioned
  check (
    gc_summary is null
    or jsonb_typeof(gc_summary) <> 'object'
    or (gc_summary ? 'schema_version')
  );

commit;
