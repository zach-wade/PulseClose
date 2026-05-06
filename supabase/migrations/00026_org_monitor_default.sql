-- 00026_org_monitor_default.sql
-- G7.1 — org-level "monitor every new validation by default" toggle. When
-- true, every new validation that doesn't already inherit a borrower-level
-- monitor sub (B1) gets a default-cadence subscription auto-created.
-- Default false: existing tenants opt in explicitly. Settings UI exposes
-- this on the Org tab next to ai_extraction_enabled (00022).

begin;

alter table public.organizations
  add column if not exists monitor_new_validations_by_default boolean not null default false;

commit;
