# PulseClose — Product Strategy & Future Direction

**Last updated 2026-05-05.** Replaces the April 2026 version, which
predated Path B data model, AI memo Story Mode v2, sanctions screening,
the AI privacy bundle, and Batch 2 (E1 / A1 / B1).

> Internal planning document. Pairs with [docs/ROADMAP.md](docs/ROADMAP.md)
> (the journey-organized backlog), [docs/DISTRIBUTION-STRATEGY.md](docs/DISTRIBUTION-STRATEGY.md)
> (the 2026 distribution playbook), and [pickup.md](pickup.md) (current
> session state). Read [pickup.md](pickup.md) first if resuming work.

---

## The brand stack

Three brands, one strategy. Get this right; everything else follows.

- **Wade Intel** (parent / authority brand) — `wadeintel.com`. Operator-led lender tech methodology firm. Owns the *category language*.
  - Newsletter: **Build Buy Borrow** at `buildbuyborrow.substack.com`
  - Open framework: **5-Concept Loan Framework**, GitHub `wade-intel/loan-framework`, CC BY 4.0
- **PulseClose** (product) — `pulseclose.com` (WordPress marketing) + `app.pulseclose.com` (Next.js authenticated product). The implementation of the methodology Wade Intel publishes.
- **Build Buy Borrow** (newsletter) — the distribution flywheel. Authority-first content; PulseClose is sidebar/footer only.

The Lenny model: newsletter / framework / open content builds the
category authority; the product is sold to the audience the authority
attracts, not by the authority itself.

---

## Where we are today (2026-05-05)

PulseClose is a multi-tenant SaaS borrower-validation platform for
bridge lenders. Live at `app.pulseclose.com`, real vendor data,
production-stable through 25 migrations. NPLA Atlantic City
(2026-06-22/23) is the forcing function — ~7 weeks out.

### What works in production

**Validation pipeline (Stages 1-3):**
- **Entity validation** — Cobalt Intelligence SOS lookup, all 50 states. 30s timeout, rate-limit backoff (1h on 429).
- **Track record verification** — Realie owner-name property search → ATTOM enrichment for sale history. Regrid as fallback. Trust-but-verify deed-chain matching against borrower-submitted addresses.
- **Litigation screening** — CourtListener (federal courts, bankruptcy + civil). Materialized into structured cards in `litigation_cases`.
- **GC validation** — CSLB scrape for CA contractors. Other states = manual (multi-state adapters are post-NPLA).
- **Sanctions / PEP screening** — OpenSanctions API with OFAC SDN direct as auto-fallback. Names Screened includes officers + registered agent from the entity filing.
- **Risk factors + tier rebuild** — 9 deterministic factors, override-and-rerun via atomic `recompute_risk_factors_atomic` RPC. AI never picks the tier.
- **AI memo (Story Mode v2)** — strengths / risks / recommendations narrative blocks, regenerates on factor recompute. PII-redacted via token-based depersonalization (Claude never sees real borrower / entity / property names in the memo path).

**Lender workflow (Stages 4-7):**
- **Override-and-rerun** is the product, not a workaround. Lender disagrees, system recomputes atomically, memo regenerates.
- **Investor evaluation engine** — multi-investor eligibility + leverage matrix + rate adjusters. Pre-filled deal form from validation context.
- **Investor PDF parser (A1)** — fund manager uploads guidelines PDF, Claude extracts criteria with confidence per row, lender accepts/edits before save. Audit trail in `investor_criteria_extractions`. **NPLA hero feature.**
- **Investor handoff** — Excel + PDF generation. `sent_handoff` activity event.
- **Continuous monitoring** — entity SOS, federal litigation, sanctions screens re-run on cadence (daily/weekly/monthly). Per-adapter status tracking. Email on changes. **Critical-only filter** for deal-flow noise control.
- **Borrower watchlist (B1)** — borrower-level monitoring template auto-inherits into new validations for the same borrower. Closes the lock-in evaporation gap.
- **Deal outcome capture (E1)** — Withdrawn / Funded / Extended / Repaid / Defaulted with per-status optional fields. **The substrate everything reputation/performance work depends on.**

**Workspace primitives:**
- **Activity feed (B5)** — `/dashboard/activity` + per-validation strip. Universal `activity_events` table; every state change emits.
- **Universal infra** — `documents` (Supabase Storage), `notification_preferences`, `activity_events` from migration 00017. No per-feature reinventions.
- **Comparative borrower view (S1)** — side-by-side diff of two validations.
- **Risk methodology PDF (S5)** — printable methodology view at `/validations/[id]/risk-methodology`.
- **Auth + RLS** — Supabase, org-scoped, RLS on every table.
- **Stripe billing** — Starter $299 / Pro $499 / Enterprise $799 / Internal (unlimited, SQL-only). Usage metering on every vendor API call.

### Architecture (corrects April 2026 doc)

- **Path B normalized data model** — borrowers / entities / properties / lenders are FK-referenced from `borrower_validations`. Snapshot tables (`entity_checks`, `track_record_entries`, etc.) carry `org_id` for RLS performance.
- **JSONB used heavily, with schema versioning** — every JSONB column has a Zod schema in `src/lib/schemas/jsonb.ts`, a `schema_version` field, and a CHECK constraint. (The April doc claim "no JSONB blobs" was always wrong; this is the corrected statement.)
- **Canonical-name dedup** — `normalized_canonical` generated columns + Postgres `canonicalize_name()` function + JS `canonicalizeName()` mirror. Drift between SQL and JS creates infinite duplicates instead of dedupes.
- **Tokenize-and-set name matching** — verify-core deed-chain matcher, validations input warning, Realie owner filter all canonical token-subset, never substring.
- **AI privacy bundle (00022)** — per-org `ai_extraction_enabled` toggle, regex PII scrub on text doc inputs, token-based depersonalization for AI memo. Fails CLOSED on lookup error. See [docs/PRIVACY-POSTURE.md](docs/PRIVACY-POSTURE.md).
- **Cross-cutting design principles** — 11 codified in [docs/ROADMAP.md](docs/ROADMAP.md). Every new matcher / dedup key / Claude consumer that violates one is on a clear path to silent failure.

---

## Honest current data gaps

The product cannot do these things yet, and saying so to lenders is
better than overpromising:

- **Historical deed coverage is partial.** Realie has strong CA current-ownership but historical transfers depend on county scraping. Older flips a borrower sold years ago may not surface. **C2 BatchData ($200-500/mo) closes this** — vendor-cost decision pending.
- **Litigation is federal-only.** Most litigation that matters for bridge lending (mechanic's liens, breach of contract, lis pendens, foreclosures) happens at the state level. Roadmap C6 splits the litigation pillar by category once we add a state-court vendor.
- **GC validation is California-only.** Multi-state CSLB-equivalent adapters (FL/TX/NY) are post-NPLA / customer-driven.
- **Co-borrower / multi-guarantor schema (G1.2)** — single guarantor field today. Most TT Investment Properties loans have Kim Thanh Thi Truong as co-borrower (likely wife). Damon-decision item.
- **Address parser edge cases** — `71 WEBBER WAY 77, BUENA PARK` shape returned "Address not found" because the `77` between street and city tripped the parser. Surfaced during 2026-05-02 Truong testing. ~0.5d to fix.
- **Person-name 2-token false positive limit** — token-set matcher treats `"Kim An"` ⊆ `"An Soon Kim"` as a match. Real fix requires DOB / SSN / address fingerprinting (deferred — privacy implications).
- **`address_normalized` not USPS-canonical** — same property in different formats creates duplicate property rows. Roadmap Foundations item.
- **Print CSS not physically tested** — handoff + risk-methodology print rules look right in DevTools but page-break behavior under real printer drivers untested. Pre-NPLA manual item.

---

## Strategic position

### Distribution thesis (per memory + DISTRIBUTION-STRATEGY)

**Capital-provider endorsement is the only organic distribution path.**
Lender-peer outreach doesn't work in this niche; lenders trust
funds-they-borrow-from + their existing CRM more than any product
demo. Therefore:

- Damon-only outreach pre-NPLA (no independent lender / fund outreach)
- Insignia is the design partner; their endorsement is the wedge for the next 5-10 lenders
- NPLA is the forcing function for the first quote-able testimonial
- Wade Intel = methodology authority. PulseClose = implementation. Build Buy Borrow = distribution flywheel.

Full mechanics in [docs/DISTRIBUTION-STRATEGY.md](docs/DISTRIBUTION-STRATEGY.md).

### Why this niche, why now

- **The category language doesn't exist yet.** No incumbent owns "borrower validation for bridge lenders" as a body of knowledge. LendingWise / Liquid Logics / Mortgage Office are LOS / fund-management / horizontal tools — none have ongoing methodology content. Wade Intel can plant the methodology flag uncontested.
- **The compliance pressure is real and rising.** OFAC has cited unwitting bridge lenders in 2024-2025 for funding sanctioned-borrower properties. State AG offices are paying attention. "We do borrower validation in a Google Sheet" is becoming an existential risk position.
- **The AI moment is right.** Doc ingestion (Truong xlsx → form pre-fill in 5s) and Story Mode AI memos turn a 2-hour underwriting task into a 5-minute review. PulseClose-with-AI is plausibly 20x faster than manual; pre-AI, the gap was 5x and not enough to switch.

### IP / partnership posture (per memory)

Zach Wade owns all PulseClose IP. Insignia is design-partner, not co-owner. Possible future partnership structures (JV, JV-fund, parallel SaaS) determine compensation only — never IP. Build dual-use; generalize Module 1 (evaluate-against-investors) so it's usable beyond Insignia. Multi-tenant infrastructure stays alive regardless of partnership choice.

---

## Pricing posture

Current tiers (see [docs/PRICING-STRATEGY.md](docs/PRICING-STRATEGY.md) for full rationale):

| Plan | Monthly | Checks | Notes |
|---|---|---|---|
| Starter | $299 | 20 | Single-user lender |
| Professional | $499 | 50 | Small team |
| Enterprise | $799 | Unlimited | Mid-market lender |
| Internal | — | Unlimited | SQL-only; founder/QA orgs |

**Three packaging hypotheses to test post-NPLA:**

1. **Fund tier ($1,499-2,499/mo)** — bundles A1 (investor PDF parser), A2 (counter-offer calculator), A3 (borrower capital-availability PDF), B1 (borrower watchlist), A4 future (per-investor performance dashboard). Targets fund principals doing 50-200 deals/year.
2. **Per-validation overage** — $30/check above the cap on Starter and Pro. Stripe metered billing.
3. **Annual prepay discount** — 2 months free. Anchor for fund tier especially.

Damon question at NPLA: does fund tier resonate, or do funds want to bundle it into a per-deal cost?

---

## Roadmap (forward)

Full backlog in [docs/ROADMAP.md](docs/ROADMAP.md). High-level slate:

### Pre-NPLA polish (~5-7 days)

- **A2** Counter-offer / repricing calculator (2d) — pairs with A1 on evaluate
- **A3** Borrower capital-availability PDF (1.5d) — borrower-facing single-pager
- **B2** Portfolio health dashboard (2d) — "first thing the lender opens"; uses E1 outcomes
- **B3** Validation search + filter + CSV export (2d)

### Half-day fillers (any time)

- G2.4 — address parser edge cases
- G4.1 — methodology PDF download (one-click vs Cmd+P)
- G4.2 — confidence-score audit + tooltip
- G3.4 — add GC after-the-fact action
- G7.1 — org-level monitor default (extends B1)
- G7.2 — "next run in N hours" indicator (~15 min)

### Post-NPLA / vendor-cost-gated

- **C2** BatchData historical deeds (2-3d, $200-500/mo) — closes the deed coverage gap
- **C1** Geo-tagged photo verification (3d) — major fraud lever
- **C5** Bank statement parser → liquidity factor (2d)
- **D2** Slack/Teams notifications (1.5d)
- **D1** Email-forward deal submission (3d)
- **D5** Public REST API (2d) — required for any lender embedding PulseClose data into their UW system

### Reputation + cross-tenant (post-E1 row volume + density)

- **E2** Borrower reputation score (3d)
- **E3** Anonymized cross-tenant consensus (4-5d full feature; needs 10+ lenders + legal review)
- **E4** Public borrower profile, opt-in (2d)
- **A4** Investor performance dashboard (3d)
- **A5** Originator scorecard for investors (2d)

### Damon-gated (don't build until decision)

- **G1.2** Co-borrower / multi-guarantor schema
- **C3** Reverse phone/email
- **G2.2** TransUnion address validation (gated on Noah's logins)

---

## Long-shot bets (the bigger swings)

These don't make sense at our current stage but are worth naming:

- **Lender-side autopilot.** Once we have outcome data flowing (E1) plus reputation scores (E2) plus cross-tenant consensus (E3), we can build the "auto-decline / auto-approve / route-to-human" router that a non-credit-officer could safely operate. This is when PulseClose stops being a tool and becomes infrastructure.
- **The borrower-facing brand.** E4 (public borrower profile) lets a strong-track-record borrower publish their verified PulseClose history at `pulseclose.com/borrower/[uuid]`. Per-element opt-in. Two-sided marketplace primitive. Defer activation until we have lender-side density that makes the certification valuable to borrowers.
- **Capital-availability marketplace.** Once A3 + A4 + cross-tenant consensus exist, a borrower with strong PulseClose history could ping multiple investors with a pre-validated package and get back rate-and-terms in <24h. This is the fund-side product that turns Wade Intel into a multi-product company.
- **The 5-Concept Framework as standard.** If Wade Intel becomes the citation source for "how to validate a borrower in private lending," that's a moat that compounds for years even if PulseClose itself is overtaken on a feature axis.

---

## Operating constraints (keep in mind)

- **Solo technical founder.** Velocity is days-not-weeks for code, but every doc / sales conversation / vendor procurement touches the same person. Distribution time-budget is the binding constraint, not code velocity.
- **Damon-only outreach pre-NPLA.** No independent lender outreach. Damon is sole conduit. Capacity unconstrained on the engineering side.
- **NPLA is 7 weeks out.** Major features land before NPLA only if they make demos materially better. A2/A3 yes. C2 BatchData no (vendor cost decision pending).
- **OpenSanctions trial expires 2026-05-28.** Auto-falls-back to OFAC SDN direct. Decision: rotate trial keys (per pickup.md Open decisions #3).
- **Cobalt rate-limit risk during demo days.** Decision: rotate keys across multiple Cobalt accounts (per pickup.md Open decisions #4).
- **AI privacy bundle gates A1 and any future Claude consumer.** ZDR is on by default; depersonalization runs server-side; per-org toggle is the strict-mode kill switch. See [docs/PRIVACY-POSTURE.md](docs/PRIVACY-POSTURE.md).

---

## What changed since the April 2026 strategy doc

For anyone resuming this and trying to reconcile against the previous version:

| April 2026 said | Reality 2026-05-05 |
|---|---|
| "Schema is normalized — separate tables, no JSONB blobs" | We use JSONB heavily, with schema-versioned Zod parsers + CHECK constraints. Path B + JSONB is the correct architecture for what we're building. |
| "No sanctions or OFAC screening" | OpenSanctions + OFAC fallback shipped (2026-04 in the P0 corrections push). |
| "AI analysis: Claude generates underwriting memos" | Story Mode v2 with explicit strengths/risks/recommendations + dual renderer for v1 legacy + token-based PII depersonalization (2026-05-03). |
| "Track record is incomplete — 25 of 75 historical flips visible" | Truth, but mitigation now exists via trust-but-verify (deed-chain matcher against borrower-submitted addresses) + canonical-name dedup. C2 BatchData closes the residual gap. |
| "Litigation is federal only" | Still true. State coverage is C6, post-NPLA. |
| "GC California only" | Still true. |
| "Module 8 of original BridgeFlow platform" | Module 1 (evaluate-against-investors) is now generalized and shipped at `/dashboard/evaluate`. PulseClose is a standalone product, not a module. |

---

## Reference paths

- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production app:** https://app.pulseclose.com
- **Marketing site:** https://pulseclose.com (WordPress, content version-controlled in [wordpress/](wordpress/))
- **Wade Intel:** https://wadeintel.com
- **Build Buy Borrow:** https://buildbuyborrow.substack.com
- **5-Concept Framework:** GitHub `wade-intel/loan-framework` (mirror at `/Users/zachwade/code/active/wade-intel-loan-framework`)
- **Vercel project:** `buildfolios-projects-e8f9d80e/pulseclose`
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
