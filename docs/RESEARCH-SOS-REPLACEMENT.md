# Research — replacing / de-renting Cobalt (SOS entity data)

> Deep research, 2026-06-25 (two parallel web-research agents + adversarial
> verification). Question: cheapest viable way for a **pre-revenue** SaaS to get
> U.S. multi-state Secretary-of-State entity data (status, formation date,
> registered agent, officers/members, filing history) as a replacement or partial
> replacement for **Cobalt Intelligence** (~$2/lookup, or ~$1k/mo for 1k; 20 free).
>
> **Why this matters:** Cobalt is the ONLY SOS source in our stack and has NO
> vendor-layer fallback — a 429 / quota exhaustion kills the entire entity pillar
> (and cascades into the mandate + confidence, per Plan B finding #19). And the
> trial quota can't survive the demo, while $1k/mo can't be justified pre-revenue.

## The headline

**There is no single cheap drop-in.** The market forces a trade-off:
- **Cheap + self-serve + free-tier + broad coverage** → you lose **filing history**.
- **Full field set incl. filing history** → that's Cobalt (cheapest *mature* self-serve), or sales-gated enterprise KYB ($8k–$92k/yr).

**But** the high-volume states are disproportionately the *easy* ones — they offer
free APIs or free bulk downloads. So the win is the **same hybrid we already use
for GC licenses**: self-serve the easy states for ~$0, keep a paid vendor for the
long tail. This fits our existing adapter-with-fallback pattern (Realie→Regrid,
OpenSanctions→OFAC) exactly — Cobalt becomes the *fallback*, free state data the
*primary*.

## Recommendation — phased

### Phase A (now, ~$0, pre-revenue)
1. **Ingest free state sources** (bulk/API, not fragile scrapers), in ROI order:
   - **Florida (Sunbiz)** — free bulk SFTP (`sftp.floridados.gov`, user `Public`),
     daily deltas + quarterly full. **Richest free source: officers (≤6, w/ titles)
     + FEI/EIN + registered agent + filing events.** Use the bulk feed, not the
     Cloudflare'd web UI. *(Best single free win.)*
   - **California (CALICO API)** — free official JSON API (register at
     `calicodev.sos.ca.gov`): name, number, formation date, status, registered
     agent, principal address, **and filing history**. Do NOT scrape
     `bizfileonline.sos.ca.gov` (Incapsula-protected, ToS bans robots).
   - **Washington** — free search API **+** free daily extract incl.
     GoverningPersons (officers) + document/filing index.
   - **Colorado / Oregon / New York** — free Socrata bulk (daily). Registered agent
     + status; **no officers** (CO/OR/NY), NY has filing-level history.
2. **Keep Cobalt as the fallback** for: TX, DE, IL, the ~40 small states, **and
   officer data outside FL/WA**. Rotate trial keys to get through the demo. (New
   trial key verified live 2026-06-25: returns CA status/agent/filing documents.)
3. Mirrors the GC bulk-ingest registry (`scripts/contractor-sources.ts`): a
   `sos-sources.ts` registry + `ingest-sos.ts`, DB-first `lookupEntity` with Cobalt
   fallback. The architecture already exists — this is a port, not net-new design.

### Phase B (once paying customers exist)
- **Bake-off** the cheap commercial primaries on real ICP-state entities, measuring
  per-state fill rate for agent / officers / **filing history** (where the cheap
  tier fails):
  - **OpenSOSData** — ~$0.003 (cached) / $0.03 (live) per lookup, 53 jurisdictions,
    10 free no-card, no subscription. Returns agent + officers "where available."
    **No filing history.** Early-stage vendor (rate limits/ToS unpublished).
    *Cheapest real alternative — 10–25× cheaper than Cobalt.*
  - **Enigma** — published self-serve: $20/mo (600 credits) / $200/mo (8k credits),
    free start. ~50 states. **Current data only, no filing history.** Credit model
    is attribute-weighted (≠ lookups).
  - **GovLink** — all 50, $0.10 pre-check / $2.50 full-w/-certificate, 10 free,
    MCP-native, claims non-scraped. **Solo-dev side project — continuity risk;
    contingency only.**
- **Keep Cobalt (or upgrade)** specifically for **filing history + officer depth +
  its timestamped source screenshot** (a diligence artifact none of the free/cheap
  sources produce — relevant to the FIDELITY "trust dies on bad diligence" posture).

## Ruled out (verified)
- **People Data Labs, Clearbit, Crustdata, Trestle** — NO SOS registry fields at
  all (firmographic/identity enrichment). Don't carry agent/officers/filings/status.
- **Middesk, Signzy, Sayari** — full field set but **sales-gated, no public pricing,
  ~$8k–$92k/yr** annual minimums. Not pre-revenue-attainable.
- **LexisNexis/TLOxp, Thomson Reuters CLEAR** — **legally blocked**: CLEAR's FCRA
  terms bar use as a credit-eligibility factor + forbid third-party API access;
  TLOxp needs GLBA/DPPA credentialing + on-site inspection.
- **CSC, CT Corporation/Wolters Kluwer, Harbor Compliance, Northwest** — **wrong
  product** (manage *your own* entities); Harbor ToS bars re-serving data to tenants.
- **OpenCorporates** — free bulk is ODbL share-alike + non-commercial (poison for a
  proprietary SaaS); commercial API ~£2,250–£12,000+/yr (likely *more* than Cobalt
  at our volumes). *Premise correction: it was NOT acquired; still independent.*

## Legal posture (scraping public SOS)
- **CFAA risk low** for un-gated public pages (*hiQ v. LinkedIn*, 9th Cir. 2022).
- **Copyright weak** (facts uncopyrightable, *Feist*).
- **Real risk = civil breach-of-contract** where ToS bans automated access — **CA
  and DE explicitly prohibit** robots/scraping/mining; **FL affirmatively offers
  bulk** (lowest risk); TX silent. Civil only; worst realistic case at low volume is
  a C&D / IP block.
- **Risk-minimizing posture = prefer official APIs/bulk** (which IS the Phase-A
  plan), honor robots.txt, rate-limit, never bypass CAPTCHA/login, treat a C&D as a
  hard stop for that state.

## Confidence / caveats
- High confidence (verified live June 2026): FL bulk, CA CALICO API, WA API+extract,
  CO/OR/NY Socrata; OpenSOSData + Enigma pricing/limits; enterprise vendors
  sales-gated; PDL/Clearbit have no SOS data; OpenCorporates free = non-commercial.
- Lower confidence: Cobalt's exact $/lookup (pricing bot-gated; ~$0.50–$2 est.);
  OpenSOSData rate limits/ToS (unpublished); Cobalt officer coverage caveat (their
  blog: ~28 states, **CA officers excluded**).
- **No maintained multi-state open-source SOS scraper exists** — the GitHub repos
  are single-state, dormant. The hybrid avoids this because the easy states are
  APIs/bulk, not scrapes (~6 ingestion pipelines to maintain, not 50 scrapers).
