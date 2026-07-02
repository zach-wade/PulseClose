# PulseClose — End-to-End UX Redesign Plan

**Persona-driven coherence pass for the whole product.** Written 2026-06-23,
grounded in: [CUSTOMER-SCENARIOS.md](./CUSTOMER-SCENARIOS.md) (personas), the
live public funnel (landing + pricing), and a source-level read of the
analyzer / detail / evaluate components.

> **Supersedes** the tactical [UX-PLAN.md](./UX-PLAN.md) for forward planning
> (its §4 quick-wins shipped 2026-06-23). This plan is structural and
> persona-shaped, and it makes the **Fund a first-class citizen** (the chosen
> central direction).

---

## 0. The five principles

1. **Job-shaped, not data-shaped.** Today's IA exposes the *data model*
   (Validations, Evaluate, Investors). Personas don't think in those nouns. The
   IA should expose the *jobs*: vet a borrower, size/route a deal, set a
   standard, watch the book.
2. **One canonical Deal object.** The eligibility form and the underwriting
   workbench are two engines reading two copies of the same inputs. Collapse to
   **one Deal** that both read; editing a term invalidates downstream results
   explicitly (no silent stale state).
3. **Progressive disclosure by persona.** The Spreadsheet Refugee never sees a
   DSCR input; the Underwriter gets the full workbench. Same page, different
   depth, revealed on demand.
4. **The stamp is the point.** For the wedge personas, "✓ meets [Fund]'s
   standard" is the headline outcome — promote it, don't bury it.
5. **AI stays a labeled, gated step.** Never auto-runs, always says who/what,
   never sets the number. (Already true; keep it.)

---

## 1. Information architecture — the job-shaped restructure

**Today (data-shaped):** Dashboard · Validations · Evaluate · Investors · Usage.

**Proposed (job-shaped), lender tenant:**

| Nav | Job | Replaces / absorbs |
|---|---|---|
| **Borrowers** | "Who am I lending to?" — the durable spine; validations + deals + outcomes + monitoring hang off a borrower | Validations list (becomes a borrower's history) |
| **Deals** | "Size + route this loan" — the analyzer lives here, one Deal at a time | Evaluate (form) + workbench |
| **Capital** | "Who funds these + what standards must I meet?" | Investors + Mandates (assessment view) |
| **Book** | "Watch the live loans" | Monitoring + outcomes roll-up |
| Settings | Org / team / API / **Webhooks** / billing | (+ the missing Webhooks UI) |

**Borrower spine (UX-PLAN §2, now committed):** dedup on `primary_borrower_id`;
a Borrower detail page composes their validations, deals, mandate stamps,
outcomes, monitoring into one coherent view. This is the single highest-leverage
legibility fix — it makes the product tell its own story.

*Interim already shipped:* recent-evaluations card on validation detail,
next-step strip, sidebar rename. Those carry until the full restructure.

---

## 2. The Deal analyzer redesign  *(the centerpiece — the acute pain)*

### The problem, concretely
On `/dashboard/evaluate` today a user meets, top to bottom:
- ~14 deal fields (loan type, property type, state, purchase price, loan amount,
  ARV, rehab, FICO, experience, occupancy, loan purpose, rural, address, name)
- → eligibility results
- → scenario comparison
- → the **UnderwritingPanel** with its *own* ~12 sizing inputs (NOI, stabilized
  NOI, going-in cap, exit cap, rate, amort, closing costs, coverage basis, max
  LTV/LTC/LTARV, min DSCR, min debt-yield)
- → 4 AI-context boxes (sponsor, market, business plan, notes)

≈ **30 inputs across two engines that don't share state.** Editing the loan
amount up top silently stales the workbench. It reads as a wall, and a
verify-only lender sees underwriting inputs they'll never use.

### The redesign: a Deal stepper over one Deal object

A **Deal** belongs to a borrower and moves through steps; each step shows only
what it needs, and every step reads the *same* Deal state.

```
 ┌─ Deal: [Borrower] · $X bridge · CA ──────────────────────────────┐
 │  ①  Terms      ②  Eligibility   ③  Sizing      ④  Judgment   ⑤ Hand off │
 │  ●━━━━━━━━━━━━━●━━━━━━━━━━━━━━━○ (optional) ─ ○ (optional) ─ ○            │
 └──────────────────────────────────────────────────────────────────┘
```

- **① Terms** — the shared deal params, entered **once**. Pre-filled from the
  borrower's validation (name, state, experience). This is the only place these
  live; ② and ③ read them.
- **② Eligibility** — "Which investors accept this?" Runs the evaluate engine on
  the Terms. Output: the per-investor pass/conditional/fail + best-execution
  list (already good). **No new inputs.** A verify-only lender can stop here.
- **③ Sizing** *(opt-in)* — "How big, and what binds it?" *Only here* do the
  income/value/rate inputs appear (NOI, caps, rate, amort). House constraints
  **default from the matched investor tiers** in ② (don't re-ask LTV/LTC/DSCR
  unless the lender overrides). Output: the constraint ladder + binding
  constraint + per-investor sizing.
- **④ Judgment** *(opt-in)* — the AI copilot. The 4 context boxes stay collapsed
  until "Run AI judgment" is pressed. One clear gated action.
- **⑤ Hand off** — assemble the artifact (sizing + judgment + mandate stamp).

**What this kills:**
- *Duplication* — Terms entered once; ② and ③ share them.
- *Stale state* — changing a Term marks ②/③ "stale — re-run," never silently
  wrong.
- *Bloat for the wrong persona* — ③/④ are opt-in; verify-only users never see
  sizing inputs.
- *The "two engines" feel* — one Deal, one progress spine.

**Data:** the Deal maps to the existing `deal_evaluations` (② ) + `uw_models`
(③ ④ ) rows we already link via `validation_id` — the UI just stops treating
them as separate surfaces. No new tables; this is a front-end + state
consolidation with a thin "Deal" view model.

**Sizing input reduction:** going-in cap and rate can default from
property-type/loan-type norms (editable); closing costs default to a %; coverage
basis defaults to current. The lender confirms 3–4 numbers (NOI, ARV/stabilized,
rate), not 12.

---

## 3. Borrower / validation detail redesign

The ~16-section, ~650-line scroll (UX-PLAN §3.1) → progressive disclosure:

- **Top:** borrower identity + risk tier + **the next-step strip** (shipped) +
  **mandate stamps promoted here** ("✓ meets Insignia's standard") — the
  Downstream Adopter's headline outcome, currently buried.
- **Tabs / accordion:** `Summary` (+ AI memo, expanded) · `Evidence` (the 5
  pillars + property table + verify tray) · `Deal` (analyzer entry) · `Hand off`
  · `Book` (monitor + outcome). Summary expanded; the rest collapsed.
- Mobile falls out of this for free (collapsed sections instead of a wide scroll).

---

## 4. The Fund as a first-class citizen  *(central direction)*

The wedge persona has no product home. Make the Fund a real tenant.

### 4.1 Fund tenant + role
- An org `type` of `fund` (or a `fund` role). A fund tenant's home is **not** the
  lender dashboard — it's a **Mandate console**.
- The fund **authors mandates directly** (reuse `investor_mandates`, owned by the
  fund tenant rather than nested inside a lender's investor row). The A1 PDF
  parser feeds the gates.

### 4.2 The cross-originator mandate view  *(the wedge mechanic)*
- An originator **joins a fund's program** (a consent link). From then on, their
  completed validations are auto-assessed against that fund's mandate (the engine
  already does this) and the **verdict + deal metadata** are shared back to the
  fund — **not** the raw diligence dataset.
- The fund sees, across all originators in its program: *which deals meet the
  standard, which fail and why, throughput, exception rate.*
- **Privacy boundary (must hold):** share the **assessment verdict + minimal deal
  facts**, not the borrower's full diligence record, unless the originator
  explicitly forwards the handoff. This keeps it "sharing a stamp," not
  "replicating an entity graph" (honors the post-Elementix constraint).

### 4.3 Originator-side surface
- A **Programs** area (under "Capital"): "You're in Insignia's program. Your
  deals are assessed against their standard. 7 of your last 10 met it." Joining a
  program is the moment the wedge converts a referred originator.

### 4.4 What this arms
This closes the wedge loop's missing middle: the fund can **operate** the loop it
drives — set the standard once, push it to a roster, see compliance — and the
originator gets a concrete reason to be on PulseClose (capital access). It's the
product encoding of capital-provider endorsement → rep-and-warranty relief.

*Scope honesty:* this is the most ambitious piece (multi-tenant sharing + consent
model + a second tenant UX). Sequence it after the lender-flow redesign (§2–3),
but design the data/consent model now so the mandate work we shipped extends
cleanly into it.

---

## 5. Pricing + packaging, re-shaped to the modules

Move off the single check-volume axis to **module-shaped tiers** (matches
[PRICING-STRATEGY.md](./PRICING-STRATEGY.md) §0):

| Tier | Persona | Anchored on | Axis |
|---|---|---|---|
| Starter / Pro | Spreadsheet Refugee | ① Verify (+ light ③) | per-seat, check volume |
| **Underwriting $1,499** | Underwriter | + ② Underwrite | per-seat premium (additive — decided) |
| **Fund (metered)** | Mandator | ③ Distribute / mandate console | flat base + per-loan |

- Public pricing page: add the Underwriting card (additive, per the decision) and
  a **"For capital providers"** path for the Fund tier (today's vestigial
  "fund-level discussions" becomes a real surface).
- Landing page: add a **Mandator-facing strip** ("Fund a roster of originators?
  Standardize their diligence.") — the wedge persona is currently invisible in
  positioning.
- *Numbers stay Damon-gated;* this is the structure, not the final prices.

---

## 6. Per-persona: does it flow now? (before → after)

| Persona | Before | After |
|---|---|---|
| Spreadsheet Refugee | Sees a 30-input analyzer wall incl. DSCR | Stops at ② Eligibility; never sees sizing inputs |
| Underwriter | Two engines, stale state, 30 scattered inputs | One Deal stepper, shared Terms, ~4 sizing numbers |
| Downstream Adopter | Mandate stamp buried in a 16-section scroll | Stamp promoted to top of borrower detail; Programs surface |
| Mandator (fund) | No product home; "investor" row in a lender's account | Fund tenant + mandate console + cross-originator view + tier |

---

## 7. Sequencing (build order, with sizing)

**Phase 1 — Lender flow coherence (highest leverage, no multi-tenancy):**
1. **Deal analyzer stepper** over one Deal object (§2). *~3–4 days.* The acute fix.
2. **Validation/borrower detail tabs + promoted mandate stamp** (§3). *~1.5 days.*
3. **Borrower-spine IA** (§1: Borrowers/Deals/Capital/Book nav + borrower detail).
   *~2–3 days.*
4. Small completion: **Settings → Webhooks UI**, empty/error states, "what's next"
   on handoff. *~1–1.5 days.*

**Phase 2 — Arm the wedge (Fund as first-class):**
5. **Fund tenant + mandate console** (§4.1). *~3–4 days.*
6. **Program consent link + cross-originator view** (§4.2–4.3), privacy boundary
   enforced. *~4–5 days.*

**Phase 3 — Packaging (Damon-gated):**
7. Underwriting + Fund pricing tiers + landing/pricing repositioning (§5).
   *~1–2 days code, after Damon validates numbers.*

**Recommended first build:** Phase 1 item 1 (the analyzer stepper) — it's the
pain you named, it's self-contained, and it establishes the "one Deal" model the
rest builds on.

---

## 8. Open questions to resolve before Phase 2

- **⭐ GATING: will a fund actually grant rep-and-warranty relief (or faster
  funding / lighter re-diligence) on a PulseClose verdict?** 2026-06-24
  competitive research confirmed the cross-originator mandate verdict is empty
  space (no competitor does it) but could *not* confirm any fund leans on a
  third-party verdict. If the answer is no, the entire Phase-2 Fund build is
  low-value — it degrades to "nice routing." **Settle with Damon before building
  §4.** (Now on the PRICING-STRATEGY §5 Damon agenda.)
- Fund tenant: separate org type vs. a role on an existing org? (Affects auth +
  RLS.)
- Program consent: per-originator opt-in to a named fund, or fund-initiated
  invite? (Affects the sharing model.)
- Exactly what deal metadata crosses the tenant boundary with a verdict (the
  privacy line). Draft this with Damon — it's also a trust-selling point.

---

## 9. Live-review findings (2026-06-23)

Drove the **live prod app** as three seeded test users (one per persona) and
screenshotted every key screen. Repeatable harness lives in `scripts/`:
`create-test-user.ts` → `seed-persona-data.ts` (stable IDs) → `drive-persona.ts`.
Screens in `ux-review/<persona>/`. The plan above holds; this section records
what the pixels confirmed, what to adjust, and bugs found en route.

**Test orgs (prod):** Underwriter `uw@test.pulseclose.com` (Test Bridge Capital,
2 validations + investors + eval + uw_model + mandate) · Spreadsheet Refugee
`solo@test.pulseclose.com` (1 validation, no investors) · Mandator
`fund@test.pulseclose.com` (Keystone Capital Partners, empty). Password
`Test1234!`. Re-seed any time; IDs are stable (`1111…`/`2222…`/`3333…`).

### Confirmed against real pixels
- **§2 — the two-engine wall is exactly as described.** `/dashboard/evaluate`
  renders the "Deal scenario" form (~13 inputs) and then, stacked directly below
  on the *same* page, "Underwriting Workbench — size & judge" with its own NOI /
  caps / rate / amort / coverage-basis / house-constraint inputs. A verify-only
  lender (and the Spreadsheet Refugee) meets the full sizing wall whether or not
  they want it. The stepper redesign is the right call.
- **§3 — the mandate stamp is genuinely buried.** On the validation detail page,
  "Capital-provider mandates" renders as the **11th of 13 stacked sections**
  (order: header → 4 stat cards → AI Risk Assessment → Why this rating? → Entity
  → Track Record → Borrower address verification → Public records → Sanctions →
  GC → **Mandates** → Recent evaluations → Investor handoff). For the wedge
  feature this is the headline output sitting near the bottom. Promote it to the
  top, as §3 says.
- **§4 — the Fund has no home, and it's worse than "an investor row."** The Fund
  tenant's dashboard serves the **originator onboarding flow** verbatim —
  "Start here: ① Validate the borrower ② Evaluate against your investors ③ Hand
  off to capital" — which is the opposite of a fund's job. Confirms Fund-tenant
  as Phase 2's core.

### Adjustments / additions to the plan
- **§3 — also de-duplicate the AI memo against the deterministic factors.** The
  "AI Risk Assessment → Risks" list and the "Why this rating?" factor list show
  the *same* items (active federal litigation, extended hold, GC license) with
  the same severities, one above the other. When tabbing the detail page, the
  `Summary` (AI memo) and `Evidence` (factors) tabs should not repeat the risk
  list verbatim — let the memo narrate and the factor list drill down, not both
  enumerate. (Aligns with the drill-down-over-characterization principle.)
- **§1/§2 — "Manage investors" leaks the data model to the user.** The page
  description literally says criteria are "stored as JSONB rows in
  `investor_criteria`," and renders each criterion as a raw `snake_case`
  key/value card (`loan_types`, `max_ltarv`, `rural_allowed`…). Job-shaped IA
  should hide storage detail and present a readable buy-box. Fold into the §1 IA
  pass.
- **Empty-state for the analyzer is wrong for the no-investor persona.** With
  zero investors the evaluate page still renders the entire two-engine wall and
  shows a hint telling the user to **run a dev script**
  (`npx tsx scripts/seed-sample-investors.ts`) — a developer instruction leaked
  into the product. The Spreadsheet Refugee's first screen should be a guided
  empty state, not the wall + a CLI command.

### Bugs found while driving (fix independently of the redesign)
1. **Detail page white-screens on object-shaped `disciplinary_actions`.**
   `src/components/dashboard/gc-result-card.tsx:165` renders each
   `disciplinary_actions` element directly as a React child. The production
   contract is `string[]` (CSLB adapter, types), so real data is safe — but it's
   the **one spot in the whole detail render path with no shape guard** (every
   other card coerces with `String(...)`, null-checks, or `safeParse`). A single
   malformed row → "Something went wrong" for the entire page. Add a defensive
   coercion (belt-and-suspenders per ROADMAP robustness principles).
2. **Validations with no `ai_analysis` show "Generating…" forever.** The
   dashboard AI column renders a perpetual "Generating…" chip when `ai_analysis`
   is null and nothing is actually running (seen on the Solo org's validation).
   Needs a terminal state ("Not run" / "—") distinct from in-flight.
3. **Header actions overflow on mobile.** On the validation detail at 390px the
   "Evaluate against investors / Download risk… / Route…" buttons run off the
   right edge (no wrap/collapse). The §3 tabbed redesign should fix this for
   free, but note it.
4. **`handle_new_user` slug strips capitals.** `regexp_replace` runs before
   `lower()`, so "Test Bridge Capital" → slug `-est-ridge-apital-…`. Cosmetic
   (uniqueness holds via id suffix) but wrong; swap the order. (Found seeding
   test orgs; not UX-blocking.)

## 10. Coherence map (2026-06-26) — the "I don't understand it end-to-end" pass

Re-audited the LIVE product (3 parallel readers: IA/nav, persona docs, the two
heavy surfaces) after the owner — who built it — said it was overwhelming and he
wasn't sure he understood it end to end. **If the builder can't hold the flow, no
lender or capital partner can — and capital-provider endorsement is the only
distribution channel, so legibility is the gate on distribution, not polish.**

**Headline (confirms §0/§3):** it's not too many features — *the app doesn't tell
the story that connects them.* Much of the redesign already shipped (job-shaped
nav, the Deal stepper). The overwhelm is concentrated in a few fixable spots.

### The product in plain language — three jobs, in order
The whole product answers three questions about a bridge loan: **① Verify the
borrower → ② Underwrite the deal → ③ Distribute to capital.** Everything in the
app is one of those three. The engine sets the numbers; the AI narrates.
- **① Verify** — borrower + property → 5 parallel checks → deterministic tier + AI
  memo. *The solo lender can stop here.*
- **② Underwrite** — Deal stepper: terms → eligibility → size (binding constraint)
  → AI judgment (now incl. macro regime). *The underwriter lives here.*
- **③ Distribute** — handoff (Excel/PDF) → route → **"meets [Fund]'s mandate"
  stamp** → monitor → outcome. *The fund's reason to push it to originators.*

### The three overwhelm hot-spots (not 30)
1. **Validation detail page** — ~30 cards / 5 tabs, THREE competing "where am I"
   cues (status badge + Verify→Evaluate→Handoff strip + 5-tab bar), the primary
   CTA repeated 3×, up to 3 stacked alarm banners. Buries the verdict + next step.
2. **Sizing step** — ~18 inputs + 7 result blocks of un-glossed CRE math, all
   expanded at once. No progressive disclosure; a verify-only lender hits the wall.
3. **Naming + jargon** — one concept wears ~4 names (Deals/Evaluate/Evaluate
   Deal/Deal); "Book" is opaque; Mandate console + `/admin` are orphaned; CRE
   jargon everywhere with no inline definitions.

### Ranked fixes (most confusion collapsed first) — STATUS (commits 2026-06-26)
1. **One spine everywhere** — 🔶 PARTIAL. Detail page de-duplicated (single next
   action in the strip; mandate stamp already promoted to top). Full app-wide
   Verify → Underwrite → Distribute metaphor across every screen still TODO.
2. **Verdict-first detail page** — 🔶 PARTIAL. ✅ Primary CTA de-duplicated (was
   3×, now 1 in the strip); ✅ mandate stamp at top. TODO: collapse the 3 stacked
   banners into one "needs attention" block; surface the one-line verdict (memo
   headline) above the fold.
3. **Progressive disclosure on Sizing** — ✅ DONE. 10 advanced inputs (house caps
   + exit/takeout, investor-defaulted) collapse behind "Advanced"; 8 core
   economics fields stay visible. Results-pane deep blocks (takeout/stabilization/
   interest-reserve) could get the same treatment (TODO, lower priority).
4. **One name per concept + fix orphans** — 🔶 PARTIAL. ✅ "Book" → "Portfolio"
   (nav + detail tab + button); ✅ evaluate H1 "Evaluate Deal" → "Deals". TODO:
   Mandate console front door; link or drop orphaned `/admin`.
5. **Inline glossary** — ✅ FOUNDATION + first application. New reusable `<Term>`
   (src/components/ui/term.tsx) + GLOSSARY; applied to the sizing ratio row.
   Extend to the remaining labels incrementally (NumField labels, detail-page
   jargon) — backward-compatible, low-risk.

> **Superseded by §11.** The incremental detail-page tweaks above (banner
> consolidation, verdict line) are rolled into the deliberate **verdict-first
> redesign** specced in §11, approved 2026-06-26 after competitor research.

## 11. Verdict-first redesign — research → principles → platform-wide rollout (2026-06-26, APPROVED)

The §10 incremental fixes helped (sizing went 18→8 fields) but the detail page
stayed busy — reordering ≠ reducing. So we did a deliberate design pass: a
clickable mockup (`docs/mockups/detail-redesign.html`, 3 states: verified /
needs-review / flagged), grounded in competitor research, **approved by the owner
2026-06-26.** This section is the spec; build against it, don't re-litigate.

### 11.1 Competitor research — what the market actually does
Three parallel research sweeps (KYB/identity-decisioning · CRE/bridge LOS ·
credit-memo/decision tools), REAL screenshots where obtainable.

| Tool (category) | How its screen leads | Takeaway |
|---|---|---|
| nCino, Built, Mortgage Office, **Mortgage Automator**, **Baseline**, Liquid Logics (LOS) | Money tiles + dates + people + tasks; Kanban pipeline; **no verdict, no grade, no ratios on the loan** | Systems of record — they *omit* the decision |
| Lendr (private-lending AI UW) | Findings bucketed **Critical/Warning/Info/Pass** with imperative action labels | Severity + action verbs, link to source |
| Blooma (CRE AI UW) | One composite score → drill; a **valuation selector cascades into all ratios** | One driving valuation, not every permutation |
| Persona / Alloy / Middesk / Markaaz (KYB/decisioning) | Status-label verdict (approve/review/decline); **score is secondary** | A first-class "couldn't-complete" state, never a pass |
| Moody's CreditLens / S&P / nCino credit | Verdict/rating on top → weighted factors → raw spreads (3 layers); **AI in the narrative only** | BLUF + glass-box reason codes + deterministic score |

**Two headlines:** (1) **verdict-first is genuine white space** — *no* competitor leads with a synthesized decision combining sized loan + binding constraint + AI stance + diligence verdict. (2) **"couldn't-complete ≠ pass" is universal** in real decisioning tools (Middesk `neutral`/`irs_unavailable`, Persona yellow "Not Applicable", Alloy `error`, Markaaz F-vs-Z, Cobalt "Incomplete") — our "Verified-on-429" (Achilles) bug is the exact anti-pattern they engineer against.

### 11.2 Principles (canonical — apply platform-wide)
1. **BLUF / verdict-first.** Lead every decision surface with the answer in display type, then a one-line "why" (binding driver). *(credit-memo BLUF; Persona/Lendr)*
2. **Two disclosure levels max.** Verdict → driver cards → evidence drawer. Never everything at once. *(NN/g; Shneiderman "overview → zoom → details-on-demand")*
3. **First-class "couldn't-complete" state, never a pass.** Distinguish three non-passes: real negative *finding* vs *no-data/not-supplied* vs *infra-error*. *(Middesk/Alloy/Markaaz)* — **this is the status-bug fix.**
4. **Separate workflow/system state from the quality verdict.** *(Persona lifecycle vs decision)* — mirrors "AI never sets the tier."
5. **Status = color + icon + shape, never color alone.** Status badge (pass/review) ≠ count badge (3 liens). *(NN/g a11y; ~1 in 12 men colorblind)*
6. **Per-pillar quad: status + label + sub-label + plain message.** Concrete state ("CA SOS 429", "1 active case · civil · 2025"), never adjectives ("minor"). *(Middesk/Rabbet)*
7. **Counterfactual line — "what clears this."** The most-trusted explanation for novices; pair with **headroom** (distance-to-cap) for experts. *(XAI research; Built covenants)*
8. **Severity buckets with imperative action verbs.** "Re-run entity check", "Review flags" — not adjectives. *(Lendr)*
9. **Delta vs prior run** (▲/▼ signed) — anchor the verdict in time (we have override-and-rerun + monitoring). *(dashboard UX)*
10. **Drill to source evidence via a side drawer, not below-the-fold.** *(Rabbet slide-out; Cobalt source screenshot; our drill-down rule)*
11. **One driving set of numbers; alternates one click away.** Highlight the binding/abnormal metric, mute the in-range ones. *(Blooma valuation selector; LightBox "outside the norm")*
12. **Money-tile header for deal surfaces** — big label-over-value tiles; lead tile = binding constraint + max loan. *(Mortgage Automator/Baseline)*
13. **Auto-rerun the verdict on input change; re-run only the failed piece.** *(Lendr live re-underwrite; Alloy 206-partial resumable)* — our override-and-rerun.
14. **One strong opinionated default, not infinite configurability** *(the recurring competitor anti-pattern)*. Keep the math **auditable on screen** *(rivals hide it in Excel — our visible deterministic engine is the trust wedge)*.

### 11.3 The detail page spec (answer-first) — APPROVED
Layout, top to bottom:
- **Header:** borrower name · entity · state · *secondary* actions only (Methodology, Route).
- **Verdict hero** (one card, color/icon/shape per state):
  - Verdict + **delta chip** (▲/▼ vs last run, or "first run").
  - One-line **reason** (the binding signal / top driver — BLUF).
  - **5-pillar quad row** (Entity / Track / Litigation / GC / Sanctions), each = icon + label + sub-label + message + "view evidence →".
  - **Mandate** line (meets / conditional / does-not-meet).
  - **Counterfactual** ("what clears this").
  - **1–2 actions** with imperative verbs.
- **"Full report" (collapsed `<details>`):** the *entire current page* — the 5 tabs (Summary/Evidence/Deal/Hand off/Portfolio), AI memo, Why-this-rating (with the old stat tiles + factors drilling to source), monitoring. Nothing deleted; demoted one level.

**Verdict-state computation (single source of truth — `lib/validation/verdict.ts`):**
- **Needs review** — ANY of the 5 checks did not complete (errored / `not_run` / unavailable). Beats everything; an incomplete check can never read clean. *(fixes Achilles)*
- **Flagged** — all checks completed AND (≥1 material flag OR mandate "does not meet").
- **Verified** — all checks completed AND no material flags.
- The deterministic **tier** rides alongside the verdict (Verified · LOW); AI never sets either.

### 11.4 Platform-wide rollout (apply the SAME primitives everywhere)
Build a shared kit once, reuse on every surface:
- **Shared primitives:** `computeVerdict()` util (§11.3 logic — the status-bug fix, used everywhere so verdicts are consistent) · status tokens (color+icon+shape) · `<VerdictHero>` · `<PillarQuad>` · `<DeltaChip>` · `<Counterfactual>` · evidence `<Drawer>` · `<Term>` (done).

| Surface | Apply |
|---|---|
| **Borrowers list** (dashboard) | Replace the bare status with the **verdict chip** (Verified/Needs review/Flagged) + delta; reuse `computeVerdict()` so list and detail never disagree. |
| **Deal stepper** | Lead each step's *result* with the answer. Sizing result → **money-tile header** (max loan · binding constraint · tier) + a **constraint table with the binding row highlighted + headroom**; **counterfactual** ("would clear at LTV ≤ 70%"); auto-rerun on input change. Judgment → already verdict-shaped (stance + memo + macro); align its styling to `<VerdictHero>`. |
| **Handoff PDF / view** | **BLUF**: lead the artifact with the verdict + binding constraint + tier so the investor sees the answer first. |
| **Capital / Mandate console** | Verdict-first per originator (meets/conditional/fails throughput + exception rate); reuse the pillar/quad + delta. |
| **Portfolio** | KPI tiles + delta; flag the abnormal metric, mute in-range. |
| **Fund tenant** | Cross-originator verdict rollup built from the same `computeVerdict()`. |

### 11.5 Build sequence (each gated by build + visual-verify on prod)
1. **Shared primitives** — `computeVerdict()` + status tokens + `<VerdictHero>` / `<PillarQuad>` / `<DeltaChip>` / `<Counterfactual>` / evidence `<Drawer>`.
2. **Detail page** (highest-value, most-broken) — assemble from the primitives; folds in the **Verified-on-429 status fix**. Ship → drive-visual-pass.
3. **Borrowers list** verdict chips (reuse the util).
4. **Deal stepper** result surfaces (money-tile header + constraint table + counterfactual).
5. **Handoff PDF** BLUF lead.
6. **Capital / Portfolio / Fund** rollups.

Consistency is load-bearing: every verdict on every surface comes from the one
`computeVerdict()` — inconsistent verdicts destroy trust faster than missing ones.

## 12. Craft + de-AI pass (2026-07-01) — "looks clearly AI-developed" + "highly cluttered"

Damon's two verbatim critiques on the 7/1 reset call: the product is *"highly
cluttered, a lot going on,"* and it *"looks clearly AI-developed."* A full audit
(three code deep-reads) confirmed both — and, importantly, **separated them into two
different problems with two different fixes.** This is a **~2–3 day craft/discipline
sweep, NOT a rearchitecture.** The verdict-first architecture (§11) is sound; the work
is craft + hierarchy. Do it before the **AAPL Nov 9–11 demo** and during the July/Aug
ICC trial. Tracked as **UX-1** in the ROADMAP [Post-Damon-reset sequence](ROADMAP.md#post-damon-reset-sequence-2026-07-01--construction-sizing-coherence-craft).

### 12.1 "Cluttered" = signal-to-noise, not bad structure
The density is *informational*, and the architecture is defensible. The fix is
emphasis, not removal — one question per screen; everything else discloses:
- **One answer dominates each surface.** §11 already does this on the detail page;
  extend to Sizing (the **max loan + binding constraint** is the answer — make it
  visually dominant; demote the constraint ladder + per-investor table into it).
- **Collapse the stacked banners.** The detail-page left column stacks up to 3
  full-width banners (input-warning / pending-review / demo-data) before content →
  collapse into a single **"data quality"** line that expands on click.
- **Group related cards.** Evidence tab renders Property table + Verify tray +
  Borrower uploads + Verified track record as 4 sibling cards → nest under one
  **"Property evidence"** section.
- **Reduce visual sameness.** Today every card is an identical white box, so nothing
  pops. The one thing that matters (binding constraint row, verdict) must be visually
  louder — via weight/size/spacing/highlight — than its neighbors.

### 12.2 "Looks AI-made" = enforce the design system we already wrote
`design-system.md` **already forbids** nearly every tell the audit found; it just
isn't enforced. The sweep (with concrete locations):
- **Kill gradients + opacity-arithmetic backgrounds.** `bg-gradient-to-br from-info/5`,
  `bg-amber-50/40`, `border-amber-300/50` ([ai-memo.tsx:59,48](../src/components/dashboard/ai-memo.tsx),
  banners, [litigation-grid.tsx:60](../src/components/dashboard/litigation-grid.tsx)) →
  flat semantic-token fills. Opacity math (`/40`, `/60`) is the single biggest AI tell.
- **Cut icon saturation.** The AI-memo card alone renders **7 different icons**
  (`Sparkles`, `TrendingUp/Down`, `Minus`, `AlertTriangle`, `Info`, `Lightbulb`,
  `CheckCircle2` — [ai-memo.tsx:18-28](../src/components/dashboard/ai-memo.tsx)) → 1–2;
  let typography carry the hierarchy.
- **Replace raw-tailwind color sprawl with semantic tokens.** `amber-50/100/300`,
  `red-50` scattered across [gc-status-chip.tsx](../src/components/dashboard/gc-status-chip.tsx),
  [entity-result-card.tsx:120](../src/components/dashboard/entity-result-card.tsx),
  banners → `--warning` / `--danger` / etc., one value each, no per-component variants.
- **Enforce the type scale.** No `text-2xl` on stat values, no `text-[10px]` custom
  sizes, no 4-sizes-in-one-row factor cards. Page title `text-2xl`, section header
  `text-base`, card title / body `text-sm`, small `text-xs` — nothing else.
- **Single, subtle loading state.** No double `animate-pulse` (the "Generating…" card
  pulses both the `Sparkles` icon and a dot — [ai-memo.tsx:526](../src/components/dashboard/ai-memo.tsx)).
- **`--info` (violet) is chart-series only** per design-system — remove it from UI
  status containers.

### 12.3 The teaching-memo principle (design guardrail from the call)
Damon's stated fear: throwing a deal in blind and *"not knowing shit when the investor
calls."* The AI memo must stay a **teaching-oriented "common framework to evaluate the
deal"** — it narrates and frames so the human *learns* the deal; it never becomes a
black box that replaces reading it, and never sets the number or the tier. When
simplifying the memo UI, preserve the drill-to-evidence path (Noah's principle: AI
narrates, never characterizes) — de-clutter the chrome, not the substance.

### 12.4 Scope note
This is craft, not features. It does **not** touch the engine (that's UW-1) or the
verdict logic (COH-2). It can ship in parallel with the sizing work. Success test: a
neutral observer can't tell it was AI-built, and Damon can find the one number that
matters on each screen in <2 seconds.

## 13. Persona-agnostic coherence — "no matter who you are, it makes sense" (2026-07-01, PRIORITY)

The owner's top UX priority after the reset: the product must feel like **one seamless
thing** to whoever opens it — a broker submitting an intake, an underwriter (Damon/Noah)
sizing a deal, or a capital partner reviewing throughput. Today it can read as four bolted-
together tools. This section is the coherence spec; it's **cross-cutting principle 13** in
ROADMAP and is tracked as **UX-2**, woven through Phases 1–4 with a dedicated consolidation
pass. It builds on §11 (verdict-first) — this is §11 extended from "answer-first" to
"same product, every persona, every surface."

### 13.1 The five coherence rules (apply to every surface)
1. **One Deal object, no re-keying.** A deal entered once (or doc-ingested once) flows
   Borrower → Deal → Capital → Portfolio. No surface re-asks for data another surface
   already has. The intake packet pre-fills sizing; the sized deal pre-fills the handoff.
2. **One verdict, everywhere.** Every surface renders `computeVerdict()` — the Book, the
   detail hero, the Mandate Console, the handoff, the portfolio row. Two surfaces disagreeing
   on the same borrower (the mandate-vs-book bug, COH-2) is the cardinal sin.
3. **Answer first, evidence on disclosure.** BLUF on every screen (§11.2). The one number
   that matters is visually dominant; everything else discloses.
4. **Sizing uses the Excel-parity layout ICC already trusts.** Two-column "Underwriting
   Summary" — **proceeds waterfall on the left, constraint ladder + pass/fail + cushion on
   the right** — mirroring `RTL_Loan_Sizer` so an underwriter reads it in seconds. The magic
   (live-solve, best-execution) sits under a familiar shell.
5. **Persona wayfinding.** Each surface names the current persona's *next action*:
   broker → "what's missing / send to underwriter"; underwriter → "size / structure / route";
   capital partner → "does it meet my mandate / portfolio impact." The fund tenant already
   gets the mandator spine (§4); extend the pattern so no persona lands on a dead end.

### 13.2 Coherence primitives to add (beyond §11.4's kit)
- **`<ProceedsWaterfall>`** — the money movement (advance + holdback − prepaid − closing →
  net → cash-to-close → equity%), from the decoded RTL sizer. The artifact that makes it
  *replace* the Excel.
- **`<ConstraintLadder cushion>`** — the binding-constraint table with **headroom per test**
  surfaced (Damon's "art of massaging the deal"), not just pass/fail. Each row carries an
  **include/exclude toggle** — ICC's actual Quick Form has an "Include YES/NO → MINIFS" column;
  underwriters turn a constraint off and re-size live (finding #28; a per-org config value, not
  a code change — principle 14). Reused on sizing, handoff, and per-investor.
- **`<DualSizer>`** — **in-place bridge | stabilized/takeout** side-by-side (finding #25): the
  same deal sized on in-place NOI at the bridge rate AND on forward NOI at the takeout rate.
  This is the "coverage in place now AND at stabilization" matrix Damon asked for; it's how
  ICC's institutional MFR sheet is actually laid out. Feeds UW-3.
- **`<RefiStressGrid>`** — the "does the bridge exit?" surface (finding #26): NOI −0/5/10/15/20%
  → recomputed LTV, DSCR, and refi proceeds at each level, from the construction-MF `Loan
  Analysis` sheet. The bridge's real risk is the takeout; this is higher-value than another
  point estimate and pairs with AN-2 (reserve adequacy).
- **`<ScenarioColumns>`** — native Option_1 / Option_2 / Option_3 comparison (the RTL sizer
  and Colchis tool both do this by hand today).
- **`<SolveControl>`** — the live goal-seek sliders (UW-5): drag a target DSCR / rate /
  cash-to-close, watch the deal re-solve. The 10× over their Excel.
- **`<CustomInputs>` (Tier 2 — the "put my own variables in" affordance).** Inside a known
  mode: **override any computed cell** (extends override-and-rerun to sizing inputs/
  intermediates), **named custom adjustments** ("+ $50k seismic holdback"), and saved per-org
  assumption sets. Every override is visibly flagged + drill-through preserved. This is how we
  give the on-the-fly-variables feel without a spreadsheet; the full **"structured core, open
  edges"** tiering (incl. the Tier-3 governed formula canvas, logged in
  [IDEAS.md](IDEAS.md#user-authored-model-layer-formula-canvas--tier-3-governed)) is the
  north-star endgame — Tier 3 gated on real trial demand, never speculative.
- **`<PersonaNextStep>`** — the wayfinding CTA block, persona-aware.

### 13.3 Two patterns that let PulseClose actually *beat* Excel (not just match it)
The north-star stress test (ROADMAP) named the two reasons an underwriter keeps a sheet open —
input burden and opacity. Answer both in the UX:
- **Quick-Quote → Full-Model progressive disclosure.** Size on the few binding inputs
  (as-is / ARV / rate / advance) in *seconds* and show the number; the 40-line budget + 5-yr
  pro-forma discloses only when they want precision. ICC already splits this — their file is
  the *"Loan Submission **Quick** Form."* A stepper that demands 40 inputs before a number
  loses to Excel.
- **Show-the-math / drill-to-formula + export.** Every number drills to its inputs and the
  constraint/formula that produced it (principle 8) — Excel's formulas are opaque spaghetti, a
  clean drill-through is the thing Excel *can't* do. And an **"export to Excel"** affordance on
  the sized deal (→ their rate-offer-letter format) means leaving PulseClose never means
  leaving empty-handed. These are what turn "replace the Excel" from a claim into trust.

### 13.4 Success test
Sit a broker, an underwriter, and a capital partner in front of the same deal. Each should
(a) immediately see the verdict/answer for *their* job, (b) never hit a screen that
contradicts another or asks for data already given, (c) find their next action without a
tour. And the underwriter should recognize the sizing screen as "my one-sheet, but it
solves."
