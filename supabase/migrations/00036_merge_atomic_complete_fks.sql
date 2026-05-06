-- 00036_merge_atomic_complete_fks.sql
-- Audit C1: 00035's FK list was incomplete. Re-create the function with
-- the full set of FK references that point at borrowers / entities.
--
-- Missing for borrower:
--   property_ownership.owning_borrower_id
--   track_record_entries.owning_borrower_id
--   verified_flips.owning_borrower_id
--   litigation_checks.target_borrower_id
--   sanctions_checks.primary_borrower_id
--   borrower_public_profiles.borrower_id  (special-cased — unique)
--
-- Missing for entity:
--   property_ownership.owning_entity_id
--   track_record_entries.owning_entity_id
--   verified_flips.owning_entity_id
--   litigation_checks.target_entity_id
--   sanctions_checks.primary_entity_id
--
-- borrower_public_profiles has a unique(borrower_id), so when both source
-- and target borrowers have profiles we can't re-point — that would
-- violate the unique. Policy: keep target's profile if it exists, drop
-- source's (cascade deletes its dependents). Otherwise re-point source's
-- profile to target.

begin;

create or replace function public.merge_records_atomic(
  p_entity_type text,
  p_org_id uuid,
  p_source_id uuid,
  p_target_id uuid
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_table text;
  v_fks text[][];
  v_fk text[];
  v_count integer;
  v_re_pointed jsonb := '[]'::jsonb;
  v_source_exists boolean;
  v_target_exists boolean;
  v_target_has_profile boolean;
begin
  if p_source_id = p_target_id then
    raise exception 'source_id and target_id must differ';
  end if;

  case p_entity_type
    when 'borrower' then
      v_table := 'borrowers';
      v_fks := array[
        array['borrower_validations','primary_borrower_id'],
        array['borrower_validations','guarantor_borrower_id'],
        array['borrower_entities','borrower_id'],
        array['borrower_signals','borrower_id'],
        array['borrower_property_signals','borrower_id'],
        array['monitor_subscriptions','borrower_id'],
        array['deal_evaluations','borrower_id'],
        array['property_ownership','owning_borrower_id'],
        array['track_record_entries','owning_borrower_id'],
        array['verified_flips','owning_borrower_id'],
        array['litigation_checks','target_borrower_id'],
        array['sanctions_checks','primary_borrower_id']
      ];
    when 'entity' then
      v_table := 'entities';
      v_fks := array[
        array['borrower_validations','primary_entity_id'],
        array['entity_checks','entity_id'],
        array['borrower_entities','entity_id'],
        array['entity_signals','entity_id'],
        array['property_ownership','owning_entity_id'],
        array['track_record_entries','owning_entity_id'],
        array['verified_flips','owning_entity_id'],
        array['litigation_checks','target_entity_id'],
        array['sanctions_checks','primary_entity_id']
      ];
    when 'lender' then
      v_table := 'lenders';
      v_fks := array[
        array['property_ownership','lender_id'],
        array['track_record_entries','lender_id']
      ];
    else
      raise exception 'invalid entity_type: %', p_entity_type;
  end case;

  execute format(
    'select exists (select 1 from public.%I where id = $1 and org_id = $2 for update)',
    v_table
  ) into v_source_exists using p_source_id, p_org_id;
  execute format(
    'select exists (select 1 from public.%I where id = $1 and org_id = $2 for update)',
    v_table
  ) into v_target_exists using p_target_id, p_org_id;

  if not v_source_exists or not v_target_exists then
    raise exception 'Both records must exist and belong to your org';
  end if;

  -- Borrower-only special case: borrower_public_profiles has unique
  -- (borrower_id). Resolve before the generic re-point loop so we don't
  -- hit a unique-constraint violation. Profile stays with the target if
  -- the target already has one; otherwise the source's profile is
  -- re-pointed (next field in v_fks below — but only when safe).
  if p_entity_type = 'borrower' then
    select exists (
      select 1 from public.borrower_public_profiles where borrower_id = p_target_id
    ) into v_target_has_profile;
    if v_target_has_profile then
      -- Drop source's profile (cascades any dependents). Capture row
      -- count for the receipt.
      delete from public.borrower_public_profiles where borrower_id = p_source_id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_re_pointed := v_re_pointed || jsonb_build_object(
          'table', 'borrower_public_profiles',
          'column', 'borrower_id',
          'rows', v_count,
          'action', 'deleted_source_profile'
        );
      end if;
    else
      update public.borrower_public_profiles set borrower_id = p_target_id where borrower_id = p_source_id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_re_pointed := v_re_pointed || jsonb_build_object(
          'table', 'borrower_public_profiles',
          'column', 'borrower_id',
          'rows', v_count
        );
      end if;
    end if;
  end if;

  foreach v_fk slice 1 in array v_fks loop
    execute format(
      'update public.%I set %I = $1 where %I = $2',
      v_fk[1], v_fk[2], v_fk[2]
    ) using p_target_id, p_source_id;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      v_re_pointed := v_re_pointed || jsonb_build_object(
        'table', v_fk[1],
        'column', v_fk[2],
        'rows', v_count
      );
    end if;
  end loop;

  execute format(
    'delete from public.%I where id = $1 and org_id = $2',
    v_table
  ) using p_source_id, p_org_id;

  return jsonb_build_object(
    're_pointed', v_re_pointed,
    'deleted_source', true
  );
end;
$$;

commit;
