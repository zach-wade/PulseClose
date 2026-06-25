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
6. **✅ #23 FIXED — AI memo used a RETIRED model.** The Story Mode memo called
   `claude-sonnet-4-20250514` (Sonnet 4.0), which **retired 2026-06-15** — every
   memo 404'd, was caught, and returned null (no memo on any fresh validation).
   Bumped to `claude-sonnet-4-6`; swept the other legacy `…-4-5-20250929` call
   sites (share photo/address/bank extract, investor PDF) too. Also raised
   `/api/validations` maxDuration 60→300s (the heavy deed-verify+memo `after()`
   path was budget-starved). **Verified:** a fresh validation's memo generates in
   ~30s. *(Hygiene: add a model-retirement check to VENDOR-LEDGER — a retired model
   id silently breaks every consumer.)*
7. **✅ #29 FIXED — fund persona** routes to the Mandate Console (server-side
   redirect; `getUserProfile` carries `org_type`). Verified: fund@ lands on
   `/dashboard/capital/mandates`.
8. **🔵 #24/#25 — deferred polish:** investor raw-JSON view; Sizing-step NOI/cap
   pre-fill from doc-ingest.

## Re-pass verification (2026-06-25) — fixes confirmed on real data

Deployed the fixes, re-ran the 3 loans through the live pipeline, and re-assessed
the mandate (`scripts/verify-mandate-fix.ts` against the real persisted rows). The
Mandate Console now shows the before/after side by side:

| Borrower | Before | After | Why correct |
|---|---|---|---|
| Mark Morrison (common, Tier 4) | **FAIL · 5 gates** (incl. false "active litigation", "sanctions/PEP", "not active") | **FAIL · 1 gate** (experience tier) | Disambiguation false-positives gone; the one fail is legitimate (no verifiable track record). |
| Christopher Soverns (clean, entity 429) | **FAIL · 3 gates** | **CONDITIONAL** (re-run) | A clean borrower with an incomplete check is no longer hard-failed. |
| Nik Kafetzopoulos (clean, entity 429) | **FAIL · 3 gates** | **CONDITIONAL** (re-run) | Same. |

Console summary went from **0 conditional / all-fail** to **2 meet · 2 conditional · 5
fail**. Also confirmed live: **#22** entity copy now reads "lookup did not complete —
re-run; not a confirmation the entity is absent" (was "could not be located — verify
spelling"); **#21** pipeline marks a 429'd entity "partial" not "flagged"; **#20** the
Deal tab leads with a "Size this deal" CTA.

**Still open after the pass:** **#19** — the Cobalt *trial quota* is exhausted, so the
entity pillar 429s regardless of the new backoff (a vendor-$/queue issue, not a code
bug); **#23** — AI memo generation; a minor handoff "Litigation & sanctions" info line
still prints the raw `potential_match` instead of the classified "1 exclusion-list
(informational)".

## Doc-ingest tested on REAL ICC packages (2026-06-25) — Task 1

Tested `/api/ingest/borrower-doc` end-to-end on the real packages (`scripts/drive-docingest.ts`).

**✅ Extraction quality is strong — the moat path works.** This is the answer to "is
the doc-ingested underwriting half real?": **yes.**
- **905 LBJ (signed app PDF, 3.3M):** borrower Evan Shapiro, Evander Co LLC, CA,
  loan $356,250, sfr/bridge, **+ 2 track-record addresses** (601 Pacific, 2716 6th) —
  form pre-filled perfectly.
- **286 Virginia (loan-request, via CSV):** Kafetzopoulos / Achilles Properties LLC,
  loan $3.4M (80% LTC), purchase $1.75M, ARV $5.67M, rehab $2.5M, FICO 740,
  construction, **+8 track-record addresses**, notes caught "refinancing existing
  $1.079M Insignia bridge."
- **544 Sunset (loan-request, via CSV):** loan **$4,239,490 (exact file match)**,
  purchase $2.2M, ARV $6.48M, FICO 731 — spot-on.

**✅ #26 FIXED (2026-06-25) — The 4MB cap was Vercel's serverless body limit.** Now the
browser uploads the file STRAIGHT to the documents bucket (bypassing Vercel), and the
API reads it from storage via the admin client (migration 00049 raised the bucket to
50MB for appraisals; route guards PDFs >24MB for Claude's 32MB cap; temp object
deleted immediately after read). **Verified live on the previously-413'ing files:**
286-virginia xlsx (5.3M), 812-tait PDF (5.8M), and the **8.1M / 140-page** 1310-armadale
PDF all return HTTP 200 with clean extractions (model bumped to claude-sonnet-4-6).

**✅ #27 FIXED — "Max 10MB" copy → "up to 50MB."**

## Per-persona pass (2026-06-25) — Task 2

Drove `solo@` and `fund@` (`scripts/drive-persona.ts`; `ux-review/{solo,fund}/`).
- **Solo** ("Spreadsheet Refugee / Solo Lending LLC"): functional, **identical UI/nav
  to the underwriter** (Borrowers/Deals/Capital/Book). Works, but un-differentiated —
  a solo operator gets the same Capital/Book surfaces as a team. Low priority.
- **🔴 #29 — Fund persona gets the WRONG home.** `fund@` ("Fund Mandator / Keystone
  Capital Partners") lands on the **originator onboarding** screen — "Start here…
  Validate the borrower / Run your first validation." A capital provider doesn't run
  borrower validations; their home is the **Mandate Console + cross-originator program
  view** (the verdict surface). This is the known "make the Fund a first-class
  citizen" gap (the Fund tenant is unbuilt) — the top persona finding.

**🟡 #28 — Multi-value docs:** a loan request can carry several figures (max-ask vs
approved loan; pro-forma vs conservative ARV). The AI picks one — 286's loan came
back $3.4M (80%-LTC max) vs the $3.29M approved, ARV $5.67M vs the $4.615M in our
golden set. The "review before running" step covers it, but surfacing *which* figure
(or flagging alternates) would help. Minor; entity_state also came back null from the
CSVs (present in the PDF).
