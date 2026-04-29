-- Backfill domain entities from existing data (Session 1 of 3 in data-model
-- refactor; pairs with 00010_domain_entities.sql).
--
-- Strategy: 1:1 dedup on legacy data (no fuzzy matching). Each unique
-- (org_id, normalized name) tuple becomes one record. Future admin tools
-- can merge legitimate duplicates with human review.
--
-- Order matters: domain entities first, then property_ownership, then FKs
-- on existing snapshot tables.
--
-- Lender FDIC classification is NOT done here — Session 2 ingests the FDIC
-- list and updates classifications. Backfilled lenders get 'unknown'.

-- ── 1. Backfill borrowers ────────────────────────────────────────────────
-- One row per distinct (org_id, normalized borrower_name).
-- Guarantor names also become borrowers (a guarantor IS a borrower-type entity
-- in our model).

insert into public.borrowers (org_id, display_name)
select distinct on (v.org_id, public.normalize_text(v.borrower_name))
  v.org_id,
  v.borrower_name
from public.borrower_validations v
where v.borrower_name is not null
  and trim(v.borrower_name) != ''
order by v.org_id, public.normalize_text(v.borrower_name), v.created_at;

insert into public.borrowers (org_id, display_name)
select distinct on (v.org_id, public.normalize_text(v.guarantor_name))
  v.org_id,
  v.guarantor_name
from public.borrower_validations v
where v.guarantor_name is not null
  and trim(v.guarantor_name) != ''
  and not exists (
    select 1 from public.borrowers b
    where b.org_id = v.org_id
      and b.normalized_name = public.normalize_text(v.guarantor_name)
  )
order by v.org_id, public.normalize_text(v.guarantor_name), v.created_at;

-- ── 2. Backfill entities ─────────────────────────────────────────────────
-- One row per distinct (org_id, normalized entity_name, state).
-- Sourced from entity_checks (which has state), joined to validations (org).

insert into public.entities (org_id, display_name, state, entity_type, formation_date_known, latest_sos_status, latest_sos_check_at, latest_registered_agent)
select distinct on (v.org_id, public.normalize_text(ec.entity_name), ec.state)
  v.org_id,
  ec.entity_name,
  ec.state,
  ec.entity_type,
  ec.formation_date,
  ec.sos_status,
  ec.check_date,
  ec.registered_agent
from public.entity_checks ec
join public.borrower_validations v on v.id = ec.validation_id
where ec.entity_name is not null
  and trim(ec.entity_name) != ''
order by
  v.org_id,
  public.normalize_text(ec.entity_name),
  ec.state,
  ec.check_date desc;  -- most recent check wins for cached SOS state

-- Also catch entities referenced only by borrower_validations.borrower_entity_name
-- without a corresponding entity_check (edge case, but possible).
insert into public.entities (org_id, display_name)
select distinct on (v.org_id, public.normalize_text(v.borrower_entity_name))
  v.org_id,
  v.borrower_entity_name
from public.borrower_validations v
where v.borrower_entity_name is not null
  and trim(v.borrower_entity_name) != ''
  and not exists (
    select 1 from public.entities e
    where e.org_id = v.org_id
      and e.normalized_name = public.normalize_text(v.borrower_entity_name)
  )
order by v.org_id, public.normalize_text(v.borrower_entity_name), v.created_at;

-- ── 3. Backfill lenders ──────────────────────────────────────────────────
-- Extract lenderName from track_record_entries.raw_response (Realie format).
-- Classification = 'unknown' until FDIC ingestion in Session 2.

insert into public.lenders (org_id, display_name)
select distinct on (v.org_id, public.normalize_text(tre.raw_response->>'lenderName'))
  v.org_id,
  tre.raw_response->>'lenderName'
from public.track_record_entries tre
join public.borrower_validations v on v.id = tre.validation_id
where tre.raw_response is not null
  and tre.raw_response->>'lenderName' is not null
  and trim(tre.raw_response->>'lenderName') != ''
order by v.org_id, public.normalize_text(tre.raw_response->>'lenderName'), tre.id;

-- ── 4. Backfill properties ───────────────────────────────────────────────
-- One row per distinct (org_id, normalized address).
-- Sourced from track_record_entries; verified_flips also contribute.

insert into public.properties (org_id, address_display, latest_avm)
select distinct on (v.org_id, public.normalize_address(tre.property_address))
  v.org_id,
  tre.property_address,
  -- Take Realie's modelValue as the cached AVM
  (tre.raw_response->>'modelValue')::numeric
from public.track_record_entries tre
join public.borrower_validations v on v.id = tre.validation_id
where tre.property_address is not null
  and trim(tre.property_address) != ''
order by v.org_id, public.normalize_address(tre.property_address), tre.id;

-- Verified flips that reference addresses not in track_record (rare but possible).
insert into public.properties (org_id, address_display)
select distinct on (v.org_id, public.normalize_address(coalesce(vf.resolved_address, vf.submitted_address)))
  v.org_id,
  coalesce(vf.resolved_address, vf.submitted_address)
from public.verified_flips vf
join public.borrower_validations v on v.id = vf.validation_id
where coalesce(vf.resolved_address, vf.submitted_address) is not null
  and trim(coalesce(vf.resolved_address, vf.submitted_address)) != ''
  and not exists (
    select 1 from public.properties p
    where p.org_id = v.org_id
      and p.address_normalized = public.normalize_address(coalesce(vf.resolved_address, vf.submitted_address))
  )
order by v.org_id, public.normalize_address(coalesce(vf.resolved_address, vf.submitted_address)), vf.id;

-- ── 5. Backfill borrower_validations FKs ────────────────────────────────

update public.borrower_validations v
set primary_borrower_id = b.id
from public.borrowers b
where b.org_id = v.org_id
  and b.normalized_name = public.normalize_text(v.borrower_name)
  and v.borrower_name is not null;

update public.borrower_validations v
set guarantor_borrower_id = b.id
from public.borrowers b
where b.org_id = v.org_id
  and b.normalized_name = public.normalize_text(v.guarantor_name)
  and v.guarantor_name is not null;

-- For primary_entity_id, prefer the entity matched on (name + state) via
-- entity_checks; fall back to name-only match if no entity_checks row exists.
-- Note: Postgres UPDATE...FROM cannot JOIN to the target table; comma-separate.
update public.borrower_validations v
set primary_entity_id = e.id
from public.entities e, public.entity_checks ec
where ec.validation_id = v.id
  and e.org_id = v.org_id
  and e.normalized_name = public.normalize_text(ec.entity_name)
  and e.state = ec.state
  and v.borrower_entity_name is not null
  and public.normalize_text(ec.entity_name) = public.normalize_text(v.borrower_entity_name);

-- Fallback: name-only match for validations without entity_checks
update public.borrower_validations v
set primary_entity_id = e.id
from public.entities e
where v.primary_entity_id is null
  and e.org_id = v.org_id
  and e.normalized_name = public.normalize_text(v.borrower_entity_name)
  and v.borrower_entity_name is not null;

-- ── 6. Backfill entity_checks.entity_id ─────────────────────────────────

update public.entity_checks ec
set entity_id = e.id
from public.entities e, public.borrower_validations v
where v.id = ec.validation_id
  and e.org_id = v.org_id
  and e.normalized_name = public.normalize_text(ec.entity_name)
  and e.state = ec.state;

-- ── 7. Backfill property_ownership rows from track_record_entries ────────

insert into public.property_ownership (
  property_id, owning_entity_id, owning_borrower_id,
  acquired_at, disposed_at, acquisition_price, disposition_price,
  lender_id, lender_name_observed, source, confidence
)
select
  p.id,
  v.primary_entity_id,
  v.primary_borrower_id,
  tre.acquisition_date,
  tre.disposition_date,
  tre.acquisition_price,
  tre.disposition_price,
  l.id,
  tre.raw_response->>'lenderName',
  case when tre.source = 'realie' or tre.source = 'regrid' then 'deed' else 'inferred' end,
  tre.confidence
from public.track_record_entries tre
join public.borrower_validations v on v.id = tre.validation_id
join public.properties p
  on p.org_id = v.org_id
  and p.address_normalized = public.normalize_address(tre.property_address)
left join public.lenders l
  on l.org_id = v.org_id
  and l.normalized_name = public.normalize_text(tre.raw_response->>'lenderName')
where tre.property_address is not null;

-- ── 8. Backfill track_record_entries FKs ────────────────────────────────

update public.track_record_entries tre
set property_id = p.id
from public.properties p, public.borrower_validations v
where v.id = tre.validation_id
  and p.org_id = v.org_id
  and p.address_normalized = public.normalize_address(tre.property_address)
  and tre.property_address is not null;

update public.track_record_entries tre
set owning_entity_id = v.primary_entity_id,
    owning_borrower_id = v.primary_borrower_id
from public.borrower_validations v
where v.id = tre.validation_id;

update public.track_record_entries tre
set lender_id = l.id
from public.lenders l, public.borrower_validations v
where v.id = tre.validation_id
  and l.org_id = v.org_id
  and l.normalized_name = public.normalize_text(tre.raw_response->>'lenderName')
  and tre.raw_response is not null;

-- Link active_ownership_id to the property_ownership row for currently-held
-- properties (disposed_at is null = current ownership)
update public.track_record_entries tre
set active_ownership_id = po.id
from public.property_ownership po
where po.property_id = tre.property_id
  and po.disposed_at is null
  and tre.property_id is not null;

-- ── 9. Backfill verified_flips FKs ──────────────────────────────────────

update public.verified_flips vf
set property_id = p.id
from public.properties p, public.borrower_validations v
where v.id = vf.validation_id
  and p.org_id = v.org_id
  and p.address_normalized = public.normalize_address(coalesce(vf.resolved_address, vf.submitted_address))
  and coalesce(vf.resolved_address, vf.submitted_address) is not null;

update public.verified_flips vf
set owning_entity_id = v.primary_entity_id,
    owning_borrower_id = v.primary_borrower_id
from public.borrower_validations v
where v.id = vf.validation_id;

-- ── 10. Backfill litigation_checks FKs ──────────────────────────────────
-- target_borrower_id: when entity_name on the litigation_check matches the
-- validation's primary borrower's normalized name.
-- target_entity_id: when entity_name matches the validation's primary entity.

update public.litigation_checks lc
set target_borrower_id = b.id
from public.borrowers b, public.borrower_validations v
where v.id = lc.validation_id
  and b.org_id = v.org_id
  and b.normalized_name = public.normalize_text(lc.entity_name)
  and lc.entity_name is not null;

update public.litigation_checks lc
set target_entity_id = e.id
from public.entities e, public.borrower_validations v
where v.id = lc.validation_id
  and e.org_id = v.org_id
  and e.normalized_name = public.normalize_text(lc.entity_name)
  and lc.entity_name is not null
  and lc.target_borrower_id is null;  -- prefer borrower match if both possible

-- ── 11. Backfill sanctions_checks FKs ───────────────────────────────────

update public.sanctions_checks sc
set primary_borrower_id = v.primary_borrower_id,
    primary_entity_id = v.primary_entity_id
from public.borrower_validations v
where v.id = sc.validation_id;
