# PulseClose Roadmap

> Living document. Append to it; don't snapshot-replace. Last meaningful edit dated in the Decisions Log.
>
> **Sibling docs:**
> - [STRATEGY.md](../STRATEGY.md) — vision, positioning, market, long-shot bets (the *why*)
> - [DATA-MODEL.md](./DATA-MODEL.md) — target schema, signals/overrides design, migration plan (the *how*)
> - [pickup.md](../pickup.md) — per-session handoff (the *what's loaded right now*)
>
> **2026-05-02 reorganization:** rewrote around the lender's journey instead of strategic-lever tiers. Every feature lives at one of eight stages of the user's actual work — Intake → Run → Investigate → Decide → Route → Hand off → Monitor → Outcome. The old Tier S/A/B/C/D/E/F catalog is preserved verbatim in the [Backlog](#backlog--provenance--tier-mapping) section at the end so nothing is lost. The decisions log carries forward unchanged.

---

## North Star — what we're optimizing for

**NPLA conference, June 22-23, 2026 (Atlantic City), attendee mode** is the forcing function. Damon facilitates warm intros to fund people, lenders, and consulting prospects. Win = land **3 of**: fund introductions, lender intros, product demos, consulting leads.

**Strategic structure:** Zach owns all PulseClose IP. Insignia (Damon + Noah) is design partner + first paid customer. Partnership structure leans toward a JV-type venture or JV-fund where the tech goes in-house and Zach holds equity, with the multi-tenant SaaS option staying live as a parallel track. Compensation structure is what gets negotiated; tech ownership is settled. See [memory: project_insignia_partnership_paths](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/project_insignia_partnership_paths.md).

**Distribution thesis:** Lenders don't refer UW tools peer-to-peer. Capital-provider endorsement is the only organic distribution path. Investor handoff Excel/PDF is the strategic artifact. NPLA serves both potential business models — SaaS customer acquisition AND fund-LP intros — without committing to either.

**The product mental model that everything serves:** **a verification + underwriting gateway between front-end CRM and the LOS that turns a deal package into a tier'd, override-aware, deed-verified borrower record AND a sized, judged loan — then routes the cleared deal to the right capital provider with one click and writes the result back to the lender's system of record.** Each pillar (entity, track record, litigation, sanctions, GC) is one adapter underneath; the sizing engine + AI judgment layer turn the cleared record into a loan recommendation; each downstream surface (handoff, evaluate/underwrite, monitor, outcomes) is one consumer of that record.

> **Internal model, not buyer language.** "Verification + underwriting gateway"
> is how *we* reason about it. Market research is clear that SMB lenders respond to
> the *outcome* ("catch the borrower problem before you fund; size the deal in
> minutes"), not to "system of intelligence between your CRM and LOS." Lead with
> the job-to-be-done and name the buyer's actual LOS — keep the architecture phrase
> internal. **And underwriting is decision *support*: the deterministic engine
> sizes and tiers, the AI narrates — PulseClose never makes the credit call.**

---

## Status snapshot (as of 2026-06-23)

> **Repositioning note (2026-06-23):** the product crossed from "borrower
> validation" to a **verification + underwriting gateway** — it now sizes the loan
> (deterministic engine across LTV/LTC/LTARV/DSCR/debt-yield) and judges the deal
> (AI underwriting copilot), in addition to validating the borrower and routing to
> investors. The North Star below has been extended accordingly. See
> [STRATEGY.md](../STRATEGY.md) for the positioning, pricing, and distribution
> implications, and [UX-PLAN.md](./UX-PLAN.md) for the coherent-product UX plan.

**Live at app.pulseclose.com.** Multi-tenant SaaS, Stripe billing, real vendor
data flowing. **51 migrations applied (00001–00051).**

**Shipped since the last snapshot (2026-06-22 → 06-23):**
- **Underwriting Workbench (Module 10) + AI UW Copilot (Module 6)** — ported from
  the validated standalone bridge-deal-evaluator. Deterministic loan sizing
  (`src/lib/underwriting/sizing.ts`, 24/24 regression checks vs the hand-computed
  deal), per-investor best-execution overlay, and an AI judgment layer (Opus 4.8,
  Damon's 5-dimension framework + 5-concept lens + deal-killers + stance) wired
  through the full AI privacy harness. `uw_models` table (00040), `/api/underwrite`
  + `/api/underwrite/[id]/judge`, panel on the evaluate page.
- **Self-serve funnel** — public landing (`/`) + `/pricing`, **14-day / 50-check
  trial** replacing the 3-check gate (00041/00042), dashboard usage meter, trial
  drip emails (Resend), PostHog funnel events (inert until env keys set). Reframed
  as **warm-intro landing infrastructure**, not cold acquisition — see STRATEGY.
- **D6 — Interoperability & lender-stack integration** added to this roadmap (the
  "fits in someone's stack" dependency; generic write-back API + webhooks before
  per-LOS connectors).

**Earlier (2026-04-30 → 05-04):**

**Recently shipped (2026-04-30 → 05-04, see [pickup.md](../pickup.md)):**
- P0 — 5 PRs of critical-path fixes (FK consistency, monitor cron error handling, atomic risk recompute, JSONB schema versioning, snapshot-table `org_id`).
- Universal infra — `documents`, `notification_preferences`, `activity_events`, storage bucket, helpers (events/emit, notifications/dispatch, documents/store) live across endpoints.
- Tier S — Comparative borrower view, Story Mode v2 AI memo, litigation case cards, GC inline summary, risk methodology PDF.
- Recovery — `internal` plan tier for Test Co; `insertOrThrow` wrapper surfacing silent insert failures; PR 14 unblocked the production build (Suspense around `useSearchParams`); Cobalt timeout 15s → 30s; AI memo `severity` schema widened to accept `informational`.
- Batch 1 (Close the journey, 2026-05-02) — G1.1+G2.1 intake addresses → deed verify; G3.1 pillar evidence above operational layer; G3.2 Send share link to borrower (Resend email); G3.5 sidebar tools removed; G5.1+G6.2 validate→evaluate→handoff CTAs; B5 activity feed UI; matcher/dedup story (canonical-name dedup migration 00021 + tokenize-and-set matcher).
- AI privacy 2-day bundle (2026-05-03) — per-org `ai_extraction_enabled` toggle (00022); regex PII scrub on text doc inputs; token-based depersonalization for AI memo; 5 audit-pass fixes including a critical address-shortening leak. See [PRIVACY-POSTURE.md](PRIVACY-POSTURE.md).
- Batch 2 (Capital stickiness + outcome substrate, 2026-05-04) — E1 deal outcomes capture (00023); A1 investor PDF parser (00024) — NPLA hero; B1 borrower watchlist (00025).

**Architecturally settled:**
- Path B data model (borrowers / entities / properties / lenders are first-class, validations are snapshots).
- Override-and-rerun is the product (not a workaround).
- AI never picks the tier — Claude explains, deterministic factors decide.
- Every JSONB column is `schema_version`-stamped and validated through `src/lib/schemas/`.
- Snapshot inserts pass `org_id` and use `insertOrThrow` — silent insert failures surface as errors.

---

## How to read this document

The product is one journey, rendered as eight stages. Every feature, every UX gap, every existing screen lives at exactly one stage. Cross-cutting surfaces (workspace, borrower side, investor side, foundations) wrap the journey.

**Stage in the journey → user goal at that stage → what exists → what's coming → what's broken or disconnected.**

Where a feature was previously catalogued under a Tier letter, the original tier code (e.g. **A1**, **B5**, **C2**) is kept inline so the existing decisions and effort estimates remain traceable. The full tier-keyed table is preserved at the bottom in [Backlog — provenance + tier mapping](#backlog--provenance--tier-mapping).

**Cross-cutting design principles (apply to every feature in every stage):**
1. **Universal `documents` table** ([X1](#stage-1--intake-bring-a-deal-in)) backs every file upload — borrower share-link, lender doc ingest, photo verification, bank statements, investor PDFs, handoff artifacts. One ingestion path, one storage layer, one audit trail.
2. **Universal `notification_preferences`** ([X2](#stage-7--monitor)) drives every outbound alert. Channel = email | slack | teams | sms | webhook. Per-user, per-event-type.
3. **Universal `activity_events`** ([X3](#cross-cutting--workspace)) records every state change. UI feed, audit log, and "what changed" diffs all read from this.
4. **Universal `deal_outcomes`** ([Stage 8](#stage-8--outcome-capture-the-feedback-loop)) records life-of-loan post-close state. Foundation for reputation, investor performance, consensus moat.
5. **Borrower / entity / property / lender domain entities are canonical.** Every new feature references them by `id`, never by text.
6. **Every new endpoint enforces RLS via direct `org_id =` policy.** New tables get `org_id` denormalized.
7. **Every JSONB column is versioned** and validated through `src/lib/schemas/`.
8. **Data-matching across format boundaries uses tokenize-and-set, never substring.** Vendor data and lender input arrive in different shapes (Realie: `LASTNAME, FIRSTNAME-MIDDLE`; lender: `Firstname Middle Lastname`; SOS: `LASTNAME, FIRSTNAME`). Substring matching on lowercased + space-stripped strings false-negatives constantly. The canonical pattern (`canonicalizeName`, `tokenSetMatch`) is in [src/lib/track-record/verify-core.ts](../src/lib/track-record/verify-core.ts) and [src/lib/domain/upsert.ts](../src/lib/domain/upsert.ts) — every new matcher copies that shape, including:
   - tokenize on non-alphanumeric (`\b[a-z0-9]+\b`)
   - drop length-1 tokens for **person** names (`"An"` alone false-positives), keep length-1 for **entity** names (`"S&T Bank"` is meaningful)
   - drop entity-suffix tokens (`llc | inc | corp | ...`) for entity matching
   - sort tokens, join with single space → canonical form
   - match by set inclusion (smaller ⊆ larger)
9. **Dedup keys are dual-coded.** When a Postgres generated column derives a dedup key from a SQL function (e.g., `normalized_canonical generated always as (canonicalize_name(display_name, true)) stored`), the application code must implement the same logic in JS for `WHERE normalized_canonical = $jsCanonical` lookups. Drift between the two creates **infinite duplicates** instead of dedupes — the JS query never finds the row Postgres just generated, so it inserts a new one. See [`canonicalizeName` in upsert.ts](../src/lib/domain/upsert.ts) and the parity test cases there. Any change to one must update the other in the same PR.
10. **Generated dedup columns require a backfill plan.** Adding a stricter canonical key to an existing table will reveal pre-existing duplicates that violate the new constraint. Migrations must include either (a) a cleanup script run before `CREATE UNIQUE INDEX` or (b) a `RAISE NOTICE` post-apply step that surfaces the conflict count so the operator can run a merge tool. See [00021_canonical_name_dedup.sql](../supabase/migrations/00021_canonical_name_dedup.sql) for the template — and the lessons we learned writing it.
11. **Any place we `JSON.parse` a Claude response is a truncation hazard.** Claude returns `stop_reason: "max_tokens"` when it ran out of room mid-output, and the regex pattern `\{[\s\S]*\}` happily matches truncated JSON that then fails `JSON.parse`. Three rules: (a) `max_tokens` defaults to 4096 unless a smaller bound has been measured to fit; (b) the parse path must inspect `stop_reason` and surface "Document too large — Claude truncated" rather than a generic parse error; (c) for response shapes with a known cardinality (e.g., "up to 50 addresses"), tell Claude the cap in the prompt and slice the response defensively. See [src/app/api/ingest/borrower-doc/route.ts](../src/app/api/ingest/borrower-doc/route.ts) for the canonical shape — every `client.messages.create` site copies that pattern.
12. **Every Claude consumer routes through the AI privacy bundle.** Three layers: (a) `requireAiEnabled(orgId)` gate from [src/lib/ai/check-enabled.ts](../src/lib/ai/check-enabled.ts) — fails CLOSED on lookup error so a DB hiccup never silently sends opted-out PII; returns 503 with code `AI_DISABLED` to the caller. (b) `scrubPii()` from [src/lib/ai/redact-pii.ts](../src/lib/ai/redact-pii.ts) on text-derived inputs (xlsx / csv / txt) — strips SSN/phone/email pre-call. PDFs ride the per-org toggle as the strict-mode answer because pre-extracting text loses table structure. (c) For prompts that interpolate borrower / entity / property / lender names, run [src/lib/ai/redact.ts](../src/lib/ai/redact.ts) `buildRedactionMap` → `redact()` forward → `unredactObject()` reverse → `findLeftoverTokens()` safety scan. `addressVariants()` (street alias) and `entityVariants()` (legal-suffix-stripped) catch partial mentions in factor explanations. Every new endpoint that calls `client.messages.create` MUST add these three layers — see A1 implementation in [src/app/api/investors/[id]/extract-criteria/route.ts](../src/app/api/investors/[id]/extract-criteria/route.ts) for the canonical post-bundle pattern.
13. **Persona-agnostic coherence — "no matter who you are, it makes sense" (2026-07-01).** The product is one continuous thing to a broker, an underwriter, and a capital partner alike. Every surface obeys: **one Deal object** flows Borrower → Deal → Capital → Portfolio with no re-keying; **one `computeVerdict()`** so no two surfaces disagree (the mandate-vs-book bug is a violation); **verdict/answer first**, evidence on disclosure; sizing follows the **Excel-parity layout** ICC already trusts (waterfall + constraint ladder + **cushion/headroom** per binding test); **native scenario compare** instead of re-keying; and every screen orients the current persona to *their* next action. Any new surface is scored against this + [UX-AUDIT-RUBRIC.md](UX-AUDIT-RUBRIC.md); the full spec is [UX-REDESIGN-PLAN.md §13](UX-REDESIGN-PLAN.md).

---

# The Lender's Journey

## Stage 1 — Intake (bring a deal in)

**User goal:** "I just got a deal package. Get it into PulseClose with as little typing as possible."

**Surface:** [/dashboard/new](../src/app/dashboard/new/page.tsx) + the validation creation API.

### What exists
- Manual form fields: borrower name, guarantor name, entity name, state of formation, GC name/license/state. ✅
- **DocIngest** widget at the top of the form: drop xlsx/PDF/CSV → Claude extracts → form pre-fills. Currently extracts `borrower_name`, `borrower_entity_name`, `entity_state`, `guarantor_name`, `gc_name`, `gc_license_number`, `gc_state`. ✅
- **DocIngest already extracts `property_addresses: string[]` but the form ignores that field.** ⚠️ See gap below.

### Gaps
- ~~**G1.1 — Property addresses dropped on the floor.**~~ ✅ **Shipped 2026-05-02.** `DocIngest`'s `property_addresses` extraction now flows into a Property Addresses textarea on the form, sends in the API request, and the validation API runs `verifyAddresses()` in `after()` against the lender-supplied list. AI memo regenerates with verified-flip stats included. Drop the Truong xlsx → see deed-verified flips on the detail page.
- **G1.2 — Co-borrower / multi-guarantor can't be modeled.** Schema is single-guarantor; Truong example has Kim Thanh Thi Truong on most loans. Needs `validation_borrowers` join (or borrower-multiplicity on `borrower_validations`). Track in [DATA-MODEL.md](./DATA-MODEL.md). (~1 day.)
- **G1.3 — No "have we seen this borrower" check.** Lender can re-validate a borrower they did 3 weeks ago without realizing it. (B4 below addresses.)

### What's coming
- **Auto-fill verified flips from intake doc** (G1.1). Doc-ingest's existing `property_addresses` flows into Stage 2 deed verification. ~0.5 day.
- **B4 — "Have we seen this borrower" guard.** Fuzzy-match on borrower name as the lender types; surface prior validations before they spend a vendor call. ~0.5 day.
- **D1 — Email-forward deal submission.** `deals@<lender>.pulseclose.com` → Resend webhook → Claude extraction → draft validation. Stays-in-inbox workflow integration. Stores raw email in `documents` (`purpose='inbox_submission'`). Requires Resend inbound (paid). ~3 days.
- **D4 — Browser bookmarklet / extension.** Right-click an address on Zillow → "Validate this address" → opens new validation pre-filled. Bookmarklet first (~1 day), extension later (+2 days).
- **C3 — Reverse phone/email.** Optional borrower phone/email at intake → Hunter.io / NumVerify → "Phone matches name (high confidence)" or "VOIP / no name match (review)" chip. ~1 day.
- **G1.2 — Multi-borrower / co-borrower modeling** (when a real customer hits it pre-NPLA, otherwise post).

---

## Stage 2 — Run (validate the borrower)

**User goal:** "Click a button. Wait less than a minute. See trustworthy pillar results."

**Surface:** validation creation API + inline progress card on `/dashboard/new` + redirect to detail page.

### What exists
- 4 pillars in parallel: Entity (Cobalt SOS, 50 states), Track Record (Realie + Regrid + ATTOM, owner-name search), Litigation (CourtListener federal), Sanctions/PEP (OpenSanctions + OFAC SDN direct). Plus Sanctions runs sequentially after entity to include officers/agent. GC runs only if a GC was provided (CA = automated via CSLB; non-CA = manual_review state). ✅
- AI memo regen via `after()`. Story Mode v2 default. Dual renderer for legacy v1. ✅
- Cobalt timeout 30s. Per-adapter status + 1h backoff on rate limits + email-failure tracking on monitor runs. ✅
- Atomic risk recompute via `recompute_risk_factors_atomic` RPC — no zero-factor window if recompute fails mid-stream. ✅
- Inline progress card during validation creation (each pillar shows its loader). ✅

### Gaps
- ~~**G2.1 — Verified-flips deed-chain is a separate manual step.**~~ ✅ **Shipped 2026-05-02 with G1.1.** When intake addresses are supplied, deed-verification runs in `after()` alongside the rest of the validation pipeline. The manual VerifiedTrackRecord paste flow remains for top-ups.
- **G2.2 — TransUnion address validation pending Noah's logins.** Adapter is scoped, build is ~1 day once logins land.
- **G2.3 — GC outside CA is manual.** Multi-state adapters (FL/TX/NY) are post-NPLA / customer-driven.
- **G2.4 — Address parser edge cases.** [`parseAddressForState` in verify-core.ts](../src/lib/track-record/verify-core.ts) doesn't handle building/unit numbers between street and city: `"71 WEBBER WAY 77, BUENA PARK, CA 90621"` returns "Address not found" because `77` between street and city trips Realie. Fix: tokenize → identify state-code anchor → strip everything between, OR fall through to Realie with the raw input on parser failure (Realie may be more tolerant). ~0.5d. Surfaced during 2026-05-02 Truong test.

### What's coming
- **Doc-addresses → Verified Track Record at run time** (G1.1/G2.1 wire-up). Verified-flips runs alongside the 4 pillars on the very first submit. Detail page lands with deed history populated.
- **C2 — BatchData historical deeds.** Parallel adapter; closes the ~60-70% historical gap Realie misses. Vendor cost ~$200-500/mo. ~2-3 days.
- **TransUnion address validation** (~1 day; blocked on Noah's login).

---

## Stage 3 — Investigate (read the report; gather more)

**User goal:** "Read the synthesis, drill into anything sketchy, request more from the borrower if needed."

**Surfaces:** [/dashboard/validations/[id]](../src/app/dashboard/validations/%5Bid%5D/page.tsx) (the detail page) + the borrower share link [/share/[token]](../src/app/share/%5Btoken%5D/page.tsx).

### What exists
- 4 pillar cards: EntityResultCard, **UnifiedPropertyTable** (replaces the old paired TrackRecordTable + VerifiedTrackRecord rows-list — Phase 1 of the property-model consolidation; one card per property with provenance badges: verified / public-record / claimed-only / manual), LitigationCases (S3 — case-card UI with category/status filter chips), GCResultCard, SanctionsCard. ✅
- AI memo (Story Mode v2): summary → strengths → risks (severity badges + "Why this rating? →" jump links) → recommendations. Compact toggle. Sky-blue informational severity for `market_outlier`-class informational risks. ✅
- WhyThisRating panel: factor rows with `id="risk-factor-<key>"` anchors. Inline override actions per factor (e.g. "Mark as primary residence" on `extended_hold`). ✅
- VerifiedTrackRecord card (now titled "Borrower address verification"): workflow surface only — share link, send-to-borrower, paste form. Property rows surfaced via this flow appear in the unified table above. ✅
- HandoffCard: preparer fields + narrative + Excel/PDF buttons (label changes when dirty). ✅
- MonitorCard: opt-in continuous monitoring (cadence + recipients + adapter coverage). ✅
- Borrower share link: borrower pastes addresses (or uploads xlsx/pdf, 422 on extraction failure) → same verify pipeline. ✅

### Gaps
- **G3.1 — Verified Track Record is below the fold and not connected to intake.** It's the most reliable track-record signal we have, but lives mid-detail-page. Should auto-populate from intake doc (G1.1) and live next to the Track Record pillar, not below the AI memo.
- **G3.2 — No "Send share link to borrower" CTA on the detail page.** The share link is the borrower-side workflow but the lender has no obvious way to copy/send it. Needs a button + Resend email template.
- **G3.3 — Borrower-side activity is invisible to the lender.** When borrower uploads via share link, no notification, no banner, no count update on the detail page. The lender has to refresh and notice.
- **G3.4 — No "add a GC after-the-fact."** Validation ran without GC; lender realizes the deal has one. Today the lender either re-runs the whole validation or hits the standalone `/dashboard/gc` tool. Needs an "Add GC validation to this borrower" action.
- **G3.5 — Standalone single-check pages are vestigial.** `/dashboard/entity`, `/dashboard/gc`, `/dashboard/litigation`, `/dashboard/track-record` exist as one-off tools that don't tie to a `validation_id`. They predate the unified flow and clutter nav. Decide: hide behind a "Tools" submenu, or delete.

### What's coming
- **G3.1 fix — pull VerifiedTrackRecord above the fold and auto-populate** from the intake xlsx address list (paired with G1.1).
- **G3.2 — "Send share link" CTA** on detail page header. Click → modal: copy link, or send via Resend with pre-written template. Activity event `sent_share_link`. ~0.5 day.
- **G3.3 — borrower-side activity surfaced.** New "Borrower activity" strip on the detail page that reads `activity_events` for this validation (uploaded_doc, verified_addresses, uploaded_photo, etc.). ~0.5 day on top of B5.
- **G3.4 — "Add GC to this borrower" action.** Detail page: GC pillar card shows "Add GC" when no `gc_validations` row exists. Click → inline form → patches the validation. ~0.5 day.
- **G3.5 — kill or hide standalone tool pages** (decide and execute).
- **G3.6 — Property-model Phase 2: collapse `verified_flips` into `track_record_entries`.** Phase 1 (UI consolidation) shipped; the data layer still has two tables and the unified component does runtime merging. Phase 2 is the schema migration: extend `track_record_entries.source` enum with `borrower_claimed_verified` / `borrower_claimed_unmatched`, migrate flip rows in, point the share-link verify endpoint at the unified table, drop `verified_flips`. Side effect: factor engine starts seeing borrower-claimed properties (today only sees deed-discovered). Validate against known-borrower tier outcomes before shipping. Full plan in [docs/IDEAS.md](IDEAS.md#property-model-consolidation). *Unblocks when:* Phase 1 proves out in real usage (~1-2 weeks). ~1 day.
- **C1 — Geo-tagged photo verification.** Borrower share-link gets per-property photo upload. EXIF GPS + Claude vision → property-level signal `photo_verified`. ~3 days. Major fraud-detection lever.
- **C5 — Bank statement parser** (borrower upload). Claude extracts ending balance, NSF count, monthly inflows. New liquidity factor. ~2 days. Privacy: 90-day expiry on `documents`.
- **C4 — Address consistency cross-check.** Home vs registered agent vs property addresses; flag CMRA mail-drops, cluster anomalies. New informational factor. ~1 day.
- **C6 — Public records expansion.** Splits litigation pillar into Bankruptcy / Civil / Liens / Tax warrants / Foreclosures sub-cards. Extends `litigation_cases.category`. ~1 day.

---

## Stage 4 — Decide (override, finalize, document the call)

**User goal:** "Apply my judgment where I know more than the data; lock in the tier; export the math."

**Surface:** the detail page (signal write actions) + [/validations/[id]/risk-methodology](../src/app/validations/%5Bid%5D/risk-methodology/page.tsx).

### What exists
- Override-and-rerun: signal insert → trigger re-derives risk_factors → tier recomputes → AI memo regenerates via `after()`. ✅
- Atomic recompute via RPC. ✅
- Risk methodology printable: 9 factors in canonical order, severity dot, contributing data, exclusion reasons, signal-override audit trail, methodology pointer to `src/lib/risk/factors.ts`. ✅
- AI never picks the tier — `risk_rating` is hard-overwritten server-side from the deterministic tier. ✅

### Gaps
- **G4.1 — "Print risk methodology" requires Cmd+P.** Should be a one-click download (server-rendered to PDF). Bundling logic with the handoff PDF renderer is a small reuse.
- **G4.2 — Confidence score is opaque.** Bare percentage. Lender comparing 78% vs 65% has no idea what's driving it. Needs tooltip with contributing signals OR rename to "Validation completeness" if that's what it actually measures.

### What's coming
- **G4.1 — methodology PDF download.** Server renders → stores in `documents` (`purpose='risk_methodology'`) → returns download URL. ~0.5 day.
- **G4.2 — confidence-score audit + tooltip.** Audit the scoring function; pick the truthful label; add hover tooltip showing the inputs. ~0.5 day.

---

## Stage 5 — Route (find the right capital provider)

**User goal:** "Borrower passes my underwriting. Which of my investors will buy this deal, at what terms?"

**Surfaces:** [/dashboard/evaluate](../src/app/dashboard/evaluate/page.tsx), [/dashboard/evaluate/[id]](../src/app/dashboard/evaluate/%5Bid%5D/page.tsx), [/dashboard/evaluate/investors](../src/app/dashboard/evaluate/investors/page.tsx).

### What exists
- Module 1 — Evaluate Deal v1: rules engine takes deal parameters, evaluates against configured investors, returns pass / conditional / fail per investor. ✅
- Investor criteria as configurable JSON (criteria_value JSONB rows, server-side Zod validation, key-by-key error display). ✅
- 3 sample investor configs seeded. ✅

### Gaps
- **G5.1 — No CTA from validation → evaluate.** Validation detail page has zero outbound link to "Evaluate this deal against my investors." The two surfaces are routed as islands. Lender has to navigate manually.
- **G5.2 — Investor criteria editor is a bare textarea.** Plain text JSON editor; full Monaco / structured editor was deferred. Today's flow: type JSON, hit Validate, fix errors. Workable but ugly.

### What's coming
- **G5.1 — "Evaluate against my investors →" CTA** on validation detail page header. Click → opens evaluate page with this validation's borrower / entity / properties pre-loaded into the deal form. ~0.5 day.
- **A1 — Investor criteria PDF parser** (highest-leverage Tier A win for NPLA). Fund manager uploads guidelines PDF → Claude extracts `investor_criteria` rows → preview screen with confidence per row → save. Audit trail in `investor_criteria_extractions`. ~3 days.
- **A2 — Counter-offer / repricing calculator.** Failed deal → side panel computes minimum delta on each constraint ("drop loan $25K → passes at 7.75%"). Each suggestion is a clickable "what-if". ~2 days.
- **F1 — Multi-deal scenario comparison.** Three-column page showing investor matches across 3 deal structures (75 LTV / 70 LTV / 80 LTC). Pick the best. ~1.5 days.
- **F2 — Rate-shock stress test.** "+100bps / +200bps" toggle on evaluation results. ~1 day.

---

## Stage 6 — Hand off (the artifact every meeting hinges on)

**User goal:** "Send the chosen investor a polished package. Or hand the borrower a capital-availability proof."

**Surface:** HandoffCard on detail page + [/handoff/[id]](../src/app/handoff/%5Bid%5D/page.tsx).

### What exists
- Handoff Excel + PDF: auto-pull from validation data (deeds, sales prices, ownership, court records, sanctions, Zillow comp). Manual fillable cells (rehab spend, GC details, narrative). Branded header, page numbers, print-friendly. ✅
- Save-then-download pattern (dirty tracking; button labels switch when dirty). ✅
- Loose email validation + amber hint + field-level errors on save. ✅
- Print CSS shipped but **never physically tested on real paper** (deferred manual item).

### Gaps
- **G6.1 — Handoff doesn't reference the chosen investor from Stage 5.** Generic artifact. Should optionally include a top-match investor block (terms, rate, rationale) when an evaluation exists.
- **G6.2 — No CTA from evaluate → handoff.** Lender has to navigate back to detail page → HandoffCard.

### What's coming
- **G6.2 — "Generate handoff for top-match investor" CTA** on evaluate results page. Pre-fills HandoffCard with the matched investor's terms; lender reviews/saves. ~0.5 day.
- **G6.1 — handoff template extension** for top-match block (rate, points, LTV, rationale). ~0.5 day.
- **A3 — Borrower capital-availability PDF.** Once eligible at ≥1 investor, generate borrower-facing single-pager: "Capital is available. Estimated terms X-Y%, Z-day close." Anonymized investor list by default. Stored in `documents` (`purpose='borrower_capital_summary'`). ~1.5 days.
- **Print test (deferred manual item).** Physically print `/handoff/[id]` and `/validations/[id]/risk-methodology` to verify page-break / margin / color rules.

---

## Stage 7 — Monitor (the loan is live)

**User goal:** "Tell me if anything changes that I'd want to know — without me having to remember to check."

**Surface:** MonitorCard on detail page + [/api/cron/monitor](../src/app/api/cron/monitor/route.ts) (daily 09:00 UTC).

### What exists
- Per-validation monitor subscriptions: cadence (daily/weekly/monthly), recipients, alert rules. ✅
- Monitor cron runs entity / litigation / sanctions adapters; diffs vs prior snapshot; emails on change via Resend. ✅
- `monitor_runs.adapter_results` jsonb (per-adapter status: ok / rate_limited / failed / skipped). 1h backoff on rate limits. ✅
- `monitor_runs.email_status` tracking (sent / skipped / failed). ✅
- Universal `notification_preferences` table — channel = email | slack | teams | sms | webhook (X2 schema only; only email wired today). ✅

### Gaps
- **G7.1 — Monitoring is opt-in per validation.** No org-level default, no smart prompts. If lender forgets, the lock-in value disappears. Needs a per-org `monitor_default_on` setting + a one-time prompt after first validation.
- **G7.2 — No "next run in N hours" indicator.** MonitorCard shows cadence but not when it's about to fire. Cosmetic but it's part of the trust signal.
- **G7.3 — No Slack/Teams output yet.** Schema is there; dispatch layer wired only for email.

### What's coming
- **B1 — Borrower watchlist (one-click monitoring).** Detail page header toggle. Modal: weekly cadence + recipient + critical-only. Default works one-click. Add `borrower_id` FK on `monitor_subscriptions` so a NEW validation for the same borrower auto-inherits monitoring. ~0.5 day.
- **D2 — Slack/Teams notifications.** Wire universal `notification_preferences` dispatch to Slack/Teams webhooks. Channel test button. Lender's credit team lives in Slack. ~1.5 days.
- **D3 — Calendar integration (closing dates).** Optional `borrower_validations.expected_close_date`. ICS download. Cron at 7 days pre-close: notification "Re-run validation for closing this week?" ~1 day.
- **G7.1 — org-level monitoring default.** Settings: "Monitor every new validation by default (weekly, founder + credit team)." ~0.5 day.
- **G7.2 — "next run in N hours" on MonitorCard.** ~15 min.

---

## Stage 8 — Outcome (capture the feedback loop)

**User goal:** "Tell PulseClose how the deal turned out so it gets smarter."

**Surface:** validation detail page (status pill) + future borrower / investor profile pages.

### What exists
- Nothing. `deal_outcomes` table is scoped in DATA-MODEL.md; not yet shipped.

### Gaps
- **G8.1 — No outcome capture exists.** Without it, every Stage 5+6 output is unmeasurable. Reputation, performance dashboards, consensus moat all wait on this. **Highest-leverage 1-day item in the entire roadmap that isn't yet built.**

### What's coming
- **E1 — Deal outcomes capture.** Validation detail "Update deal status" button. Statuses: Withdrawn / Funded / Extended / Repaid / Defaulted. Optional fields per status (close date, funded amount, extension reason, default cause). Captures lender_user_id + timestamp. RLS org-scoped. ~1 day. **Ship this in the next batch.**
- **E2 — Borrower reputation score.** Recomputed on validation create / signal apply / outcome update. Components: validation count, average tier, default rate, extension rate, signal-correction rate. Like a credit score for borrowers. ~3 days.
- **E3 — Anonymized cross-tenant consensus.** HMAC-hash of normalized name + tax-id-last-4. Aggregation cron. Validation gets a chip "3 other lenders validated this borrower in 90d." ~2 days schema now; full feature 4-5 days when activated. Requires customer density (10+ lenders) + legal anonymization review.
- **E4 — Public borrower profile (opt-in).** Borrower with strong PulseClose history can publish a verified track record at `pulseclose.com/borrower/[uuid]`. Per-element opt-in. ~2 days.
- **A4 — Investor performance dashboard.** Per-investor: deals evaluated, pass rate, funded count, default rate. Originator drill-down. Needs `deal_outcomes`. ~3 days.
- **A5 — Originator scorecard for investors.** Letter grade (A-F) per originator, computed from outcome data. Two-sided marketplace primitive; defer activation post-NPLA, schema now. ~2 days.

---

# Cross-cutting surfaces

These don't sit at one stage; they wrap the journey.

## Cross-cutting — Workspace

**Surfaces:** [/dashboard](../src/app/dashboard/page.tsx) (the validation list), [/dashboard/compare](../src/app/dashboard/compare/page.tsx), future `/dashboard/portfolio`, future `/dashboard/activity`, future `/dashboard/search`.

### What exists
- Dashboard list with checkbox column, GC inline summary chip, tier badge, flag count, AI status, confidence %. ✅
- S1 Compare flow — pick 2 → side-by-side aligned by factor_key. ✅
- S4 GC chip — desktop column + mobile inline. ✅
- Loading skeleton on list. ✅

### What's coming
- **B5 — Activity feed UI** (universal `activity_events` table is already populating). New page `/dashboard/activity` + a per-validation strip on detail page. Filterable by actor / event type / entity / date. ~2 days. *Closes G3.3 and G7.x in part.*
- **B2 — Portfolio health dashboard.** Tier × flag count grid for the org's borrower book. Recently-changed section. ~2 days. The "first thing the lender opens in the morning."
- **B3 — Validation search + filter + CSV export.** Top-of-dashboard search bar with autocomplete on borrower / entity / property. Filter sidebar. ~2 days.
- **B6 — Validation diff over time.** Same borrower, two validations 6 months apart. Reuses S1 layout + a "Changes" panel. ~1.5 days incremental on S1.
- **D5 — Public REST API.** `/api/public/validations`, `/api/public/handoff/[id]/excel` keyed on per-org API tokens. Required for any lender with their own UW system to embed PulseClose data. ~2 days.

## Cross-cutting — Borrower-side surface

**Surface:** [/share/[token]](../src/app/share/%5Btoken%5D/page.tsx) (public, share-token gated).

### What exists
- Borrower pastes addresses or uploads xlsx/pdf. Same verify pipeline as lender-side. 422 on extraction failure. ✅

### What's coming (much of it lives in Stage 3 above; collected here for the borrower's POV)
- **C1 — Photo upload per property** (3 days).
- **C5 — Bank statement upload** (2 days).
- **G3.2 — "Send share link" CTA** from lender side (0.5 day).
- **E4 — Public borrower profile** (2 days, post-density).
- **G3.3 — surface borrower-side activity to lender** (0.5 day).

## Cross-cutting — Investor-side surface (post-NPLA)

Investor logins are post-launch. Schema lands pre-NPLA so data accumulates. Includes:

- **A4 — Investor performance dashboard** (~3 days).
- **A5 — Originator scorecard** (~2 days).
- **F3 — Investor-side deal queue.** Login + deal queue + accept/decline/comment. New role `investor_user`. ~3 days.

## Cross-cutting — Interoperability & lender-stack integration (D6)

**The thesis dependency nobody can skip.** The North Star calls PulseClose "a
verification gateway between front-end CRM and the LOS." For *us* that's a
metaphor; for a customer it's a literal integration requirement. A lender does
not abandon their system of record — they bolt PulseClose onto it. If data can't
flow **in** (deal + borrower from wherever they already keep it) and **out** (the
cleared, tier'd, deed-verified record back into their LOS/CRM), PulseClose is a
parallel silo a human re-keys into — which is exactly the manual workflow we sell
against. Adoption past the first hand-held design partner is gated on this.

**Grounded in the real stacks** (from the Insignia engagements — representative
of the ICP). A mid-market lender runs roughly:
- **LOS / system of record:** Nexys (ICC) or Encompass (IM). This is where the
  funded loan lives; it has its own API surface, DocGen, and field/milestone model.
- **CRM / intake:** Salesforce (both orgs) — where the deal enters and gets qualified.
- **POS / borrower portal:** Simple Nexus (IM).
- **Doc store:** Box (both).
- Plus email as the universal connective tissue.
The verification gateway sits **between Salesforce (intake) and Nexys/Encompass
(LOS)** — read a qualifying deal, validate, write the cleared record forward.

**This is a large, customer-gated body of work — not a pre-NPLA item.** Sequence
cheap-and-generic before expensive-and-bespoke:

1. **Generic read/write API first (extends [D5](#cross-cutting--workspace)).**
   Per-org API tokens; `GET` validations/handoff (D5) **plus** a `POST` create-
   validation endpoint so an external system can push a deal in. Outbound
   `webhook` channel already exists in `notification_preferences` (X2) — wire
   real event payloads (validation.completed, tier.changed, outcome.reported) so
   a lender's stack can subscribe. ~3–4 days. Unblocks any technical customer to
   self-integrate without us building a connector.
2. **CSV / spreadsheet import-export** (deal lists in, validated records out).
   The lowest-friction "fits my stack" answer for non-technical lenders. ~2 days.
3. **Salesforce app/connector** — read a deal from an SF intake object, write the
   PulseClose tier + risk flags + cleared-record link back to SF fields. The
   highest-leverage single connector because SF is the shared intake layer across
   the ICP. Build against the first customer who needs it. ~1–2 weeks.
4. **Per-LOS connectors (Nexys, then Encompass).** Push the validated record +
   conditions into the LOS; optionally pull deal context out. Each LOS API is its
   own project (auth, field mapping, DocGen). ~2–4 weeks **each**, one paying
   customer at a time — never speculative.
5. **iPaaS escape hatch (Zapier / Make).** Once the generic API + webhooks exist
   (item 1), publish a connector so the long tail of lender tools integrate
   without bespoke work. ~1 week after item 1.

**Unblocks when:** the first customer past the design-partner stage names the
system PulseClose must talk to. Until then, ship items 1–2 (generic, reusable)
and let real demand pick which connector in 3–4 gets built first. Pairs with the
distribution thesis: a capital provider mandating PulseClose to its lenders makes
"wire it into our LOS" the first question — have the generic API ready to answer it.

## Cross-cutting — Foundations

**Building blocks that everything else composes on:**

- **X1 documents** ✅ (every file upload).
- **X2 notification_preferences** ✅ (every outbound alert; only email dispatch wired today, D2 finishes Slack/Teams).
- **X3 activity_events** ✅ (every state change; B5 is the missing UI).
- **Universal `deal_outcomes`** — ships with E1.
- **Path B data model** ✅ (borrowers / entities / properties / lenders are first-class).
- **JSONB schema versioning** ✅ across all object-shaped JSONB columns.
- **`insertOrThrow` wrapper** ✅ on every user-visible insert.
- **AI privacy posture — open decision.** Today every borrower name + property + sanctions match goes through Anthropic. Options: ZDR contract ($5-15K/mo), PII redaction pre-flight (~1 day), depersonalized AI prompt (~0.5 day), per-org `ai_extraction_enabled` toggle (~0.5 day), AWS Bedrock customer-tenancy (post-NPLA). **Recommendation:** ship the 2-day bundle (redaction + depersonalized prompt + toggle) before serious lender outreach. Decide before A1 (which adds another Claude consumer).
- **OpenSanctions trial expires 2026-05-28.** Falls back to OFAC SDN direct (free) after that. Renew or upgrade.
- **G1.2 — multi-borrower / co-borrower modeling** (foundational schema change; defer until a real customer hits it).

### Data integrity — canonical keys and the matchers that enforce them

The 2026-05-02 testing pass surfaced a class of bug that the early
codebase shipped with: vendor data and lender input arrive in different
formats (Realie: `LASTNAME, FIRSTNAME-MIDDLE`; SOS: `LASTNAME, FIRSTNAME`;
lender form: `Firstname Middle Lastname`). The early matchers (substring
on lowercased + space-stripped strings) silently false-negatived
99% of comparisons. Two separate fixes shipped (`bbd4226` for the
verify-core deed-chain matcher, `48d550e` for the borrower-linked-to-entity
input-warning check). A third issue — the dedup keys for borrowers /
entities / lenders — required a migration ([00021_canonical_name_dedup.sql](../supabase/migrations/00021_canonical_name_dedup.sql))
to add canonical-name generated columns and unique indexes. Cross-cutting
principles 8 + 9 + 10 above codify the pattern; this section captures
the remaining items in this surface area.

**Shipped:**
- ✅ `verify-core` deed-chain matcher (tokenize + set-compare).
- ✅ `validations/route.ts` borrower-linked-to-entity input-warning matcher.
- ✅ `00021_canonical_name_dedup.sql` — `canonicalize_name(text, strip_entity_suffixes)` Postgres function + `normalized_canonical` generated columns on borrowers / entities / lenders + org-scoped unique indexes. JS `canonicalizeName` in `upsert.ts` mirrors the SQL exactly. Org-scoped uniqueness is enforced; global lender rows (FDIC) intentionally allow same-canonical-name with distinct fdic_ids.
- ✅ Realie owner-search filter (`searchPropertiesRealie`). Was using `startsWith` on uppercased strings — false-negatived "TT INVESTMENT PROPERTIES, LLC" vs "TT Investment Properties LLC" (comma format mismatch) and silently fell through to borrower-name fallback. Now uses the canonical token-subset check (entity-suffix-stripped). Same primitives as verify-core.
- ✅ `scripts/cleanup-canonical-duplicates.ts` — productized version of the inline merge surgery I ran during 00021 rollout. Detects duplicates by canonical key in borrowers/entities/lenders within their dedup scope, re-points FK references, deletes duplicates. Idempotent. Dry-run by default; `--apply` to execute.

**Still open:**
- **Property `address_normalized` canonicalization.** Same shape of bug — addresses come in many formats (`"1310 Rosalia Ave, Garden Grove, CA 92840"` vs. `"1310 ROSALIA AVE"` vs. `"1310 Rosalia Avenue"`). Today's `normalize_address()` SQL function only strips punctuation + lowercases. A properly-canonical address requires USPS-style suffix expansion (`Street`/`St`/`Str` → `street`), directional handling (`N` / `North`), and unit-separator parsing (`Apt 5` / `#5` / `Unit 5`). **Effort:** 1-2 days. **Risk if not fixed:** the same property gets created multiple times under different deeds; track-record aggregation across snapshots double-counts. **Mitigation while open:** Realie's `addressFull` is the de-facto canonical when available; prefer it over user-typed display when persisting.
- **Address parser edge cases (`verify-core.ts parseAddressForState`).** The `, City, ST ZIP` regex doesn't handle building/unit numbers between street and city — `71 WEBBER WAY 77, BUENA PARK, CA 90621` returned "Address not found" because `77` between street and city tripped Realie. Fix: tokenize → identify the state-code token → treat everything before it (excluding city) as the street + suffix. Or: send the raw address to Realie when the parser fails (Realie may be more tolerant). ~0.5d.
- **Cobalt entity-name normalizer.** [`cobalt.ts:178 normalizeEntityName`](../src/lib/adapters/cobalt.ts) uses substring-on-normalized matching and produces noisy "Registered name X differs from search Y" warnings. Low impact (just warning text) but should adopt the canonical pattern. ~1h.
- **Borrower-Entity linking via fuzzy-name match in upsert.** `linkBorrowerToEntity` matches existing relationships by `(borrower_id, entity_id)` exact — fine. But the upstream resolution from name→id uses the dedup canonical key, so name-format drift can still create the wrong link if the borrower or entity row was created under a different format earlier. Will resolve naturally once `00021` is widely deployed.
- **Person-name false-positives in the 2-token case.** `"Kim An"` ⊆ `"An Soon Kim"` triggers a false match because the matcher treats names as unordered token sets. Real fix requires DOB / SSN / address fingerprinting. Documented as a known limit, not a bug.
- **Cross-borrower / cross-entity merge UI.** Once two real records collide (e.g., human discovers Kim's entity exists under both abbreviation and full name), the lender needs an admin tool to merge them and re-point all FK refs. Bigger feature, ~2d. Probably post-NPLA unless a customer hits it.

---

# Recommended sequence

A single ordered list. Each item names the journey stage it lives at, the strategic lever, and the dependency. Pre-NPLA capacity at proven 2-day-per-feature velocity is ~25-35 working days remaining.

**Live always — no batch:**
0. **Bug bash + UX polish.** Anything caught in real-use sessions ships within hours. Live-fix culture, not weekly cadence. (Recent example: AI memo `severity` schema widening shipped same-day.)

**Batch 1 — Close the journey (5-6 days). Goal: one continuous flow from intake to handoff. ✅ COMPLETE except B5.**
1. ~~**G1.1 + G2.1 — Doc-ingest addresses → Verified Track Record at run time.**~~ ✅ Shipped 2026-05-02. Deed-verified flips appear automatically on first submit; AI memo regenerates with verified-flip stats. *Stage 1+2.*
2. ~~**G3.1 — Pull VerifiedTrackRecord above the fold**~~ ✅ Shipped 2026-05-02. Pillar evidence sits between WhyThisRating and HandoffCard. *Stage 3.*
3. ~~**G5.1 — "Evaluate against my investors →" CTA** on detail page.~~ ✅ Shipped 2026-05-02. Pre-fills evaluate form via URL params. *Stage 5.*
4. ~~**G6.2 — "Ready for the investor handoff?" hint on evaluate results.**~~ ✅ Shipped 2026-05-02. *Stage 6.*
5. ~~**G3.5 — Drop standalone single-check pages from sidebar**~~ ✅ Shipped 2026-05-02 (nav cleanup commit + page files deleted in robustness-sweep commit).
6. **B5 — Activity feed UI** + per-detail-page strip. 2 days. *Cross-cutting workspace + closes G3.3.* **Only Batch 1 item remaining.** Schema is populating with all 7 emit verbs (created, updated, applied_signal, ran_monitor, sent_share_link, sent_handoff, compared, evaluated_deal). Just needs read+render layer.
7. ~~**G3.2 — "Send share link" CTA** with Resend template.~~ ✅ Shipped 2026-05-02. Backend at `POST /api/validations/[id]/send-share-link` + inline form on VerifiedTrackRecord card.

**Robustness sweep — 2026-05-02 audit pass (post-Batch 1).**
After Batch 1 shipped end-to-end, ran a comprehensive code review applying
the new design principles to every adjacent surface. Items that fell out:

- ✅ **AI memo `max_tokens` 2048 → 4096.** Same Claude-truncation class as the doc-ingest bug; AI memo's response was within budget for Truong but borderline for portfolios with more risk factors. Bumped before it bit.
- ✅ **Share-link `extract-addresses` `max_tokens` 2048 → 4096.** Parity with `borrower-doc` for borrower-side xlsx uploads.
- ✅ **Realie owner-search filter** uses canonical token-subset (was `startsWith` on uppercased strings; format-fragile).
- ✅ **Activity emit on handoff download** (`sent_handoff` verb with `artifact: 'excel' | 'pdf'`). Both download paths now emit events; B5 feed will see them.
- ✅ **Removed duplicate "Export PDF" button** from validation detail header. `window.print()` printed the validation page directly with no print CSS — confusing UX. The risk-methodology print + handoff PDF/Excel are the canonical artifact paths.
- ✅ **Deleted orphan tool pages** at `/dashboard/{entity,gc,litigation,track-record}/page.tsx`. Already unlinked from sidebar (G3.5); no remaining incoming refs.
- ✅ **`scripts/cleanup-canonical-duplicates.ts`** productized. Dry-run by default; `--apply` to execute. Re-points FK refs across borrower_validations, borrower_entities, entity_signals, entity_checks, borrower_signals, borrower_property_signals, property_ownership.

**Batch 2 — Tier A capital stickiness + outcome substrate (8-10 days). Goal: Damon can demo "load your fund's PDF" + every deal starts collecting outcomes.**
8. **AI privacy posture decision + 2-day bundle** (redaction + depersonalized prompt + toggle). 2 days. *Foundations.* Decide before #9.
9. **A1 — Investor PDF parser.** 3 days. *Stage 5.* The NPLA hero feature.
10. **E1 — Deal outcomes capture.** 1 day. *Stage 8.* Blocker for every reputation/performance feature.
11. **A2 — Counter-offer / repricing calculator.** 2 days. *Stage 5.*
12. **A3 — Borrower capital-availability PDF.** 1.5 days. *Stage 6.*
13. **B1 — Borrower watchlist (one-click monitoring).** 0.5 day. *Stage 7.*

**Batch 3 — Daily-driver retention (5-7 days). Goal: lender opens PulseClose every morning.**
14. **B2 — Portfolio health dashboard.** 2 days.
15. **B3 — Search + filter + CSV export.** 2 days.
16. **B4 — "Have we seen this borrower" guard.** 0.5 day.
17. **B6 — Validation diff over time.** 1.5 days.
18. **G4.1 — methodology PDF download** + **G4.2 — confidence audit/tooltip.** 1 day.

**Batch 4 — Trust-but-verify expansion (5-7 days). Goal: more ground-truth signals, less inference.**
19. **C2 — BatchData historical deeds.** 2-3 days. Single biggest data-quality jump.
20. **C1 — Geo-tagged photo verification.** 3 days. Major fraud lever + demo wow.
21. **C4 — Address consistency cross-check.** 1 day.
22. **C6 — Public records expansion** (liens / warrants / foreclosures sub-cards). 1 day.

**Batch 5 — Workflow integration + content (4-5 days). Goal: meet the lender where they live.**
23. **D2 — Slack/Teams notifications.** 1.5 days. *Stage 7.*
24. **D4 — Browser bookmarklet.** 1 day. *Stage 1.*
25. **D5 — Public REST API.** 2 days. *Cross-cutting workspace.*
26. **Demo collateral** — one-page leave-behind, three talk tracks, demo deal pre-load (pre-loaded with E1 outcomes). 1-2 days.
27. **Insignia testimonial** — collect quotable line from Damon or Noah. Async ask through working sessions, not a discrete deliverable.

**Buffer batch 6.** Bug bash, polish, dry-run NPLA demos with Damon. Print test. Demo deal final scrub.

**Post-NPLA / structure-dependent:**
- E2 (reputation), E3 (consensus), E4 (public profile), A4 (investor performance), A5 (originator scorecard), F1-F3 (Module 1 expansion + investor side), C3 (reverse phone), C5 (bank statement parser), D1 (email-forward intake), D3 (calendar integration), TransUnion address (when logins land), multi-state GC adapters, Nexys LOS write-back, state-court litigation provider, G1.2 (multi-borrower modeling).

---

# Open decisions / questions

1. **AI privacy posture** — see Foundations. Decide before A1.
2. **What to do about standalone single-check pages** (`/dashboard/entity` etc.). Delete vs. hide-under-Tools. (Ship #5 in Batch 1 either way.)
3. **OpenSanctions trial expires 2026-05-28** — renew or fall back to OFAC SDN direct.
4. **Insignia partnership structure** (JV / JV-fund / parallel SaaS) — orthogonal to product work, drives compensation not tech ownership.
5. **Truong xlsx live test** — once Batch 1 #1 ships, drop the xlsx in `/dashboard/new` to verify the end-to-end path. (Currently runbook test at `~/.claude/plans/ok-so-now-what-delightful-lark.md`.)

---

# Backlog — provenance + tier mapping

Every feature catalogued under the old tier system. The "Stage" column re-slots each feature into the user journey above so it's findable two ways. Notes preserved.

| Idea / Tier code | Stage | Source | Notes |
|---|---|---|---|
| OpenCorporates person → entity discovery ($2,800/yr) | Stage 2 | STRATEGY.md | DEFERRED. Insignia uses Elementix; revisit only for non-Insignia customers. |
| **S1** Comparative borrower view | Workspace | Audit 2026-04-30 | ✅ Shipped. |
| **S2** Story Mode AI memo | Stage 3 | Audit 2026-04-30 | ✅ Shipped. |
| **S3** Litigation case-card UI | Stage 3 | Audit 2026-04-30 | ✅ Shipped. |
| **S4** GC inline summary | Workspace | Audit 2026-04-30 | ✅ Shipped. |
| **S5** Risk methodology PDF | Stage 4 | Audit 2026-04-30 | ✅ Shipped (G4.1 polish: download not print-only). |
| **A1** Investor criteria PDF parser | Stage 5 | Audit 2026-04-30 | Batch 2. Highest Tier A. |
| **A2** Counter-offer / repricing | Stage 5 | Audit 2026-04-30 | Batch 2. |
| **A3** Borrower capital-availability PDF | Stage 6 | Audit 2026-04-30 | Batch 2. |
| **A4** Investor performance dashboard | Stage 8 | Audit 2026-04-30 | Post-NPLA. Needs E1. |
| **A5** Originator scorecard for investors | Stage 8 | Audit 2026-04-30 | Post-NPLA. Needs E1+E2. |
| **B1** Borrower watchlist (one-click monitor) | Stage 7 | Audit 2026-04-30 | Batch 2. |
| **B2** Portfolio health dashboard | Workspace | Audit 2026-04-30 | Batch 3. |
| **B3** Validation search + filter | Workspace | Audit 2026-04-30 | Batch 3. |
| **B4** "Have we seen this borrower" guard | Stage 1 | Audit 2026-04-30 | Batch 3. |
| **B5** Activity feed | Workspace | Audit 2026-04-30 | Batch 1. Closes G3.3. |
| **B6** Validation diff over time | Workspace | Audit 2026-04-30 | Batch 3. Builds on S1. |
| **C1** Geo-tagged photo verification | Stage 3 | Audit 2026-04-30 | Batch 4. |
| **C2** BatchData historical deeds | Stage 2 | pickup.md | Batch 4. Single biggest data-quality lever. |
| **C3** Reverse phone/email validation | Stage 1 | Audit 2026-04-30 | Post-NPLA (cheap signal). |
| **C4** Address consistency cross-check | Stage 3 | Audit 2026-04-30 | Batch 4. |
| **C5** Bank statement parser | Stage 3 | Audit 2026-04-30 | Post-NPLA. Privacy-sensitive. |
| **C6** Public records expansion (liens, warrants) | Stage 3 | Audit 2026-04-30 | Batch 4. |
| **D1** Email-forward deal submission | Stage 1 | Audit 2026-04-30 | Post-NPLA. Resend inbound paid. |
| **D2** Slack/Teams notifications | Stage 7 | Audit 2026-04-30 | Batch 5. |
| **D3** Calendar integration (closing dates) | Stage 7 | Audit 2026-04-30 | Post-NPLA. |
| **D4** Browser extension / bookmarklet | Stage 1 | Audit 2026-04-30 | Batch 5 (bookmarklet); extension post-NPLA. |
| **D5** Public REST API for CRMs | Workspace | Audit 2026-04-30 | Batch 5. |
| **E1** Deal outcomes capture | Stage 8 | Audit 2026-04-30 | Batch 2. Blocker for A4/A5/E2/E3/E4. |
| **E2** Borrower reputation score | Stage 8 | Audit 2026-04-30 | Post-NPLA. Needs E1. |
| **E3** Anonymized cross-tenant consensus | Stage 8 | Audit 2026-04-30 | Post-density. Schema now. |
| **E4** Public borrower profile (opt-in) | Stage 8 + Borrower-side | Audit 2026-04-30 | Post-density. |
| **F1** Multi-deal scenario comparison | Stage 5 | Audit 2026-04-30 | Post-NPLA. |
| **F2** Rate-shock stress test | Stage 5 | Audit 2026-04-30 | Post-NPLA. |
| **F3** Investor-side deal queue | Investor-side | Audit 2026-04-30 | Post-NPLA. New role. |
| **X1** Universal `documents` table | Foundations | Audit 2026-04-30 | ✅ Shipped. |
| **X2** Universal `notification_preferences` | Foundations | Audit 2026-04-30 | ✅ Schema shipped; only email dispatch wired (D2 finishes). |
| **X3** Universal `activity_events` table | Foundations | Audit 2026-04-30 | ✅ Schema shipped; B5 is the UI. |
| **G1.1** Doc-ingest addresses → verified flips | Stage 1+2 | UX audit 2026-05-02 | Batch 1. Closes address paradox. |
| **G1.2** Multi-borrower / co-borrower modeling | Foundations | Truong demo data | Defer until customer-driven. |
| **G3.1** VerifiedTrackRecord above fold | Stage 3 | UX audit 2026-05-02 | Batch 1. |
| **G3.2** "Send share link" CTA | Stage 3 | UX audit 2026-05-02 | Batch 1. |
| **G3.3** Surface borrower activity to lender | Stage 3 | UX audit 2026-05-02 | Batch 1 (rolls into B5). |
| **G3.4** "Add GC after-the-fact" action | Stage 3 | UX audit 2026-05-02 | Post-Batch-3. |
| **G3.5** Kill standalone tool pages | Cross-cutting | UX audit 2026-05-02 | Batch 1. |
| **G4.1** Methodology PDF download (not print-only) | Stage 4 | UX audit 2026-05-02 | Batch 3. |
| **G4.2** Confidence-score audit + tooltip | Stage 4 | P0 audit + UX 2026-05-02 | Batch 3. |
| **G5.1** Validation → evaluate CTA | Stage 5 | UX audit 2026-05-02 | Batch 1. |
| **G6.1** Handoff template references chosen investor | Stage 6 | UX audit 2026-05-02 | Batch 2 (with G6.2). |
| **G6.2** Evaluate → handoff CTA | Stage 6 | UX audit 2026-05-02 | Batch 1. |
| **G7.1** Org-level monitor default | Stage 7 | UX audit 2026-05-02 | Batch 5. |
| **G7.2** "Next run in N hours" indicator | Stage 7 | UX audit 2026-05-02 | Polish (any batch). |
| **G7.3** Slack/Teams output | Stage 7 | Audit + UX 2026-05-02 | = D2. |
| **G8.1** Outcome capture exists at all | Stage 8 | UX audit 2026-05-02 | = E1. |
| Cross-lender borrower reputation graph | Stage 8 | STRATEGY.md long-shot | = E2 + E3. |
| Fraud-ring detection via graph AI | Stage 8 | STRATEGY.md long-shot | Long horizon; needs E1/E3. |
| Satellite construction monitoring | Stage 7 | STRATEGY.md long-shot | Pairs with C1. |
| Climate-risk scoring per property | Stage 3 | STRATEGY.md long-shot | First American partnership. New informational factor. |
| DSCR rental-loan vertical | New | STRATEGY.md | 90% engine reuse. Post-NPLA bet if signal appears. |
| SBA lending vertical | New | STRATEGY.md | $25B/yr. Far. |
| UK bridging finance | New | STRATEGY.md | GBP 13.4B. Far. |
| Compliance automation (mandated docs, deadlines) | Stage 7 | Insignia 4/28 call | Composes with X1. |
| Operating-agreement collection adapter | Stage 1 | Insignia 4/28 call | For Kiavi/Yabi brokered channel. Templated borrower request via share link. |
| State-specific endorsement validator | Stage 3 | Insignia 4/28 call | Per-state research-bound. |
| ICP picker (Bridge / Bank / DSCR / Brokered / Private credit) | Foundations | 4/28 demo | Premature; v1 hardcodes Bridge. |
| Auto-recommend supplemental conditions | Stage 4 | Insignia 4/28 call | Small rules layer on factor + signal data. |
| Multi-state GC adapters (FL/TX/NY) | Stage 2 | Existing roadmap | Post-NPLA / customer-driven. |
| Nexys LOS write-back | Cross-cutting workspace | Existing roadmap | Blocked on Nexys API access. |
| State-court litigation provider | Stage 3 | Existing roadmap | Eval pre-NPLA, sign post-NPLA. |
| TransUnion address validation | Stage 2 | Existing roadmap | Blocked on Noah's logins. ~1 day to wire. |

---

## Post-NPLA sequence (2026-06-23)

The pre-NPLA batch sequence is spent; NPLA happened 2026-06-22/23. This is the
new ordered plan, synthesized from the 2026-06-23 strategy + UX + market analysis.
Ordered by leverage. **Assume NPLA produces ≥1 capital-provider signal and 0–2
warm lender intros — the realistic outcome under the distribution thesis.**

1. **Doc reconciliation + reposition (½–1 day) — DONE 2026-06-23.** This pass:
   promote the verification+underwriting gateway North Star, fix stale facts (42
   migrations), add UX-PLAN, repackage pricing on paper, capture future ideas.
   *Highest ROI hour on the board — stops the next session resuming on a false map.*
2. **Turn PostHog on** — set `NEXT_PUBLIC_POSTHOG_KEY` (+ host) in Vercel. The
   funnel is shipped but inert; we're flying blind until this is set. Also set
   `RESEND_API_KEY` + `CRON_SECRET` so trial/onboarding emails fire.
3. **UX quick-win pass (2–3 days)** — the §4 list in [UX-PLAN.md](./UX-PLAN.md):
   workbench on the evaluate detail page (parity), "next step" CTA + progress
   strip on validation detail, evaluate→handoff deep-link, fix the "minor"
   severity color, borrower's recent evaluations on their detail page, first-run
   "start here" card. Fixes the first-run story.
4. **Underwriting → handoff artifact (2–3 days)** — put the sizing constraint
   ladder + binding constraint + AI judgment stance into the Excel/PDF handoff +
   the borrower one-sheet. *This is what makes underwriting demo-able to a capital
   provider — the connective tissue that turns the shipped engine into the wedge.*
5. **D6 item 1 — generic write-back API + real webhook payloads (3–4 days).** A
   `POST` create-validation endpoint + per-org tokens + real
   `notification_preferences` webhook events (validation.completed, tier.changed,
   outcome.reported). The answer to "wire it into our LOS" — the first question a
   mandating capital provider asks. See [§D6](#cross-cutting--interoperability--lender-stack-integration-d6).
6. **Minimum capital-provider "mandate" object (3–5 days).** A fund/investor
   defines a validation/underwriting standard (fed by the A1 PDF parser); a
   lender's validation gets stamped "meets [Fund]'s standard." Connects the
   distribution thesis to an actual product surface and turns A1 from an island
   into a loop. Build toward the documented rep-and-warranty-relief mechanic
   ("run PulseClose = borrower-diligence reps satisfied").
7. **Pricing repackage (1 day code + Damon validation).** Add a **$1,499
   Underwriting tier** (workbench + AI judgment + handoff artifact); design (don't
   yet build) a **metered Fund tier ($1.5–3k/mo, flat base + per-loan usage)**.
   See [PRICING-STRATEGY.md](./PRICING-STRATEGY.md). Validate the numbers with
   Damon, not at the desk.
8. **Validation-detail tabs + borrower-centric IA** (UX-PLAN §2–3) — bundle the
   tabs with #4 (same page); do the borrower-centric restructure once real
   multi-borrower volume confirms it matters.
9. **AVM adapter** (later, customer-gated) — sharpens the AI judgment's "market"
   dimension from "NOT PROVIDED" to real comps.

**Explicitly de-prioritized (do NOT spend cycles here):**
- **BatchData / C2 historical deeds + any data-layer deepening.** The
  post-Elementix positioning lock is explicit: orchestrate the entity-graph layer
  (Elementix + First American own it; Insignia already pays for it), don't
  replicate it. De-fund C2.
- **GEO/AEO / programmatic SEO** beyond maintaining the 15 existing guides — own
  research killed organic web as the demand engine for this ICP.
- **Reputation/consensus + investor-performance UI (E2/E3/E4/A4/A5)** — gated on
  outcome-row density we won't have for months. Schema-only.
- **Autonomous underwriting decisioning** — keeps the product advisory (the
  "AI advises, human decides, deterministic engine sizes" spine) and out of
  ECOA/fair-lending territory the posture doc doesn't yet cover.
- **CRE *broker* GTM** — brokers buy deal-matching, not diligence. If expanding,
  go to CRE *bridge lenders* (same underwriting logic) — see [IDEAS.md](./IDEAS.md).

---

## Post-Damon-reset sequence (2026-07-01) — construction sizing, coherence, craft

Supersedes the Post-NPLA sequence above as the active plan. Synthesized from the
**2026-07-01 Damon engagement-reset demo** (he saw the restructured 4-section
product; ICC is trialing it **July + August across both businesses**) cross-checked
against the code (three deep-read audits), the real 208-loan ICC book, and
[CALIBRATION-FINDINGS.md](CALIBRATION-FINDINGS.md). Full extraction in memory
`project_damon_engagement_reset_2026-07-01` + `project_damon_excel_model_moat`; the
unscoped versions live in [IDEAS.md](IDEAS.md#damon-engagement-reset-demo-2026-07-01--sharpened-signals).

**New forcing function:** the **AAPL conference, Nov 9–11 2026 (Las Vegas)** is the
GTM debut Damon chose (over NPLA — West Coast, needs runway). Everything below should
land before it, most inside the July/Aug ICC trial window.

**Why this order (the through-line):** the July/Aug trial *will fail on Damon's real
flow* if the engine keeps sizing construction as bridge — **~27% of ICC's real book
is construction + fix&flip (32 GUC / 24 F&F of 208 loans)**, and #10049 (the loan we
demoed) is Ground-Up Construction that the engine sized as generic bridge. Damon's
"the LPB's wrong because it might be a construction loan" is **confirmed in code and
data**. So: (1) make the engine size his real deals, (2) make the app never contradict
itself, (3) make it not look like a prototype — then expand.

**The sizer-vs-Solver reconciliation (the core finding):** three layers exist, only
the first is in the product. (a) The **bridge constraint ladder** (`sizing.ts`, MIN
across LTV/LTC/LTARV/DSCR/DY) reproduces Damon's bridge one-sheet — shipped. (b) The
**deal-type-aware buy-box** (construction → LTARV-primary, skip as-is LTV, `costSpentToDate`)
was built and **validated to 6.9% mean |Δ| vs. real ICC approved loans** — but it lives
in `scripts/fidelity-score.ts buyBoxFor`, **not the product engine.** (c) **Interest-reserve
+ advance-vs-construction-holdback math** — the "Solver" piece. **CORRECTION (2026-07-01,
trove):** this model is **not missing** — it's `Loan Sizer - Construction.xlsx` in the trove
(`loan-sizer-trove-2026-07/`). Its "Solver" behavior is a **circular interest reserve** (the
reserve is capitalized into the loan, and is computed on the loan that includes it), which
**solves in closed form** — `TotalLoan = (PurchaseAdvance + ConstructionHoldback) / (1 −
Rate/12 × Months × Discount)` — i.e. deterministic where their Excel iterates. So "it didn't
replicate his Solver" because we ported only the bridge ladder and never built the RTL
waterfall (now shipped, see UW-1) or the construction Sources/Uses + capitalized reserve
(UW-1 ground-up path, spec'd below).

**The 2026-07-01 data trove (decoded).** ICC handed over a large data set; the
product-relevant models are decoded and pulled into the repo at
`clients/insignia-capital/data/loan-sizer-trove-2026-07/` (see its README for the full
decoded logic + golden fixtures). The crown jewel is **`RTL_Loan_Sizer_Fillable.xlsx`**
(Noah, 2026-06-23) — the fix&flip sizer, which produces a **structured deal, not just a
max loan**: a proceeds waterfall (purchase-advance + rehab-holdback − prepaid-interest −
closing → net proceeds → cash-to-close → equity%), an initial-advance-vs-holdback split,
and a **Tier×Rehab-Type buy-box grid** with a **cushion (headroom) per test**. Also
decoded: the **Construction Budget** (soft/hard cost split, spent-to-date, %-complete,
$/sqft), a **DSCR/PITIA calculator** (income-approach max loan via `PV`), the **Colchis
Scenario Tool** (a real investor's rate-stack pricing + eligibility box, buyup/buydown in
bps/$), and the **Track Record & REO schema** (which already tags ground-up + construction
budget per property). Plus **10 real investor seller guides / DSCR matrices / quote sheets**
(`Lenders.zip`) as the A1 fixture set. **This changes UW-1 from "port a buy-box" to
"output the structured deal the way their Excel does — only better."**

### The plan — phased, ordered for the trial then the debut

**Guiding order:** (Phase 1) make the engine model his *real* deals — the July/Aug trial
fails otherwise; (Phase 2) make it **coherent + trustworthy end-to-end** — one thing that
makes sense to anyone; (Phase 3) best-execution + capital surfaces — the distribution
wedge; (Phase 4) additional-analysis differentiators — the moat; (Phase 5) integration.
**Persona-agnostic UX coherence (cross-cutting principle 13) is woven into every item**,
not deferred to the end — UX-2 is only the dedicated consolidation pass.

#### Phase 1 — The engine models real deals (do first; trial-blocking)

1. **UW-1 — Structured construction/RTL sizing IN the product engine (highest leverage).**
   Rebuild sizing to output a **structured deal**, per the decoded `RTL_Loan_Sizer`
   (fixtures in the trove README). Into [src/lib/underwriting/sizing.ts](../src/lib/underwriting/sizing.ts)
   + the deal stepper: (a) the **proceeds waterfall** (purchase-advance + rehab-holdback,
   less prepaid-interest + closing → net proceeds → **cash-to-close** → equity%); (b) the
   **initial-advance-vs-holdback split**; (c) **interest-reserve capitalization**
   (`InitialAdvance × Rate/12 × PrepaidMonths`, generalizing to a draw timeline); (d) the
   deal-type-aware **governing-assumption picker** — port `buyBoxFor` from
   `scripts/fidelity-score.ts` (construction → LTARV-primary, skip as-is LTV, LTC loose
   secondary; **infer basis from economics**, not the purpose dropdown — calibration #14);
   (e) LTV/LTP govern the *initial advance* with **holdback added back** (`AsIs×MaxLTV +
   Holdback`); (f) a **cushion (headroom) per constraint**, surfaced.
   **Status: RTL/fix&flip path SHIPPED** — [src/lib/underwriting/rtl-sizer.ts](../src/lib/underwriting/rtl-sizer.ts)
   + [scripts/verify-rtl-sizer.ts](../scripts/verify-rtl-sizer.ts) reproduce `RTL_Loan_Sizer`
   Option_1 to the penny (30/30). **Remaining: the ground-up construction path** — a
   Sources/Uses model with a **capitalized interest reserve solved in closed form**
   (`TotalLoan = (PurchaseAdvance + ConstructionHoldback) / (1 − Rate/12 × Months × Discount)`),
   per the decoded `Loan Sizer - Construction.xlsx` — deterministic where their Excel iterates.
   *Stage: Route / underwrite.*
2. **UW-2 — Import ICC's Excel models as golden fixtures + deal-type templates.** Wire the
   trove models (`loan-sizer-trove-2026-07/` RTL sizer, construction budget, DSCR calc) +
   the pre-existing ones (One Sheet Bridge/Construction/Lilac, MFR Rehab, 286 Virginia /
   544 Sunset) into [scripts/golden-loans.ts](../scripts/golden-loans.ts); assert engine
   output **to-the-penny** (RTL Option_1 → Max Loan $2,422,000, Net $2,200,000, CTC
   $294,999). Deal-type templates (RTL / ground-up / DSCR-rental / MFR) in the stepper.
   The proof for the "replace your Excel model" wedge. *Action: get Michael's ground-up
   Solver `.xlsx` from Damon.* *Stage: Route.*
3. **UW-5 — Live-solve / goal-seek (the 10× over their Excel).** Every ICC model is
   forward-calc; Michael reaches for Excel **Solver** to invert it. Make inversion native:
   solve for max loan at a target DSCR, the rate that hits a target net-proceeds, the
   purchase-advance% that caps cash-to-close. Sliders that re-solve live — what only
   Michael can do today, instant and safe for the whole team. *Stage: Route.*
4. **UW-6 — DSCR / rental income-approach constraint.** Add the PITIA-DSCR path from the
   decoded DSCR calculator — max loan via `PV(rate/12, term, −(NOI/DSCR)/12)`, both
   amortizing and interest-only — as a first-class constraint (covers the 15 DSCR-rental
   loans + stabilized MFR). *Stage: Route.*
5. **UW-3 — Surface the sizing depth layers (<1 day).** Promote to first-class the already-
   computed depth (`exit.ts`/`stabilization.ts`/`reserve.ts`): **DSCR in-place AND
   stabilized** (buried at [deal-stepper.tsx:851](../src/components/dashboard/deal-stepper.tsx);
   Damon asked for both), **exit/takeout** ("prove the takeout clears the bridge"), the
   **stabilization path**. *(The "confidence is low" remark maps to existing G4.2 — do
   together.)* *Stage: Route.*
6. **UW-4 — Deposits / equity-contribution input (bundle with UW-1).** Add optional
   earnest/deposit/equity-source inputs so equity-required reconciles to the real capital
   stack — matters most on construction. *Stage: Route.*

#### Phase 2 — Coherence + trust (one thing that makes sense to anyone)

7. **COH-2 — Fix the mandate console reading raw results (HIGH).** [CALIBRATION #18](CALIBRATION-FINDINGS.md) —
   still open. `buildDiligence` ([src/lib/mandates/assess.ts:86-90](../src/lib/mandates/assess.ts))
   bypasses disambiguation / list-classification / not-run, so a **clean borrower fails 5
   gates** (Mark Morrison: clean in the Book, fails the Mandate Console — same data,
   opposite verdict). Mirror the risk-factor logic (only `confirmed` litigation trips the
   gate; only real `sanction`/`pep` trips sanctions; `not_run`/failed = "could not verify,"
   never auto-fail). The trust-killer on the capital-partner surface Damon-as-fund sees
   first. *Stage: Route / decide.*
8. **UX-1 — Craft + de-AI pass (2–3 days, no rearchitecture).** Damon: "looks clearly
   AI-developed." Enforce [design-system.md](design-system.md) (it already forbids the
   tells): kill gradients + opacity-arithmetic (`bg-amber-50/40`, `bg-gradient-to-br`), cut
   icon saturation (7 in the AI-memo card → 1–2), raw tailwind sprawl → semantic tokens,
   enforce the type scale, single loading state; de-clutter to one-question-per-screen.
   Full spec: [UX-REDESIGN-PLAN.md §12](UX-REDESIGN-PLAN.md).
9. **UX-2 — Persona-agnostic coherence (the user's top priority: "no matter who you are it
   makes sense").** The seamless-product pass: **one Deal object** flowing Borrower → Deal →
   Capital → Portfolio with no re-keying; **one `computeVerdict()`** on every surface;
   **Excel-parity sizing layout** (waterfall left, constraint ladder + pass/fail + cushion
   right — the layout ICC already trusts) so an underwriter reads it instantly; **cushion/
   headroom shown everywhere** a constraint binds (Damon's "art of massaging the deal");
   **native scenario compare** (Option_1/Option_2 columns); a first-run path that orients
   any persona (broker / underwriter / capital partner) to *their* next action. Full spec:
   [UX-REDESIGN-PLAN.md §13](UX-REDESIGN-PLAN.md). *Woven through Phases 1–4; this item is
   the dedicated consolidation pass.*

#### Phase 3 — Best-execution + capital (the distribution wedge)

10. **A1+ — Best-execution rate stack (not pass/fail).** Parse the 10 real seller guides /
    DSCR matrices / quote sheets (`Lenders.zip`: ACRA, ArchWest, Conventus, Dunmor,
    Eastview, Oakhurst, …) via the A1 parser; the evaluate engine returns a **priced rate
    stack per investor** (rate + buyup/buydown in bps/$, binding eligibility flag), ranked —
    the Colchis-tool structure, generalized. Wire live rate sheets so pricing stays current.
    *Stage: Route.*
11. **CAP-1 — Concentration alerts + facility-aware sizing + portfolio roll-up.** Flag a
    borrower crossing a $ threshold ($20M) or geographic concentration ("10 big loans in
    Bel Air"); size against the **lender's own facility capacity** (the Colchis LOC
    Borrowing-Base-Limits model) so we never green-light a loan the facility can't hold;
    roll network activity up to the capital partner. Damon (both businesses) is the first
    capital-partner user. *Stage: Portfolio / Monitor.*
12. **CAP-2 — Priced-rate + margin overlay per investor, override-able (small).** "Price
    every loan, bake in a margin; override if the LO pushes back." Extends the per-investor
    overlay + A2. *Stage: Route.*
13. **COND-1 — Auto-conditions from the deal profile.** Generate the likely condition set
    (ground-up → draw inspections, budget, completion; DSCR → lease/estoppel) from the deal
    type + pillars, seeded by ICC's Master Nexys Condition List. Turns sizing into a
    pre-underwrite. *Stage: Decide.*

#### Phase 4 — Additional-analysis differentiators (the moat — things Excel can't do)

14. **AN-1 — Construction cost benchmarking.** Compare a budget's **$/sqft to regional
    norms** (RSMeans-style or derived from ICC's own deal corpus) → flag under-budgeted
    rehabs (feasibility + fraud signal). *Stage: Investigate / Route.*
15. **AN-2 — Interest-reserve adequacy over the draw timeline.** Does the reserve carry to
    stabilization given the NOI ramp? Wire `reserve.ts` + `stabilization.ts` to the draw
    schedule. *Stage: Route.*
16. **AN-3 — Sponsor capacity from the REO schedule.** Concurrent projects, aggregate
    exposure, can-they-carry — turns the track record into a *forward* risk signal.
    *Stage: Investigate.*
17. **AN-4 — Calibrate the buy-box to realized outcomes (the compounding moat).** As deal
    outcomes accrue (E1), tune the buy-box to *actual* performance and benchmark a
    borrower's budget/cost against the corpus. A spreadsheet on one laptop can never do
    this; a multi-tenant platform can. *Stage: Outcome.*

#### Phase 5 — Integration + adjacency

18. **INT-1 — Salesforce connector (customer-gated) = [D6 item 3](#cross-cutting--interoperability--lender-stack-integration-d6).**
    Damon asked twice; Insignia is standing up SF/Encompass now. Reconfirms SF as the
    priority connector when the field-mapping need lands. *Stage: Interoperability.*
19. **Consumer Bridge — logged adjacency, NOT built.** The trove's `Consumer Bridge.zip` is
    an owner-occupied **HPML/HOEPA/TILA** product (TaliMar-modeled) — a different regulatory
    animal from the business-purpose ICP. Captured in [IDEAS.md](IDEAS.md); revisit only if
    ICC actually pursues consumer bridge.

**Non-product action items from the reset call (don't lose these):**
- **Email Damon the AAPL conference info** (Nov 9–11, Vegas) — he asked; can't find it in his inbox.
- **~~Get Michael's Solver `.xlsx`~~** — turned out to be in the trove
  (`Loan Sizer - Construction.xlsx`; "Solver" = a closed-form-solvable circular interest
  reserve). Still worth grabbing Damon's **condo-project Excel** he offered + confirming the
  named `ICC SFR 1-4 Construction Deck V.1.01.xlsx` (likely in the 16GB download).
- **Thursday 4:00** standing meeting (was Tuesday; blew it) — run the **Livermore bridge-
  apartment live deal** through PulseClose together.
- He'll send **Cushman & Wakefield multifamily sizing decks** — mine for MFR sizing nuggets.

**New cross-cutting design principle (from the reset call):** the AI memo stays a
**teaching-oriented "common framework to evaluate the deal," never a black box.** Damon's
stated fear: throwing a deal in blind and "not knowing shit when the investor calls." The
memo narrates + frames so the human learns the deal; it never replaces reading it, and
never sets the number or the tier (same spine as always).

---

## Decisions log (append-only)

### 2026-07-01 (b) — ICC data trove decoded → expanded phased plan
ICC handed over a large data trove (`~/Downloads`: `Loan Sizer.zip`, `Insignia Capital
Corp.zip` 1.5GB, `Lenders.zip` 122MB, `Consumer Bridge.zip`, + a 16GB+ server image still
downloading). Decoded the **product-relevant models** and pulled them into
`clients/insignia-capital/data/loan-sizer-trove-2026-07/` (with a README documenting the
decoded logic + golden fixtures). Crown jewel: **`RTL_Loan_Sizer_Fillable.xlsx`** (Noah,
2026-06-23) — the fix&flip sizer, which produces a **structured deal** (proceeds waterfall,
initial-advance-vs-holdback split, prepaid-interest reserve, cash-to-close, Tier×Rehab-Type
buy-box with a cushion per test). Also decoded: Construction Budget (soft/hard cost split,
spent-to-date, %-complete, $/sqft), a PITIA DSCR calculator (PV-based max loan), the Colchis
Scenario Tool (a real investor's rate-stack pricing + eligibility box), and the Track Record
& REO schema (tags ground-up + construction budget per property). `Lenders.zip` = 10 real
investor seller guides / DSCR matrices / quote sheets (A1 fixture set). Consumer Bridge = a
separate HPML/HOEPA product → logged as adjacency, not built. This **reframed UW-1 from "port
a buy-box" to "output the structured deal the way their Excel does — only better,"** and,
with an improvement deep-think (features/UX/integrated-data/additional-analysis), expanded
the plan into **5 phases** (engine models real deals → coherence+trust → best-execution+capital
→ additional-analysis moat → integration): added UW-5 live-solve/goal-seek, UW-6 DSCR
income-approach, UX-2 persona-agnostic coherence (+ cross-cutting **principle 13**), A1+
best-execution rate stack, COND-1 auto-conditions, and AN-1..4 (cost benchmarking, reserve
adequacy, sponsor capacity, calibrate-to-outcomes). UX coherence elevated to the owner's top
priority ("no matter who you are, it makes sense") — spec in [UX-REDESIGN-PLAN.md §13](UX-REDESIGN-PLAN.md).
Next action: **start building UW-1.**

### 2026-07-01 — Damon engagement-reset demo → construction-sizing + coherence + craft plan
Damon saw the restructured 4-section product (Borrower · Deal · Capital · Portfolio) on
the 7/1 reset call; strong buy-in ("you're onto something for the space," "bigger
opportunity here"); ICC trialing it **July + August across both businesses**; **AAPL Nov
9–11 Vegas** is the new GTM-debut forcing function (chosen over NPLA). Three code deep-reads
+ the real 208-loan ICC book + [CALIBRATION-FINDINGS.md](CALIBRATION-FINDINGS.md) converged
on one gap: the sizing engine is **loan-type-agnostic**, but **~27% of the real book is
construction+F&F** and the flagship #10049 E2E loan is Ground-Up Construction sized as
bridge — confirming Damon's "the LPB's wrong because it's a construction loan." Reconciled
the "did we replicate his Solver?" question: we ported the **bridge** constraint ladder to
the product, **validated** the deal-type-aware construction buy-box in `scripts/fidelity-score.ts`
(6.9% mean |Δ|) but **never ported it to the engine**, and **never built** the interest-
reserve/holdback/draw math (Michael Nassirzadeh's local Excel Solver — not in any repo).
Discovered **ICC's real Excel models already sit in the consulting repo** (`clients/insignia-capital/data/`)
— usable as golden fixtures. Also confirmed two coherence breaks (mandate console reads raw
results, #18, still open; two sizing truths) and the "looks AI-developed"/cluttered UX (craft
drift from `design-system.md`, not rearchitecture). Actions: added the **Post-Damon-reset
sequence** (UW-1 construction sizing → UW-2 import models → COH-2 mandate fix → UW-3 DSCR
surfacing → UW-4 deposits → UX-1 craft/de-AI → CAP-1 concentration → CAP-2 pricing overlay →
INT-1 Salesforce); logged the non-product action items (AAPL email, get Michael's Solver
file, Livermore live-deal run); added the teaching-memo design principle; wrote the demo
signals into [IDEAS.md](IDEAS.md) and [UX-REDESIGN-PLAN.md §12](UX-REDESIGN-PLAN.md); memory
`project_damon_engagement_reset_2026-07-01` + `project_damon_excel_model_moat`.

### 2026-06-23 — Reposition to verification + underwriting gateway; reconcile docs
The Underwriting Workbench (deterministic sizing) + AI UW Copilot shipped this
week (commits `9c372c6`, `e9b2bda`), moving the product from "borrower validation"
to a verification + underwriting gateway. A self-serve funnel also shipped
(`6a093b0`, `f50445d`) — reframed as warm-intro landing infrastructure, not cold
acquisition (organic web is not the demand engine for this ICP; capital-provider
endorsement/mandate is). Three parallel analyses (UX audit, strategy/plan-gap,
sourced market stress-test) converged: the build is right and converging; the
docs, pricing, and first-run UX lagged. Actions taken: North Star extended to
include sizing/judgment; status snapshot refreshed (51 migrations); post-NPLA
sequence added (above); [UX-PLAN.md](./UX-PLAN.md) created; pricing repackage
spec'd (add $1,499 underwriting tier + metered fund tier); de-prioritized
BatchData/C2, SEO, reputation stack, autonomous decisioning, CRE-broker GTM.
Market basis: Vendr/Middesk pricing (~$13.75K median KYB ACV), Fannie Mae lender-AI
survey (AI valued for inputs/velocity, not the credit decision), FinCEN private-fund
AML rule (eff. 2028 — tailwind, not deadline), Day-1-Certainty rep-and-warranty
mechanic as the proven endorsement→requirement lever. Full synthesis lives in the
2026-06-23 session; [STRATEGY.md](../STRATEGY.md) carries the durable version.

### 2026-05-05 — Distribution strategy rewrite (kill mass programmatic SEO)
After Wade Intel parent brand context surfaced (parent firm at wadeintel.com, Build Buy Borrow newsletter, 5-Concept Loan Framework on GitHub) and 2026 SEO/GEO research showed organic CTR fell 58-61% on AI-Overview-present queries while AI-search hand-raisers convert 11x better, rescoped the original 300+ programmatic SEO play. KILL: 35 unwritten state guides, 100 county lien guides, 50 contractor license guides, 30 city market pages, 80 unwritten glossary terms. KEEP: 15 state guides + 20 glossary terms + 1 pillar post (now drafts on WP via new `publish-blog/glossary/guides.ts` scripts with FAQPage schema + named-expert byline + last-reviewed dates baked in). New effort split 30/20/15/15/10/10 (capital-provider authority / LinkedIn founder-led / newsletter / GEO retrofit / open framework / NPLA). Full mechanics in [DISTRIBUTION-STRATEGY.md](DISTRIBUTION-STRATEGY.md); programmatic SEO sub-doc in [seo-strategy.md](seo-strategy.md).

### 2026-05-04 — Batch 2 shipped (E1 + A1 + B1)
Three features completing the capital-stickiness + outcome substrate. E1 (deal_outcomes table at 00023) is the highest-leverage 1-day item that wasn't built — unlocks E2/E3/A4/A5 reputation work. A1 (investor PDF parser, 00024) is the NPLA hero feature — fund manager uploads guidelines PDF, Claude extracts criteria with confidence per row, lender accepts/edits before save; full audit trail in `investor_criteria_extractions`. First new Claude consumer post-AI-privacy-bundle — gated by `requireAiEnabled` and PII scrub. B1 (00025) adds borrower-level monitor templates that auto-inherit into new validations for the same borrower; closes G7.1 lock-in evaporation gap. Critical-only severity filter on both validation- and borrower-scope subs. Total 5 days of code; commits 27a31f4 / 3f36429 / 3d2c273.

### 2026-05-03 — AI privacy 2-day bundle shipped (00022)
Per-org `ai_extraction_enabled` toggle (default true; orgs opt OUT) gates every Claude call. PII regex scrub on text doc inputs (xlsx/csv/txt). Token-based depersonalization for AI memo — borrower / entity / guarantor / property / lender / GC / litigation / sanctions match names replaced with [[TOKEN]] placeholders before send; reverse-walked + unredacted before storage; leftover-token scan catches model-side corruption. Audit-pass surfaced 5 real bugs: fail-closed on DB lookup error (was fail-open — would have leaked PII during transient hiccups); schema example contradicting token instruction; settings UI claiming PDF was redacted (it isn't — too important to lose table structure); CRITICAL leak where short-form addresses (`1310 Rosalia Ave`) escaped the full-form map (fixed via `addressVariants` and `entityVariants` aliases); first-write-wins byToken map for canonical unredaction. Codified as cross-cutting principle #12. Commits 4515531 + a277c23.

### 2026-05-02 — Reorganized roadmap around the lender's journey
Old structure was tier-keyed (S/A/B/C/D/E/F/X) — good for prioritization, bad for understanding the product as one continuous flow. UX audit surfaced four disconnects (address paradox, no validate→evaluate→handoff CTAs, borrower-side activity invisible, vestigial standalone tool pages) that were hidden by the tier framing because each disconnect spans tiers. Rewrote primary navigation around eight journey stages (Intake → Run → Investigate → Decide → Route → Hand off → Monitor → Outcome) plus four cross-cutting surfaces (Workspace, Borrower-side, Investor-side, Foundations). Every previous tier feature preserved with its tier code; full backlog table maps tier ↔ stage. Added 11 explicit UX gaps (G1.1 through G8.1) as first-class items with stage placement, fix scope, and batch slot. Recommended sequence is now one ordered list of batches keyed to journey stages, not 7 tiers in parallel. Source: 2026-05-02 UX analysis triggered by user feedback that "things seem disconnected." Replaces the previous tier-organized recommended-sequence section.

### 2026-04-30 — Velocity-aware expansion plan + P0 audit
After shipping Now + the entire code-buildable Pre-NPLA punch list in two days (2026-04-29 → 04-30), ran a four-track audit (code correctness / data model / UX / strategy) to surface bugs from the rapid push and rescope what's reachable pre-NPLA at proven velocity. Outputs: P0 — Corrections section covering 6 critical bugs, 7 data-model issues, and 9 UX gaps; migration `00016_p0_corrections.sql`; Expansion plan with six tiers (S/A/B/C/D/E/F); three universal infra tables (documents, notification_preferences, activity_events). Implementation order spans 8 weeks at 2-day-per-feature pace. Source: 2026-04-30 multi-track audit. Plan reflects [memory: feedback_velocity_sizing](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/feedback_velocity_sizing.md) and [memory: feedback_long_term_architecture](../../../.claude/projects/-Users-zachwade-code-active-pulseclose/memory/feedback_long_term_architecture.md). *(2026-05-02 update: tier organization re-folded into journey-stage organization; original feature catalog preserved in backlog table.)*

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

**App pricing:** $299 / $499 / $799 — set in [src/lib/stripe/server.ts](../src/lib/stripe/server.ts) and [src/app/dashboard/settings/page.tsx](../src/app/dashboard/settings/page.tsx). Stripe is the source of truth. Plus the SQL-only `internal` plan for Test Co (unlimited, no Stripe price ID).

Older strategy docs reference $499 / $1,499 / $2,999 — stale. If pricing changes, update both code locations and add a Decisions Log entry.
