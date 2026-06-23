# Migration Plan — Bridge/CRE Deal Evaluator → PulseClose Underwriting Module

> **Audience:** PulseClose dev. **Author:** Zach (+ Claude). **Date:** 2026-06-22.
> **TL;DR:** A standalone CRE bridge-loan **sizing engine + AI underwriting-judgment layer** was built and validated as a separate app. It maps directly onto two PulseClose modules that are **specced but not built** — the **Underwriting Workbench** (Module 10) and the **AI UW Copilot** (Module 6) risk layer. This doc is the plan to fold that validated code into PulseClose instead of running it standalone. Net: it fills the platform's biggest underwriting gap and reuses ~70% of plumbing PulseClose already has.

---

## 1. Why this exists (the honest current-state map)

We thought some of this was already built. It isn't — here's the precise line (verified against the codebase 6/22):

| Capability | PulseClose today | Source |
|---|---|---|
| Investor **eligibility** box-matching + repricing + counter-offers | ✅ BUILT | `src/lib/evaluate/engine.ts` (`evaluateDealForInvestor`, `findMatchingTier`, `applyAdjusters`, `suggestCounterOffers`) |
| LTV / LTC / LTARV ratios | ✅ BUILT (`calculateRatios`) | same |
| **Loan SIZING** (max loan = MIN across LTV/LTC/ARV/**DSCR**/**debt-yield**; identify the *binding constraint*) | ❌ **GAP** — no DSCR, no debt-yield, no sizing | — |
| **Underwriting JUDGMENT** (assess sponsor / economics / market / structure / exit; deal-killers; severities) | ❌ **GAP** — AI only *narrates* deterministic risk pillars; doesn't judge deal structure/exit/sponsor capacity | `src/lib/ai/analysis.ts` |
| Document ingestion (OM/rent-roll/T-12 → extract → pre-fill) | ✅ BUILT | `src/app/api/ingest/borrower-doc/route.ts` (Claude Sonnet, PDF/xlsx/csv/txt) |
| Sponsor/diligence data (SOS, deeds/track-record, litigation, sanctions, GC) | ✅ BUILT, **real vendor integrations** | Cobalt · Realie · Regrid · ATTOM · CourtListener · OpenSanctions/OFAC · CSLB |
| AVM / market comps / cap-rate data | ❌ not built (specced: HouseCanary/CoreLogic/CoStar) | `modules/ai-underwriting.md` §5–6 |

So the two unbuilt modules are exactly the gap:
- **Underwriting Workbench** (`learnings/bridge-platform/modules/underwriting-workbench.md`, HIGH priority) — replaces the 5 Excel UW models; auto-calc LTV/LTC/LTARV/IRR/**DSCR/debt-yield**, pro-forma, 9 deal-type templates.
- **AI UW Copilot** (`learnings/bridge-platform/modules/ai-underwriting.md`, "highest-impact") — risk-analysis engine with the **exact five categories: property/borrower/market/structural/exit** + severity (Critical/Elevated/Informational).

The standalone evaluator is a working prototype of **both**.

---

## 2. The seed asset (what's already built + validated)

Two locations:

1. **Validated reference engine + AI layer** — `~/code/clients/consulting/shared/products/bridge-deal-evaluator/` (TypeScript, `npm test` green, `tsc` clean):
   - `src/engine/underwrite.ts` — sizes the loan as the MIN across LTV / LTC / Loan-to-ARV / DSCR / debt-yield; returns the **binding constraint** + full metrics + a value-add returns sketch. Reproduces a hand-computed deal (the credibility anchor).
   - `src/ai/facts.ts` — deterministic **facts block**: serializes ONLY engine-computed numbers (the "use ONLY these figures" discipline — same as PulseClose's PII-redacted prompt rigor).
   - `src/ai/judgment.ts` — the AI judgment: Damon's deal-eval framework (sponsor/economics/market/structure/exit + deal-killers) + the Wade Intel 5-concept lens → **structured JSON** (per-dimension severity, kill-flags as data, sizing stance, partner memo). Opus 4.8 + structured outputs.
2. **Productized app (the UX reference)** — `~/code/active/wadeintel-bridge` (Next 16 / React 19 / Tailwind v4; private GH repo `zach-wade/wadeintel-bridge`). The pluggable **`Product` registry** (`src/lib/product.ts` + `registry.ts`) — value-add bridge is product #1; a new deal type = one descriptor file. Plus the constraint-ladder viz, Bear/Base/Bull scenarios, and the `/api/judge` route. **The shell is reference UX; the lib is the real asset.**

> Note on inputs: the standalone app used sliders; the design decision (6/22) is **typed numeric entry** (Excel-like) for primary deal entry, sliders only for the scenario explorer. The Workbench should be typed-numeric (it's replacing Excel).

---

## 3. The fit — what maps where

| Standalone code | PulseClose module | Action |
|---|---|---|
| `engine/underwrite.ts` (constraint-ladder sizing, DSCR/debt-yield) | **Underwriting Workbench** auto-calc core | Port into `src/lib/underwriting/` (new) or extend `src/lib/evaluate/engine.ts`; add the sizing fn the eligibility engine lacks |
| `Product` registry (`product.ts` + descriptors) | Workbench **deal-type templates** (the spec's 9 templates, "same engine, different deal type") | The registry pattern **is** the template system — each template = a descriptor. Start with bridge/MFR (validated from Insignia's 5 Excel models). |
| `ai/judgment.ts` + `ai/facts.ts` | **AI UW Copilot** risk-analysis layer | The five framework dimensions = the spec's five risk categories. Wire it to fire on a built deal, fed by the engine numbers + PulseClose's diligence data. |
| Bear/Base/Bull `scenarios.ts` | Workbench **scenario modeling** (spec §3) + roadmap F2 (rate-shock stress test) | Direct port. |

---

## 4. Reuse vs. build

**Reuse (already in PulseClose — do NOT rebuild):**
- **Ingestion** (`/api/ingest/borrower-doc`) — feed extracted deal numbers straight into the Workbench inputs (kills the typing). Extend the extraction schema to pull NOI / rent roll / purchase price / rehab.
- **Diligence data** — Realie (track-record/deeds), CourtListener (litigation), Cobalt (SOS), sanctions, ATTOM. **Feed these into the AI judgment** so "sponsor: NOT PROVIDED" becomes "sponsor: 4 verified flips per deed records, no litigation." This is the moat the standalone app couldn't touch.
- **AI privacy harness** (`ai_extraction_enabled` toggle, token-based depersonalization) — wrap the judgment call in it.
- **`documents` table, `deal_evaluations`, canonical `borrowers/entities/properties`, override-and-rerun, activity feed** — the judgment + sizing slot into the existing record/rerun lifecycle.
- **Eligibility engine** — pair sizing WITH eligibility: size the max loan → judge it → match it to investors who'll buy it → counter-offer. That's the full loop.

**Build:**
1. **Sizing engine** in `src/lib/underwriting/` — port `underwrite.ts`; unit-test against the same hand-computed fixture.
2. **Extend `DealParams`** (`src/lib/evaluate/engine.ts`) with `current_noi`, `stabilized_noi`, `going_in_cap`, `exit_cap`, `closing_costs`; add `max_dscr` / `min_debt_yield` to investor criteria + leverage tiers (the eligibility engine has no DSCR/debt-yield fields today).
3. **`/api/underwrite`** (or extend `/api/evaluate`) — recompute sizing server-side, persist to a `uw_models` table (see Workbench spec §4 data model: `UWModel` / `UWModelVersion` / `UWScenario` / `RentRollEntry` / `ProFormaYear`).
4. **AI judgment route** — port `judge()`; build the facts block from the deal + the diligence data; return structured findings; persist alongside `ai_memo_versions` (reuse the schema_version pattern).
5. **UI** — `dashboard/evaluate` (or a new `dashboard/underwrite`): typed numeric form per template + constraint-ladder + scenario strip + the judgment panel. Reference UX: `wadeintel-bridge/src/app/page.tsx`.

---

## 5. Sequencing

- **MVP (matches Workbench "MVP, 3-4 wks" but with the engine already written):** Bridge/MFR template sizing + the AI risk read, reusing ingestion + diligence. This alone replaces the most common Excel model AND adds judgment no competitor has.
- **V1:** more templates via the registry (Construction, SFR Ground-Up, the Commercial set), scenario comparison, feed into Deal Summary (Module 9).
- **Later:** AVM/market-data layer (HouseCanary/CoStar) — the one diligence layer PulseClose doesn't have yet; it sharpens the "market" dimension from "NOT PROVIDED" to real comps.

## 6. Open decisions for the dev (+ Zach)
- New `src/lib/underwriting/` module vs. extending `src/lib/evaluate/`? (Rec: new module; keep eligibility and sizing as separate engines that compose.)
- `uw_models` as a first-class table now, or piggyback `deal_evaluations.additional_params` for MVP? (Rec: first-class table per the spec — sizing needs versioning.)
- AI model: judgment is reasoning-heavy → Opus 4.8 (the standalone uses it); extraction/narrative stays Sonnet. Confirm against the spend cap (set; shared key).

## 7. Source pointers
- Validated engine + AI: `~/code/clients/consulting/shared/products/bridge-deal-evaluator/`
- Productized reference UX + `Product` registry: `~/code/active/wadeintel-bridge/` (GH `zach-wade/wadeintel-bridge`)
- Module specs: `~/code/clients/consulting/learnings/bridge-platform/modules/{underwriting-workbench,ai-underwriting,deal-summary-generator}.md`
- Insignia's 5 Excel UW models (the validation source) — referenced in `underwriting-workbench.md` §10.
