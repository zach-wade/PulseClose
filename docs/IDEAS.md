# Future feature ideas (unscoped)

Things we've talked about but haven't committed to. Not the prioritized
roadmap — that's `ROADMAP.md`. This is the "come back to this when..."
list. Each item should answer the question: *what user feedback or
business condition would unblock this?*

When something here gets prioritized, move it to `ROADMAP.md` with a
specific journey/stage assignment.

---

## Adjacent market: CRE bridge *lenders* (not brokers) — 2026-06-23

The underwriting engine (`src/lib/underwriting`) already underwrites the
sponsor + exit — the same logic CRE bridge lending uses. Market research
(2026-06-23) was clear: CRE debt **brokers** buy deal-*matching* tools and
won't pay for diligence (different buyer, different motion — **skip them**).
But CRE **bridge lenders** ($5M–$30M value-add/recap, sponsor-credential-driven,
fast-close) are a near-zero-GTM-change adjacency for the existing engine.

- **Why:** same underwriting logic; strong 2026 tailwind (CBRE originations
  +112% YoY Q3'25; ~$1T 2026 maturity wall; maturing debt ~4.76% vs ~6.24% new).
- **Scope:** commercial deal-type templates on the existing sizing engine
  (office/retail/industrial, hotel, mixed-use, land — specced in the consulting
  `underwriting-workbench.md`); the judgment layer already generalizes.
- **Unblocks when:** a CRE bridge lender surfaces via the capital-provider
  network, OR the standalone "replace your Excel UW model" wedge gains traction
  and asks for commercial templates.

## Standalone underwriting wedge — "replace your Excel UW model"

`uw_models` has nullable FKs to both `deal_evaluations` and `borrower_validations`
— i.e., you can underwrite a deal *without* a full borrower validation. That
makes the workbench a viable **standalone cold wedge** with a one-sentence pitch,
no Elementix competition, and Insignia's 5 real Excel models as the validation
anchor. May be a *better* opener than borrower validation (which now sits adjacent
to Elementix's data layer).

- **Unblocks when:** we want a cold/standalone entry point distinct from the
  capital-provider wedge — e.g., a lender who won't adopt the full gateway but
  will pay to kill their Excel UW model. Pairs with the $1,499 Underwriting tier.

## Continuous title / collateral monitoring (CRE moat)

Research flagged this as a genuinely *unserved* gap for CRE lenders (background
screening is considered solved; title/lien/collateral drift is not). It fits the
existing monitor runner (`src/lib/monitor/runner.ts`) — same cadence/diff/notify
pattern, new adapter.

- **Unblocks when:** we pursue a CRE-lender adjacency and want a differentiated
  monitoring story, or a customer asks for post-close lien monitoring.

## AVM / market-data layer

The one diligence layer we don't have — turns the AI judgment's
"market: NOT PROVIDED" into real comps + price-trend context. HouseCanary
(best SFR API + comps) for MVP, CoreLogic for commercial/MF, ATTOM for cheap bulk.

- **Why:** sharpens the underwriting judgment's "market" + "exit" dimensions; also
  feeds the specced Module 6 property-intelligence phase.
- **Unblocks when:** a customer's deals hinge on market reads the lender can't
  supply, OR a vendor-cost decision frees ~$500–2,000/mo.

### Land / development enrichment (Damon, ICC call 2026-06-25)

Damon described, for a Texas land/development deal (a 30-50 parcel deal), wanting
the underwriting to auto-pull the local market read instead of an analyst manually
pulling ~100 charts per $2M loan: "if the AI is doing it, no additional time, just
compute." This is a concrete unblock signal for the AVM layer, specifically for the
Underwriting Workbench **Template 9 (Land / Development)**, whose current field list
lacks these. Signals + free sources to wire:

- **Local unemployment rate** -> BLS LAUS (county/MSA); sibling BLS QCEW already specced.
- **Median income** -> Census ACS.
- **Housing permits + housing starts** coming online next year -> Census Building
  Permits Survey + New Residential Construction (starts).
- **Borrower's share of the area pipeline** -> derived metric (borrower units / area
  pipeline; a calc on top of permits/starts, no vendor supplies it directly).
- **Absorption rate** of new units -> derived from starts/completions vs sales/occupancy;
  CoStar/HouseCanary supply MF absorption; for-sale SFR absorption is a calc.

Note: the AI UW Copilot spec already lists the matching **market risk flags** ("oversupply:
new permits outpacing absorption," "single-employer-town concentration risk") and the
batch sources (Census permits, BLS employment) - so this is mostly "wire the specced
sources into Template 9," not net-new design. Insignia already has CoStar access.

**Build-now assessment (2026-06-25):** The usual cost gate doesn't apply — BLS/Census
APIs are FREE. But this is the *higher-effort* of the two new ideas: per-deal geo
lookups + the two **derived** metrics (absorption rate, borrower pipeline share) are
real work, and it only fires on land/Template-9 deals. **Recommend: defer behind the
macro overlay** (below) — build it when land deal-flow actually shows up, since
applicability is narrow. Promote to ROADMAP after the macro overlay ships.

## Macro / recession-indicator overlay (Damon, ICC call 2026-06-25) — NEW, no prior home

Distinct from the per-deal AVM read above: a **firm/portfolio-level macro overlay** that
feeds the "market" and "exit" dimensions of the Module 6 judgment AND the investor
memo (Module 9 / Deal Summary), so models and LOIs are defensible. Damon's framing:
"build our own market intelligence" in the style of bond-fund managers - he named
**Bill Gross and Jeff Gundlach** (and referenced **Michael Burry** and **Aswath
Damodaran**) - "what are the 3 things they look for" on rates up/down, recession,
housing oversupply. The point is to put a defensible macro read into investor memos
without manual chart-pulling.

- **Likely feed (inference - Damon named people, not data series):** FRED (St. Louis
  Fed) free macro - yield curve / 10Y-2Y spread, high-yield credit spreads (OAS),
  Fed funds path, CPI/PCE, unemployment trend, Sahm Rule recession signal.
- **Where it lives:** a macro layer feeding Module 6's market/exit dimensions + the
  partner/investor memo output; NOT the per-deal property AVM.
- **Methodology voice already in the Wade Intel orbit:** the DCF tool reconciles to a
  Damodaran workbook; the Burry methodology pivot landed with Damon on the 5/13
  advisory - so the vocabulary exists, only the automated macro feed is new.
- **Unblocks when:** a deal's defensibility (investor memo) hinges on a macro read -
  the 6/25 ICC call is the first concrete instance.

**SHIPPED v1 (2026-06-25):** `src/lib/macro/fred.ts` — 7 free FRED series
(T10Y2Y yield curve, BAMLH0A0HYM2 HY OAS, DFF fed funds, CPIAUCSL→YoY, UNRATE
trend, SAHMREALTIME, MSACSR housing supply) → DETERMINISTIC per-indicator
signal + a regime label (Supportive→Mid-cycle→Late-cycle→Contractionary), built
from a transparent risk score (never AI-set — same spine: AI narrates, doesn't
set the regime). Threaded into `buildFactsBlock` so Module 6's market/exit
dimensions + the partner memo cite the regime explicitly. Best-effort: no
`FRED_API_KEY` or any fetch error → judgment runs without it (never fatal); each
series degrades independently. **Needs the free FRED key** (instant signup at
fred.stlouisfed.org/docs/api/api_key.html → set `FRED_API_KEY`). Verified:
null-path + format via `npx tsx scripts/verify-macro.ts`; build + lint clean.
**Follow-ups (noted, not blocking):** (a) surface the deterministic indicator
table as a drill-down card in the memo UI (Noah's "show the inputs, don't just
characterize" — the AI memo characterizes, the indicator table is the evidence);
(b) persist a daily macro snapshot instead of live-fetching per judge call.

## Capital-provider "mandate" object (the wedge's missing product surface)

The distribution thesis assumes a fund can *mandate* PulseClose to its
originators — but there's no product object for it. A thin version: a fund/investor
defines a validation/underwriting standard (fed by the A1 PDF parser), and a
lender's validation gets stamped "meets [Fund]'s standard." Turns A1 from an
island into a loop and gives Damon/Insignia something concrete to *hand* a lender.
Build toward the rep-and-warranty-relief mechanic ("run PulseClose = diligence
reps satisfied"). *(Promoted to the post-NPLA sequence in ROADMAP.md — kept here
for the fuller rationale.)*

- **Unblocks when:** a capital provider commits to pushing PulseClose downstream
  (post-NPLA signal).

---

## APN / tax-assessor verification (canonical ground truth)

Realie returns an APN (Assessor Parcel Number) on every property. The
county tax assessor's online lookup is the canonical ground truth for
ownership at any moment — public, free, slow, and per-county. Cross-
checking the assessor record against the deed owner would close the
last identity-match leak the verify-tray confidence score can't catch
on its own: a deed in escrow / chain-of-title gap where Realie's owner
field is stale.

- **Why:** ground-truth identity match no other vendor can supply.
- **Scope:** per-county HTML / API adapters, plus an orchestration
  layer that picks the right adapter by parcel state + county FIPS.
  CA alone is 58 counties; nationwide is ~3,100.
- **Unblocks when:** a verify-tray false-promote slips through (i.e.,
  the confidence score said high but the lender rejected anyway) AND
  the deed's APN points to a county whose assessor publishes records
  via a usable interface. Start with Santa Clara + LA + Orange (the
  three counties with the highest Bridge ICP volume) and grow from
  there. Until then, the verify-tray confidence score + lender review
  is the precision layer.

---

## Drill-down + matcher follow-ups (Noah review, 2026-05-08)

Residual gaps after the post-review fixes (Realie fallback filter,
check-failed badge state, contributing_data inline render). Each item
came out of either the audit transcript or an incomplete fix; flagged
here so they don't get forgotten before the next capital-partner demo.

**Matcher / data integrity**

- **Realie fallback usage telemetry.** Fallback now token-filters, but
  it still fires silently when an entity-name search returns zero.
  Common cause is filing-format drift (comma vs none, "LLC" suffix
  variants) that we should fix at the source rather than rely on the
  fallback. Add a server-side log/metric every time the fallback fires
  + the entity-name input that produced zero hits, so we can see how
  often we're degrading to personal-name search.
  *Unblocks when:* we have >50 production validations and want to
  audit identity-match precision empirically.
- **ATTOM identity match audit.** Same class of bug as Realie was —
  haven't reviewed how ATTOM enrichment attributes deeds to a borrower.
  Worth a focused read of `src/lib/adapters/attom.ts` + the deed-chain
  matcher in `src/lib/track-record/verify-core.ts` for the same
  prefix-match-without-token-filter pattern.
  *Unblocks when:* a Noah-class reviewer flags a false-positive deed.
- **Display-side ownership filter.** `/api/validations/[id]/route.ts`
  fetches `track_record_entries` filtered only by `validation_id`. If
  a row was attributed to a shared/merged entity in an earlier
  validation, no display-side guard catches misattribution. Add
  `.eq('owning_borrower_id', borrowerId)` as belt-and-suspenders.
  *Unblocks when:* first cross-borrower entity-merge happens in prod
  via `merge_records_atomic`.

**Drill-down completeness (audit gaps not yet shipped)**

- **Lender names in concentration evidence.** `lender_concentration`
  factor now renders lender_id + count, but IDs are opaque. Either
  enrich `contributing_data` server-side with `lender_name` at compute
  time, or render-side join via the `lenders` table.
  *Unblocks when:* user complains "what lender is this?" — fast fix
  once asked.
- **Property row → Realie source link.** Unified property table
  expansion shows transfers as plain text. Each transfer should link
  to the deed (Realie response includes recordingDate + docType but
  not a permalink — may require pulling Realie's web URL pattern or
  storing the response key). Closes the "verify the chain" loop.
  *Unblocks when:* a capital partner asks "where did this deed come
  from" mid-demo.
- **Claimed-only rows expand-and-edit.** Borrower-claimed properties
  that didn't match public records are non-clickable. They should
  expand to show what was claimed + a "promote to track record" or
  "reject claim" affordance. Today the lender has no path to act on
  unmatched claims.
  *Unblocks when:* first lender flow surfaces a borrower claim that
  didn't match deed records and the lender wants to keep the claim.
- **AI memo factor citations.** Memo pillar assessments are free-form
  prose. Should anchor-link to the corresponding pillar card AND cite
  which deterministic factor(s) drove the rating phrase. The V2 risk
  rows already link via "Why this rating? →" — extend that pattern
  upward to the pillar narratives.
  *Unblocks when:* a reviewer says "I don't trust this paragraph" —
  i.e. once we have evidence the memo undermines instead of helps.

**Risk / failure modes to monitor**

- **Litigation drill-down bug Noah hit live.** Static read of
  `litigation-cards.tsx` shows the click-through path is intact, so
  the bug Noah saw 2026-05-07 may be stale or in a different surface
  (handoff PDF? share view?). Need a live-test pass before NPLA — try
  every drill-down click on the Truong validation and the share view.
  *Unblocks when:* always — this is a verification task, not a build.
- **"Minor" labels on non-pillar surfaces.** Pillar cards now
  distinguish CHECK FAILED from a minor finding. The same opaque
  language likely lives on the unified property table provenance
  badges, the monitor card, and the activity feed. Sweep for
  generic-severity badges that don't communicate WHAT was measured.
  *Unblocks when:* schedule a polish pass before NPLA.
- **Realie state filter assumes borrower has a state.** Adapter
  early-returns `[]` when `req.state` is missing, but the orchestrator
  may not pass it for every borrower (test-mode validations, manual
  property-only flows). Worth confirming every code path that calls
  `searchPropertiesRealie` resolves a state first.
  *Unblocks when:* low-priority, but a quick grep would close the
  loop.

---

## Demo / NPLA pitch strengtheners

These specifically improve the story for capital-provider endorsement
and the conference demo. Pick from this list if NPLA is approaching
and there's slack capacity.

- **Pricing output, not just pass/fail.** Investor evaluator returns
  "passes Bridgeline at 11.25% / 2 pts / 75% LTV / $487k max" instead
  of just a green checkmark. Schema already has `rate_adjusters` and
  `leverage_matrix`; this is surfacing them at the deal level.
  *Unblocks when:* a lender asks "what rate would my investor quote?"
- **Mobile-optimized share link.** Native camera capture
  (`<input capture="environment">`), larger touch targets, iOS file
  picker tested. Lenders demo the share-link to borrowers on phones.
  *Unblocks when:* a borrower complains about the upload UX OR a
  lender asks "can I send this to a borrower's phone."
- **Counterfactual slider.** "What if FICO were 720?" — drag slider,
  watch tier rebuild live. Recompute machinery already exists; this
  is a UI layer. Demo gold; secondary underwriting use.
  *Unblocks when:* prepping a live demo where audience interaction
  matters.
- **Wade Intel branding on outputs.** Handoff PDF + share page surface
  "Validated using the Wade Intel 5-Concept Loan Framework" with a
  link to wadeintel.com / the open framework repo. The methodology
  IS the moat per STRATEGY.md; product currently hides it.
  *Unblocks when:* Wade Intel marketing site has the framework page
  in a stable URL we can deep-link to.
- **Slack `/pulseclose` slash command.** Beyond outbound webhooks —
  a true slash command. `/pulseclose check Truong` returns a card
  inline. Teams that live in Slack adopt 10× faster.
  *Unblocks when:* a target lender is a heavy Slack shop AND we have
  real production traffic to justify the OAuth setup.

---

## Multi-user / team workflow

Things the single-underwriter ICP doesn't need yet. First multi-user
lender that adopts will surface most of these.

- **Multi-underwriter workflow.** Underwriter A does the validation,
  Underwriter B signs off. "Approved by..." trail. Assignment.
  *Unblocks when:* first lender with >1 active user joins.
- **Comments / annotations on validations.** Per-validation comment
  thread alongside the existing `data_edits` audit log. Different
  semantics: edits change data, comments are just discussion.
  *Unblocks when:* multi-underwriter is in scope.
- **Underwriter QA / second-set-of-eyes flow.** Required-reviewer
  workflow on HIGH-risk validations.
  *Unblocks when:* a lender's compliance team asks for it.
- **Token-claim concurrency control on AI memo regen.** Today's
  `regenerateAiMemoForValidation` is last-write-wins. With Claude
  ~30s latency, that effectively means "last-started wins" for a
  single user. With multiple concurrent users editing the same
  validation, two simultaneous regens could race and the wrong one's
  output could win. Fix when it bites: stamp a unique token at start,
  write only if token still matches at end (replaces the inverted
  optimistic-lock removed in `c9d1836`-ish).
  *Unblocks when:* multi-underwriter editing surfaces a wrong-memo
  bug in the wild.
- **Cross-underwriter notes on borrowers.** Lender's running notes
  accumulate across validations of the same borrower. ("This guy is
  always late on payoff but always pays.") `borrower_signals` could
  carry these but UI surface needs designing.
  *Unblocks when:* a lender works the same borrower across many
  deals and asks "where do I keep notes."

---

## Property model consolidation

- **Phase 2: collapse `verified_flips` table into `track_record_entries`.**
  Phase 1 (shipped in `<commit>`) merged the two tables into one
  `UnifiedPropertyTable` UI component, but `verified_flips` and
  `track_record_entries` still exist as separate DB tables. Each
  unified row dispatches to whichever underlying table backs it.
  Phase 2 unifies the data layer:
  1. Add new source values to `track_record_entries.source`:
     `borrower_claimed_verified` (deed-matched) and
     `borrower_claimed_unmatched` (no deed match — yellow-flag rows).
  2. Migration: insert one `track_record_entries` row per existing
     `verified_flips` row (de-duping by `property_id` against
     existing entries — for matches, merge fields and drop the flip
     row; for non-matches, create a new track-record row with the
     `_unmatched` source).
  3. Refactor share-link verify endpoint
     ([src/app/api/share/[token]/verify/route.ts](../src/app/api/share/[token]/verify/route.ts))
     to write into `track_record_entries` instead of `verified_flips`.
  4. Drop `verified_flips` table.
  5. Remove the `mergeRows` function from
     [src/components/dashboard/unified-property-table.tsx](../src/components/dashboard/unified-property-table.tsx)
     and just read from one source.
  6. Once collapsed, `claimed_only` rows become editable through the
     existing `/api/track-record/[id]` PATCH path (Phase 1 disables
     edit on those because they have no underlying track-record id).
  *Unblocks when:* the unified Phase 1 UI proves the model works in
  practice (~1-2 weeks of usage). If users push back on the
  consolidation, Phase 2 stays deferred and Phase 1 can be reverted
  by swapping the page back to TrackRecordTable + VerifiedTrackRecord.
  *Migration risk:* moderate. The borrower-side share-link write path
  flows into `verified_flips` today; switching it to
  `track_record_entries` requires careful field mapping (especially
  match_status → source). The factor engine ([src/lib/risk/factors.ts](../src/lib/risk/factors.ts))
  reads from track_record_entries, so post-migration the engine sees
  borrower-claimed properties too — desired side-effect but should
  be validated against expected tier outcomes for known borrowers.

## Lender customization

Tunables that today are hard-coded.

- **Risk-factor weight customization per org.** "Treat
  `dismissed_litigation` as moderate not informational because we're
  conservative." Today the catalog + weights live in
  `src/lib/risk/factors.ts`.
  *Unblocks when:* second lender pushes back on a default tier.
- **Lender-customizable share-link branding.** White-label share
  page: logo + brand colors + "Validation requested by [Lender
  Name]." Today the share page is PulseClose-branded.
  *Unblocks when:* a lender asks (most do, eventually).
- **Time-series tier tracking visualization.** Show how the tier has
  changed over time as monitor cron updates the underlying data.
  *Unblocks when:* a borrower has accumulated >5 monitor runs and
  the data is interesting.

---

## Workflow / scale

Things that matter when usage grows beyond one-deal-at-a-time.

- **Batch import / bulk validation.** "Validate these 50 borrowers
  from a CSV overnight." Real workflow for portfolio reviews and
  lender takeovers.
  *Unblocks when:* a lender asks to validate a portfolio they're
  acquiring OR signs up with a backlog.
- **Saved searches / smart filters.** "Show me deals where tier
  changed in last 30 days AND outcome is unset." Today the
  validations list is a flat sort.
  *Unblocks when:* a user has >50 validations and complains about
  finding things.
- **Search across validations.** Unified search bar. Cross-validation
  + cross-borrower + cross-property name match.
  *Unblocks when:* same trigger as saved searches.
- **Batch handoff.** "Generate one packet for all 5 deals routed to
  Investor X this week."
  *Unblocks when:* a lender routes >3 deals to the same investor in
  a week.
- **Outbound webhooks for LOS integration.** True public webhook
  subscription system (vs. the per-user notification webhooks today).
  Lender's LOS subscribes to `validation.completed`, pulls into their
  pipeline.
  *Unblocks when:* a lender names their LOS and asks to integrate.

---

## Borrower-facing improvements

The share-link is the borrower's only touchpoint today.

- **Borrower-side document checklist.** When a lender requests a
  validation, the borrower lands on the share page and sees "you
  need to upload: bank statement, photos of properties X/Y/Z, etc."
  Guided onboarding instead of free-form.
  *Unblocks when:* a borrower abandons the share-link mid-flow OR a
  lender asks for it.
- **Borrower-facing dashboard.** Borrower logs in (vs. just share
  link) and sees their full history with multiple lenders, their
  public profile, can publish/unpublish. Schema (`investor_users`)
  already has the auth pattern that could be adapted for borrowers.
  *Unblocks when:* the public profile (E4 full) gets renderer UI AND
  enough borrowers are repeat-using share links to want a home base.
- **Public-profile QR code.** Borrower hands out a QR at networking
  events that links to their `borrower_public_profile`.
  *Unblocks when:* a borrower asks for it (low likelihood but cheap).

---

## Distribution / growth

Outside the product surface but adjacent.

- **Pricing calculator embed.** Embeddable widget brokers can put on
  their marketing site for pre-qualification.
  *Unblocks when:* Wade Intel or PulseClose has a content/SEO play
  that needs interactive surfaces.
- **AI-generated investor outreach email.** "Email Bridgeline with
  this deal summary." Pre-fills using the validation memo.
  *Unblocks when:* a lender asks "can you draft this for me."
- **Audit / compliance export.** "Export every action taken on
  validations in Q2 for our regulator." Beyond the per-validation
  audit log.
  *Unblocks when:* a regulated lender asks (most do, eventually).

---

## Process notes

- This file grows. Keep entries terse — one paragraph max.
- "Unblocks when" is the most important field. If you can't write
  one, the idea isn't ready to be captured here either; have the
  conversation first, then write down the *condition*.
- Promote items to `ROADMAP.md` when the unblock condition fires
  AND there's actual buildable scope.
- Delete items that turn out to be wrong assumptions.
