# PulseClose — Session Pickup & Execution Plan (2026-06-25, rev. FIDELITY phase II)

> **Self-contained handoff. A fresh session starts at §"The plan (start here)".**
> Center of gravity (unchanged): **calibrate the real pipeline against real loans
> until it's trustworthy** — the demo is seeded synthetic; the real product must
> produce this on real deals. Since the last pickup, the big diligence gaps the
> calibration surfaced are now **substantially closed** (disambiguation, doc-ingest
> of the underwriting package, multi-state GC). **Next: re-run the harness on more
> real loans to find what's LEFT, then actually walk a few real loans through the
> product UI to see what the experience + data look like end-to-end.**

## Read first (in order)
1. **[docs/CALIBRATION-FINDINGS.md](docs/CALIBRATION-FINDINGS.md) — THE NORTH STAR.**
   What the live pipeline did to real ICC loans + the ranked gaps. Findings
   #1/#5/#7 (and effectively #4) are now FIXED; re-read to see what remains.
2. [docs/RESEARCH-DISAMBIGUATION.md](docs/RESEARCH-DISAMBIGUATION.md) — OFAC/FFIEC-cited
   basis for the screening disambiguation layer + the (now-shipped) build plan.
3. [docs/RESEARCH-GC-VALIDATION.md](docs/RESEARCH-GC-VALIDATION.md) — the GC
   coverage research + the state-by-state ingest map + refresh-cron design.
4. [docs/VENDOR-CAPABILITY-MAP.md](docs/VENDOR-CAPABILITY-MAP.md) — vendor catalog,
   live-key status, decisions.
5. [STRATEGY.md](STRATEGY.md) · memory `MEMORY.md` (esp. `project_screening_disambiguation`,
   `project_fidelity_pivot`).

---

## Where we are — the headline (2026-06-25)

Two realities, now much closer together:
- **The engine is real and excellent** (unchanged): deterministic sizing + exit/
  takeout + stabilization + interest reserve + per-investor best-execution +
  mandate verdict. AI narrates, never sets the number/tier.
- **The diligence data is now far more trustworthy** — this is the change. The
  trust-killer (common-name false positives) is fixed at the source; the
  underwriting package is ingestible; GC validation spans 5 states on real data.

Everything below is **live on `main`, deployed green**; migrations **00001–00048**
(00048 = litigation `not_run`, ⚠️ not yet pushed — deploy with the #13 fix);
`npm run build` clean; `npx tsx scripts/verify-underwriting-engine.ts` +
`npx tsx scripts/test-disambiguation.ts` (26 assertions) pass.

**What changed since the last pickup (all shipped + on prod):**
- **Screening disambiguation layer** (`src/lib/screening/disambiguation.ts`) — the
  trust-killer fix. Name-only matches capped at "possible — review," never a
  tier-dropping hit; "name appears common" on dispersed matches. Wired through
  OpenSanctions + OFAC + CourtListener + risk factors + UI. Verified on loan 10228
  (20 litigation → 1 possible + 19 unlikely) and a 6-loan distinctive-name set.
- **List-type classification** (OFAC FAQ #5 §1) — only true `sanction`/`pep` hits
  drive risk; SAM/FINRA/medical/disqualified-director *exclusions* are
  informational. (Every "sanctions" match in the 6-loan set was actually an
  exclusion-list entry — pure noise, now routed out of the tier.)
- **Identifier surfacing + jurisdiction/DOB corroboration** — the matched entry's
  DOB/POB/nationality render so a reviewer can clear a false positive; borrower
  DOB (optional, transient, never persisted/never to AI) + country fed into the
  OpenSanctions query + disambiguation subject.
- **Litigation caption precision** — first-name-position matching ("Paul Mark
  Morrison" ≠ "Mark Morrison"); weak/none = "not the named party" = filtered.
- **Adjudication audit trail** — reuses `factor_overrides` (actor+time+reason) with
  OFAC-FAQ framing on the `sanctions_review`/`litigation_review` factors.
- **Doc-ingest of the underwriting package** (`/api/ingest/borrower-doc`) — now
  extracts structured loan_amount/purchase/as-is/ARV/rehab/FICO/type/purpose (+
  the existing entity/GC/addresses); a `DocIngest` drop zone in the deal-stepper
  Terms step pre-fills the sizing workbench. Validated on a real ICC package.
- **Multi-state GC validation** — `contractor_licenses` table (00046) + a
  config-driven ingest registry (`scripts/contractor-sources.ts` +
  `ingest-contractors.ts`) + DB-first `lookupGC` (`src/lib/gc/lookup.ts`). **~400k
  licenses across CA(scrape)+WA/OR/FL/VA(bulk).** Coverage-miss telemetry
  (`gc_coverage_misses`, 00047). Registry-driven refresh cron
  (`.github/workflows/refresh-contractor-licenses.yml`, cadence per source).
  Smart no-coverage UX ("no statewide GC license" for TX/NY/PA vs "automated").
  Cobalt contractor API deliberately NOT adopted (redundant/structurally empty).
- **Interest-reserve presentation** — now leads with GROSS, net as a labeled line.
- **Deploy fix** — swapped `next/font/google` → bundled `geist` package (the
  intermittent "Failed to fetch Geist Mono from Google Fonts" build failures).

---

## The plan (start here) — back to fidelity, then SEE the experience

**Goal this session: (A) find what's still broken by running more real loans
through the harness, then (B) actually walk a few real loans through the product
UI to see the screens, the UX, and the real data — not the seeded demo.**

### A. Harness: re-run + loop more real loans, hunt new issues
**Done this session (2026-06-25):** re-ran the harness (disambiguation #7–#12 all
hold — trust-killer stable); **added 3 real loans** (905-lbj TX, 812-tait MFR+GC,
1310-armadale construction); **built the field-by-field fidelity score**. New
findings #13–#17 logged in CALIBRATION-FINDINGS.md. **Golden set refactored into
`scripts/golden-loans.ts`** (shared by both harnesses — no drift).

1. ✅ **Re-ran the harness** + ✅ **FIXED finding #13** (the top trust bug): a
   failed check (429) was indistinguishable from a clean check and litigation
   *rewarded* it with +10 confidence. Now litigation emits a `not_run` sentinel
   (migration **00048**), the pipeline withholds the bonus + drops to `partial` +
   warns, the UI shows a "Did not complete" badge, the monitor reports
   `rate_limited`, and the AI memo is told incomplete ≠ clear. Verified live: 429'd
   loans now print "SCREEN INCOMPLETE." **⚠️ Migration 00048 must deploy WITH the
   code** (a `not_run` insert needs the expanded CHECK or it throws).
2. ◐ **Added 3 loans** (now 9 in `GOLDEN[]`). Still queued: 1518 Dolphin Ter
   (#8008173, draw emails only — thin). Keep adding non-CA + MFR as the trove yields.
3. ✅ **Field-by-field fidelity score built + tuned** (`scripts/fidelity-score.ts`):
   `npx tsx scripts/fidelity-score.ts`. After #15/#16 fixes: **5/7 within buy-box,
   mean |Δ| 6.9%** (was 25.6%). Engine reproduces ICC's actual decisions; the lone
   outlier is 10228 (87% LTARV — genuinely aggressive, correctly surfaced).
   - ✅ **#15** — deal-type-aware buy-box (`buyBoxFor`): construction is
     LTARV-primary (70%) with LTC loose (90%), not LTC-first.
   - ✅ **#16** — engine gained `costSpentToDate` (SizingInputs + schema +
     `/api/underwrite`) so in-progress refis (812-tait) size LTC on the true basis.
   - NEXT: diff TIER + investor PLACEMENT (not just loan $) once audit logs expose
     the actual tier; wire the governing-assumption picker into the product UI.
4. **Watch for remaining CALIBRATION-FINDINGS gaps:** #2 entity-anchored track
   record (owner-name search still fragile — confirmed again: 0 props for
   Morrison/Bhuyan/Duwaji/Series); #3 Regrid geo-trial (retire — see below).

### B. Walk real loans through the actual product UI — ✅ DONE (2026-06-25)
Drove 3 real loans through prod end-to-end + EVERY top-level screen, detail tab,
the stepper, and the printable handoff (`scripts/drive-real-loan.ts` +
`drive-loan-tabs.ts` + `drive-full-review.ts` + `drive-stepper.ts`; screenshots in
`ux-review/real-loan/`). **Full screen-by-screen review: docs/PLAN-B-UI-REVIEW.md.**
Findings #18–#25. **✅ FIXED + VERIFIED on real data this session (deployed):**
- **#18** (🔴 the big one) — the MANDATE (`src/lib/mandates/assess.ts`) now reads
  diligence through disambiguation/classification/not-run, mirroring the risk
  factors. Verified: Morrison FAIL(5 gates incl. false litigation+sanctions+not-
  active) → FAIL(1 legit gate); clean Soverns/Kafetzopoulos FAIL(3) → **CONDITIONAL**
  (re-run). Console: 0 → **2 conditional**. (`scripts/verify-mandate-fix.ts`.)
- **#19** — Cobalt exponential backoff + jitter + retried cached fallback. (Trial
  QUOTA still exhausts → entity 429s anyway; vendor-$/queue follow-up.)
- **#21** — 429'd entity → "partial" not "flagged"; badge no longer false-"Verified".
- **#22** — entity copy distinguishes a 429 ("did not complete — re-run") from "not located".
- **#20** — Deal tab leads with a "Size this deal" CTA.

**Still open:** #19 Cobalt trial quota (vendor decision); **#23 AI memo** didn't
generate on fresh validations (after()/serverless? — needs prod-log look); minor
handoff sanctions info-line shows raw `potential_match`; #24/#25 polish.
**✅ Already-working (re-confirmed):** #13 not-run honesty; disambiguation at
factor/tier/Book level; deed-verify pill.

<details><summary>Original Plan B steps (for reference)</summary>
This is different from the harness (which calls adapters directly, no DB/UI). To
SEE the experience, run a loan through the real product end-to-end and look at
every screen:
1. Log in as the underwriter test org (creds below). 
2. **Intake** (`/dashboard/new`): drop a real loan package (Excel/PDF from the
   trove) → watch doc-ingest pre-fill borrower/entity/GC/addresses; add the
   optional DOB; submit → the live pipeline runs.
3. **Validation detail** (`/dashboard/validations/[id]`): inspect every pillar
   card with REAL data — entity, track record, litigation (the disambiguation
   "possible — review" / "unlikely" badges), GC (now multi-state), sanctions
   (sanctions/PEP vs collapsed exclusions), the Flags tile, why-this-rating.
4. **Evaluate/underwrite** (`/dashboard/evaluate` → stepper): drop the package in
   the Terms step → pre-filled sizing; run eligibility + sizing + judgment; look
   at the interest-reserve (gross-led), best-execution, mandate verdict.
5. **Capture what's good and what's rough** — this is a UX-quality pass on real
   data. Note anything that reads as a black box, a false positive, an empty
   pillar, or a confusing number. Feed findings back into CALIBRATION-FINDINGS.

> ⚠️ Use a REAL loan run through the live pipeline for this — NOT the seeded
> Westbrook demo (it's hand-authored synthetic; never present it as vendor-pulled).

</details>

### C. Lower-priority / decisions (see §Decisions for the user)
- GC refresh cron needs 2 GitHub repo secrets to actually fire (below).
- Regrid retire-vs-pay; CA bulk-FTP migration; per-license GC adapters
  (NV/NC/TN/UT/GA) when miss-telemetry shows the volume.

---

## Critical context (carry forward — non-negotiable)

- **The spine:** deterministic engine sizes + tiers; **AI narrates, never sets the
  number or the tier**; human decides. Keeps us out of ECOA/fair-lending.
- **Disambiguation rule (now codified):** a name-only match (no DOB/address/
  distinctive name) is capped at **"possible — review,"** never a hit; weak/none
  = "not the named party" = filtered noise; only `sanction`/`pep` list types drive
  risk (not SAM/FINRA/medical exclusions). DOB is the promoter to "confirmed" and
  is **transient — never persisted, never sent to AI.**
- **Noah's trust rules:** *"can't trust the output without the inputs"* (drill-down,
  no black box); **a single false positive destroys trust**; *"the less you ask the
  borrower, the better"* (→ doc-ingest, not forms).
- **Damon's gate:** *"get real people, real users in here."* Results = hours saved
  per deal. Distribution = **capital-provider endorsement.**
- **Hard boundary:** rehab spend / ARV / NOI / true ownership % are **package-ingest,
  never API** (research-confirmed). Doc-ingest is how they get in.
- **GC coverage reality:** no nationwide API; TX/NY/PA/NJ/MA/CO have **no statewide
  GC license** (don't chase them — the UI says so). Bulk-ingest is the durable path.
- **The demo (Westbrook) is seeded, not live** — the calibration loop + a real-loan
  UI walkthrough are the path to a *real* demo.

---

## Reference

- **Repo:** `/Users/zachwade/code/active/pulseclose` · **Prod:** https://app.pulseclose.com
- **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose` · **Supabase:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose · migrations **00001–00048**
- **Underwriter test org:** `27296b6b-87f2-4b71-9e84-2c71f652449c` · logins
  `uw@`/`solo@`/`fund@test.pulseclose.com` pw `Test1234!`
- **Westbrook seeded demo:** `/dashboard/validations/44444444-4444-4444-8444-444444444444`
- **Real loan trove:** `~/Downloads` (5.3G: loan apps, Nexys audit logs, appraisals)
  + `~/code/clients/consulting/clients/insignia-capital/data/` (loan-request xlsx).
  Audit logs: `Loan Audit Log - 10287/10294/10295.csv`. Packages:
  `286 Virginia Pl - ICC - Loan Request.xlsx`, `_544 Sunset Ave - ICC - Loan Request - 3.9.26.xlsx`.

**Commands**
```bash
npm run build                                   # sanity-check before push
npx tsx scripts/verify-underwriting-engine.ts   # engine checks
npx tsx scripts/test-disambiguation.ts          # 26 disambiguation assertions
set -a; source .env.local; set +a; npx tsx scripts/calibrate-loan.ts   # the fidelity harness
npx tsx scripts/ingest-contractors.ts [WA|OR|FL|VA|all|--due daily|--due weekly]  # GC bulk refresh
# Re-seed demo: ORG_ID=27296b6b… npx tsx scripts/seed-sample-investors.ts
#   then … PERSONA=underwriter npx tsx scripts/seed-persona-data.ts
git push origin main                            # autodeploy; vercel ls pulseclose | head -5 to confirm
```

**Live key status:** Cobalt/RentCast/OpenSanctions/CourtListener ✅ (prod).
Regrid = geo-limited trial (403 most areas) — fallback only, likely retire.
Cobalt **contractor** trial exhausted (we did NOT adopt it).

---

## Decisions for the user (open)
- **GitHub repo secrets** for the GC refresh cron: add `NEXT_PUBLIC_SUPABASE_URL`
  + `SUPABASE_SERVICE_ROLE_KEY` (Settings → Secrets → Actions). Until then the
  scheduled ingest no-ops harmlessly; the data is already loaded.
- **Regrid:** retire (lean on Realie + RentCast + address-list deed-verify) vs pay
  for coverage. Recommendation: retire — it blocks nothing critical.
- **CA GC bulk migration:** move CA off the CSLB scrape onto the paid Full File FTP
  (stability) — vendor-$ decision. Scrape works today.

## Deferred / queued (NOT lost)
- **Per-license GC adapters** (NV/NC/TN/UT/GA) — build when miss-telemetry shows
  deal flow. **AZ** bulk exists but is Cloudflare-gated (needs a solver).
- **Field-by-field fidelity score** in the harness (item A.3 above).
- Side-by-side **sizing scenarios** + governing-assumption picker; **ZHVI haircut +
  Oakhurst >$3M cap** engine wiring; **full Fund tenant** (org type + RLS +
  cross-originator sharing — gated on the rep-and-warranty question).
- **Liens/judgments** (TLOxp/LexisNexis, FCRA-gated); **HouseCanary** AVM upgrade;
  **Sayari/Middesk** ownership graph — when each becomes the bottleneck.
- **Promote-to-confirmed** is wired for sanctions (DOB); litigation can't promote
  (no DOB in court records) — that's expected.
