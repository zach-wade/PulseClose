# Competitive Research — Pricing, Packaging, UX, Wedge (2026-06-24)

> Deep-research run (5 search angles → 22 sources fetched → 90 claims → 25
> adversarially verified, 24 confirmed / 1 killed). Findings folded into
> [PRICING-STRATEGY.md §0 + §5](PRICING-STRATEGY.md), [STRATEGY.md](../STRATEGY.md)
> strategic-position, and [UX-REDESIGN-PLAN.md §8](UX-REDESIGN-PLAN.md). This is
> the durable cited record. Checked June 2026; re-verify before quoting prices.

## Headline

KYB/diligence vendors charge **per-check usage**; lending LOS/UW vendors charge
by **active-loan volume or institution size** (and are mostly sales-gated).
Packaging is **volume-banded, not capability-modular** — so PulseClose's
verify / +underwrite / +fund tiers are unusual but defensible. Routing
marketplaces match deals to lenders by buy-box *fit*, but **none produces a
per-originator pass/conditional/fail verdict against one fund's published mandate
with rep-and-warranty relief** — that wedge is genuinely differentiated.
Diligence and loan sizing are table-stakes. Best UX to borrow: Built's
stay-in-Excel Add-In.

## Verified findings (high confidence)

1. **Pricing axes.** KYB = per-check usage (Cobalt **$0.50–2.00/lookup**;
   Enformion **$0.25/match**; ComplyAdvantage **~$99/mo per 100 monitored
   entities**). LOS = per-active-loan volume / institution-size tiers (Baseline
   **$995 / $1,995/mo** banded by loan volume). Mortgage Automator, Blooma,
   LendingWise publish **no prices** (sales-gated).
   *Sources: complyadvantage.com/pricing, baselinesoftware.com/pricing,
   cobaltintelligence.com pricing blog, go.enformion.com/pricing.*

2. **Packaging.** LOS packaging is **volume-banded, not capability-modular** —
   Baseline ships full features at every tier and differs only by loan volume.
   Exceptions: Mortgage Automator (4 functional modules), Baselayer
   (modularizes by category). PulseClose's module tiers resemble the exceptions.
   *Sources: baselinesoftware.com/pricing, mortgageautomator.com/pricing,
   baselayer.com/business-verification.*

3. **The mandate wedge is empty space.** LendingWise / StackSource / Janover
   route deals to matching lenders by geography/asset/size (one-directional
   buy-box matching). Built enforces each lender's own policy internally;
   Baseline manages a lender's own investors. **No cross-originator mandate
   verdict exists.**
   *Sources: stacksource.com/financing, janover.co/lenders,
   getbuilt.com/products/deal-management, lendingwise.com/lender-market-place.*

4. **Table-stakes vs. UX to borrow.** 5-pillar diligence (Cobalt SOS,
   ComplyAdvantage sanctions, Baselayer KYB) and loan sizing (Blooma scores +
   sizes) already exist — table-stakes. Best UX pattern: **Built's "Connect"
   Excel Add-In** pulls live data so users stay in Excel, avoiding a form-wall.
   Reinforces PulseClose's stepper-with-prefill + Excel handoff.
   *Sources: baselayer.com/business-verification, getbuilt.com/products/deal-management.*

## Caveats / reliability flags

- **LOS pricing is largely opaque.** Mortgage Automator, Blooma, LendingWise
  publish nothing. Floating **$699/mo** and **$75/mo** figures are
  unattributed — **do not cite.** Baseline's $995/$1,995 band is the one hard
  public LOS anchor.
- ComplyAdvantage $99/mo reflects an annual-discount; Enformion Pro $0.01/match
  is custom/negotiated.
- Two 2–1 verifier splits (kept, lower confidence): Mortgage Automator
  "no underwriting" is scoped to its pricing page only; LendingWise marketplace
  matching is **user-initiated, not automatic**.
- One claim **killed (0–3):** that Baseline lists no public price / axis — it
  *does* (per-active-loan volume). Marketplace lender counts are self-reported.

## Open questions (carried forward)

1. **⭐ Will a fund grant rep-and-warranty relief on a third-party (PulseClose)
   verdict?** The load-bearing assumption of the Fund wedge — unconfirmed by
   research. **Damon question; settle before the Phase-2 Fund build.** (On the
   PRICING-STRATEGY §5 agenda + UX-REDESIGN-PLAN §8.)
2. What do sales-gated LOS vendors actually charge, and on what axis?
3. Does anything *outside* this comp set (MCT Marketplace, correspondent /
   note-buying networks) already produce a per-originator mandate verdict?
4. What price point is defensible between the per-check KYB floor and the
   per-loan LOS ceiling?

## Source quality ledger

Primary (vendor pages): complyadvantage, baselinesoftware (×3), mortgageautomator,
blooma.ai/plans, lendingwise (×2), baselayer, go.enformion, cobaltintelligence,
getbuilt, stacksource, janover.co. Secondary: vendr/middesk, capterra/lendingwise,
privatelenderlink, credaily/lev. Blog/unreliable (flagged, low weight):
bridgemarketplace, financely-group, janover.pro, cobalt blog.
