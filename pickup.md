# PulseClose — Session Pickup & Execution Plan (2026-07-01, rev. UW-ENGINE-SHIPPED)

> **Self-contained handoff — start a fresh session from here.**
> Arc of this session: from the **2026-07-01 Damon engagement-reset** (ICC trialing PulseClose
> **July + August across both Insignia businesses**) → decoded ICC's real Excel models from the
> data trove → **BUILT + shipped the whole deal-sizing engine** (RTL/fix&flip, ground-up
> construction, DSCR, goal-seek, dispatcher — all math-verified **to the penny**) → **merged to
> `main` + deployed.** All green; migrations unchanged (00001–00051).
>
> **The engine is DORMANT** — imported by no UI yet, so the deploy is additive/safe. **NEXT =
> wire the shipped sizers into the deal stepper (UX-2)** — precise steps + a prod-drive gate in
> §NEXT below.
>
> **⭐ NORTH STAR for the underwriting thread: REPLACE THE EXCEL → port into the CRM → API
> backbone into the LOS** (owner-set; sharpened + stress-tested 2026-07-01 (c) after mining the
> 72GB ICC Box). The honest framing: replace the Excel for **80–90% of standard deals + be
> system-of-record even for the 10% that still touch a sheet** (not "kill Excel"). The **platform
> stack**: engine → replace-the-Excel app → **Salesforce embed (INT-1, Layer 2)** → **LOS push
> (Nexys/Encompass, INT-2, Layer 3)**; CRM before LOS (the deal is born in the CRM, pre-LOS);
> API-first throughout (principle 14). See ROADMAP §North star (platform stack + stress test) +
> **UW-7** (dual sizer · refi stress grid · operational shortfall · constraint toggle · LOI/rate-
> offer gen). Also the standalone cold wedge ("kill your Excel UW model").
>
> **Active plan:** ROADMAP [Post-Damon-reset sequence](docs/ROADMAP.md#post-damon-reset-sequence-2026-07-01--construction-sizing-coherence-craft).
> Prior session's SOS-coverage state is preserved under §Critical context (still valid).

## Read first (in order)
1. **[docs/ROADMAP.md](docs/ROADMAP.md) §Post-Damon-reset sequence** — the active ordered plan (UW-1 → INT-1) + the 2026-07-01 Decisions Log entry.
2. **[docs/CALIBRATION-FINDINGS.md](docs/CALIBRATION-FINDINGS.md)** — findings #14–#17 (deal-type buy-box, `costSpentToDate`) + #18 (mandate reads raw results, still open). The evidence base for UW-1 + COH-2.
3. **[STRATEGY.md](STRATEGY.md) §Sharpened by the Damon reset** — the "loan desk in a box" product-space synthesis + the sizer-vs-Solver reconciliation.
4. **[docs/UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md) §12** — the craft/de-AI + de-clutter pass (UX-1).
5. **[docs/IDEAS.md](docs/IDEAS.md) §Damon engagement-reset demo** — the unscoped versions · memory `MEMORY.md` (esp. `project_damon_excel_model_moat`, `project_damon_engagement_reset_2026-07-01`).

---

## Where we are — headline (2026-07-01)
On `main`, deployed green; **migrations 00001–00051 (no new migrations)**; build clean. The
prior session's **free-SOS coverage (12 free entity states + Cobalt fallback)** is live and
unchanged. The gap that blocked the ICC trial — the engine was loan-type-agnostic while ~27%
of ICC's book is construction+F&F — is now **CLOSED at the engine layer**: RTL, ground-up
construction, and DSCR sizers all ship and reproduce ICC's real sheets to the penny. What's
left to make it *usable* is the stepper UI (UX-2), plus the coherence fix COH-2 and the Excel
long-tail (UW-7) toward the "replace the Excel" north star.

## Analysis + planning done this session (then the code below)
- **Extracted the Damon reset transcript** (`~/Downloads/Damon Engagement Reset mtg 7.1.26.rtf`) →
  memories `project_damon_engagement_reset_2026-07-01` + `project_damon_excel_model_moat`.
- **Checked his assumptions vs. real data:** #10049 (99 TO 100 LLC) **is Ground-Up Construction**;
  ICC book of 208 = **137 Bridge / 32 GUC / 24 F&F / 15 DSCR**. Construction feedback confirmed.
- **Reconciled sizer-vs-Solver** (then BUILT it — see §SHIPPED): the deal-type construction
  buy-box was validated in `scripts/fidelity-score.ts` (6.9% mean |Δ|) but wasn't in the engine;
  the ground-up "Solver" turned out to be `Loan Sizer - Construction.xlsx` in the trove (a
  closed-form-solvable circular interest reserve), now shipped as `construction-sizer.ts`.
- **Wrote the plan into:** ROADMAP (new sequence + Decisions Log), STRATEGY (§Sharpened…),
  UX-REDESIGN-PLAN (§12), IDEAS (§Damon reset). Cleaned memory to PulseClose-only.

---

## Trove decoded (2026-07-01) — the models are now in the repo
ICC handed over a large data trove. Product-relevant models decoded + pulled into
**`clients/insignia-capital/data/loan-sizer-trove-2026-07/`** (consulting repo) with a
**README** documenting the decoded logic + golden fixtures. Crown jewel:
**`RTL_Loan_Sizer_Fillable.xlsx`** (Noah, 6/23) — fix&flip sizer producing a *structured
deal* (proceeds waterfall + initial-advance-vs-holdback + prepaid-interest + cash-to-close +
Tier×Rehab buy-box with cushion per test). Also: Construction Budget, DSCR/PITIA calc, Colchis
rate-stack pricing tool, Track Record schema. `Lenders.zip` = 10 real investor guides (A1 set).
✅ **The full ICC Box landed + was mined (2026-07-01 (c))** — `~/Downloads/Private Folder.zip`,
**72GB / 94,751 files**. Synthesis-only (nothing persisted to repo); findings folded into
ROADMAP (platform stack + UW-7 long-tail + INT-2 + principle 14), STRATEGY, IDEAS, UX-REDESIGN
§13, CALIBRATION-FINDINGS **#24–#30**. Highlights: ICC's MFR sheet sizes with `MIN(LTV/DY/DSCR)`
(validates the engine); a **dual in-place+stabilized sizer**; a **refinance NOI-stress grid**
("does the bridge exit?"); operational-shortfall reserve; per-constraint include/exclude toggle;
the CSI-division cost taxonomy (AN-1); intake schema from ICC's own loan app. Mined ONLY models/
process docs — stayed out of PII packets, QuickBooks/accounting, captured-server-data.
> **🔒 DATA-GOVERNANCE (surfaced 2026-07-01):** the Box is NOT just models — it holds
> **BOIR/FINCEN beneficial-ownership filings, employee withholding (PII), ICC financials, and a
> "Cyber Attack File / Captured Server Data" folder (`clients.xls`, `Event_log`)**. Treat it as
> ICC-confidential + third-party PII under NDA. Extract ONLY the underwriting models we need;
> do NOT ingest the Box wholesale into any repo/product/AI pipeline; the captured-server-data is
> off-limits. Be deliberate about where 60GB of this lives and how long we keep it.

## SHIPPED this session (branch `uw1-rtl-structured-sizer`, math cross-checked to the penny)
The whole sizing-engine layer is built + verified (pure modules, no UI yet):
- **UW-1 RTL/fix&flip** — `src/lib/underwriting/rtl-sizer.ts` + `scripts/verify-rtl-sizer.ts`
  (30/30, reproduces `RTL_Loan_Sizer` Option_1 to the penny: proceeds waterfall + advance/
  holdback split + Tier×Rehab buy-box + cushions).
- **UW-1 ground-up construction** — `construction-sizer.ts` + `verify-construction-sizer.ts`
  (21/21). The "Solver" = a **circular capitalized interest reserve** that solves in **closed
  form** (`TotalLoan = base/(1−k)`); proven `closed-form == fixed-point`. 2 findings (#19/#20).
- **UW-6 DSCR** — `dscr-sizer.ts` + `verify-dscr-sizer.ts` (15/15). Both DSCR conventions
  (residential PITIA + commercial NOI); PV max-loan proven identical to `underwrite()`. Finding #22.
- **UW-5 live-solve** — `solve.ts` + `verify-solve.ts` (11/11). Bisection goal-seek inverts all
  sizers ("what advance hits $X cash-to-close / a target DSCR"); round-trip verified.
- **Dispatcher** — `dispatch.ts` + `verify-dispatch.ts` (14/14). `sizingModeForLoanType()` routes
  the Nexys loan_type → the right sizer (honors CALIBRATION #14 economics override); `sizeDeal()`
  returns a mode-tagged result.
**91 assertions total, `tsc` + lint clean.** Findings `docs/CALIBRATION-FINDINGS.md` #19–23
(#23 = dispatcher DSCR asymmetry — decide before the stepper: route DSCR mode to `maxLoanByDscr`
so all modes SIZE, with `dscrForLoan` as a "check my number" affordance).
**MERGED to main + deployed 2026-07-01** (engine is dormant — imported by no surface yet, so the
deploy is additive/safe). Vendor work merged too (VENDOR-LEDGER RentCast plan + temp-probe removal).

## RentCast / vendor note (2026-07-01)
The 85% RentCast burn is **NOT PulseClose** (70 req lifetime, 0 last week) — it's the shared
**`bf`/Build-Folio** key on the one $74/mo 1,000-req API Foundation plan. Owner action: put
Build-Folio on its own RentCast account or upgrade; audit its 17.5% error rate. See VENDOR-LEDGER
§4 + the new Plan snapshot (⚠️ CONFIRM rows = costs not yet verified against dashboards).

## NEXT (paused by choice) — finish wiring the sizers into the deal stepper (UX-2)
The engine layer is done + dormant; the remaining work is a real feature needing a **prod visual
drive** to verify (never mark UI done without a drive — memory `feedback_verify_the_ui_not_just_data`).
Precise steps:
1. **Input schema** — extend `UnderwriteBody` + `uwSizingInputsV1` (Zod, `src/lib/schemas/`) with the
   mode-specific fields: RTL (asIsValue, arv, purchaseAdvancePct, rehabFundingPct, prepaidInterestMonths,
   closingCostsPct, tier, fico, rehabType); construction (reserveMonths, reserveDiscount, holdbackPct,
   originationFeePct, fixedClosingCosts, maxLTC, maxLoanToARV); DSCR (monthlyRent, taxes, insurance, hoa).
2. **API dispatch** — in `src/app/api/underwrite/route.ts` (377 lines): call `sizingModeForLoanType(loan_type, {rehabBudget, asIsValue})`
   → `sizeDeal({mode, ...})`; return the mode-tagged `structured` result **alongside** the existing
   `sizing` (additive, backward-compatible). Persist in `uw_models`.
3. **Stepper form** — `src/components/dashboard/deal/deal-stepper.tsx` (1,227 lines; the audit's
   `:851` refs are in THIS file, the `deal/` subfolder). Step ③ Sizing: show the mode-specific inputs
   for the chosen loan_type; keep bridge inputs for Bridge.
4. **Excel-parity result UI (UX-2)** — new components `<ProceedsWaterfall>` (advance+holdback−prepaid−closing→net→cash-to-close→equity%)
   on the LEFT, `<ConstraintLadder cushion>` (pass/fail + headroom per test) on the RIGHT — mirroring the
   RTL/Construction sheets. Add UW-5 `<SolveControl>` sliders (goal-seek). Spec: UX-REDESIGN-PLAN §13.2.
5. **Prod drive** — deploy, drive `/dashboard/evaluate` for a Fix&Flip + a Ground-Up + a DSCR deal
   (Playwright + screenshots), read them, verify the numbers match the golden fixtures on-screen.
Then UW-3 (surface depth layers) · UW-4 (deposits/equity).
- **Phase 2 (coherence+trust):** COH-2 mandate-reads-raw fix (HIGH) · UX-1 craft/de-AI ·
  **UX-2 persona-agnostic coherence** (owner's top priority; principle 13 / UX-REDESIGN §13).
- **Phase 3:** A1+ rate stack (10 real investors) · CAP-1 concentration + facility-aware · CAP-2 pricing · COND-1 auto-conditions.
- **Phase 4 (moat):** AN-1 cost benchmarking · AN-2 reserve adequacy · AN-3 sponsor capacity · AN-4 calibrate-to-outcomes.
- **Phase 5:** INT-1 Salesforce · Consumer Bridge (logged adjacency, not built).

**[USER / NON-PRODUCT ACTIONS]**
- **Email Damon the AAPL conference info** (Nov 9–11, Vegas) — he asked, can't find it.
- **~~Michael's ground-up Solver~~** — found in the trove (`Loan Sizer - Construction.xlsx`; the "Solver" is a closed-form-solvable circular interest reserve). Still: grab Damon's condo-project Excel + confirm `ICC SFR 1-4 Construction Deck V.1.01.xlsx` (likely in the 60GB+ ICC Box download).
- **Thursday 4:00** — run the **Livermore bridge-apartment live deal** through PulseClose with him.
- **CALICO subscription approval** (carried) — chase `bizfile@sos.ca.gov`; CA works via Cobalt meanwhile.

---

## Critical context (carry forward — non-negotiable)
- **CALICO** — the CA subscription (product **CBC API Production**) has been **"Submitted" since
  06/25**. The API itself is **live + healthy** (probed: returns 401 "invalid subscription key for
  an *active* subscription" — it just needs the sub approved). CBC is normally self-serve, so stuck
  = anomaly (likely an unclicked signup-confirmation email or a per-product approval flag). **UCC
  UAT is irrelevant — cancel it.** No dedicated CALICO support address; escalate via
  **bizfile@sos.ca.gov / (916) 653-6814**. API: portal `calicodev.sos.ca.gov`, API host
  `calico.sos.ca.gov` (`/cbc/v1/api/`, header `Ocp-Apim-Subscription-Key`), returns
  status/formation/agent but **not officers**. `CALICO_API_KEY` env var wires it up (`sos-free.ts`).
- **Free-SOS architecture (`src/lib/adapters/sos-free.ts`):** three datacenter-friendly patterns —
  **Socrata** (CO/NY/CT/OR/PA), **open no-auth JSON API** (TX Comptroller · NY DOS · ID/ND FirstStop),
  **open ArcGIS FeatureServer** (DC). `FREE_SOS_STATES` lists live states; `SOS_FREE_BULK` (coverage
  map) + `scripts/sos-sources.ts` `SOURCES` list bulk states (FL/VA). Bulk `_source`s are in
  `ALWAYS_FRESH_SOURCES` (`sos/lookup.ts`) — the cache IS their source of truth. **Adding a live
  state = one function + a dispatch line; adding a bulk state = one `sos-sources.ts` config.**
- **SOS refresh crons (`.github/workflows/refresh-sos-entities.yml`):** daily (`--daily`, FL work-day
  file only) + quarterly 1st-of-Jan/Apr/Jul/Oct (`--full`, all bulk sources incl. VA). Manual:
  `gh workflow run refresh-sos-entities.yml -f mode=full -f state=FL` (the `state` input isolates one
  source — added this session so FL's 1.7 GB load doesn't drag VA and vice-versa).
- **FL cordata.zip is Deflate64** — never revert to zlib/`unzipper` for it; `7z` is required (in CI).
- **Disambiguation rule (END-TO-END):** weak = filtered noise (hidden), possible/probable = "review",
  confirmed = hit — across verdict, handoff, litigation card, mandate gates. DOB stays transient.
- **Individual borrowers (no entity) are first-class:** entity + GC pillars read not_applicable;
  no phantom lookups; no spurious mandate fails.
- **UX-AUDIT-RUBRIC.md is the design gate** — no raw snake_case/enums (`enumLabel`/`factorLabel`);
  status = color+icon+shape; **blue = actions only (active status = GREEN)**; no `text-lg`/`xl`;
  white cards on slate; no gradients/emoji; honest "Preview/Beta" labels.
- **The spine (unchanged):** deterministic engine sizes + tiers; **AI narrates, never sets the
  number or the tier**; **one `computeVerdict()` on every surface** (pass `mandate` standing — the
  #10049 "mismatch" was a harness that forgot to); **model ids opus-4-8 / sonnet-4-6 only** (a
  retired id silently 404s every consumer); Westbrook demo is **seeded**.

---

## Reference
- **Repo:** `/Users/zachwade/code/active/pulseclose` · **Prod:** https://app.pulseclose.com
- **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose` · **Supabase:** `oazwscmgyqknwatqgtyc`
- **Commits this session:** the UW engine layer + docs + vendor audit (`73802d0 → 22e0614`), merged to `main`. Migrations **00001–00051** (unchanged, no new).
- **Engine files (dormant, tested):** `src/lib/underwriting/{rtl-sizer,construction-sizer,dscr-sizer,solve,dispatch}.ts` · tests `scripts/verify-{rtl,construction,dscr,solve,dispatch}*.ts` (run all to re-green).
- **Decoded models + golden fixtures:** `clients/insignia-capital/data/loan-sizer-trove-2026-07/` (+ README with the math).
- **Test orgs (pw `Test1234!`):** uw@ `27296b6b-87f2-4b71-9e84-2c71f652449c` · solo@
  `db330e86-bce5-4428-9cd3-81c2a683884a` · fund@ `0aada23e-56f5-47ce-b400-a872be3daaf1` (org_type=fund)
- **Real-loan trove:** `~/Downloads/Loan Report - All Loan Report.csv` (Nexys export). Free-coverage
  loans: **FL** #10049 (99 TO 100 LLC + `CGC1525790`, all-5-free ✓), #10050 (FKAC 1 LLC + `CGC1516589`);
  **NY** #10285 Nachman. #10049 validation from this session: `ef7ec968-e6d4-4832-97e1-ffd10e453587`.
- **Cache counts:** FL **3.93M** active · VA **388k** active LLCs · FL/WA/OR/VA GC bulk (contractors).

**Commands**
```bash
npm run build                                        # sanity-check before push
set -a; source .env.local; set +a
npx tsx scripts/e2e-persona-loan.ts fili             # #10049 all-5-free E2E (keys: nachman|pappas|fili|fkac)
gh workflow run refresh-sos-entities.yml -f mode=full -f state=FL   # reload one bulk state (FL|VA)
gh run watch <run-id> --exit-status                  # watch a CI ingest run
git push origin main                                 # autodeploy; `vercel ls pulseclose | head -3` to confirm
```
*Live keys in `.env.local`: RentCast / OpenSanctions / CourtListener / FRED / **Cobalt** ✅ · CALICO
pending sub-approval. Free SOS state lookups need **no** keys.*

## Decisions / open items for next session
1. **DSCR dispatch (finding #23)** — before wiring: route `dscr` mode to `maxLoanByDscr` (SIZE) with `dscrForLoan` as "check my number"? (Recommended yes.)
2. **COH-2 sequencing** — the mandate-reads-raw trust-killer is a live bug on the capital-partner surface Damon-as-fund sees in the trial; consider pulling it forward (ahead of / alongside the stepper) rather than leaving it in Phase 2.
3. **RentCast (owner)** — separate Build-Folio onto its own account/plan or upgrade; audit its 17.5% error rate. PulseClose itself is fine (~0 usage).
4. **Vendor ledger ⚠️ CONFIRM rows** — verify Supabase/Vercel/Sentry/Cobalt/Realie/Regrid/OpenSanctions/GoDaddy costs against dashboards.
5. **ICC Box (72GB)** — ✅ landed + mined 2026-07-01 (c) (synthesis-only, findings in CALIBRATION #24–#30). Governance held: models/process docs only, no PII/QuickBooks/captured-server-data. Still worth a targeted look for `ICC SFR 1-4 Construction Deck V.1.01.xlsx` + Damon's condo-project Excel if/when needed.
6. **CALICO (carried)** — chase the CBC sub approval (bizfile@sos.ca.gov); CA works via Cobalt meanwhile.
7. **Lender Grid (~35 lenders)** — Downloads re-scan (2026-07-01 (d)) found `Insignia Capital Corp.zip` → `Lender Grid/` + master `ICC Lender Grid 1.20.24.xlsx` = ~35 real lender rate sheets/guidelines (Bloomfield, Corevest, Dunmor, Archwest, LendingOne, Conventus, ACRA, Eastview, …). We've encoded **2** (Colchis + Oakhurst). This is the A1+ fixture set → seed `scripts/seed-sample-investors.ts` from it. See CALIBRATION #31–#33.
8. **Formula-canvas decision — RESOLVED + encoded (2026-07-01).** "Structured core, open edges": **Tier 1** (shipped verified modes) + **Tier 2** (override-any-cell + custom adjustments + constraint toggle + per-org assumptions) committed in ROADMAP UW-7 + UX-REDESIGN §13.2 `<CustomInputs>`; **Tier 3** (governed user-authored formula canvas + AI-assisted xlsx import, embedded engine, structured output skeleton, labeled "custom/unverified") logged in IDEAS with guardrails — **built only on real trial demand.** Hard line: never render an arbitrary user grid without a structured output skeleton.

**Also queued:** UW-7 (Excel long-tail → the "replace the Excel" north star) · UW-3 (surface depth layers) · UW-4 (deposits/equity) · A1+ (parse the ~35-lender Lender Grid).

**Doc-staleness sweep (2026-07-01 (d)):** North Star de-NPLA'd (→ AAPL Nov 9-11 + July/Aug ICC trial); Status snapshot notes engine shipped/dormant; E2E migration count 25→51; NPLA-RUNBOOK + DEMO-DATA-HYGIENE marked HISTORICAL; created **docs/DATA-GOVERNANCE.md** (persistent Box-PII policy) + added to CLAUDE.md read-list. Full audit + re-scan folded into ROADMAP/STRATEGY/IDEAS/UX-REDESIGN/CALIBRATION.
