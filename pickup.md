# PulseClose — Session Pickup & Execution Plan (2026-07-01, rev. SOS-COVERAGE)

> **Self-contained handoff — start a fresh session from here.**
> This session shipped two things: (1) the remaining **UX-audit Thread A** findings
> (two-column Summary, fund-tenant nav, property-count reconcile, LOW fixes), then
> (2) a large **free-SOS-coverage expansion** — went from **3 → 12 free entity states**,
> restored the Cobalt fallback, diagnosed + fixed the FL bulk load, and passed the
> definitive **#10049 all-5-pillars-free** E2E. All on `main`, green, migrations
> unchanged (00001–00051). Commits: **1fdc7a3 → f82d553** (14).
>
> **Nothing is mid-flight.** The only user-action item is the **CALICO subscription
> approval** (chase `bizfile@sos.ca.gov`; CA works via Cobalt meanwhile). Everything
> else below is optional/next-up, not blocked.

## Read first (in order)
1. [docs/COVERAGE.md](docs/COVERAGE.md) — the SOS/GC coverage table (now 12 free states + Cobalt).
2. [docs/RESEARCH-SOS-50-STATE.md](docs/RESEARCH-SOS-50-STATE.md) **§Complete matrix** — every
   state's definitive verdict + the three free-access patterns (Socrata / open JSON API / ArcGIS).
3. [docs/UX-AUDIT-RUBRIC.md](docs/UX-AUDIT-RUBRIC.md) — the design gate; **score every new surface**.
4. [docs/PERSONA-E2E-PLAN.md](docs/PERSONA-E2E-PLAN.md) — the real-loan E2E harness
   (`scripts/e2e-persona-loan.ts <key>` — keys: `nachman`|`pappas`|`fili`|`fkac`).
5. [docs/UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md) §11.2 (verdict-first principles) · memory `MEMORY.md`.

---

## Where we are — headline (2026-07-01)
All on `main`, deployed green; **migrations 00001–00051 (no new migrations)**; `npm run build`
clean. The **entity pillar now resolves FREE across 12 states**; where it doesn't, the
**re-keyed Cobalt** covers all 50 as paid fallback. The diligence + verdict layer is honest
end-to-end (individual borrowers, weak matches, pending-review), the UI's raw-enum leakage is
fixed site-wide, and the Summary/Fund-nav restructure shipped. FL + VA are full free entity+GC states.

## Shipped this session

### 1. UX-audit Thread A (`1fdc7a3`, `eb6a398` — verified live via `scripts/drive-verify-threadA.ts`)
- **Two-column Summary** — the curated Summary (AI memo + why-this-rating + at-a-glance stats +
  mandate stamps) promoted OUT of the "Full report" disclosure into a two-column layout under the
  verdict hero; disclosure holds the deep drill only (default tab Evidence).
- **Fund-tenant nav** — `org_type=fund` gets the mandator spine (**Mandates + Portfolio**);
  Borrowers/Deals hidden (`src/components/dashboard/sidebar.tsx` reads `org_type` from `/api/settings`).
- **Property-count reconcile** — Summary "Track record" stat + `UnifiedPropertyTable` share one
  merge (`unifiedPropertyCounts`); the stat agrees with the table.
- **LOW** — Borrowers-table AI column no longer clips; entity card shows a dynamic **free-source
  note** listing only the fields THAT source actually left blank (`entity-result-card.tsx`).

### 2. Free-SOS-coverage expansion (`c68101a` → `f82d553`) — 3 → 12 free entity states
All in `src/lib/adapters/sos-free.ts` unless noted; each live-verified from a **datacenter IP**
(our real constraint — Vercel + CI are datacenter IPs, so CAPTCHA/Cloudflare/Incapsula/WAF-403
sources are unusable even when "free" in a browser).
- **Free-LIVE (per-request):** **TX** (Comptroller franchise-tax open JSON API), **CT/PA/OR**
  (Socrata), **DC** (DLCP ArcGIS FeatureServer), **ID/ND** (shared "FirstStop" open JSON API) —
  joining the pre-existing **CA**(needs key)·**CO**·**NY**.
- **Free-BULK (ingested → `sos_entities`, cron-refreshed):**
  - **VA** — SCC LLC register (`csv-url` source kind in `scripts/sos-sources.ts`), **388k active
    LLCs**. ⚠️ VA's `llc.csv` is **Excel-capped at 1,048,575 rows** → entities past the cap + all
    **non-LLC corps (a separate `corp.xlsx` not ingested)** miss cache → Cobalt.
  - **FL** — Sunbiz `cordata.zip`, **3.93M active entities** (see the FL fix below).
- **Complete 50-state matrix** in RESEARCH-SOS-50-STATE.md §Complete matrix — every remaining
  state is bot-walled or paid → Cobalt. `VA` corp.xlsx + `IA` (JSON dump) are the only unbuilt
  free-bulk candidates left; `MT/NM/OH/MS` are free-but-datacenter-IP-blocked near-misses.

### 3. FL bulk fixed — the Deflate64 discovery (`af220cd`, `6c15d7b`)
FL `--full` had been failing at unzip (`too many length or distance symbols`). **Root cause was
NOT a corrupt download** — `cordata.zip` uses **Deflate64** (compression method 9), which
zlib/`unzipper` cannot inflate; it also has **10 entries** (cordata0-9.txt) and the old code read
only the first. **Fix:** extract with **`7z e -so`** (7-Zip supports Deflate64), streaming all
entries through the fixed-width parser — no multi-GB temp file (`scripts/ingest-sos.ts`; the
workflow ensures `p7zip`). CI ran green: **read 12.6M → upserted 3.93M**.
> **Diagnosis method worth remembering:** a **64-byte SFTP read** of the zip header (compression
> method @ offset 8) + the EOCD told us everything — *don't burn 2h CI runs guessing.*

### 4. Cobalt restored + #10049 E2E passed
- **Cobalt key RESTORED (`.env.local` + Vercel prod, old trial key removed, prod redeployed,
  auth-verified).** The 50-state paid fallback is live again.
- **#10049 all-5-pillars-FREE E2E PASSED** (`scripts/e2e-persona-loan.ts fili` — 99 TO 100 LLC +
  GC BP Construction `CGC1525790`, FL): entity `source=fl_sunbiz` (free cache, no Cobalt), GC free
  (DBPR), litigation/sanctions/track-record free. Verdict **"Flagged · 1 issue"** (a mandate
  legitimately fails) — **detail == batch == handoff ✓ consistent**.

---

## Open / next (nothing blocked — pick any)

1. **[USER ACTION] CALICO subscription approval** — the CA free unlock. See §Critical context;
   chase `bizfile@sos.ca.gov` / (916) 653-6814 for the **CBC API Production** product; cancel the
   irrelevant UCC UAT one. CA works via Cobalt (paid ~$5) meanwhile, so this is an optimization.
2. **VA corp entities** (optional) — only VA **LLCs** are ingested; add the `corp.xlsx` file
   (use `exceljs`, already a dep) as a second VA source url to cover corporations too. Also, VA's
   LLC file is Excel-capped, so a chunk of newer LLCs miss cache → consider whether a non-capped
   VA source exists, else accept Cobalt fallback.
3. **Iowa free-bulk** (optional, low value ~0 loans) — `idh-be.iowa.gov/api/v1/datasets/554/rows.json`
   JSON dump; would be a new source kind (active-only, no status/officers).
4. **Residual UX LOW items** — Borrowers table Date column sits past the 1440 scroll edge; Mandate
   Console "active" badge renders blue not green (rubric: active status = green). Both minor.
5. **Product direction** — the SOS coverage infra is now strong; the natural next product thread is
   calibration against real ICC loans (`docs/CALIBRATION-FINDINGS.md`) or further UX polish. Ask the user.

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
