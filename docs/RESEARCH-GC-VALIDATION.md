# GC license verification — research findings + build decision

> Deep-research run 2026-06-24 (102 agents, 20 sources, 74 claims → 25
> adversarially verified, 20 confirmed / 5 killed, 9 synthesized findings).
> Re-confirms and sharpens the prior capability-map finding. This supersedes
> the stale "Cobalt 5 states or per-state scrapers" line.

## The verdict (reconfirmed + sharpened)

**No nationwide GC-license API exists.** Two structural reasons, both verified:

1. **The leading aggregator (Cobalt) is thin for contractors.** Cobalt's own
   help doc: Contractor License API = **"Select states (CA, TX, NY, FL)"**;
   "All 50 states + DC" applies only to its **separate Secretary-of-State
   (entity) API**. Cobalt's blog admits *"No single API covers all 50 states
   for contractor licensing… No provider has solved the full problem."* Oregon
   is roadmap-only (blocked by a CAPTCHA on the CCB portal).
2. **Several major markets have NO statewide GC license at all** — so there is
   nothing to verify at the state level, by any vendor or method:
   - **Texas** — TDLR licenses only specialty trades (HVAC, electrical, etc.);
     GC oversight is municipal (Houston/Dallas/Austin city registration).
   - **New York** — no statewide GC license; NYC DOB runs a *registration*
     regime (not a license) under Admin Code Art. 418; licensing is municipal.
   - **Pennsylvania** — only a statewide **Home Improvement Contractor (HIC)
     registration** via the AG (HICPA); GC construction licensing is municipal.

   **Implication:** Cobalt's "TX/NY contractor search" returns specialty-trade
   or registration data, **not a GC license**. Paying Cobalt to "cover" TX/NY
   buys a credential that doesn't exist.

## The durable path: bulk-data ingest (not an API, not scraping)

Top construction-lending states publish **official, commercially-reusable bulk
datasets** we can ingest into our own DB on a refresh cron — the same ETL
pattern the repo already uses (FDIC, ZHVI):

| State | Source | Format / cadence | License | Fields |
|---|---|---|---|---|
| **WA** | L&I `data.wa.gov` `m8qx-ubtq` | Socrata JSON API **+** CSV/XML, **3×/day** | **PDDL public domain** (commercial OK) | name, license#, type, eff/exp, status, UBI, specialty ("GENERAL"), address — 160k records |
| **OR** | CCB `data.oregon.gov` `g77e-6bhs` + self-service Excel | CSV/Excel, **daily** | ORS public domain | name, address, CCB#, exp, RMI, bond/insurance |
| **FL** | DBPR construction public-records | **weekly CSV** (quote/comma) | Ch.119 public records | name, DBA, license#, primary/secondary status, licensure/eff/exp dates |
| **CA** | CSLB Public Data Portal (free Excel/CSV master list) **+** paid Full File/Update File (Data Services Unit) | Free master-list snapshots; paid full file (Jan/Jul) + monthly updates, 700k+ records (fixed-width, FTP) | Public records | License Master, Personnel, Workers' Comp |

**CA note:** we currently *scrape* the per-license CSLB page (brittle). CSLB
publishes a **free downloadable master list** + a paid Full File service — we
should migrate the scrape → bulk download for stability.

States not individually confirmed this run (AZ ROC appears to require a records
request, not open download; CO/NV/GA/NC/TN/VA/NJ/MA not checked) — verify
per-state before adding.

## STATUS — SHIPPED 2026-06-24

Bulk-ingest built and live for **WA / OR / FL** (~346k licenses):
- Table: `public.contractor_licenses` (migration 00046), public-read reference data.
- Ingest: config-driven registry `scripts/contractor-sources.ts` + generic runner
  `scripts/ingest-contractors.ts [STATE|all]` (+ shared `_contractor-ingest.ts`).
  Adding a state = one registry entry (URL + field mapper). WA `data.wa.gov`
  Socrata (158,933), OR `data.oregon.gov` Socrata (45,394), FL
  `CONSTRUCTIONLICENSE_1.csv` (142,082). Re-run to refresh (idempotent upsert).
- Coverage misses: `gc_coverage_misses` (migration 00047) logs every GC supplied
  in an uncovered state → `select gc_state, count(*) … group by gc_state` ranks
  which state to ingest next.
- Lookup: `src/lib/gc/lookup.ts` — by license # (exact) or unambiguous name match;
  the pipeline tries the DB first, then the CSLB scrape (CA), then not_automated.
- `GC_AUTOMATED_STATES` now = CA, WA, OR, FL.

**Follow-ups:** (1) **CA bulk migration** — CA stays on the CSLB per-license
scrape; the free master-list download URL isn't statically discoverable (JS
portal) and the clean path is the paid Full File/Update File FTP service — a
vendor-$ decision. (2) A **refresh cron** for the three scripts (WA 3×/day, OR
daily, FL weekly) — currently run on demand.

## Recommendation

1. **Do NOT pay for the Cobalt contractor API.** Its live contractor states
   (CA/TX/NY/FL) either overlap states we can bulk-ingest for free (CA, FL) or
   have no statewide GC license (TX, NY). Marginal value over bulk-ingest ≈ 0.
   (Cobalt stays valuable for its *separate* 50-state SOS/entity API — already
   used.)
2. **Build bulk-ingest** for the open-data states: **WA, OR, FL**, and
   **migrate CA** off the scrape onto the CSLB master-list download. One
   `contractor_licenses` table + a refresh script per source + point `lookupGC`
   at the table (license# or name match). Durable, low-cost, public-domain.
3. **Stop chasing GC license verification in TX/NY/PA** — substitute a
   municipal-registration check (NYC DOB, PA AG HIC lookup) only where a deal
   warrants. The UI should say *"no statewide GC license exists"* there, not
   "not automated" — it's accurate and reads as expertise.

**Caveat (from the synthesis):** Cobalt contractor pricing was not published in
the verified sources; per-state cadence/terms should be re-confirmed before
committing the ETL.

## Sources (primary)
- Cobalt coverage: help.cobaltintelligence.com/article/api-services-and-coverage
- WA L&I open data: data.wa.gov/Labor/.../m8qx-ubtq · PDDL: opendatacommons.org/licenses/pddl/1.0
- OR CCB: oregon.gov/ccb/pages/ccb%20license.aspx · data.oregon.gov/.../g77e-6bhs
- FL DBPR: myfloridalicense.com/construction-industry/public-records/
- CA CSLB data portal: cslb.ca.gov/onlineservices/dataportal/ · cslb.ca.gov/Consumers/Data.aspx
- NYC DOB GC registration: nyc.gov/site/buildings/industry/general-contractor-registration.page
- PA AG HIC: attorneygeneral.gov/resources/home-improvement-contractor-registration/
- TX (no statewide GC): tdlr.texas.gov license list (specialty trades only)
