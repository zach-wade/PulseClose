# RESEARCH — 50-state free SOS coverage (replacing Cobalt)

**Goal:** validate entity (Secretary of State) for any borrower with as little paid
Cobalt as possible — "free wherever possible, regardless of work" — prioritized by
ICC's actual loan volume. Written 2026-06-26, grounded in a real run of ICC's book
(211 loans) + the Nachman/LYI case.

**Companion docs:** [COVERAGE.md](COVERAGE.md) (the at-a-glance state table, code-driven
from [src/lib/coverage/map.ts](../src/lib/coverage/map.ts)) ·
[RESEARCH-SOS-REPLACEMENT.md](RESEARCH-SOS-REPLACEMENT.md) (the original de-rent work:
CALICO/Socrata/Sunbiz). This doc is the **forward 50-state plan + the two findings that
reshape it.**

---

## TL;DR

1. **The input, not the scraper, is the binding constraint.** SOS keys on the entity's
   **state of formation** + its **exact legal name**. Nexys has formation state blank on
   **97% of ICC loans**, and entity names are inexact ("L Y I LLC" vs the filed "LYI LLC").
   Fixed at the source: doc-ingest now extracts formation state + exact name from the
   Articles / Good Standing (the UW already has these docs). **Do this first — scrapers
   are worthless without correct inputs.**
2. **Open-data dumps are incomplete — but the live APIs are open.** Two related findings:
   - **Open-data dumps leak.** "L Y I LLC" is a real, **active** NY LLC (live DOS confirms,
     filed 2012-06-29) — yet it is *not in NY's Socrata "Active Corporations" dataset*. So a
     dump-only NY source silently misses real entities.
   - **The "bot-wall" was a false alarm.** NY's publicInquiry **SPA** renders blank headless
     (client-side protection), but the **API underneath is a plain cookieless JSON POST with
     NO bot protection** — `apps.dos.ny.gov/PublicInquiryWeb/api/.../GetComplexSearchMatchingEntities`.
     The earlier "walled" read was a payload-shape bug (wrong wrapper / string-not-array /
     invalid enum). With the correct flat body it returns 200 + the entity. **Shipped as a
     free NY fallback** (`sos-free.ts lookupNyDosLive`). LYI now resolves $0, no Cobalt.
   - **Lesson for all 50 states:** a walled SPA does NOT mean a walled API. Probe each
     state's XHR — many "live searches" are open JSON endpoints. This makes free live-API
     coverage far more achievable than a dump-only or browser-scrape approach.
3. **So the realistic target is HIGH — likely 90%+ free** (open-data + free live APIs +
   CALICO), with a small paid residual only for genuinely paywalled states (TX/DE). CALICO
   alone gets ICC to ~69% in one free key.

---

## 1. ICC volume (the prioritization)

From the Nexys export (204 real loans; see `scripts/analyze-icc-coverage.ts`):

- **Formation state: blank on 198/204 (97%)** — not captured in Nexys. Property state is
  the only usable proxy until doc-ingest backfills formation state.
- **Property state:** CA 141 (69%) · TX 13 · FL 13 · WA 7 · NY 6 · SC 6 · GA 2 · ID 2 ·
  CO 2 · MA/MT/HI/NJ/LA/OH/NV/PA 1 each.

**Cumulative-free by property-state proxy:**

| Build | States added | Cum. coverage | Notes |
|---|---|---|---|
| CALICO key | CA | **~69%** | one free key — the dominant lever |
| + already-live | + CO, NY (Socrata) | ~73% | shipped |
| + FL full ingest | + FL | ~79% | Sunbiz bulk (full quarterly load) |
| + WA open-data | + WA | ~82% | WA publishes business data (we already ingest WA GC) |
| + SC + tail scrapers | + SC, GA, … | ~88-90% | per-state live/open-data |
| **residual** | TX, DE, leaks | ~10-15% | **paid (Cobalt/OpenCorporates) — irreducible** |

> ⚠️ This is property-state proxy. If many CA-property entities are actually **DE** LLCs,
> CALICO's real hit-rate is lower and the DE residual is bigger. **We can't know until
> doc-ingest captures formation state and we re-measure.** That measurement is the next
> data point, not more guessing.

---

## 2. Source taxonomy (free → paid), by effort

| Tier | Mechanism | Free? | Reliability | Examples |
|---|---|---|---|---|
| **1. Open-data dump / API** | Socrata/CKAN feed or bulk file | ✅ | high, but **incomplete** (leak #1) | CO, NY (Socrata) · FL (Sunbiz bulk) · WA/OR (open-data) |
| **2. Official state API + key** | state-run JSON API | ✅ | high | CA (CALICO) |
| **3a. Live official API** | the JSON XHR behind the search SPA | ✅ | high; cookieless | **NY DOS publicInquiry API (shipped)** — probe each state's XHR |
| **3b. Live search scrape (HTML)** | the state's search page when there's no clean API | ✅* | fragile; some SPAs render blank headless (use the API in 3a, or stealth browser) | states without an open API |
| **4. Aggregator API** | third party normalizes 50 states | 💲 free-tier/paid | high | OpenCorporates (free tier + paid), Middesk/Sayari (paid) |
| **5. Paid 50-state vendor** | what we're replacing | 💲💲 | high | Cobalt (~$5/lookup, trial exhausted) |

\* Tier-3 is "free" only if the state doesn't bot-protect its search. NY does. Each state
must be probed individually.

---

## 3. The architecture (free-first, leaks handled)

```
exact legal name + formation state   ← doc-ingest from Articles/Good Standing (FIXED)
        │
        ▼
  [Tier 1] open-data for that state? ──hit──▶ done ($0)
        │ miss (or state has no dump)
        ▼
  [Tier 3] live official search?    ──hit──▶ done ($0)   ← bot-walled in NY/others
        │ miss / walled
        ▼
  [Tier 4] OpenCorporates aggregator ─hit──▶ done (free-tier $)
        │ miss / over quota
        ▼
  [Tier 5] Cobalt                    ──────▶ done ($5)   ← last resort
        │ 429 / no key
        ▼
  INCOMPLETE → verdict "Needs review"  (never a false "Verified" — the Achilles rule)
```

Key properties:
- **Fan-out, not pre-routing.** Because formation state may still be wrong/missing, query
  every free source we have; don't trust a single guessed state.
- **Cache everything** in `sos_entities` (00050) — repeat/override/monitor lookups are $0.
- **Incomplete ≠ clean.** Every miss that reaches the bottom reads as "Needs review", not
  "Verified" (the `computeVerdict()` rule — `lib/validation/verdict.ts`).

---

## 4. Per-state build notes (the ones worth building)

| State | ICC vol | Best free source | Effort | Notes |
|---|---|---|---|---|
| **CA** | 141 | CALICO API | **just the key** | 69% of the book; free self-serve at calicodev.sos.ca.gov |
| FL | 13 | Sunbiz SFTP bulk | low | have partial (3,167); run full quarterly ingest |
| WA | 7 | WA open-data | low | same portal family as the WA GC data we already pull |
| NY | 6 | Socrata (have it) + live fallback | **live is bot-walled** | Socrata leaks (LYI); live needs proxy/browser or OpenCorporates |
| SC | 6 | SC business search | medium | live scrape; probe for bot protection first |
| CO | 2 | Socrata (have it) | done | — |
| GA, ID, MA, MT, HI, NJ, LA, OH, NV, PA | 1-2 ea | per-state search | medium | build as volume justifies |
| **TX** | 13 | — | **hard/paid** | SOSDirect charges per search; bulk is paid. No free path. |
| **DE** | unknown (SPVs) | — | **hard/paid** | free name search only; status/detail paid. The SPV-formation gap. |

---

## 5. Recommendation (do in this order)

1. **Get the CALICO key.** ~69% of ICC free, one self-serve key. Nothing else compares.
   Wire into Vercel + `.env.local` (same as FRED).
2. **Doc-ingest formation state** — DONE this session (`api/ingest/borrower-doc`:
   formation-specific + exact name + foreign-qualification). This is what makes any of the
   downstream routing correct.
3. **Re-measure on real data.** Run ICC's CA loans post-CALICO → get the true CA hit-rate
   (CA LLC vs DE). *That number* decides how much scraper-building is worth it.
4. **Build Tier-1 open-data ingests** for the next states by volume (FL full, WA), since
   they're cheap and leak-resistant for entities they contain.
5. **Probe each high-volume state's live API** (the NY pattern): open the state's entity
   search, watch the XHR, and if it's an open JSON endpoint, wrap it like `lookupNyDosLive`.
   Many states will be free this way. Only **genuinely paywalled** states (TX SOSDirect, DE
   detail) need a paid fallback — Cobalt, or evaluate **OpenCorporates** (cheaper,
   open-data-licensed aggregator) for that small slice. Whatever still misses reads as
   "Needs review", which is *correct*, not broken.

**Bottom line:** "free 50-state" is **mostly achievable** — CALICO is ~69% of ICC in one
key, open-data + free live APIs (NY proven) cover most of the rest, and the genuinely paid
residual is small (TX/DE). The key insight: a walled *SPA* is not a walled *API* — probe
the XHR before paying.

---

## 6. Status (2026-06-26)

- ✅ Doc-ingest extracts **formation state** (not registration/qualification) + exact name.
- ✅ Socrata tokenizer fixed (single-letter names like "L Y I" now query instead of no-op).
- ✅ **NY DOS live API fallback shipped** (`lookupNyDosLive`) — catches Socrata leaks free;
  re-ran ICC's Nachman loan, entity resolves active via `ny_dos_live`, $0, no Cobalt.
- ✅ Coverage map live (`/dashboard/coverage`, `COVERAGE.md`, `coverage/map.ts`).
- ⏳ CALICO key — pending (the ~69% unlock).
- 🔬 **Finding (NY/LYI):** open-data dumps leak, but the live APIs behind walled SPAs are
  open — the bot-wall was a false alarm. Probe each state's XHR for a free live API.
- ☐ Next: probe TX/other high-volume states for an open live API (per the NY pattern);
  FL full Sunbiz ingest · WA open-data SOS · OpenCorporates only for genuinely paywalled DE/TX.

### Update (2026-06-30) — TX shipped free; WA/SC dead-ends; CALICO likely instant

Deep research (3 agents, live-verified endpoints) + a shipped adapter:

- ✅ **TX is FREE — shipped** (`sos-free.ts lookupTxComptroller`). TX SOSDirect is paid,
  but the **Comptroller** franchise-tax account-status search is an open, keyless JSON API
  (`comptroller.texas.gov/data-search/franchise-tax` — name search → `/{taxpayerId}` detail).
  Returns good-standing status, SOS file #, **registered agent + officers** (no formation
  date — `effectiveSosRegistrationDate` is a renewal stamp, deliberately not mapped).
  Verified on real ICC entities (Belfort Spec/Perfect Dream Homes = active; Winds Exploration
  = dissolved w/ flag). TX was the **2nd-biggest uncovered state (11 loans)** — now $0.
- ❌ **WA is NOT the low-effort win** this doc assumed. No free Socrata entity dataset
  (`f9jk-mm39`/`4wur-kfnr` are link-stubs); the **bulk extract was discontinued Aug 2024**;
  the legacy JSON API is dead; the only live source (CCFS `ccfs-api.prod.sos.wa.gov`) is
  **Cloudflare-Turnstile-gated** → headless-browser + token, brittle. Not worth it for ~7 loans.
- ❌ **SC has no free path.** `businessfilings.sc.gov` is a **reCAPTCHA-gated ASP.NET** form,
  no open XHR/JSON, and the only bulk is paid (Tyler, UCC-only, ~$12k/yr). Stay on Cobalt.
- 🔑 **CALICO is likely instant self-serve, not an approval queue.** The official CA SOS "BE
  Public Search" API Guide v1.0.4 documents the standard Azure APIM flow (sign up → confirm
  email → subscribe → copy `Ocp-Apim-Subscription-Key`) with **no approval step** — minutes,
  not weeks. Only unconfirmed risk: a short admin-approval on the subscription. The API returns
  status/formation/agent but **not officers**. → Worth just grabbing the key.
- **Free-live SOS now: CA(key)·CO·NY·TX**; **free-bulk: FL** (loading). The "walled SPA ≠
  walled API" thesis held for TX exactly as it did for NY; it FAILS where there's a real CAPTCHA
  (SC) or enterprise bot-protection (WA Turnstile) — those are the genuine paid residual.
