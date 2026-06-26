# PulseClose — Session Pickup & Execution Plan (2026-06-25, rev. POST-CALIBRATION + BUILD-PASS)

> **Self-contained handoff. A fresh session can start at §"The plan (start here)".**
> The two big arcs are now DONE: (1) **calibrate the real pipeline against real ICC
> loans** until it's trustworthy, and (2) **walk real loans through the live product
> UI** and fix what was rough. The engine reproduces ICC's actual decisions within
> **~7%**, the diligence layer is honest (no false-cleans, no common-name
> false-positives, even on the mandate/wedge surface), doc-ingest accepts real
> packages, Cobalt is de-rented, and the AI memo + fund persona work. **Next is
> feature work** (macro overlay, Cobalt free-state bulk ingest, tier/placement
> fidelity) — see the plan.

## Read first (in order)
1. **[docs/CALIBRATION-FINDINGS.md](docs/CALIBRATION-FINDINGS.md)** — the fidelity
   loop: what the live pipeline did to real ICC loans + the ranked gaps #1–#17
   (most FIXED; statuses inline). The harness + fidelity-score north star.
2. **[docs/PLAN-B-UI-REVIEW.md](docs/PLAN-B-UI-REVIEW.md)** — the real-loan UI
   walkthrough: screen-by-screen review + findings #18–#29 with fix status +
   the verified before/after on the mandate fix.
3. [docs/RESEARCH-SOS-REPLACEMENT.md](docs/RESEARCH-SOS-REPLACEMENT.md) — how to
   de-rent Cobalt (the SOS cache shipped; free-state bulk ingest is the follow-up).
4. [docs/IDEAS.md](docs/IDEAS.md) — the macro/recession overlay + land/dev Template-9
   enrichment (both have a 2026-06-25 build-now assessment; macro is "next").
5. [docs/RESEARCH-DISAMBIGUATION.md](docs/RESEARCH-DISAMBIGUATION.md) ·
   [docs/RESEARCH-GC-VALIDATION.md](docs/RESEARCH-GC-VALIDATION.md) ·
   [docs/VENDOR-CAPABILITY-MAP.md](docs/VENDOR-CAPABILITY-MAP.md) · [STRATEGY.md](STRATEGY.md)
   · memory `MEMORY.md`.

---

## Where we are — the headline (2026-06-25)

Everything below is **live on `main`, deployed green**; migrations **00001–00051**
applied to prod; `npm run build` clean; `npx tsx scripts/test-disambiguation.ts`
(26 assertions) + `npx tsx scripts/verify-underwriting-engine.ts` pass;
`npx tsx scripts/fidelity-score.ts` = 5/7 within buy-box, **6.9% mean |Δ|**.
All model ids current (**opus-4-8 / sonnet-4-6** only — no retired/legacy ids).

**The product, plainly:** a verification + underwriting gateway whose engine sizes +
judges the loan and whose diligence layer independently verifies the borrower —
both now trustworthy on real deals.
- **Engine** (unchanged, excellent): deterministic sizing across LTV/LTC/LTARV/DSCR/
  debt-yield + exit/takeout + stabilization + interest reserve + per-investor
  best-execution + mandate verdict. AI narrates, never sets the number/tier.
- **Diligence is now honest end-to-end:** common-name false-positives killed at the
  source (disambiguation), exclusion-list "sanctions" classified out, a failed check
  reads as "incomplete" not "clean" (#13), and the **mandate/wedge surface** applies
  all of that too (#18). Doc-ingest accepts the real packages (#26). Cobalt is
  de-rented by a shared cache (#1).

## Findings ledger (compact — detail in the two docs above)

**Calibration (CALIBRATION-FINDINGS.md):** #1 common-name FP ✅ · #2 entity-anchored
track record 🔶 OPEN (owner-name search fragile) · #3 Regrid geo-trial 🔶 (retire) ·
#4 intake captures too little ✅ (doc-ingest) · #5 sanctions exclusion-noise ✅ ·
#13 false-clean check ✅ · #14 loan-type classification ✅ · #15 construction
LTARV-primary ✅ (fidelity buy-box; product picker still TODO) · #16 in-progress-refi
basis ✅ (`costSpentToDate`) · #17 doc-ingest must target the appraisal/UW file ✅.

**Plan B UI (PLAN-B-UI-REVIEW.md):** #18 mandate bypassed disambiguation ✅ (the big
one — verified) · #19 Cobalt 429 resilience ✅ backoff (trial QUOTA still a vendor
decision) · #20 empty Deal tab ✅ CTA · #21 header badge ✅ · #22 entity-429 copy ✅ ·
#23 AI memo (RETIRED model) ✅ · #26 doc-ingest 4MB cap ✅ direct-to-storage ·
#27 "10MB" copy ✅ · #29 fund persona → Mandate Console ✅ · #24/#25 raw-JSON
investor view + sizing-step NOI prefill 🔵 deferred polish.

---

## The plan (start here) — feature work + the remaining calibration gaps

The two arcs (calibrate, walk-the-UI) are done. Pick the next thrust:

### Highest-leverage candidates (pick one)
1. **Macro / recession overlay (FRED) — SHIPPED v1 2026-06-25.** `src/lib/macro/
   fred.ts`: 7 free FRED series → deterministic per-indicator signals + a regime
   label, threaded into the Module 6 judgment facts block (market/exit dimensions +
   memo cite the regime). Best-effort/null-safe. **Needs the free FRED key** (instant
   signup → set `FRED_API_KEY` in `.env.local` + Vercel). Follow-ups: a drill-down
   indicator card in the memo UI (Noah's show-the-inputs principle) + a persisted
   daily snapshot. See IDEAS.md "Macro / recession-indicator overlay".
2. **Cobalt free-state de-rent (SHIPPED 2026-06-25 for CA/CO/NY)** — built as a
   LIVE-query + cache layer, not a bulk load: `src/lib/adapters/sos-free.ts` tries
   the free official source for a state (CALICO for CA, Socrata for CO/NY) BEFORE
   Cobalt inside `cobalt.ts lookupEntity`; the resolved hit caches in `sos_entities`
   stamped with its real `_source`. **Design pivot from the original "bulk ingest"
   plan:** CALICO has NO bulk endpoint (per-name only, ≤150), and the Socrata
   registries are 3–4M rows EACH — bulk-loading is unjustified storage pre-revenue.
   Live query is the same $0 with ~0 storage, no ingest cron, no GitHub secrets.
   Verified live (CO/NY) via `npx tsx scripts/verify-sos-free.ts`. Pipeline usage
   telemetry now bills SOS by actual provider ($0 for free/cache, $5 only on a fresh
   Cobalt call). **CA is the review-iteration win but is BLOCKED on a free key:** a
   USER signup at calicodev.sos.ca.gov → set `CALICO_API_KEY` in `.env.local` + Vercel.
   FL Sunbiz (SFTP fixed-width, has officers — the rich one) is the deferred follow-up
   (heaviest; needs an SFTP dep; doesn't touch current CA/TX review loans).
3. **Tier + investor-placement fidelity** — extend `scripts/fidelity-score.ts` from
   loan-$ to the full decision: diff the engine's TIER + investor PLACEMENT vs the
   Nexys audit logs (10287/10294/10295 present). Turns "we sized right" into "we'd
   have decided right." No external blockers.

### Remaining calibration gaps
- **#2 entity-anchored track record** — owner-name search returns 0 for most real
  borrowers (held-via-LLCs / common names). The address-list deed-verify path +
  doc-ingest-of-addresses help; confirm + lean on entity-anchored search.
- **Governing-assumption picker** (product-side of #15) — let construction deals
  size LTARV-primary in the sizing workbench UI (the fidelity buy-box already does).

### Minor / polish
- Handoff "Litigation & sanctions" info-line still prints raw `potential_match`
  (the verdict/mandate is fixed; this is the informational display line).
- #24 investor criteria render as raw JSON; #25 sizing step NOI/cap not pre-filled
  from doc-ingest.

---

## Critical context (carry forward — non-negotiable)

- **The spine:** deterministic engine sizes + tiers; **AI narrates, never sets the
  number or the tier**; human decides. Keeps us out of ECOA/fair-lending.
- **Disambiguation rule (codified + enforced everywhere incl. the mandate):** a
  name-only match (no DOB/address/distinctive name) is capped at **"possible —
  review,"** never a hit; weak/none = "not the named party" = filtered; only
  `sanction`/`pep` list types drive risk (not SAM/FINRA/medical exclusions). DOB is
  the promoter to "confirmed" and is **transient — never persisted, never to AI.**
- **A failed/incomplete check ≠ a clean check** (#13/#18). Litigation emits a
  `not_run` sentinel; the mandate treats unverified diligence as **conditional
  ("re-run")**, never an auto-fail. Mirror this for any new diligence consumer.
- **Noah's trust rules:** *"can't trust the output without the inputs"* (drill-down,
  no black box); **a single false positive destroys trust**; *"the less you ask the
  borrower, the better"* (→ doc-ingest, not forms).
- **Damon's gate:** *"get real people, real users in here."* Results = hours saved
  per deal. Distribution = **capital-provider endorsement** (the mandate is the wedge).
- **Hard boundary:** rehab spend / ARV / NOI / true ownership % are **package-ingest,
  never API**. Doc-ingest (now real-package-capable) is how they get in.
- **GC coverage reality:** no nationwide API; TX/NY/PA/NJ/MA/CO have **no statewide
  GC license** (the UI says so). Bulk-ingest is the durable path.
- **⚠️ Model-retirement hygiene:** Anthropic models retire on dates; a retired id
  silently 404s every consumer (this broke the AI memo, #23). All ids are current
  now (opus-4-8 / sonnet-4-6); audit at each retirement date (VENDOR-LEDGER §9).
- **The demo (Westbrook) is seeded, not live** — never present it as vendor-pulled.
  A real-loan run through the live pipeline is the path to a *real* demo.

---

## Reference

- **Repo:** `/Users/zachwade/code/active/pulseclose` · **Prod:** https://app.pulseclose.com
- **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose` · **Supabase:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose · migrations **00001–00051**
  (latest: 00049 documents-bucket-50MB, 00050 sos_entities cache, 00051 org_type)
- **Underwriter test org:** `27296b6b-87f2-4b71-9e84-2c71f652449c` · **Fund org:**
  `0aada23e-56f5-47ce-b400-a872be3daaf1` (org_type=fund) · logins
  `uw@`/`solo@`/`fund@test.pulseclose.com` pw `Test1234!`
- **Westbrook seeded demo:** `/dashboard/validations/44444444-4444-4444-8444-444444444444`
- **Real loan trove:** `~/Downloads` (loan apps, Nexys audit logs, appraisals) +
  `~/code/clients/consulting/clients/insignia-capital/data/` (loan-request xlsx).
  Packages used: `286 Virginia Pl…xlsx`, `_544 Sunset Ave…xlsx`,
  `812 Tait St…Financing Request…pdf`, `905 N Lbj Dr…Signed…pdf`,
  `icc_loan_10201…1310 Armadale…Signed…pdf`. Audit logs: `Loan Audit Log - 10287/10294/10295.csv`.

**Commands**
```bash
npm run build                                   # sanity-check before push
npx tsx scripts/test-disambiguation.ts          # 26 disambiguation assertions
npx tsx scripts/verify-underwriting-engine.ts   # engine checks (incl. costSpentToDate)
npx tsx scripts/fidelity-score.ts               # engine vs ICC outcomes (5/7, 6.9% Δ)
set -a; source .env.local; set +a; npx tsx scripts/calibrate-loan.ts   # live diligence harness (9 golden loans)
npx tsx scripts/ingest-contractors.ts [WA|OR|FL|VA|all|--due daily]    # GC bulk refresh
git push origin main                            # autodeploy; `vercel ls pulseclose | head -3` to confirm
```
*UI walkthrough harnesses (drive prod, screenshots → `ux-review/`):* `scripts/drive-real-loan.ts`,
`drive-loan-tabs.ts`, `drive-full-review.ts`, `drive-stepper.ts`, `drive-docingest.ts`,
`drive-persona.ts`; `scripts/verify-mandate-fix.ts` re-assesses mandates.

**Live key status:** RentCast/OpenSanctions/CourtListener ✅ (prod). **Cobalt = TRIAL
QUOTA EXHAUSTED in prod** → entity lookups 429 BUT now de-rented for CA/CO/NY by the
free-SOS layer (CALICO/Socrata tried first). **CA/CO/NY no longer hit Cobalt at all**
once `CALICO_API_KEY` is set (CO/NY are live already, no key needed). User has a
rotatable Cobalt trial key for demos (not in prod env) — now only needed for TX/DE/IL
+ the long tail. Regrid = geo-limited trial (retire).

---

## Decisions for the user (open)
- **Cobalt:** rotate trial keys for demos vs. pay (~$1k/mo for 1k) vs. build the
  free-state bulk ingest (FL/CA) to eliminate per-state cost. Rec: ship FL/CA ingest
  (the cache architecture is already in place), keep Cobalt as the long-tail fallback.
- **CA CALICO key (the one action that lands the review-iteration win):** free,
  instant self-serve signup at calicodev.sos.ca.gov → subscribe to the "BE Public
  Search" product → set `CALICO_API_KEY` in `.env.local` + Vercel. CODE IS SHIPPED;
  CA stops hitting Cobalt the moment the key is present. (CO/NY already live, no key.)
- **GitHub repo secrets** for the GC refresh cron: `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` (Settings → Secrets → Actions). Data is already loaded;
  the scheduled ingest no-ops until set.
- **Regrid:** retire (lean on Realie + RentCast + address-list deed-verify). Rec: retire.
- **CA GC bulk migration:** move CA off the CSLB scrape onto the paid Full File FTP — vendor-$.

## Deferred / queued (NOT lost)
- **Full Fund tenant** (cross-originator RLS + sharing) — gated on the
  rep-and-warranty question; the org_type marker + fund home (#29) are the foundation.
- **Land/development Template-9 enrichment** (BLS/Census) — deferred behind the macro
  overlay (narrower, more derived-metric work). See IDEAS.md.
- **Per-license GC adapters** (NV/NC/TN/UT/GA) when miss-telemetry shows volume; **AZ**
  bulk is Cloudflare-gated. **Liens/judgments** (TLOxp/LexisNexis, FCRA-gated);
  **HouseCanary** AVM; **Sayari/Middesk** ownership graph — when each is the bottleneck.
- **ZHVI haircut + Oakhurst >$3M cap** engine wiring (encoded in the buy-box doc, not
  yet firing). **Promote-to-confirmed:** wired for sanctions (DOB); litigation can't
  (no DOB in court records) — expected.
