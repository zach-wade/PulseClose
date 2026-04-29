# PulseClose Data Model

> Architectural reference for PulseClose's persistence layer. Living doc — update as the schema evolves.
>
> **Sibling docs:** [ROADMAP.md](./ROADMAP.md), [STRATEGY.md](../STRATEGY.md)
>
> Current schema lives in [supabase/migrations/](../supabase/migrations/) (00001-00009 to date). This doc describes the **target** state after the in-flight refactor, with migration notes.

---

## Design principles

1. **Domain entities are first-class and persistent.** Borrowers, entities (LLCs/Corps), properties, and lenders accumulate data over time. They are not snapshotted into per-validation rows.
2. **Validations are snapshots referencing domain entities.** Each `borrower_validations` row records what we observed at that check time; canonical state lives on the domain entities.
3. **Signals + overrides are queryable, audit-friendly, and scoped to the right entity.** Property-level facts on the property; borrower-level facts on the borrower; relationship facts on the join.
4. **Override-and-rerun is the product.** UI corrections to derived signals re-derive risk factors, recompute the tier, and re-run the AI memo automatically.
5. **All multi-tenant data is org-scoped via RLS.** Foreign keys traverse to `org_id` for policy enforcement; no cross-org leakage.

---

## Target entity model

### Domain entities (first-class, persistent)

```
borrowers
  id, org_id, display_name, normalized_name
  notes, created_at, updated_at

entities                                  -- legal entities (LLC, Corp, LP, Trust)
  id, org_id, display_name, normalized_name, state, entity_type
  formation_date_known, dissolution_date_known
  latest_sos_status, latest_sos_check_at  -- cached from most recent check
  latest_registered_agent
  notes, created_at, updated_at

borrower_entities                          -- M:M with role + ownership %
  id, borrower_id, entity_id
  role (member | manager | agent | guarantor | other)
  ownership_pct (nullable)
  source (sos | user | inferred), confidence
  created_at, superseded_at

properties
  id, org_id, address_normalized, address_display
  city, state, zip, apn (nullable)
  latest_avm, latest_avm_check_at         -- cached snapshot
  notes, created_at, updated_at

property_ownership                         -- historical chain
  id, property_id, owning_entity_id, owning_borrower_id (nullable, if known)
  acquired_at, disposed_at (nullable = currently owned)
  acquisition_price, disposition_price
  lender_id (nullable), lender_name_observed (text fallback)
  source (deed | user | inferred), confidence
  created_at

lenders
  id, org_id (nullable for global FDIC-derived classifiers)
  display_name, normalized_name
  classification (bank | bridge | private_credit | unknown)
  fdic_id (nullable), nmls_id (nullable)
  notes, created_at, updated_at
```

### Signal / override layer (override-and-rerun)

```
borrower_signals
  id, borrower_id, signal_key, signal_value (jsonb)
  source (user | derived | inferred), confidence
  set_by_user_id, reason
  created_at, superseded_at

property_signals
  id, property_id, signal_key, signal_value (jsonb)
  ... same fields ...

borrower_property_signals                  -- relationship-level
  id, borrower_id, property_id, signal_key, signal_value (jsonb)
  ... same fields ...
  -- e.g., is_primary_residence is property-FOR-borrower, not just property

entity_signals                             -- (mirror of above for entities)
  id, entity_id, signal_key, signal_value (jsonb)
  ...
```

**Signal versioning:** `superseded_at` preserves history. Active signals = `superseded_at IS NULL`. Audit trail via `audit_log`.

**Standard signal keys (initial):**
- `borrower_property_signals.is_primary_residence` (boolean)
- `borrower_property_signals.occupancy_role` (owner_occupied | absentee | rented | unknown)
- `property_signals.lender_classification_override` (bank | bridge | private_credit)
- `borrower_signals.bitcoin_source` (boolean — for supplemental tax-conditions recommendation)
- `entity_signals.actually_active` (boolean — overrides SOS "not_found" timeout cases)

### Validation snapshot tables (per-run records)

```
borrower_validations                       -- existing, refactored
  id, org_id
  primary_borrower_id (NEW, FK)            -- replaces borrower_name text
  primary_entity_id (NEW, FK)              -- replaces borrower_entity_name text
  guarantor_borrower_id (NEW, FK, nullable)
  overall_status, confidence_score, experience_tier
  ai_analysis (jsonb), input_warnings (jsonb)
  property_count_cached, flag_count_cached
  validation_date, created_by, created_at, updated_at

entity_checks                              -- refactored
  id, validation_id, entity_id (NEW, FK)
  sos_status_observed, formation_date_observed, last_filing_observed
  registered_agent_observed
  confidence, flags, raw_response, check_date
  -- The canonical entity record gets cache-updated; this row is the snapshot of what we found.

track_record_at_check                      -- refactored from track_record_entries
  id, validation_id, property_id (NEW, FK)
  active_ownership_id (FK to property_ownership row that was current at check time)
  observed_ltv, observed_avm, observed_lender_id (FK)
  observed_lien_balance, raw_response
  source (realie | regrid | attom | user)
  confidence, check_date

verified_flips                             -- refactored to use property_id
  id, validation_id, property_id (FK)
  classification (owned_and_sold | owned_and_held | never_owned | not_found)
  hold_months, profit_realized
  grantor_chain (jsonb), source, raw_response

litigation_checks                          -- refactored
  id, validation_id
  target_borrower_id (nullable), target_entity_id (nullable)
  search_type, result, details, case_number
  raw_response, source, check_date

sanctions_checks                           -- refactored
  id, validation_id
  borrower_screened_ids (jsonb array of borrower_ids)
  entity_screened_ids (jsonb array of entity_ids)
  matches, sources_searched, source

gc_validations                             -- minor refactor (lower priority)
  id, validation_id, contractor_id (FUTURE — for v1, keep gc_name text)
  ... existing fields ...
```

### Risk system (new)

```
risk_factors
  id, validation_id
  factor_key (text — e.g., "extended_hold", "active_fed_litigation", "lender_concentration")
  severity (critical | moderate | minor | informational | none)
  excluded (bool), exclusion_reason (text, nullable)
  contributing_data (jsonb — refs to property_ids, entity_ids, etc. that drove this)
  explanation (text)
  computed_at
```

**Tier rule** stays application-side (not a DB column on validations) — derived from active risk_factors at query time so it always reflects current state including overrides.

### Module 1 (new — for Evaluate Deal)

```
investors                                  -- per-org investor configs
  id, org_id, display_name, type (balance_sheet | table_funded | securitizer)
  notes, created_at, updated_at

investor_criteria                          -- versioned rules
  id, investor_id
  criteria_key (text)                      -- e.g., "max_ltv_grid", "fico_threshold", "experience_minimum", "loan_size_max", "property_types_allowed", "geography"
  criteria_value (jsonb)                   -- flexible enough for grids
  effective_from, effective_to (nullable for current)
  source (pdf_parse | user_input), source_doc_url
  created_at

deal_evaluations                           -- per-deal evaluation runs
  id, org_id
  validation_id (nullable — could be standalone)
  borrower_id (nullable for fully standalone)
  property_id (nullable)
  purchase_price, arv, rehab_budget, loan_amount, loan_type
  property_type, location, sponsor_experience_tier
  fico (nullable), additional_params (jsonb)
  evaluated_at, evaluated_by_user_id

deal_eligibility_results
  id, deal_evaluation_id, investor_id
  result (pass | conditional | fail)
  computed_terms (jsonb — LTC, LTARV, rate, fees if pass)
  reasoning (text — which criteria pass/fail with refs)
  computed_at
```

### Infrastructure tables (existing, unchanged)

`organizations`, `users`, `usage_records`, `audit_log` — keep as-is.

---

## Migration plan

Single coordinated migration in stages, all reversible until step 6:

1. **Add new tables** with all FKs nullable. RLS policies on each.
2. **Backfill from existing data** with 1:1 dedup (no fuzzy matching on legacy):
   - One `borrowers` row per `borrower_validations.borrower_name`
   - One `entities` row per (borrower_validations.borrower_entity_name, state-from-entity_checks)
   - One `properties` row per `track_record_entries.property_address` (normalized)
   - One `property_ownership` row per track_record_entries
   - One `lenders` row per unique lender name from track_record raw_response
3. **Add nullable FK columns** to existing tables (`borrower_validations.primary_borrower_id`, etc.).
4. **Populate FKs** from backfilled data.
5. **Update API routes + UI** to use the new model. Existing text columns stay, nullable, for transition.
6. **Make FKs non-null + drop old text columns** once UI/API fully migrated.

**Identity-resolution UX (going forward, post-migration):**
- New validation creation: fuzzy-match user input against existing `borrowers` / `entities` / `properties` for the org
- High-confidence match: pre-fill, ask "is this the same as X?" with override option
- No match: create new
- Admin merge tool for human-reviewed dedup of legacy 1:1 records over time

---

## Override-and-rerun flow

```
User sees Truong validation with "extended hold (41mo)" flag on 1310 Rosalia Ave.

User clicks "Mark as primary residence" in the "Why this rating?" panel.
  ↓
INSERT borrower_property_signals (
  borrower_id = Kim Truong's id,
  property_id = 1310 Rosalia's id,
  signal_key = 'is_primary_residence',
  signal_value = true,
  source = 'user',
  set_by_user_id = current_user,
  reason = 'borrower confirmed during phone call'
);
  ↓
Trigger: re-derive risk_factors for any validation with this borrower + property
  ↓
extended_hold factor for Rosalia → excluded = true, exclusion_reason = 'primary residence per user override'
  ↓
Tier recomputes (one fewer Moderate factor → tier drops to LOW)
  ↓
AI memo regenerates via after() with new factor list
  ↓
UI auto-updates without refresh (existing polling pattern)
```

**Two override scopes:**
- **Signal override** (above) — corrects underlying data, re-derives everything downstream
- **Assessment override** (later) — leave factors intact, override final tier with required note. v1 supports signal-only; assessment override is a v2 add.

---

## Open questions

1. **Multi-borrower validations.** Current schema has `borrower_name` + `guarantor_name` (1+1). Some loans have N borrowers + N guarantors. Worth a `validation_borrowers` join table? Probably yes long-term but defer until a real case forces it.
2. **GC / contractors as first-class.** Lower priority for v1 — `gc_validations` keeps `gc_name` text and we add a `contractors` table later when same GC recurs.
3. **Cross-org global tables.** `lenders` could partially be global (FDIC list is the same for everyone). Same for some entity data. Not for v1; per-org isolation is simpler and the marginal cost is small.
4. **Signal key registry.** Adopt a `signal_definitions` table for known keys + their value schemas? Or just enforce in application code? Lean toward application code for v1 (fewer moving parts).
5. **Property normalization.** What's the canonical `address_normalized` algorithm? USPS normalization library? Simple lower-case + trim + strip-punctuation? Realie may return its own normalized form we can adopt.

---

## Roadmap impact

This refactor becomes the **first item in Now**. Risk-tier rebuild and Module 1 build on this substrate, so doing them on the old model would mean throwing away the work. Estimated 2-3 sessions:

1. **Session 1:** Schema migration (new tables + FKs nullable + backfill).
2. **Session 2:** API route + UI updates to use new model. FDIC lender ingestion. Signal-write UX (the "Mark as primary residence" button, etc.).
3. **Session 3:** Risk-tier rebuild on the new substrate. Override-and-rerun trigger logic. AI memo re-generation hook.

Then Module 1, investor handoff, etc. follow on the clean substrate.
