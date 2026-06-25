# Plan B — end-to-end UI review on real loans (2026-06-25)

Three real ICC loans driven through the LIVE product (app.pulseclose.com, underwriter
test org), every top-level screen + every validation-detail tab + the deal stepper +
the printable handoff captured. NOT the seeded Westbrook demo. Screenshots:
`ux-review/real-loan/`. Repro: `scripts/drive-real-loan.ts`, `drive-loan-tabs.ts`,
`drive-full-review.ts`, `drive-stepper.ts`.

**Loans run:** 286-virginia (Kafetzopoulos / Achilles Properties LLC — happy path,
deed-verified flip), 10287 (Soverns / 14 Trapps Pond LLC — non-CA, distinctive),
10228 (Mark Morrison — common-name disambiguation showcase).

## The headline

The product's **risk-factor / tier / Book layer is disambiguation-aware and honest**
(the #13 + screening work paid off). But the **capital-provider MANDATE layer is not**,
and a **production Cobalt 429** cascades through everything. Net effect on the most
strategic screen (the Mandate Console / the distribution wedge): **33% pass rate, with
two clean distinctive-name borrowers failing.** Fix #18 + #19 and most of this flips.

The sharpest illustration: **Mark Morrison is NOT a critical flag in the Book**
(factors correctly treat his 1 name-only litigation match as "possible — review") but
**fails 5 gates in the Mandate Console** ("Active federal litigation found"). Same
borrower, same data, opposite verdict — because two code paths read the data
differently.

## Screen-by-screen

| Screen | Verdict | Notes |
|---|---|---|
| **Intake** (`/dashboard/new`) | ✅ good | Clean form; DocIngest drop zone present; entity-state is a `<select>`. |
| **Borrowers list** (`/dashboard`) | ✅ good | Correct: all 3 real loans show **Flagged** (matches reality). Trial banner, tier/flag/AI columns. |
| **Validation detail — Summary** | ◐ mostly | #13 input warning renders honestly; completeness + flags shown. Header badge bug (#21). |
| **Validation detail — Evidence** | ◐ mostly | Entity "CHECK FAILED / Cobalt 429" honest (#13 ✅). Track-record deed-verify pill ✅. Mandate card shows #18. |
| **Validation detail — Deal** | 🟡 empty | Dead-end: no sizing content, no "size this deal" CTA (sizing lives in the stepper). (#20) |
| **Validation detail — Hand off / Book** | ◐ | Render; carry the same mandate #18 text. |
| **Handoff printable** (`/handoff/[id]`) | ◐ | Tier **LOW** (factors correct ✅) but "Sanctions/PEP potential_match" + mandate "Does not meet" (#18). Entity factor message mis-describes the 429 (#22). "1 property confirmed" vs "0 on record" copy mismatch. |
| **Deals / Evaluate** (`/dashboard/evaluate`) | ✅ good | 5-step stepper, DocIngest drop zone, recent evals. Clean. |
| **Stepper — Eligibility** | ✅ good | Colchis eligible @ 9.00%; Oakhurst conditional (loan < min). Rate stress test + scenario compare. |
| **Stepper — Sizing** | 🟡 note | A FORM needing NOI/cap inputs not carried from Terms — must be entered (or doc-ingested). (#25) |
| **Capital / Investors** (`/dashboard/evaluate/investors`) | 🔵 rough | Criteria shown as **raw JSON** (transparent but rough for non-technical users). Upload-PDF + Edit-criteria present. ZHVI haircut "not yet engine-wired" (known). |
| **Mandate Console** (`/dashboard/capital/mandates`) | 🔴 broken | **33% pass; clean borrowers fail (#18).** Cross-originator view labeled Preview (honest). |
| **Book / Portfolio** (`/dashboard/portfolio`) | ✅ good | Correct: only Cardinal (seeded, real confirmed litigation) shows critical. The 3 real loans are NOT mis-flagged critical — proves factors are disambiguation-aware. |
| **Activity / Usage / Settings / Compare** | ✅ reviewed | No blocking issues surfaced this pass. |

## What works (validate these stay working after the fix)

- **#13 not-run honesty in prod** — input warning + "CHECK FAILED" + "Cobalt rate
  limited (429)", never a false "not found."
- **Disambiguation at factor/tier/Book level** — Morrison stays Tier-LOW and off the
  critical-flag list; possible matches don't drop the tier.
- **Track-record deed-verify**, **eligibility engine** (eligible/conditional + rate
  stress), the **Validate→Evaluate→Hand-off** spine, the **handoff artifact** format.

## Fix status (2026-06-25)

1. **✅ #18 FIXED — Mandate gates now use disambiguation + classification + not-run**
   (`src/lib/mandates/assess.ts`). Only `confirmed` litigation trips the
   active-litigation gate; only a real `sanction`/`pep` confirmed match trips the
   sanctions gate; a failed/`not_run`/unavailable check makes the verdict
   **conditional** ("re-run before relying on this verdict"), never an auto-fail.
2. **✅ #19 FIXED — Cobalt 429 resilience** (`src/lib/adapters/cobalt.ts`):
   exponential backoff + jitter over 4 live attempts, then a retried cached
   fallback; only then surfaces the 429 (→ honest "unavailable"). Follow-up: a
   cross-request queue if the shared trial limit still bites under heavy concurrency.
3. **✅ #21 FIXED — header badge.** The pipeline no longer treats an unavailable
   (429) entity as a hard "flagged" (→ "partial"), and `statusFromTier` won't show
   "Verified" while a check is incomplete. Badge now matches the list.
4. **✅ #22 FIXED — entity copy.** `factors.ts` distinguishes a lookup ERROR ("did
   not complete — re-run; not a confirmation the entity is absent") from a true
   "not located in SOS." (`FactorEntityView.lookup_error`, set in `persist.ts`.)
5. **✅ #20 FIXED — "Deal" tab** now leads with a "Size this deal" CTA into the
   analyzer (no longer an empty dead-end).
6. **🟡 #23 — AI memo** "No memo / generating": to CONFIRM in the re-pass (async lag
   vs generation failure; AI is enabled-by-default for the org).
7. **🔵 #24/#25 — deferred polish:** investor raw-JSON view; Sizing-step NOI/cap
   pre-fill from doc-ingest.
