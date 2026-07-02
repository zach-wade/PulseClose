# PulseClose — Product Strategy & Future Direction

**Last updated 2026-06-23.** Repositioned: the product crossed from
"borrower validation" to a **verification + underwriting gateway** (see
the new section below). The 2026-05-05 version predated the Underwriting
Workbench + AI UW Copilot, the self-serve funnel, and the post-Elementix
positioning lock. The April 2026 version additionally predated Path B,
AI memo Story Mode v2, sanctions screening, and the AI privacy bundle.

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

## What this product is now (2026-06-23 reposition)

PulseClose has become a **verification + underwriting gateway** for
bridge lenders: it turns a deal package into (1) a verified, tier'd
borrower record, (2) a **sized loan** (deterministic engine —
min across LTV/LTC/LTARV/DSCR/debt-yield, with the binding constraint
named), (3) an **AI deal judgment** (sponsor/economics/market/structure/
exit + deal-killers + a pursue / pursue-with-conditions / pass stance),
(4) a per-investor best-execution routing, and (5) a capital-partner-ready
handoff — orchestrating the lender's existing data and (on the roadmap)
writing the result back to their LOS.

**Three disciplines hold this together:**
- **It's a gateway, not a data vendor.** Per the post-Elementix lock,
  we *orchestrate* the entity-graph/diligence layer (Elementix + First
  American own it; Insignia already pays for it), we don't replicate it.
- **Underwriting is decision *support*, never the decision.** The
  deterministic engine sizes and tiers; the AI narrates and flags. We
  never make the credit call. (Market evidence: lenders want AI for
  trustworthy inputs and velocity, and guard the credit decision as core
  IP. This is also what keeps us out of ECOA/fair-lending territory.)
- **Internal model ≠ buyer language.** "Verification + underwriting
  gateway" is how *we* reason. Buyers respond to the outcome — "catch the
  borrower problem before you fund; size the deal in minutes" — and to
  their *named* LOS, not to "system of intelligence between CRM and LOS."

**Is this a viable product for businesses beyond Insignia? Yes.** The
build is multi-tenant, the wedge is repeatable (capital-provider
endorsement → downstream originators), and the underwriting workbench is
*standalone-capable* ("replace your Excel UW model" is a clean cold pitch
with no Elementix competition). The product converged on the right thing;
the work now is to point the positioning, pricing, and first-run UX at it
(see [docs/UX-PLAN.md](docs/UX-PLAN.md) and the post-NPLA sequence in
[docs/ROADMAP.md](docs/ROADMAP.md)).

## Sharpened by the Damon reset (2026-07-01) — the product space, made precise

The 2026-07-01 engagement-reset demo (Damon saw the restructured 4-section product;
ICC now trialing it July + August across **both** Insignia businesses) clarified what
this actually is, in the buyer's own words. Strip it back and PulseClose is becoming
**the loan desk in a box for the sub-$30M bridge/construction lender** — the exact
segment Damon named: *"too small for the big private credit funds but juicy for guys
like me,"* run by *"guys who spend five minutes and need help structuring,"* on Excel
models one or two people can safely touch. That segment is **too sophisticated for a
generic LOS** (Nexys can't model his condo-conversion — *"this is outside the model"*)
and **too small for institutional infrastructure** (no analyst bench, no CoStar UW shop).

**The moat is Damon's earned modeling expertise, systematized** — so Noah/Nikki can run
a deal without blowing up Solver, and 40 loans/month becomes feasible. See memory
`project_damon_excel_model_moat`. The flow is genuinely three-sided through one canonical
Deal object:
- **Originator/broker** dumps a messy intake → PulseClose **pre-flights** it (borrower
  validation + auto-scrub + "here's what's missing"). Damon: *"broker intakes are pathetic"*
  — cleaning their input is a paid service that *also* improves his deal quality.
- **Lender/underwriter (Damon/Noah)** sizes + structures with the engine that **encodes
  his models**, AI narrating on top — *"a common framework to evaluate the deal,"* never
  replacing the human. The paid core.
- **Capital partner/fund** gets the handoff + **portfolio roll-up + concentration alerts** —
  and *"everyone on their network flows up into the capital partner,"* the distribution
  flywheel, now validated in his own words.

**The strategic unlock: Damon is the entire loop in one relationship.** He's the first
lender-user *and* the first capital-partner (both Insignia businesses trialing July/Aug).
The "standalone UW wedge (replace your Excel model)" is the *cold* front door; capital-
provider endorsement is the *warm* distribution — **Damon collapses both into one proof.**
Get the loop working end-to-end for him and the core hypothesis is validated at n=1, where
n=1 is your design partner *and* your distributor.

**The one gap that blocks all of it (must-fix, not optional):** the sizing engine is
**loan-type-agnostic**, but **~27% of ICC's real 208-loan book is construction + fix&flip**,
and the flagship #10049 loan is Ground-Up Construction we sized as bridge — confirming
Damon's *"the LPB's wrong because it might be a construction loan."* We ported his **bridge**
one-sheet to the product, *validated* the deal-type-aware construction buy-box in a
calibration script (`scripts/fidelity-score.ts`, 6.9% mean |Δ| vs. real approved loans) but
**never ported it to the engine**, and **never built** the interest-reserve/holdback math.
*(2026-07-01 correction: the ground-up "Solver" model is not a mystery file — it's
`Loan Sizer - Construction.xlsx` in the trove; its "Solver" behavior is a circular interest
reserve that solves in closed form.)*
The July/Aug trial fails on his real flow until this is closed. This is UW-1 in the
[Post-Damon-reset sequence](docs/ROADMAP.md#post-damon-reset-sequence-2026-07-01--construction-sizing-coherence-craft),
and the concrete meaning of "replace your Excel UW model."

**Update (2026-07-01) — we now have the actual models.** ICC handed over a large data trove;
the product-relevant sizing models are decoded and in the repo
(`clients/insignia-capital/data/loan-sizer-trove-2026-07/`) — the RTL fix&flip sizer,
construction budget, DSCR/PITIA calculator, a real investor's rate-stack pricing tool
(Colchis), and **10 real investor seller guides / matrices / quote sheets**. This hardens the
"replace your Excel model" wedge two ways: (1) UW-1 now replicates a *structured deal* (a
proceeds waterfall + holdback split + cash-to-close + cushions), not just a max-loan number,
and can be validated **to the penny** against the golden fixtures; (2) best-execution can be
priced across a real 10-investor grid, which is the thing Damon's brokers actually pay for.
The deep-think on going *beyond* the incumbent Excel (live goal-seek instead of manual Solver;
cost-benchmarking, reserve-adequacy, and calibrate-to-realized-outcomes — analysis a
single-laptop spreadsheet can't do) is captured as Phases 3–4 of the ROADMAP sequence.

### The platform stack + the honest read on "replace the Excel" (2026-07-01, Box-informed)

Going through ICC's full operational Box (72GB — models + process docs + pricing artifacts;
[CALIBRATION-FINDINGS #24–#30](docs/CALIBRATION-FINDINGS.md)) both confirmed the wedge and
told us how far it goes.

**Is "replace the Excel" doable?** Yes — for this **bounded family of deterministic, closed-
form** sizing sheets (RTL, ground-up, DSCR, MFR value-add, stabilized takeout), which is not
"all of Excel." ICC's own institutional MFR model sizes with a `MIN(LTV/Debt-Yield/DSCR)`
dropdown — the exact engine we shipped. But the honest framing is **not** "kill Excel": Excel's
moat is open-ended cell flexibility, and the moment it opens for one odd deal it stays open.
The win condition is **replace the Excel for the 80–90% of standard deals to the penny, and be
the system of record even for the 10% that still touch a sheet.** Five commitments make that
real (detailed in [ROADMAP North Star](docs/ROADMAP.md#is-replace-the-excel-actually-doable-stress-test-2026-07-01-c-box-informed)):
radical drill-through transparency (beats Excel's opaque formulas), **parameterize-don't-
hardcode** the model, override-any-computed-cell, Quick-Quote→Full-Model progressive
disclosure, and **export *to* Excel** (their rate-offer letters are `.xlsx`; leaving PulseClose
must never mean leaving empty-handed).

**The platform stack — how the engine travels.** PulseClose is the **decision layer between
origination (CRM/POS) and closing/servicing (LOS/loan system)** — confirmed by ICC's real
pipeline in the Box (LO Workflow: Salesforce → digital app → UW review → pre-approval/"needs
list" → **founders discuss lenders + pricing** → rate-offer letter → into the LOS). The
sequence, owner-set and stress-tested:
1. **Replace the Excel** — the app an underwriter opens instead of a sheet (Layer 1).
2. **Port into the CRM** — Salesforce is confirmed as ICC's system-of-intake and *step 1*;
   the deal is *born* there, pre-LOS, so a Salesforce panel that sizes + validates on the
   opportunity is the right first embed (Layer 2 / INT-1).
3. **API backbone into the LOS** — push the *decided* deal downstream (Nexys for bridge,
   Encompass for resi) for docgen/disclosure/funding (Layer 3 / INT-2).
CRM **before** LOS because our value is a *pre-LOS decision* function; the LOS is downstream.
App→CRM→LOS, never inverted. Everything is **API-first** (ROADMAP principle 14) so all three
layers are clients of one engine.

**What the Box revealed about the buyer.** ICC is **two businesses through one relationship** —
Insignia Capital Corp (bridge/commercial) *and* Insignia Mortgage (consumer/resi), plus a
defunct NPL-servicing venture (BFC/BMSI/BMC) in the principals' history. This is why the trial
is "both businesses." Two durable implications: (a) there is a **real private-lender network**
behind ICC's bridge deals (individual capital providers served via FCI sub-servicing, e.g.
"Nomad One LLC") — the seed roster for Module 1 / the A1 rate stack, alongside the 10 seller
guides in `Lenders.zip`; and (b) Insignia Mortgage's signature **"DREAM Program"** (100%
financing, no-PMI, physician/attorney + census-tract/CRA) is a live consumer-mortgage book —
the concrete anchor for the roadmap's Consumer-Bridge adjacency (logged, not built). The
long-horizon TAM hint: the same principals once priced **distressed whole-loan / NPL pools** at
portfolio scale — the far edge of where a loan-level decision engine could eventually go.

## Where we are today (2026-06-23)

Live at `app.pulseclose.com`, multi-tenant SaaS, Stripe billing, real
vendor data, production-stable through **51 migrations (00001–00051)**.
NPLA Atlantic City (2026-06-22/23) just happened — the forcing function
is now behind us; execution shifts to the post-NPLA sequence.

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
- **Underwriting Workbench (Module 10) + AI UW Copilot (Module 6)** — *shipped 2026-06-22/23.* Deterministic loan sizing (min across LTV/LTC/LTARV/DSCR/debt-yield → binding constraint + value-add returns sketch; 24/24 regression checks vs the hand-computed deal), per-investor best-execution overlay (sizes at each investor's caps + priced rate), and an AI judgment layer (Opus 4.8 — Damon's 5-dimension framework + 5-concept lens + deal-killers + stance) through the full AI privacy harness. `uw_models` table, `/api/underwrite` + `/api/underwrite/[id]/judge`, panel on the evaluate page. AI never sets the loan amount — the deterministic engine does.
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

**Reconciling the self-serve funnel (2026-06-23).** We shipped a public
landing + pricing + 14-day trial + onboarding emails. This is *not* a pivot
to cold/organic acquisition — research reconfirmed organic web won't be the
demand engine for this ICP. It's **warm-intro landing infrastructure**: when
Damon (or a capital partner) refers a lender, that lender needs a frictionless
place to land, self-educate, and trial without a sales call. The funnel makes
referred demand *convertible*; the capital-provider wedge *creates* the demand.
(Turn PostHog on so we actually measure it.)

**The wedge made mechanical (the rep-and-warranty lever).** The proven way an
endorsement becomes a *requirement* is the Day-1-Certainty pattern: a capital
provider relaxes back-end risk (rep & warranty relief, faster funding) only when
the originator runs the approved tool. The path: land Insignia as the **named,
contracted capital-provider reference** → get PulseClose written into their
downstream-originator diligence expectations → build toward "run PulseClose =
borrower-diligence reps satisfied," then repeat with the next fund. FinCEN's
private-fund AML rule (source-of-wealth / PEP / sanctions — already in our stack)
is the compliance tailwind, but it slipped to **Jan 2028** — cite it as prudence,
don't anchor messaging to the date. The product hook this assumes — a
fund-defined standard a validation can be stamped against — **now ships** as the
capital-provider mandate object (Item 4, migration 00044): mandates with gates +
per-validation pass/conditional/fail assessments. The *cross-originator* sharing
of those verdicts (Fund tenant) is the remaining Phase-2 build.

**Competitive validation of the wedge (2026-06-24 deep-research, 22 sources,
claims adversarially verified):** the mandate verdict is **genuine empty space.**
Routing marketplaces (LendingWise, StackSource, Janover) match deals to lenders
by buy-box *fit* — one-directional routing. LOS tools enforce policy *internally*
(Built) or manage a lender's *own* investors (Baseline). **No competitor produces
a per-originator pass/conditional/fail verdict against an external fund's published
mandate.** Diligence (Cobalt SOS, ComplyAdvantage sanctions, Baselayer KYB) and
loan sizing (Blooma) are table-stakes — don't sell on them; sell on the gateway +
mandate layer. **The one unverified link:** research could *not* confirm any fund
actually grants rep-and-warranty relief on a third-party verdict. That's the
load-bearing assumption — a Damon question (now on the PRICING-STRATEGY §5 agenda)
to settle **before** the Phase-2 Fund-tenant build.

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

**Repackaging direction (2026-06-23) — now that underwriting shipped.**
Check-volume tiers price a *lookup utility*; the product now does
underwriting too. Market comps say we're undershooting (closest analog,
KYB/Middesk, runs ~$13.75K median ACV; our top tier is $9.6K ACV). The
decided direction (numbers pending Damon validation — full detail in
[docs/PRICING-STRATEGY.md](docs/PRICING-STRATEGY.md)):

1. **Keep $299 / $499 as validation-led *land* tiers** — where the
   warm-intro trial converts.
2. **Add a ~$1,499 Underwriting tier** — unlocks the workbench + AI
   judgment + handoff artifact. Where the new value (and the
   Excel-replacement switching cost) lives.
3. **Design a metered Fund / capital-provider tier ($1,500-3,000/mo,
   flat base + per-loan usage)** — priced on a different axis (a fund
   mandating PulseClose across a roster buys distribution +
   standardization, not checks). Highest-margin, most aligned with the
   distribution thesis, entirely unvalidated → a Damon conversation.
4. **Move to hybrid base + usage** — meter underwrites/judgment runs
   separately (they carry real Opus marginal cost), matching price to COGS.

Damon questions at NPLA / next sync: does a $1,499 underwriting tier land,
and do funds want a platform fee or to bundle PulseClose into a per-deal cost?

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
