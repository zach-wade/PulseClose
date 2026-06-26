# PulseClose — Session Pickup & Execution Plan (2026-06-26, rev. UX-REDESIGN-APPROVED)

> **Self-contained handoff. A fresh session can start at §"The plan (start here)".**
> Three arcs are DONE: (1) **calibrate** the engine + diligence against real ICC
> loans until trustworthy, (2) **walk real loans through the live UI** and fix what
> was rough, (3) ship a **feature trio** (Cobalt de-rent · FRED macro overlay ·
> pricing/reserve fidelity) AND run a full **UX coherence audit → an APPROVED
> verdict-first redesign**. **The next thrust is BUILDING that redesign** — the spec
> is in `docs/UX-REDESIGN-PLAN.md §11`; start at §"The plan" below.

## Read first (in order)
1. **[docs/UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md) §11** (verdict-first
   redesign — competitor research, the 14 principles, the APPROVED detail-page
   spec + `computeVerdict()` logic, platform-wide rollout, build sequence) **and §10**
   (coherence map). **Open [docs/mockups/detail-redesign.html](docs/mockups/detail-redesign.html)
   — the APPROVED mockup (3 states).** ← THIS IS THE NEXT BUILD.
2. **[docs/CALIBRATION-FINDINGS.md](docs/CALIBRATION-FINDINGS.md)** — the fidelity
   north star (gaps #1–#17, statuses inline; the `fidelity-score.ts` harness).
3. **[docs/PLAN-B-UI-REVIEW.md](docs/PLAN-B-UI-REVIEW.md)** — the real-loan UI
   walkthrough (#18–#29 with fix status).
4. [docs/RESEARCH-SOS-REPLACEMENT.md](docs/RESEARCH-SOS-REPLACEMENT.md) — Cobalt
   de-rent (shipped — see "Shipped this session"). [docs/IDEAS.md](docs/IDEAS.md) —
   macro (shipped), land/dev Template-9 (deferred).
5. [docs/RESEARCH-DISAMBIGUATION.md](docs/RESEARCH-DISAMBIGUATION.md) ·
   [docs/RESEARCH-GC-VALIDATION.md](docs/RESEARCH-GC-VALIDATION.md) ·
   [docs/VENDOR-LEDGER.md](docs/VENDOR-LEDGER.md) · [STRATEGY.md](STRATEGY.md) ·
   memory `MEMORY.md`.

---

## Where we are — the headline (2026-06-26)

Everything below is **live on `main`, deployed green**; migrations **00001–00051**
(no new migrations this session); `npm run build` clean; `test-disambiguation.ts`
(26 assertions) + `verify-underwriting-engine.ts` pass; `fidelity-score.ts` =
**6.9% mean |Δ|** on loan size + **2.1% mean |Δ|** on interest reserve. All model
ids current (**opus-4-8 / sonnet-4-6** only).

**The product, plainly:** a verification + underwriting gateway — the engine sizes +
judges the loan, the diligence layer independently verifies the borrower, both
calibrated on real deals. The work has now shifted from *correctness* (done) to
**coherence / UX** — the product is complete but was overwhelming; the fix is the
approved verdict-first redesign.

## Shipped this session (2026-06-26)
1. **Cobalt de-rent (CA/CO/NY + FL).** `src/lib/adapters/sos-free.ts` tries a free
   official source BEFORE Cobalt inside `cobalt.ts lookupEntity` — **CALICO** (CA,
   live-query, needs key) + **Socrata** (CO/NY, live now). FL via **bulk ingest**
   (`scripts/sos-sources.ts` + `_sos-ingest.ts` + `ingest-sos.ts`, fixed-width
   1440-char Sunbiz SFTP → `sos_entities`, source `fl_sunbiz`, verified 3,167 rows).
   Pipeline usage telemetry now bills SOS by real provider ($0 free/cache, $5 only
   on a fresh Cobalt call). Design note: live-query+cache, NOT bulk, for CA/CO/NY
   (CALICO has no bulk endpoint; Socrata is 3–4M rows/state).
2. **FRED macro overlay + drill-down card.** `src/lib/macro/fred.ts` (7 free FRED
   series → deterministic regime + signals) threaded into the Module 6 judgment +
   a drill-down indicator card in the deal stepper (`<Term>`-glossed). **FRED key is
   LIVE in Vercel prod** (verified regime "Mid-cycle / mixed").
3. **Pricing + interest-reserve fidelity (#3, re-scoped).** Nexys logs carry no tier
   /placement → diffed priced **rate** + funded **interest reserve** instead;
   `fidelity-score.ts` reproduces ICC reserves within 2.1% (heavy-rehab ~14mo /
   purchase ~3mo / stabilized 0) via the production `reserve.ts`.
4. **UX coherence pass 1+2** (§10): "Book"→"Portfolio", "Evaluate Deal"→"Deals",
   detail-page CTA de-dup, **Sizing progressive disclosure** (18→8 fields, advanced
   behind a collapse), **inline glossary** `<Term>` (`src/components/ui/term.tsx`).
5. **Crons live:** `refresh-contractor-licenses.yml` (GC) + new
   `refresh-sos-entities.yml` (FL daily + quarterly). **GitHub repo secrets SET this
   session** — both crons now run (were no-op'ing).
6. **THE VERDICT-FIRST REDESIGN — researched, approved, specced (NOT built).** Full
   competitor research (KYB/decisioning · CRE/bridge LOS · credit-memo) → 14
   principles → an approved clickable mockup → `UX-REDESIGN-PLAN.md §11`. This is the
   next thrust.

---

## The plan (start here) — BUILD the verdict-first redesign

The feature trio + calibration + UI-walk are done. **The primary thrust now is the
approved verdict-first UX redesign** (spec: `UX-REDESIGN-PLAN.md §11`; mockup:
`docs/mockups/detail-redesign.html`; principles: §11.2 — read before building any
surface). The core idea: **lead every surface with the answer (verdict + one-line
why + 5-pillar status + one action); collapse the full report behind one disclosure.**

**Build order (§11.5 — each step gated by `npm run build` + a visual-verify pass on
prod via `scripts/drive-visual-pass.ts`):**
1. **Shared primitives** — `computeVerdict()` util (Verified / Needs review /
   Flagged; the **single source of truth**, also the status-bug fix) + status tokens
   (color+icon+shape) + `<VerdictHero>` · `<PillarQuad>` · `<DeltaChip>` ·
   `<Counterfactual>` · evidence `<Drawer>`. (`<Term>` glossary already exists.)
2. **Detail page** — assemble from the primitives; **folds in the Verified-on-429
   status fix** (see bug below). Highest-value, most-broken. Ship → visual-verify.
3. **Borrowers list** — verdict chips per row (reuse `computeVerdict()` so list +
   detail never disagree).
4. **Deal stepper** result surfaces — money-tile header (max loan · binding
   constraint · tier) + constraint table w/ binding row highlighted + counterfactual.
5. **Handoff PDF** — BLUF lead (verdict + binding constraint + tier first).
6. **Capital / Portfolio / Fund** — verdict rollups from the same util.

> **Consistency is load-bearing:** every verdict on every surface comes from the one
> `computeVerdict()`. Inconsistent verdicts destroy trust faster than missing ones.

### Known bug — fix it in step 2 (it's why the redesign exists)
- **Verified-on-429 (Achilles).** The status badge reads **"Verified"** even when the
  entity/SOS check ERRORED (Cobalt 429 — confirmed live on `Achilles Properties LLC`,
  CA). Violates "failed check ≠ clean." `computeVerdict()` returns **"Needs review"**
  whenever any of the 5 checks didn't complete — this is the fix.

### Remaining calibration gaps (unchanged, lower priority than the redesign)
- **#2 entity-anchored track record** — owner-name search returns 0 for held-via-LLC /
  common-name borrowers; lean on the address-list deed-verify + doc-ingest paths.
- **Governing-assumption picker** (#15 product side) — let construction deals size
  LTARV-primary in the sizing UI (the fidelity buy-box already does).

### Minor / polish
- Handoff "Litigation & sanctions" line still prints raw `potential_match`.
- #24 investor criteria render as raw JSON; #25 sizing-step NOI/cap not prefilled.
- Glossary `<Term>`: extend to remaining NumField + detail-page labels (incremental).

---

## Critical context (carry forward — non-negotiable)

- **The UX principles (§11.2) are now canonical** — read before building any surface
  (BLUF verdict-first · 2-level disclosure · first-class "couldn't-complete" state ·
  color+icon+shape · per-pillar quad · counterfactual · delta · drill-to-evidence ·
  one `computeVerdict()`).
- **The spine:** deterministic engine sizes + tiers; **AI narrates, never sets the
  number or the tier**; human decides. Keeps us out of ECOA/fair-lending.
- **Disambiguation rule (enforced everywhere incl. the mandate):** a name-only match
  is capped at **"possible — review,"** never a hit; weak/none = filtered; only
  `sanction`/`pep` list types drive risk. DOB promotes to "confirmed" and is
  **transient — never persisted, never to AI.**
- **A failed/incomplete check ≠ a clean check** (#13/#18) — the redesign's
  `computeVerdict()` is the canonical enforcement of this across all surfaces.
- **Noah's trust rules:** *"can't trust the output without the inputs"* (drill-down,
  no black box); **a single false positive destroys trust**; *"the less you ask the
  borrower, the better"* (→ doc-ingest, not forms).
- **Damon's gate:** *"get real people, real users in here."* Distribution =
  **capital-provider endorsement** (the mandate is the wedge). **Legibility is the
  gate on distribution** — nobody endorses what they can't understand (the why behind
  the redesign).
- **Hard boundary:** rehab spend / ARV / NOI / true ownership % are **package-ingest,
  never API**. Doc-ingest is how they get in.
- **GC coverage reality:** no nationwide API; TX/NY/PA/NJ/MA/CO have no statewide GC
  license. Bulk-ingest is the durable path.
- **⚠️ Model-retirement hygiene:** a retired Anthropic id silently 404s every consumer
  (broke the AI memo, #23). Current: opus-4-8 / sonnet-4-6; audit at each retirement
  (VENDOR-LEDGER §9).
- **The demo (Westbrook) is seeded, not live** — never present it as vendor-pulled.

---

## Reference

- **Repo:** `/Users/zachwade/code/active/pulseclose` · **Prod:** https://app.pulseclose.com
- **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose` · **Supabase:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose · migrations **00001–00051**
  (latest: 00050 sos_entities cache, 00051 org_type)
- **Underwriter test org:** `27296b6b-87f2-4b71-9e84-2c71f652449c` · **Fund org:**
  `0aada23e-56f5-47ce-b400-a872be3daaf1` (org_type=fund) · logins
  `uw@`/`solo@`/`fund@test.pulseclose.com` pw `Test1234!`
- **Westbrook seeded demo:** `/dashboard/validations/44444444-4444-4444-8444-444444444444`
- **Achilles (live Cobalt-429 case, the status bug):** validation `273b1810-caff-4051-a52b-f6d5e34a8095`
- **Real loan trove:** `~/Downloads` (loan apps, Nexys audit logs, appraisals) +
  `~/code/clients/consulting/clients/insignia-capital/data/`.

**Commands**
```bash
npm run build                                   # sanity-check before push
npx tsx scripts/test-disambiguation.ts          # 26 disambiguation assertions
npx tsx scripts/verify-underwriting-engine.ts   # engine checks
npx tsx scripts/fidelity-score.ts               # engine vs ICC (6.9% loan-$ · 2.1% reserve)
npx tsx scripts/verify-sos-free.ts              # free-SOS layer (live CO/NY)
set -a; source .env.local; set +a; npx tsx scripts/verify-macro.ts        # FRED overlay (needs FRED_API_KEY)
set -a; source .env.local; set +a; npx tsx scripts/ingest-sos.ts --full   # FL Sunbiz quarterly (heavy; cron-owned)
git push origin main                            # autodeploy; `vercel ls pulseclose | head -3` to confirm
```
*UI/visual harnesses (drive prod, screenshots → `ux-review/`):* **`scripts/drive-visual-pass.ts`**
(the redesign verifier — self-checks deploy freshness), `drive-real-loan.ts`,
`drive-loan-tabs.ts`, `drive-deal-stepper.ts`, `drive-persona.ts`.

**Live key status:** RentCast / OpenSanctions / CourtListener ✅ · **FRED ✅ (set in
prod 2026-06-26)** · **Cobalt = TRIAL QUOTA EXHAUSTED → 429, but de-rented for
CA/CO/NY** (CO/NY live; CA the moment CALICO key is set) · **CALICO = pending user
signup** (the one remaining key) · Regrid = geo-trial (retire).
**Crons:** both live (GitHub repo secrets `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` set this session).

---

## Decisions for the user (open)
- **CA CALICO key — the one remaining key action.** Free, instant self-serve at
  calicodev.sos.ca.gov → subscribe to "BE Public Search" → paste it and I'll wire it
  into Vercel + `.env.local` (same as FRED). CA then stops hitting Cobalt entirely.
- **FL full quarterly load:** the cron is set (1st of Jan/Apr/Jul/Oct); run it once
  manually (`ingest-sos.ts --full`) if you want statewide FL coverage before then.
- **Regrid:** retire (lean on Realie + RentCast + address-list deed-verify).
- **CA GC bulk migration:** move CA off the CSLB scrape onto the paid Full File FTP (vendor-$).
- **Cobalt long-tail:** rotate trial keys for demos vs. pay (~$1k/mo) — only TX/DE/IL
  + the ~40 small states still need it (CA/CO/NY/FL are de-rented).

## Deferred / queued (NOT lost)
- **Full Fund tenant** (cross-originator RLS + sharing) — gated on rep-and-warranty;
  org_type marker + fund home + the §11.4 Fund rollup are the foundation.
- **Land/development Template-9 enrichment** (BLS/Census) — behind the macro overlay.
- **Per-license GC adapters** (NV/NC/TN/UT/GA) when miss-telemetry shows volume; AZ
  bulk is Cloudflare-gated. **Liens/judgments** (FCRA-gated); **HouseCanary** AVM;
  **Sayari/Middesk** ownership graph — when each is the bottleneck.
- **ZHVI haircut + Oakhurst >$3M cap** engine wiring (in the buy-box doc, not firing).
- **Macro follow-ups:** persisted daily FRED snapshot vs. live-fetch per judge.
