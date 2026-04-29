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

## Backlog / ideas (with provenance)

| Idea | Source | Notes |
|---|---|---|
| OpenCorporates person → entity discovery ($2,800/yr) | STRATEGY.md medium-term | DEFERRED. Insignia uses Elementix; revisit only for non-Insignia customers where Elementix isn't already paid. |
| Cross-lender borrower reputation graph | STRATEGY.md long-shot | Lenders won't share data peer-to-peer (per Noah 4/28); needs investor-mediated cooperative. Hard. |
| Fraud-ring detection via graph AI | STRATEGY.md long-shot | Same data-cooperative problem. |
| Satellite construction monitoring | STRATEGY.md long-shot | Big swing. Real if continuous monitoring proves out. |
| Climate-risk scoring per property | STRATEGY.md long-shot | First American partnership angle. |
| DSCR rental-loan vertical | STRATEGY.md market expansion | 54% YoY growth, ~90% engine reuse. Strong post-NPLA bet if a DSCR customer signal appears. |
| SBA lending vertical | STRATEGY.md market expansion | $25B/yr, regulatory tailwind. |
| UK bridging finance | STRATEGY.md market expansion | GBP 13.4B market. Far. |
| Compliance automation (mandated docs, deadlines) | Insignia 4/28 call | "Smart thing to tell us something needs to be sent out." Module 1+ extension or separate. |
| Operating-agreement collection adapter | Insignia 4/28 call | For brokered channel where Elementix output isn't accepted (Kiavi/Yabi). Templated borrower request → upload → entity-ownership map. |
| State-specific endorsement validator | Insignia 4/28 call | Noah: *"every state has some different endorsements."* Validate title policy + endorsements against state spec. |
| ICP picker (Bridge / Bank / DSCR / Brokered / Private credit) | 4/28 demo | Premature until non-Bridge customer asks. v1 hardcodes Bridge. |
| Auto-recommend supplemental conditions | Insignia 4/28 call | "If applicable" supplemental conditions section. Recommend: e.g., "Bitcoin source + loan > $10M → recommend personal tax transcript." |
| Investor-criteria PDF parser | Module 1 expansion | Investor guidelines PDF → criteria object. Could ship standalone if Module 1 expansion needs it. |

---

## Decisions log (append-only)

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
