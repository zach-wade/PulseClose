-- 00038_introspect_fks.sql
-- Helper RPC for scripts/verify-merge-fks.ts. Returns every FK pointing
-- at borrowers / entities / lenders so the script can compare against
-- the hard-coded list inside merge_records_atomic. Read-only, no rows
-- mutated.

begin;

create or replace function public._introspect_merge_target_fks()
returns table (source_table text, source_column text, target_table text)
language sql
security definer
as $$
  select
    tc.table_name::text as source_table,
    kcu.column_name::text as source_column,
    ccu.table_name::text as target_table
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name
    and tc.table_schema = ccu.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and ccu.table_name in ('borrowers', 'entities', 'lenders');
$$;

commit;
