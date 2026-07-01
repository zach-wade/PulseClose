# UX Polish Backlog (post-redesign) — ✅ ALL 5 DONE (2026-06-30)

> **STATUS: complete + shipped** (commit `4d3fe3f`). #1 handoff verbs → `screening-display.ts`;
> #2 buy-box → `criteria-display.ts`; #3 sizing prefill NOI/cap → doc-ingest + deal-stepper;
> #4 `<Term>` glossary extended; #5 mandate tokens → `MandateChip`. Superseded by the broader
> **UX audit** — see [UX-AUDIT-RUBRIC.md](UX-AUDIT-RUBRIC.md) + `ux-review/audit/FINDINGS.md`
> + [pickup.md](../pickup.md) for open items. Kept below for the acceptance criteria/history.

**Context:** the verdict-first redesign (`UX-REDESIGN-PLAN.md §11.5`, all 6 steps) is
**done + live + verified** — `computeVerdict()` single-source on detail · list ·
deal-stepper · handoff · portfolio. This is the **remaining polish** — small, mostly
independent, none blocked on a key. Pick any; each has file pointers + acceptance.

> Verify pattern: `npm run build` + a visual pass on prod (`scripts/drive-verdict-pass.ts`
> for the verdict surfaces). Ship straight to prod (autodeploy from `main`).

---

## 1. Handoff — humanize the raw screening verbs
**Where:** [src/app/handoff/[id]/page.tsx:229](../src/app/handoff/[id]/page.tsx#L229) (sanctions
line prints `doc.sanctions.result` = raw `potential_match`) + line 247 (`l.result`). Mirror
in [src/lib/handoff/excel.ts](../src/lib/handoff/excel.ts).
**Fix:** map `potential_match`→"Possible match — review", `clear`→"Clear", `not_run`→"Not run".
**Apply the disambiguation rule:** a name-only `potential_match` is a *review item*, not a hit —
say "N possible — review", and only **confirmed** matches read as a hit (mirror
`computeVerdict`'s sanctions logic / `highest_confidence`). The handoff already has `doc.verdict`
(the BLUF); make the detail line agree with it.
**Done when:** no raw `potential_match`/`not_run` strings in the PDF or Excel; possible-only
screens read as review, not as a hit.

## 2. Investor criteria → readable buy-box (not raw snake_case)
**Where:** [src/components/dashboard/investor-criteria-editor.tsx](../src/components/dashboard/investor-criteria-editor.tsx)
+ the investor detail page `src/app/dashboard/evaluate/investors/[id]/page.tsx`.
**Problem (from §9 live review):** criteria render as raw `snake_case` key/value cards
(`loan_types`, `max_ltarv`, `rural_allowed`…) and the page even mentions "stored as JSONB rows".
**Fix:** a human label + formatted value per `criteria_key` (e.g. `max_ltarv` → "Max LTARV 70%",
`rural_allowed: false` → "Rural: not allowed"). Hide storage detail. Reuse `<Term>` for the
CRE acronyms.
**Done when:** the buy-box reads like a lender's term sheet, no snake_case or "JSONB" visible.

## 3. Sizing step — prefill NOI / cap / economics from the validation + doc-ingest
**Where:** [src/components/dashboard/deal/deal-stepper.tsx](../src/components/dashboard/deal/deal-stepper.tsx)
(StepSizing inputs) + the deal view-model + the doc-ingest extraction
(`src/app/api/ingest/borrower-doc` already returns `purchase_price`/`as_is_value`/`arv`/`rehab_budget`/`fico`).
**Problem (§9 #25):** sizing-step NOI / going-in cap aren't pre-filled — the UW re-keys numbers
the package already has.
**Fix:** thread the doc-ingest extraction (and any validation property data) into the Sizing
defaults so the UW confirms 3–4 numbers, not 12 (matches §2 "sizing input reduction").
**Done when:** running a deal from a borrower with an ingested package pre-fills the core
economics; the UW edits rather than types.

## 4. Extend the `<Term>` inline glossary
**Where:** [src/components/ui/term.tsx](../src/components/ui/term.tsx) (`GLOSSARY` + `<Term>`) —
already applied to the sizing ratio row. **Extend to:** the remaining `NumField` labels in the
deal stepper + the jargon labels on the validation detail page (LTV/LTC/LTARV/DSCR/debt-yield/
NOI/cap/yield-on-cost/etc.). Backward-compatible no-op when a term isn't in `GLOSSARY`.
**Done when:** a non-expert can hover any CRE acronym on the deal + detail surfaces.

## 5. Mandate console → align to the verdict status tokens
**Where:** `src/app/dashboard/capital/mandates/page.tsx` +
[src/components/dashboard/mandate-assessments-card.tsx](../src/components/dashboard/mandate-assessments-card.tsx).
**Fix:** the console is already verdict-shaped (meets/conditional/fails throughput); make the
pass/conditional/fail chips use the shared **status tokens** (color+icon+shape) from
[src/components/validation/status.tsx](../src/components/validation/status.tsx) so it matches the
hero/list/portfolio. Optionally surface the borrower **verdict chip** next to each recent verdict.
**Done when:** the console's status styling is visually identical to the rest of the app.

---

## Already done (don't redo)
- `gc-result-card` disciplinary_actions shape-guard — **already guarded**
  ([gc-result-card.tsx:164-169](../src/components/dashboard/gc-result-card.tsx#L164)).
- The §11.4 verdict rollout (detail/list/deal/handoff/portfolio) — shipped + verified.
- "Book"→"Portfolio", "Evaluate Deal"→"Deals", sizing progressive disclosure, inline-glossary
  foundation — shipped (§10).
