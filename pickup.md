# PulseClose — Session Pickup & Execution Plan (2026-07-01, rev. DAMON-RESET)

> **Self-contained handoff — start a fresh session from here.**
> This session was **analysis + planning, no code shipped.** Reviewed the **2026-07-01
> Damon engagement-reset demo transcript** (he saw the restructured 4-section product;
> ICC now trialing it **July + August across both Insignia businesses**), ran three code
> deep-reads + checked his assumptions against the real 208-loan ICC book, and reconciled
> the sizer-vs-Solver question. Then wrote it all into the planning docs. **Everything is
> on `main`, green, migrations unchanged (00001–00051).**
>
> **The active plan is now the ROADMAP [Post-Damon-reset sequence](docs/ROADMAP.md#post-damon-reset-sequence-2026-07-01--construction-sizing-coherence-craft).**
> Next code work = **UW-1 (construction sizing in the engine).** Prior session's
> SOS-coverage state is preserved below under §Critical context (still valid).

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
unchanged. This session found the one gap that blocks the ICC trial: **the sizing engine is
loan-type-agnostic, but ~27% of ICC's real book is construction+F&F, and the flagship #10049
loan is Ground-Up Construction sized as bridge** — confirming Damon's "the LPB's wrong because
it's a construction loan." That + two coherence breaks + a craft/de-AI UX pass are the plan.

## Done this session (docs only — no code)
- **Extracted the Damon reset transcript** (`~/Downloads/Damon Engagement Reset mtg 7.1.26.rtf`) →
  memories `project_damon_engagement_reset_2026-07-01` + `project_damon_excel_model_moat`.
- **Checked his assumptions vs. real data:** #10049 (99 TO 100 LLC) **is Ground-Up Construction**;
  ICC book of 208 = **137 Bridge / 32 GUC / 24 F&F / 15 DSCR**. Construction feedback confirmed.
- **Reconciled sizer-vs-Solver:** product has the **bridge** ladder (`sizing.ts`); the deal-type
  construction buy-box was validated in `scripts/fidelity-score.ts` (6.9% mean |Δ|) **but never
  ported to the engine**; the interest-reserve/holdback/draw math (Michael's local Excel Solver)
  **exists in no repo.** ICC's real Excel models DO sit in `clients/insignia-capital/data/`.
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
⚠️ A **16GB+ server image is still downloading** (`~/Downloads/Unconfirmed*.crdownload`) — analyze when it lands.

## Active plan — ROADMAP Post-Damon-reset sequence (5 phases). NEXT: build UW-1.

- **Phase 1 (do first, trial-blocking):** UW-1 structured RTL/construction sizing (waterfall +
  holdback split + interest-reserve + deal-type buy-box + cushions, per the decoded RTL sizer) ·
  UW-2 golden fixtures to-the-penny · UW-5 live-solve/goal-seek · UW-6 DSCR income-approach ·
  UW-3 surface depth layers · UW-4 deposits/equity.
- **Phase 2 (coherence+trust):** COH-2 mandate-reads-raw fix (HIGH) · UX-1 craft/de-AI ·
  **UX-2 persona-agnostic coherence** (owner's top priority — one Deal object, one verdict,
  Excel-parity layout, cushions everywhere, scenario compare; principle 13 / UX-REDESIGN §13).
- **Phase 3 (best-execution+capital):** A1+ rate stack across 10 real investors · CAP-1
  concentration + facility-aware sizing · CAP-2 pricing/margin overlay · COND-1 auto-conditions.
- **Phase 4 (moat):** AN-1 cost benchmarking · AN-2 reserve adequacy · AN-3 sponsor capacity ·
  AN-4 calibrate-to-outcomes.
- **Phase 5:** INT-1 Salesforce · Consumer Bridge (logged adjacency, not built).

**Starting now: UW-1** — read `src/lib/underwriting/sizing.ts` + `scripts/fidelity-score.ts`
`buyBoxFor`, implement the structured waterfall + tier×rehab buy-box + cushions, then UW-2
golden fixtures (RTL Option_1 → Max Loan $2,422,000, Net $2,200,000, CTC $294,999).

**[USER / NON-PRODUCT ACTIONS]**
- **Email Damon the AAPL conference info** (Nov 9–11, Vegas) — he asked, can't find it.
- **~~Michael's ground-up Solver~~** — found in the trove (`Loan Sizer - Construction.xlsx`; the "Solver" is a closed-form-solvable circular interest reserve). Still: grab Damon's condo-project Excel + confirm `ICC SFR 1-4 Construction Deck V.1.01.xlsx` (likely in the 16GB download).
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
- **Commits this session:** `1fdc7a3 → f82d553` (14) · migrations **00001–00051** (unchanged)
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

## Decisions for the user (open)
- **CALICO** — chase the CBC sub approval (bizfile@sos.ca.gov); or accept Cobalt-paid CA indefinitely.
- **VA corp.xlsx + Iowa** — build for fuller free coverage, or leave (Cobalt covers the gaps)?
- **Next product thread** — more free-state coverage vs. calibration vs. UX polish?
