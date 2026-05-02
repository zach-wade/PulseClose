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
6. **Dedup keys are canonical, not literal.** Names enter the system in many formats — Realie returns `LASTNAME, FIRSTNAME-MIDDLE`, SOS returns `LASTNAME, FIRSTNAME`, lender forms produce `Firstname Middle Lastname`. Any equality test against literal text false-negatives. Domain dedup keys (borrowers / entities / lenders) use a canonical form: tokenize on non-alphanumeric, drop entity-suffix tokens (LLC/Inc/etc.) for entity matching, sort, join with single space. The same logic lives in **two places that must stay in lockstep** — Postgres function `canonicalize_name(text, strip_entity_suffixes bool)` (computes the generated `normalized_canonical` column) and JS `canonicalizeName()` in `src/lib/domain/upsert.ts` (used in `WHERE normalized_canonical = $jsCanonical` lookups). See cross-cutting principle 9 in [ROADMAP.md](./ROADMAP.md).
7. **Vendor data and lender input are matched via tokenize-and-set, never substring.** The same canonical pattern (with single-letter tokens kept for entities, dropped for persons) is used everywhere two names from different sources need comparison — the deed-chain ownership matcher in `src/lib/track-record/verify-core.ts`, the borrower-linked-to-entity input warning, and any future matcher. Substring on lowercased + space-stripped strings is the wrong primitive and will silently break demos.

---

## Target entity model

### Domain entities (first-class, persistent)

```
borrowers
  id, org_id, display_name
  normalized_name        -- generated: lowercase + collapse-whitespace (legacy, kept for backcompat)
  normalized_canonical   -- generated: canonicalize_name(display_name, false)
                         -- DEDUP KEY: unique on (org_id, normalized_canonical)
  notes, created_at, updated_at

entities                                  -- legal entities (LLC, Corp, LP, Trust)
  id, org_id, display_name, state, entity_type
  normalized_name        -- generated (legacy)
  normalized_canonical   -- generated: canonicalize_name(display_name, true)
                         -- DEDUP KEY: unique on (org_id, normalized_canonical, state)
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
  id, org_id, address_display
  address_normalized     -- generated: lowercase + strip-punct + collapse-whitespace
                         -- KNOWN GAP: not USPS-canonical; "1310 Rosalia Ave" vs "1310 ROSALIA AVENUE"
                         -- vs "1310 Rosalia Ave, Garden Grove, CA 92840" produce different keys.
                         -- See ROADMAP.md → "Data integrity — canonical keys" → property
                         -- address_normalized canonicalization. Mitigation: prefer Realie's
                         -- addressFull as the canonical when available.
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
  display_name
  normalized_name        -- generated (legacy)
  normalized_canonical   -- generated: canonicalize_name(display_name, true)
                         -- DEDUP KEY (org-scoped): unique on (org_id, normalized_canonical) WHERE org_id IS NOT NULL
                         -- Global FDIC rows (org_id IS NULL) intentionally allow same-canonical-name
                         -- with distinct fdic_ids — FDIC dataset legitimately has e.g. multiple
                         -- "Security Bank and Trust" institutions with different cert numbers.
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

### Universal infrastructure (new — for the Expansion plan)

These three tables are the **building blocks every Tier feature composes on**. They land as P1 (right after the P0 corrections in ROADMAP.md) so the rest of the plan inherits clean primitives.

```
documents                                  -- every uploaded or generated file
  id uuid PK
  org_id uuid FK NOT NULL
  uploaded_by_user_id uuid FK NULL          -- null when borrower-side via share token
  share_token text NULL                     -- borrower-side authorization
  storage_path text NOT NULL                -- supabase storage object path
  storage_bucket text NOT NULL DEFAULT 'documents'
  mime_type text, file_size_bytes int, original_filename text
  purpose text NOT NULL CHECK (purpose IN (
    'borrower_doc_intake',                  -- lender-side validation pre-fill
    'borrower_share_upload',                -- borrower address-list upload
    'photo_verification',                   -- C1 rehab photos
    'bank_statement',                       -- C5 borrower bank statements
    'investor_pdf',                         -- A1 investor criteria source
    'handoff_artifact',                     -- generated handoff Excel/PDF
    'inbox_submission',                     -- D1 forwarded deal email
    'borrower_capital_summary',             -- A3 generated PDF
    'risk_methodology',                     -- S5 generated PDF
    'other'
  ))
  related_entity_type text NULL CHECK (related_entity_type IN (
    'borrower','property','validation','investor','monitor_run','deal_evaluation', null
  ))
  related_entity_id uuid NULL
  ai_extraction_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (ai_extraction_status IN ('pending','success','failed','not_applicable'))
  ai_extraction jsonb NULL
  schema_version int NOT NULL DEFAULT 1
  expires_at timestamptz NULL                -- bank statements default 90d, photos null
  created_at, updated_at
  -- RLS: org_id = (select org_id from users where id = auth.uid())
  --      OR share_token = current_setting('request.headers.x-share-token', true)
  -- Indexes: (org_id, created_at desc), (related_entity_type, related_entity_id), (purpose)
```

```
notification_preferences                   -- per-user-per-event-type routing
  id uuid PK
  user_id uuid FK NOT NULL
  org_id uuid FK NOT NULL
  channel text NOT NULL CHECK (channel IN ('email','slack','teams','sms','webhook'))
  event_type text NOT NULL CHECK (event_type IN (
    'monitor_change',                       -- existing monitor cron alerts
    'tier_changed',                         -- B5 / activity event
    'signal_applied',                       -- override actions
    'deal_evaluated',                       -- Module 1 results
    'photo_uploaded',                       -- C1 borrower upload
    'bank_statement_uploaded',              -- C5 borrower upload
    'inbox_submission',                     -- D1 forwarded deal
    'handoff_sent',                         -- A3 / handoff PDF download
    'expected_close_reminder',              -- D3
    'consensus_match'                       -- E3 cross-tenant match
  ))
  enabled bool NOT NULL DEFAULT true
  target_address text NOT NULL              -- email | webhook URL | phone (E.164)
  verified_at timestamptz NULL              -- webhook test or email confirm
  created_at, updated_at
  -- RLS: user owns row OR org admin can read
  -- Unique: (user_id, channel, event_type, target_address)
```

```
activity_events                            -- universal user-facing event log
  id uuid PK
  org_id uuid FK NOT NULL
  actor_user_id uuid FK NULL                -- null for system/cron events
  verb text NOT NULL                        -- 'created' | 'updated' | 'applied_signal'
                                            -- | 'ran_monitor' | 'changed_tier'
                                            -- | 'sent_handoff' | 'evaluated_deal'
                                            -- | 'extracted_doc' | 'uploaded_photo'
                                            -- | 'reported_outcome' | 'overrode_factor'
  subject_type text NOT NULL                -- 'validation' | 'borrower' | 'property'
                                            -- | 'signal' | 'monitor_run'
                                            -- | 'deal_evaluation' | 'document'
  subject_id uuid NOT NULL
  metadata jsonb NOT NULL DEFAULT '{}'      -- e.g., { from_tier:'medium', to_tier:'low' }
  schema_version int NOT NULL DEFAULT 1
  created_at timestamptz NOT NULL DEFAULT now()
  -- RLS: org_id = current_org
  -- Indexes: (org_id, created_at desc), (subject_type, subject_id, created_at desc),
  --          (actor_user_id, created_at desc)
```

**Important:** `activity_events` is **user-facing** (powers the activity feed, B5). The existing `audit_log` is **security/compliance** (immutable, includes auth events, IP addresses, etc.). Both exist; they are not the same table.

### Outcomes layer (new — Tier A + E foundation)

```
deal_outcomes                              -- post-close life-of-loan tracking
  id uuid PK
  org_id uuid FK NOT NULL
  borrower_id uuid FK NOT NULL
  validation_id uuid FK NULL                -- nullable: outcome may post-date validation
  deal_evaluation_id uuid FK NULL
  status text NOT NULL CHECK (status IN (
    'pending','withdrawn','funded','extended','repaid','defaulted'
  ))
  status_date date NOT NULL
  funded_amount numeric NULL
  funded_terms jsonb NULL                   -- { rate, points, term_months, ltv, ltc }
  extension_count int NOT NULL DEFAULT 0
  default_cause text NULL                   -- 'payment'|'maturity'|'covenant'|'fraud'|'other'
  notes text
  reported_by_user_id uuid FK NOT NULL
  schema_version int NOT NULL DEFAULT 1
  created_at, updated_at
  -- RLS: org_id-scoped
  -- Index: (borrower_id, status_date desc)
  -- One borrower can have many outcomes (one per loan over time)
```

```
borrower_reputation_scores                 -- E2: derived score per borrower
  id uuid PK
  borrower_id uuid FK NOT NULL
  org_id uuid FK NOT NULL                   -- score is per-org-context (org's signals + outcomes)
  score int NOT NULL CHECK (score BETWEEN 0 AND 100)
  letter_grade text NOT NULL CHECK (letter_grade IN ('A','B','C','D','F'))
  components jsonb NOT NULL                 -- per-input contribution breakdown
  validations_count int NOT NULL
  outcomes_count int NOT NULL
  computed_at timestamptz NOT NULL
  expires_at timestamptz NULL               -- recompute trigger
  schema_version int NOT NULL DEFAULT 1
  -- RLS: org_id-scoped
  -- Unique: (borrower_id, org_id) — one current score per borrower per org
```

```
consensus_aggregates                       -- E3: anonymized cross-tenant counts
  id uuid PK
  borrower_hash text NOT NULL UNIQUE        -- HMAC of normalized name + tax-id-last-4
  validations_count_30d int NOT NULL DEFAULT 0
  validations_count_90d int NOT NULL DEFAULT 0
  validations_count_365d int NOT NULL DEFAULT 0
  last_seen_at timestamptz NOT NULL
  last_tier_observed text                   -- 'low'|'medium'|'high'
  computed_at timestamptz NOT NULL
  -- RLS: readable by orgs that have set consensus_participation = true
  --      writable only via service-role aggregation cron
```

```
borrower_public_profiles                   -- E4: opt-in borrower-controlled visibility
  id uuid PK
  borrower_id uuid FK NOT NULL UNIQUE
  public_uuid uuid NOT NULL UNIQUE          -- the URL slug
  visibility jsonb NOT NULL                 -- { validations: bool, outcomes: bool, reputation: bool }
  opted_in_at timestamptz NOT NULL
  opted_in_by_user_id uuid FK
  schema_version int NOT NULL DEFAULT 1
  -- RLS: borrower's org admin can read; public route bypasses RLS via public_uuid lookup
```

### Litigation cards (new — Tier S3)

```
litigation_cases                           -- structured cases extracted from raw_response
  id uuid PK
  validation_id uuid FK NOT NULL
  org_id uuid FK NOT NULL                   -- denormalized for RLS perf
  case_name text NOT NULL
  court text                                -- e.g., 'C.D. Cal.'
  filed_at date
  nature_of_suit text                       -- 'bankruptcy_ch7'|'bankruptcy_ch11'|'civil'|'lien'|'foreclosure'|'tax_warrant'
  category text NOT NULL                    -- 'bankruptcy'|'civil'|'lien'|'tax'|'foreclosure'|'other'
  status text NOT NULL                      -- 'pending'|'closed'|'discharged'|'dismissed'|'judgment'
  dollar_amount_estimated numeric NULL
  source_doc_url text                       -- CourtListener link
  raw jsonb NOT NULL                        -- preserve raw shape for re-extraction
  schema_version int NOT NULL DEFAULT 1
  created_at
  -- RLS: org_id-scoped
  -- Indexes: (validation_id), (org_id, filed_at desc)
```

### Photo + bank statement extractions (new — Tier C1, C5)

```
photo_verifications                        -- C1: per-uploaded-photo verification result
  id uuid PK
  document_id uuid FK NOT NULL              -- → documents
  property_id uuid FK NOT NULL
  validation_id uuid FK NULL
  org_id uuid FK NOT NULL
  has_exif_gps bool NOT NULL DEFAULT false
  exif_lat numeric, exif_lng numeric
  distance_from_property_meters numeric NULL
  ai_address_match_confidence numeric NULL  -- 0..1
  ai_property_type text                     -- 'single_family'|'multi_family'|'commercial'|'unclear'
  ai_visible_address text                   -- whatever address text was visible in image
  ai_assessment text                        -- claude narrative
  schema_version int NOT NULL DEFAULT 1
  processed_at timestamptz
  -- RLS: org_id-scoped
```

```
bank_statement_extractions                 -- C5: per-uploaded-statement parsed metrics
  id uuid PK
  document_id uuid FK NOT NULL
  borrower_id uuid FK NOT NULL
  validation_id uuid FK NULL
  org_id uuid FK NOT NULL
  statement_period_start date, statement_period_end date
  ending_balance numeric, beginning_balance numeric
  total_deposits numeric, total_withdrawals numeric
  nsf_count int, returned_deposit_count int
  large_deposit_count int                   -- transactions > $10K
  recurring_income_estimate numeric
  parse_confidence_per_field jsonb          -- per-field 0..1 from Claude
  raw_extraction jsonb
  schema_version int NOT NULL DEFAULT 1
  processed_at timestamptz
  -- RLS: org_id-scoped
  -- documents.expires_at default 90 days for bank_statement purpose
```

### Contact verifications (new — Tier C3)

```
contact_verifications                      -- per-(borrower, channel, value) check
  id uuid PK
  borrower_id uuid FK NOT NULL
  org_id uuid FK NOT NULL
  channel text NOT NULL CHECK (channel IN ('phone','email'))
  value text NOT NULL                       -- normalized phone E.164 or email
  vendor text NOT NULL                      -- 'numverify' | 'hunter' | etc
  match_status text                         -- 'match'|'no_match'|'unknown'
  is_voip bool, is_disposable bool
  spam_score numeric NULL
  raw_response jsonb
  schema_version int NOT NULL DEFAULT 1
  checked_at timestamptz
  -- RLS: org_id-scoped
```

### Investor PDF parsing audit (new — Tier A1)

```
investor_criteria_extractions              -- audit of Claude parses
  id uuid PK
  investor_id uuid FK NOT NULL
  document_id uuid FK NOT NULL              -- → documents (purpose='investor_pdf')
  org_id uuid FK NOT NULL
  raw_extraction jsonb NOT NULL             -- full Claude output
  parsed_criteria jsonb NOT NULL            -- structured criteria preview
  parse_confidence_per_field jsonb
  applied bool NOT NULL DEFAULT false       -- did user save → write investor_criteria rows?
  applied_at timestamptz NULL
  applied_by_user_id uuid FK NULL
  user_edits_diff jsonb                     -- diff between parsed and saved criteria
  created_at
  -- RLS: org_id-scoped
```

### Inbox submissions (new — Tier D1)

```
inbox_submissions                          -- Resend webhook → pending validation
  id uuid PK
  org_id uuid FK NOT NULL
  document_id uuid FK NOT NULL              -- → documents (purpose='inbox_submission')
  source_email text                         -- sender
  subject text
  parsed_fields jsonb                       -- borrower_name, entity, properties, loan_amount
  parse_confidence_per_field jsonb
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','converted','rejected'))
  converted_validation_id uuid FK NULL
  rejected_reason text NULL
  schema_version int NOT NULL DEFAULT 1
  created_at, updated_at
  -- RLS: org_id-scoped
```

### Public API keys (new — Tier D5)

```
api_keys                                   -- per-org tokens for /api/public/*
  id uuid PK
  org_id uuid FK NOT NULL
  label text NOT NULL                       -- human-readable
  hashed_token text NOT NULL UNIQUE         -- bcrypt(token)
  prefix text NOT NULL                      -- first 8 chars for display
  scopes text[] NOT NULL DEFAULT '{}'       -- ['validations:read','handoff:read', ...]
  last_used_at timestamptz NULL
  created_by_user_id uuid FK NOT NULL
  created_at, revoked_at
  -- RLS: org_id-scoped
```

### Deal submissions (new — Tier F3)

```
deal_submissions                           -- originator → investor with status
  id uuid PK
  org_id uuid FK NOT NULL                   -- originating org
  deal_evaluation_id uuid FK NOT NULL
  investor_id uuid FK NOT NULL
  submitted_at timestamptz NOT NULL
  submitted_by_user_id uuid FK NOT NULL
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','withdrawn','expired'))
  decision_at timestamptz NULL
  decision_reason text NULL
  decision_user_id uuid FK NULL             -- investor-side user once auth scope expanded
  schema_version int NOT NULL DEFAULT 1
  -- RLS: org_id-scoped from originator side; investor-side adds scope when role exists
```

### Infrastructure tables (existing, unchanged)

`organizations`, `users`, `usage_records`, `audit_log` — keep as-is.

---

## P0 corrections summary (cross-reference to ROADMAP.md → P0)

The following schema changes ship in `00016_p0_corrections.sql` before any new feature work:

1. **`org_id` denormalization** onto `entity_checks`, `track_record_entries`, `gc_validations`, `litigation_checks` (with backfill from `borrower_validations.org_id`).
2. **Timestamps** added to `track_record_entries` and `gc_validations`.
3. **Partial unique indexes** on all signal tables and `borrower_entities` enforcing one active row per logical key.
4. **`monitor_runs` INSERT RLS policy** added explicitly; service-role bypass documented.
5. **`risk_factors.expires_at`** column added; per-factor expiry rules in application code.
6. **`schema_version`** integer column added to every JSONB column system-wide; Zod schemas in `src/lib/schemas/`.
7. **Trigger preventing `lenders.org_id` org→NULL transitions** (escalation guard).

After P0 lands, the new universal-infra tables (X1-X3) and outcome layer (E1) come next. Everything else in the Expansion plan composes on these primitives.

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
5. **Property `address_normalized` canonicalization.** Today's `normalize_address()` SQL function only strips punctuation + lowercases — same shape of fragility as the original `normalize_text()` (since fixed in 00021 for borrowers/entities/lenders). Same address ingested in different formats creates duplicate property rows. Right answer is USPS-style canonicalization (suffix expansion `Street`/`St`, directional `N`/`North`, unit-separator parsing) plus adopting Realie's `addressFull` as the canonical when present. **Tracked in [ROADMAP.md → Data integrity — canonical keys](./ROADMAP.md#data-integrity--canonical-keys-and-the-matchers-that-enforce-them) → "Property `address_normalized` canonicalization".** ~1-2d.

---

## Roadmap impact

This refactor becomes the **first item in Now**. Risk-tier rebuild and Module 1 build on this substrate, so doing them on the old model would mean throwing away the work. Estimated 2-3 sessions:

1. **Session 1:** Schema migration (new tables + FKs nullable + backfill).
2. **Session 2:** API route + UI updates to use new model. FDIC lender ingestion. Signal-write UX (the "Mark as primary residence" button, etc.).
3. **Session 3:** Risk-tier rebuild on the new substrate. Override-and-rerun trigger logic. AI memo re-generation hook.

Then Module 1, investor handoff, etc. follow on the clean substrate.
