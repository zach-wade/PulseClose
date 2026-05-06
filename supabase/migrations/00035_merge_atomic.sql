-- 00035_merge_atomic.sql
-- Atomic merge function for borrower / entity / lender duplicates.
--
-- Replaces the JS-side multi-statement merge in src/lib/admin/merge.ts.
-- Two admins clicking "Keep this" on the same dupe pair simultaneously
-- previously raced: one would succeed cleanly, the other could partially
-- re-point rows then fail on delete, leaving an inconsistent state.
-- Wrapping in a Postgres function gives us a single transaction —
-- success-or-rollback, no partial states.

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
begin
  if p_source_id = p_target_id then
    raise exception 'source_id and target_id must differ';
  end if;

  -- Resolve table + FK list per entity type. Each row is {table, fk}.
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
        array['deal_evaluations','borrower_id']
      ];
    when 'entity' then
      v_table := 'entities';
      v_fks := array[
        array['borrower_validations','primary_entity_id'],
        array['entity_checks','entity_id'],
        array['borrower_entities','entity_id'],
        array['entity_signals','entity_id']
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

  -- Lock both source + target rows FOR UPDATE. Concurrent calls on the
  -- same pair queue here; the second one sees the source already gone
  -- after the first commits and returns a clean "Not found" error.
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

  -- Re-point each FK then accumulate counts. format(%I) safely quotes
  -- the table + column names so EXECUTE can't be injected via the FK
  -- array (which is hard-coded above anyway).
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

  -- Delete source last. If anything above failed the entire txn rolls
  -- back so source remains intact + retryable.
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
