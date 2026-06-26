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
2. **"Free" has two leaks that make 100%-free unreachable:**
   - **Open-data dumps are incomplete.** LYI LLC is a real, current NY LLC (Articles
     confirm §203 NY) — yet it is *not in NY's Socrata "Active Corporations" dataset*
     (searched every spelling + its registered address; dataset is current to yesterday).
   - **Live official searches are bot-walled.** NY's live publicInquiry app renders blank
     headless (Akamai-style protection); its API throws server-side `NullReferenceException`
     to a direct POST; the legacy `appext20` search is decommissioned. Defeating that is
     real, ongoing cost (residential proxies / real browsers / CAPTCHA), not "free."
3. **So the realistic target isn't 100% free — it's ~85-90% free with a small paid
   residual** for (a) open-data-leak misses and (b) bot-walled states. CALICO alone gets
   ICC to ~69% in one free key.

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
| **3. Live official search scrape** | the state's public entity search | ✅* | fragile; **bot-walled** in some states (leak #2) | NY publicInquiry (walled), most states' search portals |
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
5. **For the residual** (open-data leaks like LYI + bot-walled states + TX/DE): use a
   **paid fallback** — Cobalt, or evaluate **OpenCorporates** (cheaper, open-data-licensed
   aggregator with an API) as a Cobalt replacement. Accept that "free" has a floor; the
   residual reads as "Needs review", which is *correct*, not broken.

**Bottom line:** "free 50-state" is ~85-90% achievable and CALICO is most of it — but the
last ~10-15% (incomplete dumps + bot-walled live searches + TX/DE) is an irreducible paid
residual. Engineering can't make a state hand over data it bot-protects or sells.

---

## 6. Status (2026-06-26)

- ✅ Doc-ingest extracts **formation state** (not registration/qualification) + exact name.
- ✅ Socrata tokenizer fixed (single-letter names like "L Y I" now query instead of no-op).
- ✅ Coverage map live (`/dashboard/coverage`, `COVERAGE.md`, `coverage/map.ts`).
- ⏳ CALICO key — pending (the ~69% unlock).
- 🔬 **Finding (NY/LYI):** open-data incomplete + live search bot-walled — documented above.
- ☐ FL full Sunbiz ingest · WA open-data SOS · OpenCorporates eval for the paid residual.
