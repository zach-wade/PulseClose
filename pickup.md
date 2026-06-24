# PulseClose — Session Pickup & Execution Plan (2026-06-24, rev. FIDELITY phase)

> **Self-contained handoff. A fresh session starts at §"The plan (start here)".**
> The center of gravity shifted this session: from *building/polishing the demo* to
> **calibrating the real pipeline against real loans** — because the demo, while
> lovely, is **seeded synthetic data**, and the real product must produce this on
> real deals.

## Read first (in order)
1. **[docs/CALIBRATION-FINDINGS.md](docs/CALIBRATION-FINDINGS.md) — THE NEW NORTH STAR.**
   What the live pipeline actually did to a real ICC loan (10228), and the ranked
   gaps. The #1 finding (common-name false positives) reproduced Noah's trust-killer.
2. [docs/VENDOR-CAPABILITY-MAP.md](docs/VENDOR-CAPABILITY-MAP.md) — what each vendor
   can pull, gap-fillers, live key status, decisions.
3. [docs/DEPTH-AND-VALUE-DIRECTION.md](docs/DEPTH-AND-VALUE-DIRECTION.md) — the depth
   thesis (still valid: we're at parity; the wedge is the moat).
4. [docs/DEMO-PREP-NOAH-DAMON.md](docs/DEMO-PREP-NOAH-DAMON.md) — the demo script
   mapped to Noah/Damon's real questions (their words, mined from the consulting repo).
5. [STRATEGY.md](STRATEGY.md) · memory `MEMORY.md`.

---

## Where we are — the headline (2026-06-24)

The product splits cleanly into **two realities**:
- **The engine is real and excellent.** Deterministic sizing + exit/takeout +
  stabilization path + interest reserve + per-investor best-execution + mandate
  verdict. All shipped, tested, on prod. This is genuinely differentiated.
- **The diligence data is NOT yet trustworthy on real loans.** The demo (Westbrook
  etc.) is **100% seeded synthetic data** — no vendor was called; the
  "deed-verified" track record was hand-authored. When we ran a **real** loan
  through the **live** pipeline (`scripts/calibrate-loan.ts` on loan 10228), it
  surfaced hard gaps — including reproducing **Noah's exact trust-killer**.

**The pivot:** stop polishing the synthetic demo; **calibrate the real pipeline
against real ICC loans until it's trustworthy.** We have a huge trove of real loan
files (`~/Downloads`, 5.3G: loan apps, Nexys audit logs, appraisals) + the
consulting data folder. The fidelity loop (`scripts/calibrate-loan.ts`) is built
and run on loan 1; the findings are the next build list.

Everything below is **live on `main`, deployed green**; migrations 00001–00045;
`npm run build` clean; `npx tsx scripts/verify-underwriting-engine.ts` passes.

---

## The plan (start here) — calibration-driven, in priority order

1. **✅ #1 SHIPPED (2026-06-24) — Common-name false-positive disambiguation (the trust-killer).**
   Built `src/lib/screening/disambiguation.ts` — a shared match-scoring layer both
   screening pillars route through. Rule: *a name match with no corroborating
   second identifier (DOB/address/distinctive name) is capped at "possible —
   review," never asserted as a hit;* many dispersed matches → "name appears
   common." Wired through OpenSanctions + OFAC + CourtListener adapters, the
   deterministic risk factors (name-only common-name → `litigation_review` /
   `sanctions_review` at minor/moderate, NOT a tier-dropping `critical`), and the
   UI (sanctions card, litigation card, Flags tile). `match_count` undefined bug
   fixed. **Verified live on loan 10228:** litigation `0 confirmed, 20
   possible/review`; sanctions `5 to review · possible · COMMON NAME`. Test:
   `npx tsx scripts/test-disambiguation.ts` (22 assertions, all green).
   *Next on this thread:* once doc-ingest (item #3) brings DOB/address into intake,
   matches can finally be promoted to "confirmed" — wire those identifiers into
   `SubjectIdentity`.
2. **Entity-anchored + address-list track record.** Owner-NAME search is too fragile
   (Realie 404'd on the common name; borrower holds via LLCs). Collect the **property
   address list at intake** and deed-verify each (the `verifyAddresses` path already
   exists) instead of relying on owner-name search.
3. **Doc-ingest at intake.** Our 4-field intake misses the **vesting LLC name, the
   GC, the address list, and the as-is/ARV/rehab** package values. Parse the
   borrower's existing package (Excel/PDF) — Noah: *"the less you ask the borrower,
   the better."* (`lib/documents/` + a doc-ingest extractor.)
4. **Loop more real loans through the harness** — add 905 N LBJ Dr (signed 1003),
   544 Sunset, 286 Virginia, audit logs 10287/10294/10295 to `GOLDEN[]` in
   `scripts/calibrate-loan.ts`. Confirm the gap pattern; build the field-by-field
   fidelity score vs. the file's actual sizing + investor placement.
5. **Vendor decisions** (VENDOR-CAPABILITY-MAP §Decisions): Regrid is a **geo-limited
   trial** (403 on Sonoma) → paid plan or retire. **Cobalt contractor-license API**
   (CA/FL/NY/TX/OR) to replace the CSLB scraper + a **front-end "no coverage"
   warning** for unsupported states — *user-requested, queued, not built.*

**Then** (lower priority): interest-reserve presentation fix (lead with GROSS, not
the confusing net — see below); the deferred build items.

---

## Shipped this session (2026-06-24)

**Underwriting depth (engine — all wired schema→API→view-model→Sizing UI, tested):**
- **Exit/takeout sizing** (`lib/underwriting/exit.ts`) — "does the exit make sense?"
- **Stabilization-path** (`stabilization.ts`) — "years to 1.20–1.25x DSCR" (Damon's words)
- **Interest-reserve** (`reserve.ts`) — ⚠️ presentation flaw: shows NET (deficit-months
  only) which reads as confusing ($7,750 next to $14,250/mo DS). **Fix: lead with
  GROSS ($256,500), net as a labeled "if income services debt" line.** Engine already
  computes `grossReserve`.
- **Real Colchis/Oakhurst buy-boxes** encoded (`seed-sample-investors.ts`) +
  [docs/BUYBOX-COLCHIS-OAKHURST.md]. Best-execution rows now show LTV/LTC per investor.

**UX / coherence:**
- **Stepper resume mode** — `evaluate/[id]` rehydrates the saved deal (retired
  `underwriting-panel.tsx`). **Borrower-organized dashboard** (dedup by borrower).
- **Mandate Console** (`/dashboard/capital/mandates`) — fund-side verdict roll-up +
  labeled-Preview cross-originator view. **3rd-party reports** = labeled-Preview card.
- **Damon-shaped seed** (Westbrook) computed by the real engine; **DEMO-PREP-NOAH-DAMON.md**
  walkthrough mapped to their real questions.

**Vendors / data:**
- **RentCast replaces ATTOM** (`lib/adapters/rentcast.ts`) — live-tested, honest null
  prices (non-disclosure carried, not faked). ATTOM removed everywhere.
- **Keys rotated + pushed to PROD:** RentCast (new), Regrid (rotated), OpenSanctions
  (rotated). ATTOM env var deleted local + prod.
- **Deep-research vendor capability map** → VENDOR-CAPABILITY-MAP.md.
- **Calibration harness** (`scripts/calibrate-loan.ts`) + CALIBRATION-FINDINGS.md.

**Key commits:** RentCast swap, calibration harness, Mandate Console, depth adds,
resume mode — all on `main`, deployed.

---

## Critical context (carry forward — non-negotiable)

- **The spine:** deterministic engine sizes + tiers; **AI narrates, never sets the
  number or the tier**; human decides. Keeps us out of ECOA/fair-lending.
- **Noah's trust rules (his words):** *"Can't trust the output without the inputs"*
  (drill-down to source, no black box); **a single false positive destroys trust**
  (→ the #1 disambiguation build); *"the less you ask the borrower, the better"*
  (→ doc-ingest, not forms).
- **Damon's gate:** *"get real people, real users in here."* His "results" = hours
  saved per deal. Distribution = **capital-provider endorsement**, not $1k/mo SaaS.
- **The demo is seeded, not live** — never present the seeded track record / GC as
  vendor-pulled. The calibration loop is the path to a *real* demo on a real loan.
- **Hard boundary:** rehab spend / ARV / NOI / true ownership % are package-ingest,
  never API (research-confirmed).

---

## Reference

- **Repo:** `/Users/zachwade/code/active/pulseclose` · **Prod:** https://app.pulseclose.com
- **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose` · **Supabase:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Underwriter test org:** `27296b6b-87f2-4b71-9e84-2c71f652449c` · logins
  `uw@`/`solo@`/`fund@test.pulseclose.com` pw `Test1234!`
- **Westbrook demo:** `/dashboard/validations/44444444-4444-4444-8444-444444444444`
- **Re-seed:** `ORG_ID=27296b6b… npx tsx scripts/seed-sample-investors.ts` then
  `… PERSONA=underwriter npx tsx scripts/seed-persona-data.ts`
- **Calibration:** `set -a; source .env.local; set +a; npx tsx scripts/calibrate-loan.ts`
- **Real loan trove:** `~/Downloads` (5.3G) + `~/code/clients/consulting/clients/insignia-capital/data/`
- **Live key status:** RentCast/Regrid/OpenSanctions ✅ (prod); Regrid = geo-limited
  trial (403 on Sonoma) — see VENDOR-CAPABILITY-MAP.

---

## Deferred / queued (NOT lost)
- **Cobalt contractor-license API** swap (CA/FL/NY/TX/OR) + front-end no-coverage
  warning — *user-requested, queued behind disambiguation.*
- **Interest-reserve** present-gross fix · **Regrid** paid-vs-retire decision.
- From the comprehensive build: side-by-side **sizing scenarios** + governing-assumption
  picker; **ZHVI haircut + Oakhurst >$3M cap** engine wiring; **full Fund tenant**
  (org type + RLS + real cross-originator sharing — gated on the rep-and-warranty
  question).
- **Liens/judgments** (TLOxp/LexisNexis, FCRA-gated); **HouseCanary** AVM upgrade;
  **Sayari/Middesk** ownership graph — when each becomes the bottleneck.
