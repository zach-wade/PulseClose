# PulseClose — Session Pickup & Execution Plan (2026-06-30, rev. UX-AUDIT)

> **Self-contained handoff. Start a fresh session on either open thread below.**
> This session: ran a **real-loan persona E2E** (Underwriter/Solo/Fund on free-coverage
> ICC loans), fixed **6 trust/consistency bugs it surfaced**, then ran a **full visual
> UX audit** (rubric + Playwright drive) that fixed the systemic raw-enum leakage +
> several bugs — all shipped + verified live. Migrations unchanged (00001–00051).
>
> **The two open threads:**
> 1. **Finish the UX-audit findings** → [docs/UX-AUDIT-RUBRIC.md](docs/UX-AUDIT-RUBRIC.md)
>    (canonical scoring) + the open list in **§Open** below. Biggest two: Summary
>    dead-space + Fund-tenant nav (both structural — get a steer before restructuring).
> 2. **FL full SOS load via CI → the #10049 all-5-pillars-free loan** (§Open Thread B).

## Read first (in order)
1. **[docs/UX-AUDIT-RUBRIC.md](docs/UX-AUDIT-RUBRIC.md)** — NEW canonical per-page/per-persona
   desired state + 15-item global checklist. **Score every new surface against it.**
2. **`ux-review/audit/FINDINGS.md`** — scored audit findings (LOCAL, gitignored — the open
   ones are also in §Open below so they survive).
3. [docs/UX-POLISH-BACKLOG.md](docs/UX-POLISH-BACKLOG.md) — the 5 polish items, **all DONE this session**.
4. [docs/PERSONA-E2E-PLAN.md](docs/PERSONA-E2E-PLAN.md) — the persona E2E (ran; harnesses
   `scripts/e2e-persona-loan.ts` + `e2e-fund-console.ts`).
5. [docs/COVERAGE.md](docs/COVERAGE.md) + [docs/RESEARCH-SOS-50-STATE.md](docs/RESEARCH-SOS-50-STATE.md)
   — SOS coverage. **NOTE the FL-bulk correction in §Critical context.**
6. [docs/CALIBRATION-FINDINGS.md](docs/CALIBRATION-FINDINGS.md) · [docs/UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md) §11.2
   (the verdict-first principles) · memory `MEMORY.md`.

---

## Where we are — headline (2026-06-30)
All on `main`, deployed green; migrations **00001–00051** (no new migrations this session);
`npm run build` clean. Commits this session: **4d3fe3f → 92ffe0e** (7). The diligence + verdict
layer is now honest on **individual borrowers, weak name-only matches, and pending-review
properties** (all found + fixed by the real-loan E2E), and the UI's **systemic raw-enum/
snake_case leakage is fixed site-wide** (found + fixed by the visual audit).

## Shipped this session
1. **UX Polish — 5 items** (`4d3fe3f`): handoff screening verbs (`src/lib/handoff/screening-display.ts`),
   readable investor buy-box (`src/lib/investors/criteria-display.ts`), sizing prefill of
   NOI/cap from doc-ingest (deal-stepper + `api/ingest/borrower-doc`), `<Term>` glossary
   extension, `MandateChip` shared status tokens.
2. **Real-loan persona E2E + trust/consistency fixes** (`043df4d`, `a67f9fe`, `e52b31c`):
   - **Underwriter** — Sharon Nachman / "L Y I LLC" (NY): entity resolves **active via
     `ny_dos_live`, $0, no Cobalt**. **Solo** — Theodore Pappas (FL, individual, no entity).
     **Fund** — Keystone mandate console (seeded; Nachman Meets / Pappas Fails).
   - **Bugs fixed:** individual-borrower entity → **not_applicable** (pipeline guard — no
     phantom Cobalt lookup, no "Needs review", no spurious entity factor); handoff/verdict
     **weak-match filtering** (weak = hidden noise, possible/probable = review, confirmed =
     hit — end to end); memo **`[[ENTITY]]` placeholder leak** → generic-noun fallback
     (`redact.ts`); mandate **`require_sos_active` n/a** for no-entity; verdict **track pillar
     "N found · awaiting review"** (was "No properties found"); litigation card **hides weak/
     "Unlikely" name-only cases** behind a "show N unlikely" toggle (the Dr.-vs-borrower
     Nachman false positives).
   - **FL Sunbiz `--full` path fix:** the server serves a SINGLE `doc/quarterly/cor/cordata.zip`
     (~1.74 GB), NOT the 10-way split the code assumed → `--full` always 404'd, so FL only
     ever had a **daily file's 3,167 rows**. Fixed + streaming-flush parse + **resumable
     download** (stable cache dir + remote-size guard).
3. **Full visual UX audit** (`3efa98f`, `025f988`, `92ffe0e`): **[docs/UX-AUDIT-RUBRIC.md](docs/UX-AUDIT-RUBRIC.md)**;
   Playwright drive (`scripts/drive-ux-audit.ts` + `drive-validation-tabs.ts` + `drive-verify-fixes.ts`,
   screenshots → `ux-review/audit/`, scored against the rubric). **Fixes (verified live via
   re-drive):** enum/factor humanization site-wide (`src/lib/format/labels.ts` — `enumLabel` +
   `factorLabel`, applied to deal-stepper dropdowns, investor type badge, portfolio factor
   chips, all eval-summary lines), **SOS active badge green** (was blue), **property-count
   reconcile** ("0 (+6 pending review)", agrees with verdict + tray), **compare-button** label.

---

## Open / next (TODO)

### Thread A — remaining UX-audit findings — ✅ DONE (`1fdc7a3`, verified live)
Steers taken: **two-column Summary** + **fund-specific nav**. All shipped + re-driven
(`scripts/drive-verify-threadA.ts` → `ux-review/audit/threadA/`):
- **Summary dead-space** — the curated Summary (AI memo + why-this-rating + at-a-glance
  stats + mandate stamps) is promoted OUT of the "Full report" disclosure into a two-column
  layout under the verdict hero; disclosure holds the deep drill only (default tab Evidence). ✓
- **Fund persona nav** — `org_type=fund` gets the mandator spine (**Mandates + Portfolio**);
  Borrowers/Deals hidden. Sidebar reads `org_type` from `/api/settings`. Verified: fund org
  sidebar shows only Mandates/Portfolio + secondary. ✓
- **Property-count reconcile** — Summary "Track record" stat + `UnifiedPropertyTable` share
  one merge (`unifiedPropertyCounts`); stat now reads "1 (+6 pending review)", agrees with the
  table's "1 properties · 1 claimed only" + "6 to review". ✓
- **LOW** — Borrowers-table AI column no longer clips (Entity cell truncates 200px; AI/Date
  `whitespace-nowrap`); entity card shows a **"Resolved from NY DOS — free public registry …"**
  note so blank officer/agent/filing fields read as a source limit. Both verified. ✓
- **Residual [LOW]**: at 1440 the Borrowers table's rightmost **Date** column sits just past
  the visible edge (reachable via the table's `overflow-x-auto`); AI (the flagged column) now
  renders fully. Optional future polish: narrow Completeness header / responsive-hide Date.
- **Noted [LOW]**: the Mandate Console "active" badge renders **blue** — rubric says active
  status = green (blue = actions only). Not one of my findings; flag for a future pass.

### Thread B — FL full SOS load + the #10049 all-5-free loan — 🔄 IN PROGRESS
- **DISPATCHED 2026-06-30:** FL Sunbiz `--full` via `gh workflow run refresh-sos-entities.yml
  -f mode=full` → run **28488437753** (in_progress; multi-GB SFTP + millions of rows, 330-min
  timeout). Check: `gh run view 28488437753`. Repo secrets confirmed set; download is cross-run
  resumable. Local pulls still DNS-block at ~67% — CI is the path.
- Once the FL cache has statewide entities, run **#10049 — "99 TO 100 LLC" + GC BP Construction
  (`CGC1525790`, already cached)**: a real FL **construction** loan that pulls **all 5 pillars
  free** — the definitive Underwriter E2E. (Adapt `scripts/e2e-persona-loan.ts`.) Backup:
  **#10050 FKAC 1 LLC + Norway Builders `CGC1516589`.**

---

## Critical context (carry forward — non-negotiable)
- **CALICO — "Submitted" 5+ days; CA is NO LONGER hard-blocked (Cobalt key restored).**
  The subscription screenshot shows **CBC API Production** + **UCC UAT** both "Submitted"
  (req. 06/25). Research verdict: **CBC is the one we need and is normally SELF-SERVE** —
  stuck = anomaly (likely unclicked signup-confirmation email, or a per-product approval flag).
  **UCC UAT is irrelevant (we don't file UCC) and will never clear without a manual UCC
  Support Center call — cancel it.** Escalate CBC via **bizfile@sos.ca.gov / (916) 653-6814**
  (no dedicated CALICO address exists). API split: portal `calicodev.sos.ca.gov` vs API host
  `calico.sos.ca.gov` (prod `/cbc/v1/api/`, UAT `/cbc/uat/v1/api/`, header
  `Ocp-Apim-Subscription-Key`). **With Cobalt re-keyed, CA now falls back to Cobalt (paid ~$5,
  functional) — CALICO is a free-vs-paid OPTIMIZATION, not a launch blocker.**
- **Cobalt key RESTORED (2026-06-30):** new working key set in `.env.local` +
  Vercel prod (old 64-day trial key removed), auth-verified live (SC search → 202+retryId),
  prod redeployed. The 50-state paid fallback is live again — un-parks every non-free state.
- **Free-live SOS now 10 states: CA(key)·CO·CT·DC·ID·ND·NY·OR·PA·TX** + **VA/FL bulk.**
  Shipped this session (`sos-free.ts`): **TX** (Comptroller API), **CT/PA/OR** (Socrata),
  **DC** (ArcGIS FeatureServer), **ID/ND** (FirstStop open JSON API). Full **50-state matrix**
  in docs/RESEARCH-SOS-50-STATE.md §Complete matrix — the rest are bot-walled (Cloudflare/
  Incapsula/DataDome/reCAPTCHA/WAF-403 that 403 our datacenter IPs) → Cobalt.
- **VA shipped as free BULK** (`csv-url` source kind — SCC LLC CKAN CSV): **388k active VA
  LLCs cached** (status+formation+agent). With VA GC (DPOR) already cached → **VA is a full
  free entity+GC state.** ⚠️ VA's `llc.csv` is **Excel-capped at 1,048,575 rows** → entities
  past the cap + non-LLC corps miss cache → Cobalt. Load: `mode=full state=VA` dispatch.
- **✅ FL FIXED + LOADED (3.9M active entities).** Root cause was NOT a corrupt download —
  `cordata.zip` uses **Deflate64** (compression method 9), which zlib/`unzipper` can't inflate
  (→ "too many length or distance symbols"); it also has **10 entries** (cordata0-9.txt), and
  the old code read only the first. Fix: extract with **`7z e -so`** (7-Zip supports Deflate64)
  streaming ALL entries through the fixed-width parser (`scripts/ingest-sos.ts`; workflow ensures
  p7zip). CI `--full --state FL` ran green: **read 12.6M → upserted 3.93M active FL entities.**
  Diagnosis method worth remembering: a **64-byte SFTP read** of the zip header (method @off 8)
  + EOCD — don't burn 2h CI runs guessing.
- **✅ #10049 all-5-pillars-FREE E2E PASSED** (`scripts/e2e-persona-loan.ts fili` — 99 TO 100 LLC
  + GC BP Construction CGC1525790, FL): entity `source=fl_sunbiz` (free cache, no Cobalt), GC free
  (DBPR), litigation/sanctions/track-record free. Verdict **"Flagged · 1 issue"** (a mandate
  legitimately fails) — **detail == batch == handoff ✓ consistent** (harness was fixed to pass the
  mandate standing; earlier "mismatch" was a harness artifact, not a product bug).
- **Disambiguation rule, now enforced END-TO-END:** weak = filtered noise (hidden),
  possible/probable = "review", confirmed = hit — across verdict, handoff, litigation card,
  and mandate gates. DOB stays transient (never persisted, never to AI).
- **Individual borrowers (no entity) are first-class:** entity + GC pillars read
  not_applicable; no phantom lookups; no spurious mandate fails.
- **UX-AUDIT-RUBRIC.md is the design gate** — read before building any surface. No raw
  snake_case/enums (use `enumLabel`/`factorLabel`); status = color+icon+shape; **blue =
  actions only (active status = GREEN)**; no `text-lg`/`xl`; white cards on slate; no
  gradients/emoji; honest "Preview/Beta" labels (third-party-reports card is a labeled stub).
- **The spine (unchanged):** deterministic engine sizes + tiers; **AI narrates, never sets
  the number or the tier**; one `computeVerdict()` on every surface; **model ids opus-4-8 /
  sonnet-4-6 only** (a retired id silently 404s every consumer); Westbrook demo is **seeded**.

---

## Reference
- **Repo:** `/Users/zachwade/code/active/pulseclose` · **Prod:** https://app.pulseclose.com
- **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose` · **Supabase:** `oazwscmgyqknwatqgtyc`
- **Commits this session:** `4d3fe3f → 92ffe0e` · migrations **00001–00051**
- **Test orgs (pw `Test1234!`):** uw@ `27296b6b-87f2-4b71-9e84-2c71f652449c` · solo@
  `db330e86-bce5-4428-9cd3-81c2a683884a` · fund@ `0aada23e-56f5-47ce-b400-a872be3daaf1` (org_type=fund)
- **Audit subject validation (Nachman, UW org):** `085575ef-5302-43c0-b3c5-605912e0bb64`
- **Real-loan trove:** `~/Downloads/Loan Report.csv` (Nexys export — borrower/entity/state/GC
  columns) + ICC loan doc sets; `~/code/clients/consulting/clients/insignia-capital/data/`.
  Free-coverage loans: **FL** #10049 (99 TO 100 LLC + `CGC1525790`), #10050 (FKAC 1 LLC +
  `CGC1516589`); **NY** #10285 Nachman, #10006 LBLC THE LABEL LLC (entity via live DOS).

**Commands**
```bash
npm run build                                   # sanity-check before push
npx tsx scripts/e2e-persona-loan.ts nachman     # real-loan persona E2E (nachman|pappas)
npx tsx scripts/e2e-fund-console.ts             # seed + drive the Fund mandate console
npx tsx scripts/drive-ux-audit.ts               # full visual drive (all routes, 3 personas)
npx tsx scripts/drive-validation-tabs.ts        # validation detail tabs + drawers
npx tsx scripts/drive-verify-fixes.ts           # re-capture only the changed surfaces
set -a; source .env.local; set +a; npx tsx scripts/ingest-sos.ts --full --state FL  # CI-owned (local DNS-blocked)
git push origin main                            # autodeploy; `vercel ls pulseclose | head -3` to confirm
```
*Screenshots → `ux-review/audit/` (gitignored). Live keys: RentCast / OpenSanctions /
CourtListener / FRED ✅ · **Cobalt not keyed locally** (free-or-nothing) · CALICO pending.*

## Decisions for the user (open)
- **CALICO key** — pending approval; unblocks CA.
- **FL full load** — run via CI cron (local DNS-blocked at 67%).
- **Summary dead-space + Fund-tenant nav** — both structural; get a steer before restructuring.

## Doc cross-check (kept current)
- **NEW:** `docs/UX-AUDIT-RUBRIC.md` (canonical UX scoring) · `ux-review/audit/FINDINGS.md`
  (gitignored — open items mirrored in §Open above).
- `docs/UX-POLISH-BACKLOG.md` — all 5 items **DONE** (header updated).
- `docs/COVERAGE.md` + `docs/RESEARCH-SOS-50-STATE.md` — carry the **FL-bulk-not-loaded**
  correction (SFTP path was broken; only 3,167 partial rows; full load needs CI).
- `docs/PERSONA-E2E-PLAN.md` — executed (Underwriter/Solo/Fund).
