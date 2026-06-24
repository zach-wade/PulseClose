# Vendor capability map + decisions (2026-06-24)

> From the `deep-research` workflow (26 sources, 25 claims adversarially verified,
> 2 refuted) + live key tests + the loan-10228 calibration. Companion to
> [VENDOR-LEDGER.md](VENDOR-LEDGER.md) (rotation calendar) and
> [CALIBRATION-FINDINGS.md](CALIBRATION-FINDINGS.md) (what actually came back on a
> real loan). Capability claims are vendor-marketing unless noted "independently
> confirmed."

## Live key status (tested 2026-06-24)
| Vendor | Key status | Notes |
|---|---|---|
| Anthropic, Stripe, Resend, CourtListener, Cobalt, Sentry, WordPress, Supabase | ✅ ACTIVE | |
| **RentCast** | ✅ ACTIVE (NEW) | Replaced ATTOM this session. `RENTCAST_API_KEY`. In prod. |
| **Regrid** | ⚠️ ACTIVE but **geo-limited TRIAL** | Rotated this session; key works (HTTP 200) BUT calibration hit **403 "area not included in API trials"** on Sonoma County. Needs a paid plan or retire. |
| **OpenSanctions** | ✅ ACTIVE (rotated) | New key `bb916bac…`; HTTP 200. In prod. |
| ~~ATTOM~~ | ❌ removed | Dead key; replaced by RentCast. Env var deleted local + prod. |

## What our EXISTING vendors can pull (full catalog)
- **Cobalt Intelligence** — we use SOS entity only. ALSO sells (all vendor-doc-sourced):
  **Contractor-license verification — but only ~5 states (CA/FL/NY/TX/OR)**; UCC
  filings (11 states); court judgments (NY State + Miami-Dade only); **TIN/EIN
  IRS match**. None is nationwide. *Cobalt itself: "No single API covers all 50
  states for contractor licensing."*
- **Realie** — owner/property search (deed/sale history, grantor chain, AVM).
  Calibration caveat: **owner-NAME search 404'd on a common name** — fragile.
- **RentCast** (replaced ATTOM) — `/properties` record + sale history; AVM
  (`/avm/value`) + rent estimate (`/avm/rent`) available but unused. **Sale prices
  are partial** (non-disclosure states return a Sale event with no price). Free
  tier 50/mo.
- **Regrid** — parcel data; **trial coverage is geographically limited** (see above).
- **CourtListener** — **FEDERAL courts only** (PACER/RECAP), no state courts,
  judgments, or liens; docket coverage is crowdsourced/incomplete. *Independently
  confirmed (Univ. of Minnesota Law Library).*
- **OpenSanctions** — sanctions/PEP consolidated lists; OFAC SDN is the free fallback.

## Gap-fillers (research-backed)
| Gap | Best options | Already covered? |
|---|---|---|
| **Multi-state GC license** | **No national API exists** (TradesAPI claim REFUTED 0-3). Cobalt's 5 states, or per-state scrapers. | Partially (CSLB CA scrape; Cobalt 5 states available) |
| **Property/AVM/sale history** | **HouseCanary** (114M props, 35-yr history, 50-state MLS, ~2.7% AVM error — independently top-3 ranked) | Yes — Realie + RentCast + Regrid; HouseCanary = upgrade |
| **Bankruptcy/liens/judgments** | **TLOxp** (TransUnion) / **LexisNexis RiskView L&J** — API+batch, **FCRA-gated** | No — CourtListener is federal-only |
| **Portfolio-by-owner (track record)** | TLOxp (identity-anchored) / extend Realie / Reonomy (CRE). **No clean nationwide solution confirmed** — weakest gap. | Partially (Realie owner search, fragile) |
| **Beneficial ownership (Elementix alt)** | **Sayari** (deep ownership graph, configurable depth) / **Middesk** (50-state SOS+IRS KYB) | No |
| **OFAC/PEP/adverse-media** | Keep OpenSanctions; **Sayari** (40+ lists) complements. ComplyAdvantage/Dow Jones/World-Check not evaluated. | Yes (OpenSanctions + OFAC) |

## Hard boundary — NOT obtainable from ANY vendor (ingest from the loan package)
Research-confirmed across all 11 vendors surveyed: **actual rehab spend / scope /
draw history, ARV pro-forma, NOI/market-rent assumptions, and true LLC ownership
%.** These are doc-ingest inputs, not API pulls — validates the "ingest their
Excel/PDF" architecture.

## Decisions
1. **RentCast in, ATTOM out** — ✅ done, deployed.
2. **Regrid** — calibration proved the trial is geo-limited; **decide: paid plan or
   retire** (lean on Realie + RentCast). Open.
3. **Cobalt contractor API** — adopt for CA/FL/NY/TX/OR (replaces/augments the CSLB
   scrape); **front-end "no coverage" warning** for other states. **Queued, not
   built.**
4. **Disambiguation before flagging** (litigation/sanctions) — the calibration
   trust-killer; **#1 priority** (see CALIBRATION-FINDINGS).
5. **Liens/judgments (TLOxp/LexisNexis)** — gated on FCRA onboarding; later.
6. **HouseCanary / Sayari / Middesk** — evaluate when AVM quality or ownership-graph
   becomes the bottleneck; not now.

## Open questions (research flagged)
- Pricing models (per-call vs subscription) for HouseCanary/TLOxp/LexisNexis/Sayari/
  Middesk — none confirmed.
- A clean nationwide portfolio-by-owner vendor (CoreLogic/Black Knight/BatchData?).
- Best dedicated OFAC/PEP screener beyond OpenSanctions (ComplyAdvantage/World-Check).
- Build-vs-buy for multi-state GC given no national API — which states matter for
  Insignia's deal geography.
