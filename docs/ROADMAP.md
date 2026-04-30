# PulseClose Roadmap

> Living document. Append to it; don't snapshot-replace. Last meaningful edit dated in the Decisions Log.
>
> **Sibling docs:**
> - [STRATEGY.md](../STRATEGY.md) — vision, positioning, market, long-shot bets (the *why*)
> - [DATA-MODEL.md](./DATA-MODEL.md) — target schema, signals/overrides design, migration plan (the *how*)
> - [pickup.md](../pickup.md) — per-session handoff (the *what's loaded right now*)
> - [TRACK_RECORD_VERIFY_PLAN.md](../TRACK_RECORD_VERIFY_PLAN.md) — implementation plan (mostly built)
> - [CONTINUOUS_MONITORING_PLAN.md](../CONTINUOUS_MONITORING_PLAN.md) — implementation plan (not yet built)

---

## North Star — what we're optimizing for

**NPLA conference, June 22-23, 2026 (Atlantic City), attendee mode** is the forcing function. Damon facilitates warm intros to fund people, lenders, and consulting prospects. Win = land **3 of**: fund introductions, lender intros, product demos, consulting leads.

**Strategic structure:** Zach owns all PulseClose IP. Insignia (Damon + Noah) is design partner + first paid customer. Partnership structure is being shaped — leaning toward a JV-type venture or JV-fund where the tech goes in-house and Zach holds equity, with the SaaS option staying live as a parallel track. Compensation structure is what gets negotiated; tech ownership is settled. See [memory: project_insignia_partnership_paths](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/project_insignia_partnership_paths.md).

**Distribution thesis:** Lenders don't refer UW tools peer-to-peer. Capital-provider endorsement is the only organic distribution path. Investor handoff Excel/PDF is the strategic artifact. NPLA serves both potential business models — SaaS customer acquisition AND fund-LP intros — without committing to either.

**Three product bets that serve all wins:**
1. **Investor handoff output (Excel + PDF)** — the artifact every meeting hinges on
2. **Module 1 (Evaluate Deal) — generalized framework** — turns a coffee meeting into instant value: "tell me your box, I'll show you a deal that clears it"
3. **Risk-tier rebuild — rules-driven with transparent factors** — without it, demo dies under scrutiny

---

## Status snapshot

**Live at app.pulseclose.com.** Multi-tenant SaaS, Stripe billing, real vendor data flowing.

**Shipped pillars (validation report):**
1. Entity validation — Cobalt Intelligence SOS, 50 states
2. Track record (current portfolio) — Realie primary, Regrid fallback, ATTOM enrichment
3. Trust-but-verify (deed-chain) — Realie address lookup; borrower share-link variant
4. Litigation — CourtListener federal courts (bankruptcy + civil)
5. Sanctions / PEP — OpenSanctions (6 lists) + OFAC SDN direct
6. GC validation — CSLB live for CA, "NOT AUTOMATED" for other states
7. AI risk memo — Claude-generated narrative, real portfolio metrics

**Infrastructure:** Supabase auth + RLS, Stripe checkout/webhooks/portal, usage metering on every vendor call, rate limiting, Sentry, PostHog, Resend.

---

## P0 — Corrections (do these before any new features)

Surfaced by the 2026-04-30 multi-track audit (code / data model / UX / strategy). These are quietly broken or under-specified today and will erode demo credibility or block clean execution of the expansion plan below. Estimated 4-6 days total. Sequence: bugs first, then data-model migrations, then UX polish.

### P0.1 — Critical correctness bugs

**FK consistency across the four validation creation paths**
- Files: [src/app/api/checks/entity/route.ts:48](../src/app/api/checks/entity/route.ts#L48), [src/app/api/checks/gc/route.ts:43](../src/app/api/checks/gc/route.ts#L43)
- Bug: Entity-only and GC-only creation paths skip `primary_borrower_id` / `primary_entity_id` population. Track-record + litigation paths set them. Result: signal-driven re-derivation (`findValidationsAffectedBySignal`) misses these validations entirely; "Mark as primary residence" silently fails to recompute them.
- Fix: All four paths must call `upsertBorrower()` + `upsertEntity()` and persist FKs at validation creation. Add a regression test that POSTs a signal after each creation path and asserts re-derivation fires.

**Extended-hold factor logic flip**
- File: [src/lib/risk/factors.ts:228-242](../src/lib/risk/factors.ts#L228-L242)
- Bug: `allExcluded` flag inverted. With 5 properties at extended hold, 1 bank-financed: factor fires correctly but explanation says "all excluded" when 4 are still active.
- Fix: Rename to `anyActive`, flip condition. Severity = `moderate` iff `anyActive`. Explanation lists which properties are excluded vs. active by name, not summary.

**Risk-factor recompute is not transactional**
- File: [src/lib/risk/persist.ts:195-222](../src/lib/risk/persist.ts#L195-L222)
- Bug: Delete-all-then-insert. If insert fails mid-stream (network blip, transient PG error), validation has zero factors, `flag_count` cached = 0, tier silently drops to LOW.
- Fix: Either wrap in a PG RPC transaction, or compute new factors first → diff against existing → upsert by `(validation_id, factor_key)` → soft-delete missing. The diff approach is also a prerequisite for the factor-history feature in Tier B.

**`linkBorrowerToEntity` race condition**
- File: [src/lib/domain/upsert.ts:215-239](../src/lib/domain/upsert.ts#L215-L239)
- Bug: Pre-check + insert is non-atomic. Parallel calls produce duplicate active rows in `borrower_entities`. Same pattern in all four signal tables.
- Fix: Five partial unique indexes (see P0.2 below), then `INSERT ... ON CONFLICT DO NOTHING`. Application code keeps the pre-check as an optimization but stops relying on it for correctness.

**Monitor cron error handling**
- Files: [src/lib/monitor/runner.ts](../src/lib/monitor/runner.ts), [src/app/api/cron/monitor/route.ts:83](../src/app/api/cron/monitor/route.ts#L83)
- Bugs: (a) Per-adapter try/catch silently swallows 429s; subscription's `next_run_at` still bumps. Will hammer vendor on next tick. (b) Email send failure ignored; `monitor_runs` marked complete even if recipients never got the alert. Lender thinks borrower is clear when nobody knows.
- Fix: Track per-adapter status (`ok` | `rate_limited` | `failed` | `skipped`) in `monitor_runs.adapter_results jsonb`. On rate limit: delay `next_run_at` by 1h. On email failure: set `monitor_runs.email_status = 'failed'`, surface in MonitorCard run history with retry button.

**Button `render={<Link>}` navigation**
- Files: dashboard layout / nav components (audit found multiple)
- Bug: `<Button render={<Link>}>` pattern likely doesn't render an anchor tag. Back/CTA buttons currently render as buttons that do nothing.
- Fix: **Click every nav button in a real browser.** Replace with `<Link><Button>` or use Base UI's documented composition pattern. This is the single most demo-critical UX fix.

### P0.2 — Data-model corrections (one migration: `00016_p0_corrections.sql`)

**Snapshot-table `org_id` denormalization**
- Tables: `entity_checks`, `track_record_entries`, `gc_validations`, `litigation_checks`
- Issue: RLS uses `validation_id IN (SELECT id FROM borrower_validations WHERE org_id = ...)`. Postgres can't push the filter down — every query joins through a subquery scan.
- Migration: `ADD COLUMN org_id UUID NOT NULL REFERENCES organizations(id)`, backfill from validation, swap RLS to direct comparison, add `(org_id, created_at DESC)` index. Cost: 8 bytes × ~100K rows = 800KB of storage for big query-time wins.

**Missing timestamps on legacy tables**
- Tables: `track_record_entries`, `gc_validations`
- Migration: Add `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Apply existing `set_updated_at()` trigger.

**Signal supersede partial unique indexes**
- Tables: `borrower_signals`, `property_signals`, `borrower_property_signals`, `entity_signals`, `borrower_entities`
- Migration:
  ```sql
  CREATE UNIQUE INDEX borrower_signals_active_uidx
    ON borrower_signals (borrower_id, signal_key) WHERE superseded_at IS NULL;
  CREATE UNIQUE INDEX property_signals_active_uidx
    ON property_signals (property_id, signal_key) WHERE superseded_at IS NULL;
  CREATE UNIQUE INDEX borrower_property_signals_active_uidx
    ON borrower_property_signals (borrower_id, property_id, signal_key) WHERE superseded_at IS NULL;
  CREATE UNIQUE INDEX entity_signals_active_uidx
    ON entity_signals (entity_id, signal_key) WHERE superseded_at IS NULL;
  CREATE UNIQUE INDEX borrower_entities_active_uidx
    ON borrower_entities (borrower_id, entity_id) WHERE superseded_at IS NULL;
  ```
- Application code switches to upsert-style writes that supersede in a transaction.

**`monitor_runs` missing INSERT RLS policy**
- Table: `monitor_runs`
- Issue: RLS-enabled with no INSERT policy = denied. Cron is currently bypassing RLS via service-role; document this explicitly or add the policy.
- Fix: Add `CREATE POLICY monitor_runs_insert_own_org ON monitor_runs FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));` AND comment in migration that cron uses service role for cross-tenant batch inserts.

**Risk factor expiry**
- Table: `risk_factors`
- Issue: "Active litigation 2018" fires forever even after the case closes. No staleness model.
- Migration: `ADD COLUMN expires_at TIMESTAMPTZ NULL`. Per-factor default rules in `src/lib/risk/factors.ts` (e.g., `active_litigation` → 5 years from `case_filed_at` if no disposition; `sanctions_hit` → never expires; `extended_hold` → no expiry, lives until override). Recompute logic ignores expired factors. Adds a daily cron sweep to recompute affected validations.

**JSONB schema versioning**
- Tables: `borrower_validations.ai_analysis`, `borrower_validations.input_warnings`, `borrower_validations.handoff_data`, `investor_criteria.criteria_value`, all `*_signals.signal_value`, `risk_factors.contributing_data`
- Issue: No version field. Silent schema drift across migrations is going to bite once the data shapes evolve (Tier S Story Mode pushes `ai_analysis` to v2).
- Fix: Add `schema_version INTEGER NOT NULL DEFAULT 1` per affected JSONB. Define Zod schemas in `src/lib/schemas/` keyed by `(column, version)`. Validate on write. New migration column-by-column; existing rows backfill to v1.

**Global-lender escalation guard**
- Table: `lenders`
- Issue: Org-scoped row can be UPDATE'd to set `org_id = NULL`, escalating it to a global classifier visible to all tenants.
- Fix: Trigger preventing `org_id` from transitioning org→NULL. Global rows are insertable only via service-role admin scripts.

### P0.3 — UX gaps that could embarrass NPLA demo

**Validation-creation expectation setting**
- File: [src/app/dashboard/new/page.tsx](../src/app/dashboard/new/page.tsx)
- Issue: Submit → 5s redirect → detail page polls for AI memo for 90s. AI takes 30-60s. Demo-path looks broken if memo lags. Founder says "let me refresh" and re-runs the validation by accident.
- Fix: Inline progress card stays in the form during submit, showing each pillar completing in real time ("Entity: ✓ Active in CA", "Track record: 14 properties found", "Litigation: 0 federal cases", "Sanctions: clear", "AI memo: generating..."). Auto-redirect only when memo lands or after 180s timeout. Polling extended from 90s → 180s. Use Server-Sent Events if cheap, otherwise increase poll cadence to 2s.

**HandoffCard download buttons don't await save**
- File: [src/components/dashboard/handoff-card.tsx](../src/components/dashboard/handoff-card.tsx)
- Issue: Edit narrative → click "Download Excel" before save fires → download contains stale data. Investor receives a handoff with a blank "Prepared by" field.
- Fix: Disable Excel + PDF buttons while `dirty === true`. Save button shows "Save and download…" when there are unsaved changes. Toast on success: "Saved. Opening Excel…"

**Empty states explain nothing**
- Files: [src/app/dashboard/page.tsx:160-174](../src/app/dashboard/page.tsx#L160-L174), [src/app/dashboard/evaluate/page.tsx:189-198](../src/app/dashboard/evaluate/page.tsx#L189-L198)
- Issue: "No validations yet" with no guidance. NPLA attendee opens fresh tenant during demo: blank.
- Fix: Empty states with three CTAs:
  - **New Validation** (primary)
  - **Load demo borrower** — pre-loads a polished example for the demo path (ties into Tier S "Demo deck")
  - **Watch 2-min walkthrough** — embedded screencap (shipped with demo collateral)
- Differentiate "no data yet" from "API failed to load" — current code defaults to `[]` on API error and shows the empty state, hiding real failures.

**Confidence score is opaque**
- Issue: Bare percentage. Lender compares 78% vs 65% with no idea what's driving it.
- Fix: Tooltip on hover showing contributing signals (entity active +15, sanctions clear +5, 14 properties found +10, etc.). OR rename to "Validation completeness" if it really measures completeness, not borrower quality. Audit the scoring function and pick the truthful label.

**Address-extraction silent failure**
- File: [src/app/api/share/[token]/extract-addresses/route.ts:112-119](../src/app/api/share/[token]/extract-addresses/route.ts#L112-L119)
- Issue: Returns 200 with empty array on extraction failure. Borrower clicks Submit, nothing happens, share-link page sits there.
- Fix: Return 422 with a clear message; show banner: "We couldn't read this document. Try pasting addresses manually below, or upload a different file." Same fix to lender-side `/api/ingest/borrower-doc`.

**Print CSS validation**
- File: [src/app/handoff/[id]/page.tsx](../src/app/handoff/[id]/page.tsx)
- Issue: 8.5pt font, 11-column properties table, no `page-break-inside: avoid` rules. Untested on a real printer.
- Fix: Print to PDF + print on real paper. Adjust margins to 0.75in, body font 10pt min, add `page-break-inside: avoid` on each property card, `page-break-after: always` between borrowers in multi-borrower handoffs. Add a print preview button on /handoff/[id] that opens a print-css-only iframe so the founder can sanity-check before the meeting.

**Verified-flips overlay matches by address string, not property_id**
- File: [src/lib/handoff/builder.ts:221](../src/lib/handoff/builder.ts#L221)
- Issue: Borrower with multiple loans on one property double-counts in the verified-flip section.
- Fix: Match on `property_id`. The address-string fallback can stay as a defensive layer for legacy data.

**Investor JSON criteria editor lint**
- File: [src/app/dashboard/evaluate/investors/page.tsx:210-225](../src/app/dashboard/evaluate/investors/page.tsx#L210-L225)
- Issue: Plain textarea. Typed `max_ltv_x` instead of `max_ltv` = silent eligibility miss; investor returns "fail" on every deal forever.
- Fix: Server-side Zod validation on save; return key-by-key errors. Inline error display below the textarea. Add a "Validate" button separate from "Save" so the user can lint without committing. (Full Monaco editor is Tier A.)

**Zillow ZHVI null fallback is silent**
- File: [src/lib/risk/persist.ts:106-115](../src/lib/risk/persist.ts#L106-L115)
- Issue: Property's zip not in `zhvi_zips` → market-outlier factor silently skipped. For a one-property borrower with no zip match, no factor fires even at 10x AVM.
- Fix: Emit informational factor `market_outlier_unavailable` with explanation "AVM not comparable (zip not in ZHVI dataset)".

---

## Now (this week-ish)

### Data-model refactor — first-class borrowers, entities, properties, lenders
**Foundation work that everything else depends on.** Domain entities (borrowers, entities, properties, lenders) become first-class persistent records; validations become snapshots referencing them. Signals and overrides scope to the right entity (borrower-level, property-level, or borrower×property). Override-and-rerun becomes the product pattern.

Full design at [DATA-MODEL.md](./DATA-MODEL.md). Approximately 3 sessions:
- **Session 1:** New tables + nullable FKs + backfill from existing validations (1:1 dedup, no fuzzy matching on legacy).
- **Session 2:** API + UI updates to use new model. FDIC lender ingestion for bank/bridge classification. Signal-write UX ("Mark as primary residence" buttons in Why-this-rating panel).
- **Session 3:** Risk-tier rebuild on the new substrate. Override-and-rerun trigger logic. AI memo re-generation hook.

Without this, risk-tier rebuild + Module 1 + override mechanic all get built on a substrate we'd throw away within months. Per [memory: feedback_long_term_architecture](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/feedback_long_term_architecture.md), product is new enough that doing this now is straightforward; deferring it costs more.

### Risk-tier rebuild — rules-driven, transparent + override-aware
*(Builds on the data-model refactor above.)*

Replace the single-string Claude risk rating with a deterministic scoring function. Named factors (Entity status, Active fed litigation, Lender concentration, Hold-period anomaly, Sanctions hit, Foreclosure/distress, Owner-occupancy mismatch, GC license issues, Off-market LTV), each tagged Critical/Moderate/Minor/Informational, persisted to the new `risk_factors` table. Tier rule: any Critical → HIGH, ≥2 Moderate → MEDIUM, else LOW. "Why this rating?" expandable card surfaces factors + contributions + an inline override action per factor. AI memo gets the factor list and explains in narrative; never disagrees with the math. Bridge ICP defaults hardcoded for v1; **hold-period exclusions: primary residence + bank-financed** (per [memory: project_risk_tier_bridge_icp](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/project_risk_tier_bridge_icp.md)).

**Override-and-rerun loop:** user clicks "Mark as primary residence" → `borrower_property_signals` insert → trigger re-derives risk_factors → tier recomputes → AI memo regenerates via `after()`. The signal persists on the borrower-property relationship, so a second validation for the same borrower comes pre-corrected.

Files: [src/lib/ai/analysis.ts](../src/lib/ai/analysis.ts) prompt rewrite, new [src/lib/risk/factors.ts](../src/lib/risk/factors.ts) module, new "Why this rating?" component on validation detail page with inline override actions.

### flag_count recompute on read
Summary card shows "Flags: 2" while bullet list has 4 (Truong example). Cached count is set at creation, doesn't update. Fix: compute on read or recompute on ai_analysis/verified_flips change.

### AI re-run on verified flips
When borrower submits via share link, kick off `generateValidationAnalysis` via `after()` with verified flips included. Extend `AnalysisInput`. Update prompt to surface verified-flip stats.

### Recover or scaffold Module 1
Substantial prior build exists in [`/Users/zachwade/code/archive/pulseclose-archived`](file:///Users/zachwade/code/archive/pulseclose-archived) — `evaluate-engine.ts`, `eligibility-tab.tsx` (409 lines), API + tests, dashboard route, design spec at `bridge-platform/modules/investor-eligibility.md`, HTML prototype, e2e tests. Approach: don't wholesale-restore (archived app has marketing/admin/onboarding cruft not in current pulseclose). Read spec → port engine + clean Next 16-compatible UI/API to current codebase → re-use test cases as regression suite.

### Demo deal preparation
Pre-load 2-3 polished borrower validations (real or synthetic but realistic) that produce rich, clean output across all 5 pillars. These are the demos you walk into NPLA meetings with — must work flawlessly, no Cobalt rate limits, no missing data, no "trust me, normally it works."

---

## Pre-NPLA (April 28 → June 22, ~8 weeks)

### Investor handoff Excel + PDF — the centerpiece
Polished deliverable lenders hand to investors (Colchis, Oakhurst, Mandalay, Truliant, etc.). Auto-pull what's pullable: deeds, sales prices, ownership, court records, sanctions, Zillow comp. Optional manual fields for what's not in public records: rehab spend, GC details, project narrative. Per-property layout: when bought, what paid, what spent on rehab, what sold for. Branded header, page numbers, print-friendly.

This is what every NPLA meeting hinges on. Print physical copies + emailable PDF. No-brainer to elevate.

**Reference shape:** Zach has seen Insignia's actual investor handoff but doesn't have a copy. Build to the shape Damon described on the 4/28 call (deeds, sales prices, ownership, transactions per property; rehab spend / GC details / narrative as fillable fields); validate against a real Insignia handoff via Damon if possible.

### Module 1 — Evaluate Deal v1 (generalized framework)
Rules engine that takes deal parameters (purchase price, ARV, rehab budget, property type, loan size, sponsor experience, location) and shows which configured investors can buy + at what terms. Build investor criteria as configurable objects (JSON or DB rows), not hardcoded. Same framework serves: JV bringing it in-house (Insignia's investors privately loaded), fund using it for own deal flow, future SaaS variant where lenders configure their own investors.

v1 ships with 2-3 example investor configs (could be Insignia's, could be generalized templates — both fine, both private to deployment). Output: pass / conditional / fail with reasoning.

Noah called this his #1 ask twice, unprompted. *"Track Record validates the WHO; Evaluate Deal validates the WHAT."*

### Continuous monitoring
Per [CONTINUOUS_MONITORING_PLAN.md](../CONTINUOUS_MONITORING_PLAN.md). Weekly re-runs, diff detection, Resend email alerts. Biggest near-term lock-in feature. ~3 days work. Critical for converting Insignia (and future first customers) from trial to paid — without lock-in, customers churn after the first validation.

### Doc ingestion v1
Lender-side upload widget on validation creation page that accepts PDF/Excel/Word/CSV/email and AI-parses into PulseClose schema (borrower name, entity, properties). v1 scope: PDF + Excel only, lender-pasted. Noah's "drop form-fill UX" direction.

### Share-link upload widening
Borrower share link currently accepts pasted addresses only. Add file upload (Excel/CSV/Word/PDF), Claude-parse → addresses → existing verify pipeline. Half day.

### Zillow zip-median comparison
Auto-flag deviations (over/under market) on track-record properties + subject property. Currently a manual condition on Insignia intake. Damon: *"would be amazing."*

### Insignia testimonial / case study collection
Get a quotable line in writing from Damon or Noah. Concrete value (hours saved per loan, false positives caught, deal-quality signals surfaced). Drop into one-pager + demo opening. Distribution-multiplier — every meeting opens with "Insignia uses this and says X." Ask through normal working sessions, not as a discrete deliverable ask.

### Demo collateral
- One-page PDF leave-behind with what PulseClose does + how to start a trial
- Three slightly-different talk tracks (lender / fund / consulting prospect)
- Trial-start mechanic (follow-up email creates account; no QR codes needed for attendee mode)

### TransUnion address validation
Adapter, surface address-match in validation report, usage-metered. Waiting on Noah's logins; build is ~1 day once those land.

### Background check provider scoping (eval only)
Identify candidate (LexisNexis / Westlaw / Unicourt) for state-court coverage. **Eval only** before NPLA — don't sign contracts. The "we're adding state court" line is enough for booth-mode credibility.

---

## Post-NPLA / structure-dependent

### Module 1 expansion with named investor PDFs
Wire in actual Colchis + Oakhurst (and additional) investor criteria from PDFs. Path-sensitive: under JV/fund, this is private to the deployment. Under future SaaS, this becomes a "configure your own investors" UX. The framework supports both.

### Nexys LOS write-back
Map adapters → specific cleared conditions in Insignia's 130-condition master list. Blocked on Nexys API access. Once unblocked: 1-2 days for the adapter, more for the per-condition mapping.

### State-court litigation provider integration
Once eval picks a winner. $500-2K/mo vendor commitment.

### Multi-state GC adapters
FL/TX/NY contractor board adapters. Real per-state research/scrape work, ~1-2 days each.

### PDF report polish
Headers per page, page numbers, more report-like layout. Hours of work; do it bundled with investor handoff if not already covered there.

---

## Expansion plan — features unlocked by 2-day velocity

The Now + Pre-NPLA punch lists shipped in two days (2026-04-29 → 04-30). At that pace, ~50 working days remain pre-NPLA. The plan below assumes that capacity and slots features by **strategic lever**, not chronology. Sequence inside each tier is dependency-driven.

**Cross-cutting design principles for everything in this section:**

1. **Universal `documents` table** (defined in DATA-MODEL.md) backs every file upload — borrower share-link, lender doc ingest, photo verification, bank statements, investor PDFs, handoff artifacts. One ingestion path, one storage layer, one audit trail. No per-feature file tables.
2. **Universal `notification_preferences`** drives every outbound alert (monitor changes, signal applications, deal evaluation results, watchlist hits). Channel = email | slack | teams | sms | webhook. Per-user, per-event-type. No per-feature notification logic.
3. **Universal `deal_outcomes` table** records life-of-loan post-close state (funded, extended, repaid, defaulted). Foundation for reputation, investor performance dashboard, consensus moat. Capture starts now even though aggregations come later.
4. **Universal `activity_events` table** powers the activity feed, audit log, and "what changed" diffs. Every signal write, monitor run, validation rerun, override, and deal evaluation emits one row.
5. **Borrower / property / entity domain entities are canonical.** Every new feature references them by `id`, never by text. New tables that point to a borrower use FKs.
6. **Every new endpoint enforces RLS via direct `org_id =` policy** (never via subquery joins). New tables get `org_id` denormalized.
7. **Every JSONB column is versioned** and validated through `src/lib/schemas/`.

---

### Tier S — Demo wow moments (1-2 days each, ship pre-NPLA)

These exist primarily to make a 5-minute coffee-meeting demo unforgettable. Damon walks into a fund meeting, opens the laptop, and the founder/Damon hits 2-3 of these in sequence.

#### S1. Comparative borrower view
**Pitch:** Pick two validations, see them side-by-side with risk factors aligned row-for-row.

**Users:**
- *Lender:* compare a deal-in-hand to a known-good prior borrower
- *Founder/Damon (NPLA):* "this is a strong borrower vs. this is a weak one — see how the rule engine treats each"
- *Investor (handoff context):* compare two originator submissions in the same fund

**UX flow:**
- Dashboard validation list gains a checkbox column. Selecting 2 enables a sticky "Compare" button at the top.
- Click → `/dashboard/compare?a={id1}&b={id2}`
- Two columns. Sticky header per side: borrower name, tier badge, flag count, validation date.
- Body: factor rows aligned (left and right side show the same factor in the same row). Color: green/yellow/red dot per side. If a factor is excluded on one side via signal override, show the chip "excluded — primary residence" inline.
- Bottom section: portfolio bar charts side-by-side (property count, total volume, hold-period histogram).
- Empty state on first arrival: "Pick a second validation" with a borrower-name picker.

**Data model:** No new tables. New endpoint `GET /api/validations/compare?ids=a,b` returns a structured diff. The diff structure is reusable for the Tier B "validation diff over time" feature.

**Dependencies:** Existing `risk_factors`, existing portfolio aggregates. Recharts already in deps.

**Effort:** 2 days.

**Strategic fit:** Demo amplifier #1. Reusable post-NPLA for borrower-relationship reviews.

---

#### S2. Story Mode — structured AI memo narrative
**Pitch:** Replace the AI memo paragraph block with a structured narrative: opener → strengths → risks (with severity callouts) → recommendations.

**Users:**
- *Lender:* skim the strengths/risks blocks instead of reading a paragraph
- *Investor (handoff PDF):* clean narrative structure to attach to deal package
- *Founder (demo):* visually distinct from generic ChatGPT output

**UX flow:**
- Validation detail page: replace existing single-text card with four blocks (Summary, Strengths, Risks, Recommendations).
- Each Risk has a severity badge (Critical / Moderate / Minor) and a "Why this rating?" anchor link that scrolls to the relevant factor.
- Compact-mode toggle (top-right) collapses each block to its first sentence for power-users.
- Print/handoff PDF gets the same structure with proper page-break rules.

**Data model:**
- `borrower_validations.ai_analysis` schema_version 2:
  ```
  { schema_version: 2,
    summary: string,
    strengths: { title: string, narrative: string }[],
    risks: { factor_key: string, severity: 'critical'|'moderate'|'minor', narrative: string }[],
    recommendations: { priority: 'must'|'should'|'consider', narrative: string }[],
    risk_rating: 'low'|'medium'|'high'  // overwritten server-side
  }
  ```
- Migration: schema_version DEFAULT 1, new memos default to 2. Render layer falls back to the v1 paragraph view when reading old rows.

**Dependencies:** Update `src/lib/ai/analysis.ts` prompt to emit structured shape. Re-run for existing validations on demand via the "Regenerate memo" button.

**Effort:** 2 days.

**Strategic fit:** Demo polish + handoff substrate. Lays groundwork for S5 (risk methodology PDF) and B6 (validation diff).

---

#### S3. Litigation case-card UI
**Pitch:** Replace "3 federal cases found" with expandable case cards that show case name, court, year, nature, status, and link to CourtListener.

**Users:** Lender + investor (handoff). The current summary makes them open a vendor portal to verify; cards keep them in the product.

**UX flow:**
- Validation detail Litigation pillar: list of cards, one per case.
- Card header: case name, court, filing year, nature-of-suit chip, status chip (Pending / Closed / Discharged / Dismissed).
- Click → expands to show top 5 docket events + dollar amount if extractable + outbound link to CourtListener.
- Filter chip row above the list: "Bankruptcy only", "Last 5 years only", "Active only", "Federal" (toggle, future state-court).
- Handoff PDF: condensed table form (one row per case).

**Data model:**
- New view (or materialized table) `litigation_cases`: derived from `litigation_checks.raw_response` at validation creation. Columns: `id, validation_id, case_name, court, filed_at, nature_of_suit, status, dollar_amount_estimated, source_doc_url, raw jsonb, org_id`.
- Backfill from existing raw_responses.

**Dependencies:** Existing CourtListener data. Add a `litigation_cases` extraction step to the validation pipeline.

**Effort:** 1.5 days.

**Strategic fit:** Demo transparency. Counter to "your AI just said 3 cases — what cases?"

---

#### S4. GC license one-line summary on dashboard list
**Pitch:** Validation list gains a "GC" column showing license status inline ("CA #1234567 Active / No Discipline" or "TX: Manual review needed").

**Users:** Lender scanning the pipeline daily. Pulls GC status forward without a click.

**UX flow:**
- New column in validation list: "GC".
- Color: green (active, no discipline) / yellow (active, prior discipline) / gray (manual review, e.g., TX) / red (revoked or invalid).
- Hover tooltip: full license details, expiration date, classifications.
- Mobile: collapses into a small chip next to the borrower name.

**Data model:**
- Add cached column `borrower_validations.gc_summary jsonb` (`{ status, license_id, state, classifications: [], expires_at, has_discipline }`). Populate on GC validation completion. Backfill from existing `gc_validations`.
- `schema_version`: 1.

**Dependencies:** None.

**Effort:** 1 day.

**Strategic fit:** Pipeline-view density.

---

#### S5. Risk methodology — printable PDF
**Pitch:** One-page printable showing the 9 factors with severity, contributing data, exclusions, and signal overrides applied.

**Users:**
- *Investor:* skeptical that AI picked tier — wants to see the math
- *Credit committee:* wants to attach methodology to the deal file
- *Lender (audit):* annual audit of underwriting decisions

**UX flow:**
- Validation detail: button "Print risk methodology".
- Generates `/validations/[id]/risk-methodology` page with print CSS.
- Header: borrower name, validation date, tier with deterministic rule footnote ("Tier rule: any critical → HIGH; ≥2 moderate → MEDIUM; else LOW").
- Body: 9 factors in fixed order. Each row: severity icon, factor name, contributing data (property addresses, case numbers, etc.), exclusion reason if any, narrative.
- Footer: signal-override log (who, when, reason, what changed).

**Data model:** No new tables. Reads `risk_factors` + signal tables.

**Effort:** 1 day.

**Strategic fit:** Hard counter to "this is just AI". Pairs with handoff PDF — investors get methodology on the back of the handoff.

---

### Tier A — Capital-provider stickiness (the distribution lever)

Per [memory: project_distribution_thesis](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/project_distribution_thesis.md), capital-provider endorsement is the only organic distribution path. Features here make a fund/aggregator say "all our originators have to use this" — or make Damon say it for them.

#### A1. Investor criteria PDF parser
**Pitch:** Fund manager uploads their guidelines PDF (or rate sheet); Claude parses → `investor_criteria` JSONB rows; deal eligibility goes live for that investor.

**Users:**
- *Founder/Damon (NPLA):* "Hand me your guidelines — I'll have your investor profile loaded before this coffee is cold."
- *Lender admin:* maintain investor profiles without manual JSON editing
- *Investor (post-launch):* self-serve "load your criteria" via a token link

**UX flow:**
- `/dashboard/evaluate/investors` page: upload zone (PDF/Excel) per investor.
- Server: file → `documents` row → Claude extraction with structured-output prompt → preview screen showing parsed criteria as a table (max LTV by FICO, max LTC, property type allow-list, geography, loan-size band, experience minimum).
- Parser-confidence indicator per row (high/medium/low). User toggles or edits before "Save criteria".
- Save: writes `investor_criteria` rows with `source = 'pdf_parse'`, `source_doc_url` pointing at the `documents` row. Old criteria get `effective_to = now()`; new criteria get `effective_from = now()`.

**Data model:**
- New table `investor_criteria_extractions` for the audit trail of what Claude parsed (raw output, confidence per field, user edits diff).
- Reuses existing `investor_criteria` for the active rule rows.
- Documents table stores the PDF.

**Dependencies:** `documents` table (universal infra). Existing Claude SDK + Module 1 engine.

**Effort:** 3 days.

**Strategic fit:** **Highest-leverage Tier A feature.** Damon at NPLA can demo this live with a real fund's PDF. The parsed-criteria preview itself is the wow moment.

---

#### A2. Counter-offer / repricing calculator
**Pitch:** When a deal fails an investor's criteria, compute the minimum changes (lower loan, higher ARV, more equity) that would make it pass.

**Users:**
- *Lender:* borrower's deal failed — what counter do I take back?
- *Originator (Damon):* show the borrower a path to "yes" instead of "no"
- *Investor (long-term):* see counter-offer suggestions investor would accept

**UX flow:**
- Deal evaluation results page: each failed investor shows a "Counter offer" button next to its row.
- Click → side panel computes the minimum delta on each constraint:
  - Loan amount: "drop loan by $25,000 → passes at 7.75%"
  - ARV: "increase ARV by $50,000 → passes at 7.50%"
  - Equity: "add $15,000 borrower contribution → passes"
  - Combined: "$10K loan reduction + $30K ARV increase → passes at best rate"
- Each suggestion is a clickable "What if?" that re-runs the eligibility against the modified deal.

**Data model:**
- New endpoint `POST /api/evaluate/counter-offer` returning suggestion vectors.
- No schema change; reads existing `investor_criteria`.

**Dependencies:** Module 1 framework (shipped).

**Effort:** 2 days.

**Strategic fit:** Capital-provider stickiness + originator workflow. Turns a fail into a sales tool.

---

#### A3. Borrower-facing capital-availability PDF
**Pitch:** Once a deal evaluates as eligible at one or more investors, generate a borrower-facing PDF: "Capital is available for this deal. Estimated terms: X% rate, Y% LTV, Z-day close."

**Users:**
- *Lender:* hand to borrower pre-appraisal so they don't bail
- *Borrower:* proof of capital availability for a hard-money deal
- *Damon (originator):* "we've already prequalified your capital — here's the proof"

**UX flow:**
- Deal evaluation results page: button "Generate borrower summary".
- Choices: full investor list disclosed vs. anonymized ("3 capital partners eligible at terms X-Y"). Default anonymized.
- PDF: branded, single page, includes deal recap + estimated terms range + close timeline + lender contact.
- Stored in `documents` with `purpose = 'borrower_capital_summary'` for re-download.

**Data model:** Reads `deal_evaluations` + `deal_eligibility_results`. Stores rendered PDF in `documents`.

**Dependencies:** Module 1 (shipped). PDF rendering helpers from handoff (shipped).

**Effort:** 1.5 days.

**Strategic fit:** Sales tool that originator hands borrower. Damon's been asking for this in spirit.

---

#### A4. Investor performance dashboard
**Pitch:** For an investor configured in PulseClose, show every originator's deal flow funneled to them: deals evaluated, deals passed criteria, deals funded, outcomes (extended/repaid/defaulted).

**Users:**
- *Investor (long-term, login required):* see which originators are sending strong deals
- *Lender admin:* see "we've sent Colchis 12 deals via PulseClose, 9 passed, 3 funded"
- *Founder/Damon:* show a fund "look how much disciplined deal flow we'd send you"

**UX flow:**
- New dashboard page `/dashboard/investors/[id]`: top-line metrics (deals evaluated, pass rate, funded count, default rate). Charts: deal flow over time, originator breakdown (anonymized to investor, named to lender admin).
- Per-originator drill-down (lender-side only): see their submissions and outcomes.
- Investor-login surface: post-launch, deferred behind a flag.

**Data model:**
- Aggregation query against `deal_evaluations` × `deal_eligibility_results` × `deal_outcomes` (universal table — Tier E/A blocker).
- New view `v_investor_performance` for aggregate metrics.
- No new persistence required if `deal_outcomes` is captured.

**Dependencies:** **`deal_outcomes` table must exist and be populated.** That's a 1-day standalone item (E1) — capture it now even though investor view ships later.

**Effort:** 3 days for dashboard + 1 day for outcomes capture form (E1).

**Strategic fit:** Long-term moat precursor. Demoable as a wireframe at NPLA even before real outcome data exists.

---

#### A5. Deal-quality scorecard for investors (originator scoring)
**Pitch:** Investor sees per-originator scoring: deal-quality grade, pass rate against their box, funding rate, default rate, response time.

**Users:** Investor (gated post-launch); lender admin (their own card, transparent).

**UX flow:**
- Investor page: scorecard tile per originator. Grade (A-F) computed from a weighted formula. Drill-down shows the inputs.
- Originator self-view: same scorecard as the investor sees, plus "what would move me up a letter grade".

**Data model:**
- Reads `deal_evaluations` + `deal_outcomes` + validation flag counts. No new tables.
- Scoring weights stored as a per-org config row.

**Dependencies:** A4 + outcome data accumulation.

**Effort:** 2 days.

**Strategic fit:** Two-sided marketplace primitive. Defer real activation post-NPLA, scope schema now.

---

### Tier B — Daily-driver retention (turn validation tool into pipeline tool)

Today PulseClose is "I have a deal, I run a validation". These features turn it into "I check my dashboard every morning."

#### B1. Borrower watchlist (one-click monitoring)
**Pitch:** Validation detail page gains a "Monitor this borrower" toggle. Auto-creates a `monitor_subscription` with sensible defaults (weekly cadence, current user as recipient, all current properties).

**UX flow:**
- Toggle in validation header. Click → modal: "Monitor weekly. Email zach@pulseclose.com on changes. [Customize]". Default works one-click.
- "Customize" expands: cadence selector (daily/weekly/monthly), recipient list (multi-email + Slack webhook later via D2), alert rules (any change / critical only).
- Active state: small green dot next to the borrower name everywhere they appear in the app.

**Data model:** Existing `monitor_subscriptions`. Add `borrower_id` FK if not already there (currently scoped to validation_id — should also support borrower-level so a new validation auto-inherits).

**Dependencies:** Existing monitoring infra.

**Effort:** 0.5 day.

**Strategic fit:** First customer (Insignia) lock-in. Watchlist makes them log in weekly.

---

#### B2. Portfolio health dashboard
**Pitch:** 2x2 (or 3x4) grid showing distribution of all the lender's borrowers across (tier × flag count). Drill-down to the borrower list per cell.

**UX flow:**
- New page `/dashboard/portfolio`: grid of cells (tier on Y, flag count on X). Each cell shows a number + sparkline trend.
- Click cell → filtered borrower list.
- Sidebar filters: time range (last 30/90 days/all), monitored only, has-active-deal-evaluation only.
- Recently-changed section: "5 borrowers changed tier in the last 30 days" with quick links.

**Data model:** Aggregation query over `borrower_validations` × `risk_factors` × `borrowers`. No new persistence.

**Dependencies:** None.

**Effort:** 2 days.

**Strategic fit:** Daily-driver headline. The first thing the lender opens in the morning.

---

#### B3. Validation search + filter + CSV export
**Pitch:** Search across all the org's validations by borrower name, entity name, property address, date range, tier, flag presence.

**UX flow:**
- Top of dashboard: search bar with auto-complete on borrower / entity names. Returns recent matches grouped by entity type.
- Filter sidebar: date range, tier (multi-select), flag presence (any / specific factor), monitored, has-handoff.
- Result list: card per validation with preview metrics. CSV export of filtered set.

**Data model:**
- Add full-text search index on `borrowers.display_name`, `entities.display_name`, `properties.address_normalized`.
- No new tables.

**Dependencies:** None.

**Effort:** 2 days.

**Strategic fit:** Workflow friction removal. Cheap, table-stakes.

---

#### B4. "Have we seen this borrower before?" guard
**Pitch:** On `/dashboard/new`, as the lender types the borrower name, fuzzy-match against existing borrowers in the org and surface prior validations before they run a duplicate.

**UX flow:**
- Type "Kim Truo..." → dropdown shows existing matches with last-validated date and current tier.
- Click match → opens existing validation detail (read-only; option to "Run new validation for this borrower" if they want a fresh check).
- No match → form proceeds normally.

**Data model:** Reuses `borrowers` table + normalized name search.

**Dependencies:** None.

**Effort:** 0.5 day.

**Strategic fit:** Anti-friction. Saves the lender a wasted vendor call.

---

#### B5. Activity feed (universal `activity_events` table)
**Pitch:** Timeline of everything that's happened in the org: validations created, signals applied, monitor runs, tier changes, handoffs sent, deals evaluated.

**UX flow:**
- New page `/dashboard/activity`: chronological feed grouped by day. Each row: actor, verb, object, timestamp. Click → context (the validation, the signal, etc.).
- Filter: by actor (user), by event type, by entity (only Kim Truong's events), by date.
- Highlights row at top: "5 new monitor changes today, 2 require attention."

**Data model:** New universal table `activity_events`:
```
id uuid PK
org_id uuid FK NOT NULL
actor_user_id uuid FK NULLABLE  -- null for system events (cron)
verb text  -- 'created' | 'updated' | 'applied_signal' | 'ran_monitor' | 'changed_tier' | 'sent_handoff' | 'evaluated_deal' | 'extracted_doc' | ...
subject_type text  -- 'validation' | 'borrower' | 'property' | 'signal' | 'monitor_run' | 'deal_evaluation'
subject_id uuid
metadata jsonb  -- e.g., { from_tier: 'medium', to_tier: 'low', signal_key: 'is_primary_residence' }
created_at timestamptz
```
RLS: `org_id = current_org`. Index on `(org_id, created_at desc)`.

Application code emits events at every state change. The existing `audit_log` is for security/compliance; `activity_events` is the user-facing feed.

**Dependencies:** None.

**Effort:** 2 days (table + emits + UI).

**Strategic fit:** Daily-driver. Also feeds B6 (diff) and the future investor-facing "see your originator's activity".

---

#### B6. Validation diff over time
**Pitch:** Same borrower, two validations 6 months apart. Show what changed: new properties acquired/disposed, new litigation, new signals, tier delta.

**UX flow:**
- Validation detail header: "Compare to previous validation" link (only enabled if a prior validation exists for this borrower).
- Compare page (reuses S1 layout): two columns aligned by factor + portfolio. Plus a third "Changes" panel highlighting deltas (new properties, new cases, signal applications).

**Data model:** Reuses S1 endpoint with date-pair input. No new tables.

**Dependencies:** S1 (Comparative borrower view).

**Effort:** 1.5 days incremental on S1.

**Strategic fit:** Monitoring story-mode. "Borrower has been quiet for 6 months — but now this changed."

---

### Tier C — Trust-but-verify expansion (more ground-truth, less inference)

Trust-but-verify is the architectural moat — automated checks that catch the things lenders' eyes miss. Each item below adds an independent signal.

#### C1. Geo-tagged rehab photo upload
**Pitch:** Borrower uploads before/after photos via share link. Claude vision + EXIF GPS confirms address match. Adds confidence to track-record claims.

**Users:**
- *Borrower (share link):* upload zone for property photos
- *Lender:* "borrower uploaded 8 photos from 1310 Rosalia, all geo-matched within 50m → high confidence track record is real"

**UX flow:**
- Share link: each property in the verified list gets an optional "Upload before/after photos" zone.
- Upload: client-side EXIF extraction (date, GPS coordinates if available) + image dispatched to server.
- Server: store in `documents` with `purpose = 'photo_verification'`, `related_property_id`. Run Claude vision: "is this a residential property? does it look like before/after rehab? does the visible address signage match?".
- Result stored as `photo_verifications` row + creates a property-level signal `photo_verified = true` if confidence ≥ 0.8.
- Lender-side: validation detail track-record card shows photo thumbnails per property + verification chip.

**Data model:**
- `documents` (universal) stores files.
- New `photo_verifications` table:
  ```
  id, document_id FK, property_id FK, validation_id FK NULL,
  has_exif_gps bool, exif_lat, exif_lng, distance_from_property_meters numeric,
  ai_address_match_confidence numeric,
  ai_property_type text, ai_visible_address text,
  ai_assessment text, processed_at, org_id
  ```
- Auto-creates a `property_signals.photo_verified` row when high confidence.

**Dependencies:** `documents` table. Claude vision via SDK (already available). Supabase storage bucket (likely already provisioned).

**Effort:** 3 days.

**Strategic fit:** Major fraud-detection lever. Demo wow ("borrower lied about rehabbing — photos were of a different property").

---

#### C2. BatchData historical deed search
**Pitch:** Per pickup.md, this is the highest-impact data-quality improvement available. Adds historical deed data Realie misses (~60-70% gap). Vendor cost ~$200-500/mo.

**Users:** Every track-record validation gets richer.

**UX flow:** Invisible — runs in parallel with Realie + Regrid + ATTOM.

**Data model:** New adapter `src/lib/adapters/batchdata.ts`. No schema changes (writes existing `track_record_entries` + `property_ownership`).

**Dependencies:** Vendor signup ($).

**Effort:** 2-3 days.

**Strategic fit:** Single biggest data-quality bump available. Closes the "trust me, normally we have more data" demo gap.

---

#### C3. Reverse phone / email validation
**Pitch:** Borrower's contact info → Hunter.io / NumVerify confirms name match + spam score.

**UX flow:**
- New optional field on `/dashboard/new`: borrower phone, borrower email.
- Background check on submit. Result: small chip on validation card "Phone matches name (high confidence)" or "Phone is VOIP / no name match (review)".

**Data model:** New `contact_verifications` table per (borrower_id, channel, value). Free-tier API has rate limits — usage-meter aggressively.

**Dependencies:** Vendor signup (free tier exists).

**Effort:** 1 day.

**Strategic fit:** Cheap fraud signal.

---

#### C4. Address consistency cross-check
**Pitch:** Borrower's stated home address vs. entity's registered agent address vs. property addresses — flag mismatches and cluster anomalies.

**UX flow:**
- Validation detail Risk panel: new informational factor `address_inconsistency` when (a) home address ≠ any property, (b) registered agent address is a known mail-drop, (c) all properties cluster in one zip ≠ home zip.
- Each finding clickable to context.

**Data model:** New computed factor in `src/lib/risk/factors.ts`. No schema change.

**Dependencies:** Existing data + a small mail-drop / CMRA lookup list (free public dataset).

**Effort:** 1 day.

**Strategic fit:** Subtle fraud signal. Fits cleanly into existing factor framework.

---

#### C5. Bank statement parser (optional borrower upload)
**Pitch:** Borrower uploads recent bank statement via share link → Claude extraction → liquidity confirmation factor.

**UX flow:**
- Share link gains optional "Upload recent statement" zone.
- Server: stores in `documents` with `purpose = 'bank_statement'`. Claude extracts ending balance, monthly inflows, monthly outflows, NSF count, return-deposit count.
- Lender-side: liquidity card on validation detail. Shows ending balance vs. minimum-down requirement, cash-burn rate, NSF flags.
- Privacy: borrower sees a clear consent banner; statements expire from `documents` after 90 days unless lender opts to retain.

**Data model:**
- `documents` stores statement.
- New `bank_statement_extractions` table: parsed metrics, confidence per field, raw extraction.
- Factor: `liquidity_confirmed` (positive) or `liquidity_concern` (NSF > N, ending balance < threshold).

**Dependencies:** `documents` table. Privacy/legal note (statements are sensitive data).

**Effort:** 2 days.

**Strategic fit:** Differentiator. Most underwriting tools force the lender to ask for statements separately; this puts it in the borrower's flow.

---

#### C6. Public records cross-check expansion
**Pitch:** Surface what we already pull from CourtListener better — extract liens, judgments, federal tax warrants, foreclosure proceedings — instead of just bankruptcy + civil.

**UX flow:**
- Litigation pillar splits into sub-cards: Bankruptcy, Civil litigation, Liens, Federal tax warrants, Foreclosures.
- Each surfaces a count + jump to case cards.

**Data model:** Extends litigation_cases (S3) with `category` enum.

**Dependencies:** S3.

**Effort:** 1 day.

**Strategic fit:** "More than we pay for" without new vendor.

---

### Tier D — Workflow integration (where the lender already lives)

Lenders live in email, Slack, calendars, and CRMs. Meet them there.

#### D1. Email-forward deal submission
**Pitch:** `deals@pulseclose.com` → Resend webhook → Claude extraction → pre-filled validation form awaiting lender review.

**UX flow:**
- Lender forwards a deal email (broker intro, borrower email, etc.) to `deals@<lender-subdomain>.pulseclose.com`.
- PulseClose ingests, runs Claude extraction (borrower name, entity, properties, loan amount), creates a draft `borrower_validations` row.
- Lender gets a notification: "New deal from broker@xyz.com — review and run validation".
- Click → validation form pre-filled, lender adjusts and submits.

**Data model:**
- `documents` stores raw email + attachments (`purpose = 'inbox_submission'`).
- New `inbox_submissions` table: source email, subject, sender, parsed-fields preview, status (`pending_review`, `converted`, `rejected`).
- Per-org subdomain config row.

**Dependencies:** Resend inbound email ($, paid add-on).

**Effort:** 3 days.

**Strategic fit:** Workflow integration. Lender stays in their inbox.

---

#### D2. Slack / Teams notifications
**Pitch:** When a borrower's risk tier changes (or any monitored event), send a Slack message to a configurable channel.

**UX flow:**
- `/dashboard/settings/notifications`: add Slack webhook URL or Teams webhook URL. Per-event-type toggles.
- Channel test button verifies the webhook works.
- Notifications use the universal `notification_preferences` system — same routing layer as email.

**Data model:** Universal `notification_preferences` table:
```
id, user_id FK, org_id FK,
channel: 'email' | 'slack' | 'teams' | 'sms' | 'webhook',
event_type: 'monitor_change' | 'signal_applied' | 'deal_evaluated' | 'tier_changed' | 'photo_uploaded' | ...,
enabled bool,
target_address text,  -- email / webhook URL / phone
created_at, updated_at
```

**Dependencies:** Universal notifications layer (1 day) + Slack webhook integration (0.5 day).

**Effort:** 1.5 days.

**Strategic fit:** Retention. Lender's credit team lives in Slack.

---

#### D3. Calendar integration (closing dates)
**Pitch:** Validation gains an optional "expected close date" field. ICS download + reminder to re-run validation 7 days before close.

**UX flow:**
- Validation form: optional date field "Expected close".
- Validation detail: download `.ics` button.
- Cron at 7 days pre-close: notification via D2/email "Re-run validation for closing this week?" with one-click rerun.

**Data model:** Add `borrower_validations.expected_close_date date NULL`.

**Dependencies:** D2 / notifications.

**Effort:** 1 day.

**Strategic fit:** Workflow nudge.

---

#### D4. Browser extension / bookmarklet
**Pitch:** Paste any address from Zillow/Realtor/MLS → opens PulseClose with the address pre-filled in track-record.

**UX flow:**
- Bookmarklet: drop on bookmark bar. Click while on a Zillow listing → opens PulseClose new-validation flow with address pre-filled.
- Phase 2: real Chrome extension with right-click "Validate this address" + automatic property data scrape.

**Data model:** None.

**Dependencies:** None.

**Effort:** 1 day for bookmarklet, +2 days for full extension.

**Strategic fit:** Workflow speed. Demoable as "look how fast I can pull a validation".

---

#### D5. Public REST API for lender CRMs
**Pitch:** REST endpoints `/api/public/validations`, `/api/public/handoff/[id]/excel` keyed on per-org API tokens. Lenders with internal tools embed PulseClose data directly.

**UX flow:**
- `/dashboard/settings/api-keys`: generate token. Scoped per-org.
- Docs page at `/docs/api` with OpenAPI spec.

**Data model:** New `api_keys` table: `id, org_id, label, hashed_token, last_used_at, created_at, revoked_at`.

**Dependencies:** Existing endpoints + token middleware.

**Effort:** 2 days.

**Strategic fit:** Enterprise enablement. Required for any lender with their own UW system to accept us.

---

### Tier E — Network effects / data moat (long horizon, schema now)

Per [STRATEGY.md](../STRATEGY.md) long-shot bets. Each item below is high-effort and customer-density-gated, but the **schema** to support them is cheap to ship now so we accumulate data from day 1.

#### E1. Deal outcomes capture (universal `deal_outcomes` table)
**Pitch:** Post-close, lender clicks "Deal funded / extended / repaid / defaulted" on the validation. Foundation table for everything in this tier and most of Tier A.

**UX flow:**
- Validation detail: "Update deal status" button. Statuses: Withdrawn / Funded / Extended / Repaid / Defaulted.
- Each status has optional fields (close date, funding amount, extension reason, default cause).
- Once status set, validation gets an outcome chip on the dashboard.

**Data model:**
```
deal_outcomes
  id uuid PK
  org_id uuid FK NOT NULL
  borrower_id uuid FK NOT NULL
  validation_id uuid FK NULL
  deal_evaluation_id uuid FK NULL
  status: 'pending' | 'withdrawn' | 'funded' | 'extended' | 'repaid' | 'defaulted'
  status_date date
  funded_amount numeric NULL
  funded_terms jsonb NULL  -- rate, points, term length
  extension_count int DEFAULT 0
  default_cause text NULL
  notes text
  reported_by_user_id uuid FK
  created_at, updated_at
  RLS: org_id-scoped
```

**Dependencies:** Borrowers + validations (shipped).

**Effort:** 1 day for schema + capture form.

**Strategic fit:** Blocker for A4, A5, E2, E3, E4. **Ship this in P0 timeframe** even though the dashboards come later.

---

#### E2. Borrower reputation score (PulseClose-native)
**Pitch:** Over time + outcomes, build a derived score per borrower. Inputs: validation count, average tier, default rate, extension rate, signal correction rate, time-since-first-validation.

**Users:** Lender (decision input); investor (deal-flow filter); future: borrower (their own profile).

**UX flow:**
- Borrower detail page: large reputation score (A-F or 0-100) with explanation panel.
- Each input shows its contribution. Like a credit-score breakdown.
- Trend chart over time.

**Data model:**
```
borrower_reputation_scores
  id, borrower_id FK, org_id FK,
  score int,  -- 0-100
  letter_grade text,  -- 'A'..'F'
  components jsonb,  -- per-input contribution
  validations_count, outcomes_count,
  computed_at, expires_at
```
- Recompute on validation create, signal apply, outcome update.

**Dependencies:** E1.

**Effort:** 3 days.

**Strategic fit:** Long-term moat. The thing every lender wants and no one has the data for.

---

#### E3. Anonymized cross-tenant consensus
**Pitch:** When lender X validates borrower Kim Truong, check (via anonymized hash) if other lenders have validated her recently. Show "validated by 3 other PulseClose lenders in last 90 days; consolidated view available on request".

**UX flow:**
- Validation detail: small chip "Borrower has 3 other validations in network (90d)". Click → consolidated read-only view (with permissions: only show after both parties have opted in via a pre-negotiated consortium agreement).

**Data model:**
```
consensus_aggregates
  id, borrower_hash text,  -- HMAC of normalized name + tax-id-last-4 if available
  validations_count_30d, validations_count_90d, validations_count_365d,
  last_seen_at, last_tier_observed (low|medium|high),
  computed_at
```
- Hash computed at validation creation time. Aggregation cron.
- Per-org `consensus_participation` flag.

**Dependencies:** Critical mass (10+ lenders). Legal review of anonymization (~$5-15K).

**Effort:** 2 days schema + cron now; full feature is 4-5 days when activated.

**Strategic fit:** Defensible moat. Hard to replicate without customer density.

---

#### E4. Public borrower profile (opt-in)
**Pitch:** A borrower with a strong PulseClose history can opt in to a public "verified track record" page they share with new lenders.

**UX flow:**
- Borrower share link gains a section: "Make your PulseClose history visible to future lenders".
- Opt-in toggle per element (validations, outcomes, signal-corrections-not-fraud).
- Public URL `pulseclose.com/borrower/[uuid]` showing track record + reputation score.

**Data model:** New `borrower_public_profiles` table with opt-in flags + public-uuid + visibility-control matrix.

**Dependencies:** E2.

**Effort:** 2 days.

**Strategic fit:** Network engine. Borrowers self-promote → new lenders find PulseClose.

---

### Tier F — Module 1 expansion

#### F1. Multi-deal scenario comparison
**Pitch:** Enter 3 deal structures (e.g., 75% LTV at 2-yr / 70% LTV at 3-yr / 80% LTC bridge), see investor matches per scenario, pick the best.

**UX flow:** `/dashboard/evaluate/scenarios` page. Three columns. Investor pass/fail per row. Best-rate column.

**Data model:** Reuses `deal_evaluations` × `deal_eligibility_results`.

**Effort:** 1.5 days.

**Strategic fit:** Originator workflow. "Show me three options for this borrower."

---

#### F2. Rate-shock stress test
**Pitch:** "If rates rise 100bps, which investors still take this deal?" — auto-runs eligibility against +100bps / +200bps scenarios.

**UX flow:** Toggle on deal evaluation results: "Stress test +100bps". Results shown side-by-side with current.

**Data model:** No new tables.

**Effort:** 1 day.

**Strategic fit:** Risk-management story for investors.

---

#### F3. Investor-side deal queue
**Pitch:** Investor logs in, sees all PulseClose-tagged qualified deals from their configured originators, accepts/declines/comments.

**UX flow:**
- New investor-side dashboard. Deal queue. Per-deal: borrower summary, tier, eligibility result, originator's narrative.
- Accept → notifies originator. Decline → reason capture, fed back to A5 scorecard.

**Data model:** `deal_submissions` table linking originator → investor → deal_evaluation_id with status (`pending`, `accepted`, `declined`, `withdrawn`).

**Dependencies:** Investor logins (currently lender-only auth scope). New role `investor_user`.

**Effort:** 3 days.

**Strategic fit:** Two-sided marketplace primitive. Defer activation post-NPLA.

---

### Cross-cutting infrastructure (universal building blocks)

Three small but universal additions that several Tier features depend on. Ship these as P1 (right after P0) so the rest of the plan composes cleanly.

#### X1. Universal `documents` table
**Pitch:** One table for every uploaded file in the system: borrower share-link uploads, lender doc ingest, photos, bank statements, investor PDFs, generated handoff PDFs/Excels.

**Data model:**
```
documents
  id uuid PK
  org_id uuid FK NOT NULL
  uploaded_by_user_id uuid FK NULL  -- null for borrower uploads via share link
  share_token text NULL  -- for borrower-side uploads
  storage_path text NOT NULL  -- supabase storage path
  mime_type text, file_size_bytes int, original_filename text,
  purpose text NOT NULL  -- 'borrower_doc_intake' | 'borrower_share_upload' | 'photo_verification'
                         -- | 'bank_statement' | 'investor_pdf' | 'handoff_artifact'
                         -- | 'inbox_submission' | 'borrower_capital_summary'
  related_entity_type text NULL  -- 'borrower' | 'property' | 'validation' | 'investor' | 'monitor_run'
  related_entity_id uuid NULL
  ai_extraction_status text  -- 'pending' | 'success' | 'failed' | 'not_applicable'
  ai_extraction jsonb NULL  -- structured extraction result
  expires_at timestamptz NULL  -- for sensitive docs (bank statements default 90d)
  created_at, updated_at
  RLS: org_id-scoped (with share_token bypass policy for borrower side)
```

Migrate existing scattered file-handling (handoff Excel/PDF rendering, doc ingest, share-link file upload) onto this table.

**Effort:** 1 day for table + migration; per-feature integration is line-item time.

---

#### X2. Universal `notification_preferences` + dispatch layer
**Pitch:** Single per-user-per-event-type config that drives all outbound notifications. New features add an event_type and reuse the dispatch layer.

**Data model:** See D2 above for schema.

**Effort:** 1 day.

---

#### X3. Universal `activity_events` table
**Pitch:** Every state change emits one row. UI feed (B5), audit trail, time-machine queries, "what changed" diffs all read from this.

**Data model:** See B5 above for schema.

**Effort:** 1 day.

---

### Recommended implementation order (pre-NPLA, ~50 working days)

**Week 1 — Stabilization (P0 above, 4-6 days).**
Critical bugs → data-model corrections → demo-path UX. Click through the demo flow in a browser end-to-end before moving on.

**Week 2 — Universal infra + Tier S demo wow (6-8 days).**
X1 + X2 + X3 (3 days). Then S1 (Comparative) + S2 (Story Mode) + S3 (Litigation cards) + S4 (GC inline) + S5 (Risk methodology PDF) (~7 days).

**Week 3 — Tier A capital-provider stickiness (8-10 days).**
A1 (Investor PDF parser, 3d) + A2 (Counter-offer, 2d) + A3 (Borrower capital PDF, 1.5d) + E1 (deal outcomes capture — 1d, blocker for A4) + A4 (Investor performance dashboard, 3d).

**Week 4 — Tier B retention (6-8 days).**
B1 (Watchlist, 0.5d) + B2 (Portfolio dashboard, 2d) + B3 (Search, 2d) + B4 ("Have we seen this borrower", 0.5d) + B5 (Activity feed, 2d) + B6 (Validation diff, 1.5d).

**Week 5 — Data-quality jump (4-5 days).**
C2 (BatchData deeds — biggest single data-quality lever, 2-3d) + C3 (Reverse phone/email, 1d) + C4 (Address consistency, 1d).

**Week 6 — Trust-but-verify polish (5-6 days).**
C1 (Photo verification, 3d) + C5 (Bank statement parser, 2d) + C6 (Litigation expansion, 1d).

**Week 7 — Workflow integration + content (4-5 days).**
D2 (Slack/Teams, 1.5d) + D4 (Bookmarklet, 1d) + D5 (Public API, 2d). **Plus content tasks: Insignia testimonial, 2-3 polished demo deals (E1 outcomes pre-loaded), demo collateral, talk-tracks.**

**Buffer week 8.** Bug bash, polish, dry-run NPLA demos with Damon.

Tiers E (network effects) and F (Module 1 expansion beyond F1/F2) sit post-NPLA. Schema for E1-E3 ships in week 3 so data accumulates from day 1.

---

## Backlog / ideas (with provenance)

> Items marked with **→ Tier X** in Notes have been promoted to the [Expansion plan](#expansion-plan--features-unlocked-by-2-day-velocity) above with full UX + data-model detail.

| Idea | Source | Notes |
|---|---|---|
| OpenCorporates person → entity discovery ($2,800/yr) | STRATEGY.md medium-term | DEFERRED. Insignia uses Elementix; revisit only for non-Insignia customers where Elementix isn't already paid. |
| Cross-lender borrower reputation graph | STRATEGY.md long-shot | **→ Tier E (E2 + E3)**. Schema lands pre-NPLA; activation post-density. |
| Fraud-ring detection via graph AI | STRATEGY.md long-shot | Same data-cooperative problem. Long horizon; benefits from E1/E3 substrate. |
| Satellite construction monitoring | STRATEGY.md long-shot | Big swing. Pairs with C1 (photo verification) once continuous monitoring proves out. |
| Climate-risk scoring per property | STRATEGY.md long-shot | First American partnership angle. New informational risk factor; small effort. |
| DSCR rental-loan vertical | STRATEGY.md market expansion | 54% YoY growth, ~90% engine reuse. Post-NPLA bet if a DSCR customer signal appears. |
| SBA lending vertical | STRATEGY.md market expansion | $25B/yr, regulatory tailwind. |
| UK bridging finance | STRATEGY.md market expansion | GBP 13.4B market. Far. |
| Compliance automation (mandated docs, deadlines) | Insignia 4/28 call | "Smart thing to tell us something needs to be sent out." Composes with universal `documents` table (X1) once shipped. |
| Operating-agreement collection adapter | Insignia 4/28 call | For brokered channel where Elementix output isn't accepted (Kiavi/Yabi). Templated borrower request via share link + extraction via X1 + entity-ownership map population. |
| State-specific endorsement validator | Insignia 4/28 call | Noah: *"every state has some different endorsements."* Per-state research-bound. |
| ICP picker (Bridge / Bank / DSCR / Brokered / Private credit) | 4/28 demo | Premature until non-Bridge customer asks. v1 hardcodes Bridge. |
| Auto-recommend supplemental conditions | Insignia 4/28 call | "If applicable" supplemental conditions section. Recommend: e.g., "Bitcoin source + loan > $10M → recommend personal tax transcript." Small rules layer on top of factor + signal data. |
| Investor-criteria PDF parser | Module 1 expansion | **→ Tier A (A1)**. |
| Comparative borrower view | Audit 2026-04-30 | **→ Tier S (S1)**. |
| Story Mode AI memo | Audit 2026-04-30 | **→ Tier S (S2)**. |
| Litigation case-card UI | Audit 2026-04-30 | **→ Tier S (S3)**. |
| GC inline summary | Audit 2026-04-30 | **→ Tier S (S4)**. |
| Risk methodology PDF | Audit 2026-04-30 | **→ Tier S (S5)**. |
| Counter-offer / repricing | Audit 2026-04-30 | **→ Tier A (A2)**. |
| Borrower capital-availability PDF | Audit 2026-04-30 | **→ Tier A (A3)**. |
| Investor performance dashboard | Audit 2026-04-30 | **→ Tier A (A4)**. |
| Originator scorecard for investors | Audit 2026-04-30 | **→ Tier A (A5)**. |
| Borrower watchlist (one-click monitor) | Audit 2026-04-30 | **→ Tier B (B1)**. |
| Portfolio health dashboard | Audit 2026-04-30 | **→ Tier B (B2)**. |
| Validation search + filter | Audit 2026-04-30 | **→ Tier B (B3)**. |
| "Have we seen this borrower" guard | Audit 2026-04-30 | **→ Tier B (B4)**. |
| Activity feed | Audit 2026-04-30 | **→ Tier B (B5)**. |
| Validation diff over time | Audit 2026-04-30 | **→ Tier B (B6)**. |
| Geo-tagged photo verification | Audit 2026-04-30 | **→ Tier C (C1)**. |
| BatchData historical deeds | Audit 2026-04-30 / pickup.md | **→ Tier C (C2)**. Highest-impact data-quality lever available. |
| Reverse phone/email validation | Audit 2026-04-30 | **→ Tier C (C3)**. |
| Address consistency cross-check | Audit 2026-04-30 | **→ Tier C (C4)**. |
| Bank statement parser | Audit 2026-04-30 | **→ Tier C (C5)**. |
| Public records expansion (liens, warrants) | Audit 2026-04-30 | **→ Tier C (C6)**. |
| Email-forward deal submission | Audit 2026-04-30 | **→ Tier D (D1)**. |
| Slack/Teams notifications | Audit 2026-04-30 | **→ Tier D (D2)**. |
| Calendar integration | Audit 2026-04-30 | **→ Tier D (D3)**. |
| Browser extension / bookmarklet | Audit 2026-04-30 | **→ Tier D (D4)**. |
| Public REST API for CRMs | Audit 2026-04-30 | **→ Tier D (D5)**. |
| Deal outcomes capture | Audit 2026-04-30 | **→ Tier E (E1)**. |
| Borrower reputation score | Audit 2026-04-30 | **→ Tier E (E2)**. |
| Anonymized cross-tenant consensus | Audit 2026-04-30 | **→ Tier E (E3)**. |
| Public borrower profile (opt-in) | Audit 2026-04-30 | **→ Tier E (E4)**. |
| Multi-deal scenario comparison | Audit 2026-04-30 | **→ Tier F (F1)**. |
| Rate-shock stress test | Audit 2026-04-30 | **→ Tier F (F2)**. |
| Investor-side deal queue | Audit 2026-04-30 | **→ Tier F (F3)**. |
| Universal `documents` table | Audit 2026-04-30 | **→ X1 (cross-cutting infra)**. |
| Universal `notification_preferences` | Audit 2026-04-30 | **→ X2 (cross-cutting infra)**. |
| Universal `activity_events` table | Audit 2026-04-30 | **→ X3 (cross-cutting infra)**. |

---

## Decisions log (append-only)

### 2026-04-30 — Velocity-aware expansion plan + P0 audit
After shipping Now + the entire code-buildable Pre-NPLA punch list in two days (2026-04-29 → 04-30), ran a four-track audit (code correctness / data model / UX / strategy) to surface bugs from the rapid push and rescope what's reachable pre-NPLA at proven velocity. Outputs:

1. **P0 — Corrections** section added at the top of this doc covering 6 critical bugs, 7 data-model issues, and 9 UX gaps. Migration `00016_p0_corrections.sql` consolidates the schema changes (snapshot-table org_id denormalization, missing timestamps, partial unique indexes on signal tables, JSONB schema_version, risk_factor expires_at, lender escalation guard, monitor_runs RLS).
2. **Expansion plan** added with six tiers organized by strategic lever: S (demo wow), A (capital-provider stickiness), B (daily-driver retention), C (trust-but-verify), D (workflow integration), E (network-effects moat), F (Module 1 expansion). 30+ feature blocks with user stories, UX flows, data model, dependencies, effort estimates.
3. **Three universal infra tables** added to DATA-MODEL.md (documents, notification_preferences, activity_events) plus an outcome/reputation/consensus layer. Every new feature composes on these primitives — no per-feature file storage, notification, or event-log code.
4. **Implementation order** spans 8 weeks at 2-day-per-feature pace. Sequence: P0 stabilization → universal infra → Tier S demo wow → Tier A capital stickiness → Tier B retention → Tier C data-quality → Tier D workflow → buffer + content. Tiers E and F (long-horizon moat + Module 1 expansion) sit post-NPLA but their schema lands pre-NPLA so data accumulates from day 1.

Source: 2026-04-30 multi-track audit. Plan reflects [memory: feedback_velocity_sizing](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/feedback_velocity_sizing.md) (days, not weeks) and [memory: feedback_long_term_architecture](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/feedback_long_term_architecture.md) (clean-refactor over fast-ship). Distribution thesis remains intact — Tier A weighted higher than Tier B in the schedule.

### 2026-04-28 — Zach owns all PulseClose IP
Partnership structure with Insignia (JV, JV-fund, or parallel SaaS) is being shaped, but tech ownership is settled in Zach's favor. Compensation structure is what gets negotiated; ownership is not. Most product work is therefore dual-use across paths. Build generalized frameworks (Module 1 as configurable rules engine, not hardcoded to Insignia). Reserve real caution only for marketing/positioning materials that publicly name Insignia's relationships without Damon's blessing.

### 2026-04-28 — NPLA win definition
NPLA = attendee mode, June 22-23. Damon facilitates warm intros. Win = 3 of {fund intros, lender intros, product demos, consulting leads}. No booth setup. Demos delivered in coffee-meeting format with pre-loaded demo deals + investor handoff artifact + Insignia testimonial.

### 2026-04-28 — No outside-Damon lender outreach pre-NPLA
While the Insignia partnership structure is being shaped, all lender/fund outreach goes through Damon. No independent lender conversations until the partnership develops further. This protects positioning and keeps Damon's warm-intro role as the primary distribution mechanism. Implication: don't build a high-volume customer-acquisition funnel; the entire pre-NPLA customer-development surface is "ask Damon." Capacity is unconstrained on Zach's side, so the bottleneck is structure clarity, not throughput.

### 2026-04-29 — Override-and-rerun is the product, not a workaround
User-correctable signals on derived data (e.g., "this property is the borrower's primary residence") that trigger automatic re-derivation of risk factors, tier recomputation, and AI-memo regeneration. Two halves of Noah's "I want to understand what's going into that": transparency (factor decomposition) AND agency (correcting the data when the user knows more). This transforms the product from passive automated report to interactive augmented-underwriter tool, and creates a labeled-data flywheel — every override is a training example for better future automation.

### 2026-04-29 — Path B data model: full normalization
Borrowers, entities, properties, and lenders are first-class persistent domain entities. Validations are snapshots referencing them. Signals/overrides scope to the right entity (borrower, property, or borrower×property relationship). Chosen over the lighter borrower-scoped-only path because the product is new (no legacy weight), Module 1 + investor handoff will need cross-validation entity dedup anyway, and the cleaner substrate avoids rebuilding within months. See [DATA-MODEL.md](./DATA-MODEL.md). Migration uses 1:1 dedup on legacy data with admin merge tool for human-reviewed cleanup over time.

### 2026-04-29 — FDIC lender classifier
Bank/bridge/private-credit classification of lenders is derived from FDIC's free public institution database (~6,000 records, weekly CSV) plus a small known-bridge denylist for the 10-20 names that matter (Insignia, Velocity, Lima One, RCN, Anchor, Kiavi, etc.). Authoritative + self-updating. Hardcoded list rejected as the wrong answer.

### 2026-04-28 — Velocity sizing
Effort estimates are days at Zach + Claude Code pace, not weeks. "Later" only for vendor-$ commitment, external dependency block, per-jurisdiction research, or unvalidated speculation. See [memory: feedback_velocity_sizing](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/feedback_velocity_sizing.md).

### 2026-04-28 — Risk scoring is rules-driven, not pure-AI
The validation report's risk tier is computed deterministically from named factors with severity tags, then explained by Claude in narrative form. Claude does not pick the tier directly. Reason: Noah demo feedback. Reproducibility + explainability beat opaque AI judgment. AI is for narrative, not for the score itself.

### 2026-04-28 — Distribution thesis: capital providers, not lender peers
Lenders treat UW tools as competitive edge and don't refer them peer-to-peer. The only organic distribution path is capital-provider endorsement. Reorders priorities: investor handoff Excel/PDF gets elevated over polish/UX work. NPLA strategy = pitch capital providers, not peer lenders.

### 2026-04-28 — Bridge ICP hold-period rule
Extended-hold flag has two stacked exclusions: (a) primary-residence properties (borrower lives there → not flip-delay), (b) bank-financed properties (designed long-term). Source: Noah 4/28 demo, Truong/Rosalia property example.

### 2026-04-28 — Drop borrower form-fill UX
Borrowers won't fill another form at scale. Lenders pay PulseClose; borrowers don't touch the PulseClose UI for full intake. Doc ingestion (Excel/PDF/Word/CSV) replaces form-fill. The existing `/share/<token>` link survives but only as a "send me your flip list" sub-flow with file-upload added.

### 2026-04-17 — Verification Gateway product framing
PulseClose's strongest framing is as the qualification layer between front-end CRM and the LOS. Each vendor (Cobalt, Realie, Regrid, ATTOM, CourtListener, OpenSanctions, CSLB, OFAC, eventually Zillow / TransUnion / Elementix) is one adapter underneath. Value lives in orchestration + scoring + LOS payload, not any single adapter. Source: Noah unprompted at 4/17 ICC working session.

### 2026-04 — FCRA: entity-only first
Reports on business entities (LLCs) are not consumer reports under FCRA. Reports on individuals (even for business-purpose loans) likely are. Launch path: entity-only reports clean; individual data via CRA reseller (TransUnion via Insignia adapter) so the CRA partner bears compliance. Saves $75-220K Year 1 of full CRA buildout. Get formal legal opinion ($5-15K) before shipping individual-data work beyond Insignia.

### 2026-03 — Module pruning
M2 (Borrower Portal — Nexys has Quick App), M3 (Conditions Engine — Nexys has 16 templates), M4 (AI Doc Processing — commodity), M5 (Pipeline Analytics — every LOS has it) are PARKED. The full 12-module platform framing is dropped. Position: "intelligence layer for bridge lending — investor eligibility, report tracking, borrower validation, deal modeling. Works with or without an LOS."

### 2026-03 — Path 1 (full LOS) is dead
A focused-SaaS-as-non-LOS-LOS path requires building 15-20 missing features (closing docs, HUD-1, HMDA, wire calcs, post-closing, servicing, document mgmt, vendor DB, audit trail, fee accounting, compliance reporting). 12-18 months + $50-125K/year regulatory compliance. Not pursuing. Path 2 (unbundled M7+M8 standalone) is the launch tactic; Path 3 (Damon's tech-powered originator) is the longer arc.

---

## Out of scope / explicitly not doing

- **Replicating Elementix's entity-to-borrower graph.** Insignia uses Elementix; PulseClose treats it as one adapter inside the Verification Gateway, doesn't compete on person → entity mapping. NDA prevents pulling Elementix data into PulseClose product.
- **Pulling anything from Insignia's Elementix account into the PulseClose product.** NDA. Noah verbatim: *"make sure that if we're pulling it out of our accounts, it's only on our stuff."*
- **Borrower-form-fill at scale for full intake.** Doesn't scale past a handful of borrowers. Doc ingestion replaces.
- **Full LOS buildout.** See Decisions Log 2026-03 — Path 1 dead.
- **SOC 2 until customer #5+.** Not viable at current scale.
- **Lender-referral viral mechanics** (referral codes, "share with a colleague" links). They won't fire. See Distribution thesis.
- **Trade show booth infrastructure for NPLA.** Attendee mode only — no booth flow, no badge scanners, no swag, no signage.
- **ProspectIQ / industrial-vertical features.** Different repo, different vertical. Belongs in cross-vertical brainstorm doc, not here.
- **Generic "Zapier for mortgage operations" middleware.** Too broad. The narrowed SF↔Nexys connector is a Phase-2 consulting upsell with Insignia, not a productized SaaS bet.

---

## Pricing source of truth

**App pricing:** $299 / $499 / $799 — set in [src/lib/stripe/server.ts](../src/lib/stripe/server.ts) and [src/app/dashboard/settings/page.tsx](../src/app/dashboard/settings/page.tsx). Stripe is the source of truth.

Older strategy docs reference $499 / $1,499 / $2,999 — stale. If pricing changes, update both code locations and add a Decisions Log entry.
