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

### Ranked fixes (most confusion collapsed first) — STATUS
1. **One spine everywhere** (Verify → Underwrite → Distribute as the single
   progress metaphor; delete duplicates on the detail page).
2. **Verdict-first detail page** (lead with tier + one-line verdict + mandate
   stamp promoted to top + ONE next action; collapse the 3 banners into one).
3. **Progressive disclosure on Sizing** (~4 core numbers by default; depth behind
   "Advanced").
4. **One name per concept + fix orphans** ("Deals" everywhere; "Book"→"Portfolio";
   Mandate console front door; link/drop `/admin`).
5. **Inline glossary** (tooltips on the jargon; extend the "Completeness" pattern).

*(Build status appended inline as each lands — see commits 2026-06-26.)*
