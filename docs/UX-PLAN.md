# PulseClose — UX & Information-Architecture Plan

**Created 2026-06-23.** The plan for making PulseClose feel like *one coherent
product* a first-time lender can walk through — not a set of powerful but
disconnected features. Derived from an end-to-end UX audit of the shipped code
(2026-06-23). Pairs with [ROADMAP.md](./ROADMAP.md) (what to build) and
[STRATEGY.md](../STRATEGY.md) (why).

> **The verdict that motivated this doc:** the product is coherent for a power
> user who already knows the workflow (validate → evaluate → size → hand off →
> monitor), and incoherent for a first-time lender. Each feature works in
> isolation; the app doesn't yet *tell the story* that connects them. The
> discoverability miss that surfaced this — the Underwriting Workbench was
> invisible until you ran an eval, and absent from the saved-deal detail page —
> is the symptom, not the disease.

---

## 1. The journey the UX must make obvious

One lender, one deal, start to finish. Every screen should answer "where am I
and what's next."

```
Intake → Validate borrower → Review & override → Size & judge the deal →
Route to investors → Hand off → Monitor → Capture outcome
```

The product already *does* all eight. The UX job is to make the spine visible:
a persistent sense of progress, and a "next step" CTA at the end of every step
that lands on the right screen (not the dashboard).

---

## 2. The core IA problem: borrower vs. deal

This is the deepest structural issue and everything else hangs off it.

The app conflates two different objects:

- **Borrower** (person/entity): entity status, track record, litigation,
  sanctions — *attributes of who they are*. Persist across deals.
- **Deal** (a specific loan request): loan amount, LTV, property, sizing,
  eligibility, judgment — *attributes of this transaction*.

Today a "validation" is really a **deal-run that carries borrower data**, but the
nav calls it "Validations" and the framing is borrower-centric. Validate the same
borrower twice → two unrelated validation rows. The sidebar exposes neither a
clean **Borrowers** list nor a clean **Deals/Evaluations** list; evaluations hide
inside the "Evaluate Deal" *form*.

**Target model (decision):** *borrower-centric spine, deal-centric records.*
- A **Borrower** is the durable object (dedup on canonical entity name — the
  domain layer already supports this via `primary_borrower_id`).
- Each **Validation** and each **Evaluation/UW model** hangs off a borrower as a
  dated record.
- Nav surfaces **Borrowers** (the book) and lets you drill into a borrower to see
  their validations + evaluations + outcomes + monitoring in one place.

This is a ~1–2 day restructure (nav + a borrowers list + a borrower-detail roll-up
that mostly composes existing cards). It is the highest-leverage IA fix because it
makes the whole product legible; defer only if a wedge build is more urgent.

**Interim (hours, do first):** keep "Validations" but (a) rename the sidebar
"Investors" item to "Manage investors," (b) show a borrower's recent evaluations
on their validation detail, (c) show the deal/borrower context on the evaluate
results. These reduce the confusion without the full restructure.

---

## 3. The three structural UX issues (not one-off fixes)

1. **Borrower-vs-deal IA ambiguity** — §2 above. *~1–2 days.*
2. **The validation detail page is an overloaded scroll.** One ~650-line
   component renders ~16 sections (summary, entity, track record, litigation, GC,
   sanctions, property table, verify tray, AI memo, factors, uploads, verified
   flips, handoff, monitor, outcome, activity). A new lender lands and faces a
   3-minute scroll with no scaffolding. **Fix:** tabs or accordion — `Summary ·
   Evidence · Underwrite & route · Handoff · Monitor · Outcome` — with a
   persistent progress strip and a single "next step" CTA. Summary + AI memo
   expanded by default; the rest collapsed. *~1–1.5 days.*
3. **Evaluate form vs. detail-page feature parity.** The Underwriting Workbench
   lives on the form (`/dashboard/evaluate`) but is absent from the saved-deal
   detail page (`/dashboard/evaluate/[id]`). Sibling surfaces must have parity.
   **Fix:** render the workbench on the detail page (read-only or re-runnable),
   hydrated from the saved `uw_model`. *~½ day.* (Partially mitigated already:
   the workbench now renders on the form without first running an eligibility
   check.)

---

## 4. Prioritized quick wins (hours each, high first-run impact)

Ordered by impact on a first-time lender. All are small.

| # | Fix | Where | Effort |
|---|-----|-------|--------|
| 1 | "Next step" CTA + progress strip on validation detail ("Validate ✓ → Evaluate → Hand off") | `dashboard/validations/[id]` | 2–3h |
| 2 | Render Underwriting Workbench on the evaluate **detail** page (parity) | `dashboard/evaluate/[id]` | 1–2h |
| 3 | Evaluate→handoff CTA deep-links to the actual validation (`#handoff`), not `/dashboard` | `dashboard/evaluate` | 3–4h |
| 4 | Fix "minor" severity color — it renders highlighted blue; should be muted (the opaque-label trap Noah flagged) | portfolio + validation detail | 1–2h |
| 5 | Rename sidebar "Investors" → "Manage investors"; group with Evaluate | `components/dashboard/sidebar.tsx` | 1h |
| 6 | Show a borrower's recent evaluations on their validation detail | `dashboard/validations/[id]` | 2–3h |
| 7 | Show deal/borrower context above evaluate results ("Evaluation for X · $Y bridge · CA") | `dashboard/evaluate` | 1–2h |
| 8 | "What happens next" guidance on the handoff card after download | `components/dashboard/handoff-card.tsx` | 1–2h |
| 9 | First-run dashboard: a 3-step "start here" card for empty orgs | `dashboard/page.tsx` | 2h |
| 10 | "See all activity for this borrower" link from the validation activity strip | `dashboard/activity` | 1h |

A focused 2–3 day pass clears all ten and materially changes the first-run story.

---

## 5. Cross-feature linkage map (the "next step" everywhere)

The product should never dead-end. Required links:

- **New validation → detail** ✓ (exists)
- **Validation detail → Evaluate** ✓ ("Evaluate against my investors")
- **Evaluate results → the specific validation's handoff** ✗ → **fix #3**
- **Evaluate form → Underwriting Workbench** ✓ (now unconditional)
- **Evaluate detail → Underwriting Workbench** ✗ → **fix #2**
- **Handoff card → "send + mark outcome"** ✗ → **fix #8**
- **Portfolio → validation** ✓; **validation → its portfolio stats** ✗ → **fix #6**
- **Borrower → all their validations/evaluations/outcomes** ✗ → **§2 restructure**

---

## 6. Consistency checklist (apply everywhere)

- **Severity language is load-bearing** (Noah's principle: opaque labels are
  worse than none). `critical` (red) / `moderate` (amber) / `minor` (muted, NOT
  highlighted) / `informational` (muted). A failed check is "check failed /
  unknown," never a generic "minor."
- **Every screen has an empty state, a loading state, and an error state.**
  Portfolio currently shows 0s with no empty state; handoff assumes an eval ran.
- **Every number drills into its source** (the workbench constraint ladder and
  factor evidence already do this — hold the line on it for new surfaces).
- **AI is always labeled AI, and never decides** — the deterministic engine sizes
  and tiers; Claude narrates. Keep this visible in copy ("Generated by … ·
  Reviewed by a human underwriter").
- **Mobile:** the validation detail scroll and 11-column property/handoff tables
  need responsive treatment; tabs (§3.2) largely solve the scroll.

---

## 7. Sequencing against the roadmap

UX work interleaves with the post-NPLA build sequence in [ROADMAP.md](./ROADMAP.md):

1. **Quick-win pass (§4)** — 2–3 days, do alongside the doc reconciliation. Fixes
   the first-run story and the parity gaps with minimal risk.
2. **Validation-detail tabs (§3.2)** — bundle with the underwriting→handoff
   artifact work (they touch the same page).
3. **Borrower-centric IA restructure (§2)** — its own focused effort once a
   capital-provider/customer signal confirms the multi-borrower book matters
   (i.e., real volume). Until then, the interim mitigations carry it.

The principle: **don't add a feature without adding its "next step."** Every new
surface ships with the link that tells the lender where to go next.
