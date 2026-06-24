# Encoded buy-boxes — Colchis & Oakhurst (reference)

> Extracted 2026-06-24 from the real Insignia lender guideline PDFs in
> `consulting/clients/insignia-capital/data/`:
> - **Colchis RTL Purchase Guidelines - Lenders (2026-01).pdf** (single page)
> - **OH - Loan Eligibility Requirements - 06.25.pdf** (Oakhurst/Mandalay, v1.2, 10pp)
>
> This is the source-of-truth for `scripts/seed-sample-investors.ts`. These two
> are the **only** Insignia investors with a captured, encodable buy-box (Mandalay
> shares the Oakhurst doc; Ellington has none — DEPTH-AND-VALUE-DIRECTION §"Open").
>
> **Fidelity caveats** (carry into any product claim):
> - Colchis grid is a dense low-res image; lowest FICO row (660–679) and the MF
>   Heavy-Rehab / MF Construction grids render blank — read as "not lent," not
>   "missing." Confirm against a higher-res copy before hard gating on those cells.
> - Colchis publishes **no rate sheet** in this doc (it's a leverage/eligibility
>   grid). Per the pricing interview Colchis *does* have a rate sheet elsewhere;
>   the base rates encoded in the seed are **representative**, flagged as such.
> - The ZHVI high-value haircut and Oakhurst's ">$3mm cap" are captured as
>   documented criteria but **not yet wired into the engine** (they need a
>   property-value-vs-ZHVI input the deal model doesn't carry yet). Tracked below.

## Colchis — RTL Purchase Guidelines (2026-01)

**Structure:** banded grid, separate Single-Family (1–4) and Multi-Family (5–10)
tables, each split into Light Rehab / Heavy Rehab / Construction / Purchase Bridge
/ Rate-Term Refi / Cash-Out Refi. Cells are FICO band (rows) × experience tier
(cols: 8+ / 4–7 / 0–3 prior deals; Construction uses 6+ / 4–5 / 0–3). Rehab/
construction cells carry `LTP-LTV / LTC / LTARV`.

### SF (1–4) Heavy Rehab — encoded as `fix_flip`
| FICO | 8+ | 4–7 | 0–3 |
|---|---|---|---|
| 740+ | 80/85/70 | 80/85/70 | — |
| 720–739 | 80/85/70 | 80/85/70 | — |
| 700–719 | 80/85/70 | 80/82.5/70 | — |
| 680–699 | 75/82.5/65 | 75/80/65 | — |

### SF (1–4) Purchase Bridge (no rehab) — encoded as `bridge` (LTV only)
| FICO | 8+ | 4–7 | 0–3 |
|---|---|---|---|
| 740+ | 75 | 75 | 75 |
| 720–739 | 75 | 75 | 75 |
| 700–719 | 75 | 75 | 70 |
| 680–699 | 70 | 70 | 65 |

### Gates
- Loan term 6–24 mo · loan size **$100k–$3.5M** · property: SFR 1–4, townhome,
  condo, small MF (5–20) · **excluded states: IL** · excluded city: Newark NJ ·
  **rural prohibited** (RUCA > 2) · guarantor **min 680 FICO**, ≥50% control, no
  FC/SS/BK/judgments in 3 yrs · liquidity ≥ down payment + 20% rehab + 6mo PITIA.
- **ZHVI haircut** (NOT yet engine-wired): value > 200% ZHVI → −5% LTV/LTC/LTARV;
  > 300% → −10%. AIV basis for bridge, ARV basis for rehab/construction.
- LTC excludes financing/closing/inspection/insurance/staging; funds 100% of
  construction costs unless approved.

## Oakhurst / Mandalay — Loan Eligibility Requirements (06.25, v1.2)

**Structure:** flat product × experience grid (Exhibit A) + a modifier stack +
an explicit rate sheet (Exhibit B). Experience tiers: **Experienced** (≥3 projects
or ≥$5M in 3yr) and **Highly Experienced** (≥10 projects or ≥$10M).

### Exhibit A — leverage (LTV / LTC / LTARV)
| Type | Product | LTV | LTC | LTARV |
|---|---|---|---|---|
| Experienced | Bridge | 75 | — | — |
| Experienced | Light Rehab | 85 | 85 | 75 |
| Experienced | Heavy Rehab | 85 | 85 | 70 |
| Experienced | Ground Up | 85 | 85 | 70 |
| Highly Exp | Bridge | 80 | — | — |
| Highly Exp | Light Rehab | 85 | 90 | 75 |
| Highly Exp | Heavy Rehab | 85 | 90 | 75 |
| Highly Exp | Ground Up | 85 | 85 | 75 |

**Modifier stack:** MF max LTC 80% (Light/Heavy), 70% (Ground Up) · loans **>$3M
→ 80 LTC / 65 LTARV cap** (NOT yet engine-wired) · **FICO < 680 → −10% leverage.**

### Exhibit B — base rates (fixed, interest-only) + adjusters
| Product | 1–4 res | MF |
|---|---|---|
| Bridge | 9.25% | 9.5% |
| Light Reno | 9.25% | 10.0% |
| Heavy Reno | 9.5% | 10.5% |
| Ground Up | 9.5% | — |

**+50 bps each (cumulative):** >85% LTC · cash-out · FICO < 700.

### Gates
- Term 6–24 mo, IO, extensions at lender discretion · loan size **min $750k
  ($1M CA)**, max **$3M res ($5M high-value) / $7M MF** · **min FICO 660** (700 for
  non-recourse) · no BK/FC/SS in 5 yrs · **excluded states: AK, HI, ND, SD** ·
  preference against rural (USDA FNS) · entity-only (no natural persons) · MF ≤40
  units · ≥1 verified like-kind exit, originator spot-checks ≥1/3 of track record ·
  rental-hold exit: 35% expense ratio, **min 5% stabilized debt yield.**

## Engine-wiring status
| Buy-box element | Engine support | Status |
|---|---|---|
| FICO × experience leverage grid | `leverage_matrix` tiers | ✅ encoded |
| Per-tier base rate + points | `base_rate_bps` / `base_points_bps` | ✅ (Colchis rates representative) |
| Oakhurst +50bps adjusters (>85 LTC, cash-out, FICO<700) | `rate_adjusters` | ✅ encoded |
| Oakhurst FICO<680 −10% leverage | `rate_adjusters` ltv/ltc adjustment | ✅ encoded |
| Hard gates (loan/property/state/FICO/exp/rural/occupancy) | basic checks | ✅ encoded |
| Stabilized debt-yield floor (Oakhurst 5%) | `min_debt_yield` → sizing | ✅ encoded |
| **Colchis ZHVI value haircut** | needs property-value-vs-ZHVI input | ⏳ documented, not wired |
| **Oakhurst >$3M leverage cap** | needs loan-amount-conditional cap | ⏳ documented, not wired |
