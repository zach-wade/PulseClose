# PulseClose — Customer Scenarios & Product Coherence

**Purpose:** the persona/jobs-to-be-done foundation that the UX plan, pricing,
and feature packaging all point back to. Written 2026-06-23.

> **Read with:** [STRATEGY.md](../STRATEGY.md) (the verification + underwriting
> gateway reposition + the capital-provider wedge), [PRICING-STRATEGY.md](./PRICING-STRATEGY.md)
> §0 (the repackaging direction), [UX-PLAN.md](./UX-PLAN.md) (the flow the
> personas demand).

---

## 1. Why personas matter *here* specifically

PulseClose is not one product for one buyer. It sits on a **value chain** —
capital flows **fund → originator → borrower** — and the product can attach at
any link. The strategy's wedge is **top-down**: a capital provider endorses /
mandates PulseClose, and the originators it funds adopt it to keep capital
access. So the personas are not variations of one user; they are **different
links in that chain**, and the product *means something different at each link*.

The product also splits into **three module clusters**, which is the key to
pricing + packaging coherence:

- **① Verify** — 5 diligence pillars (entity / track record / litigation /
  sanctions / GC) + risk-factor engine + tier + continuous monitoring.
- **② Underwrite** — deterministic loan-sizing workbench + AI UW copilot +
  per-investor best-execution.
- **③ Distribute** — investor evaluate/route engine + capital-provider
  mandates + investor handoff artifact + write-back API / webhooks.

Each persona *centers* on a different cluster. Today's pricing prices a fourth
thing entirely — **check volume** — which maps to none of them cleanly. That is
the core coherence problem (see §5).

---

## 2. Prototype customer profiles

### 1. "The Mandator" — capital provider / private-credit fund  *(Insignia / Damon)*
- **Who:** A fund that deploys capital through a roster of bridge originators /
  table-funders. Originates little directly; lends *through* others.
- **Why they buy:** Standardize borrower diligence + underwriting across everyone
  they fund; cut rep-and-warranty / buyback risk; own a defensible "our standard."
  They buy **distribution + risk control + standardization**, never check volume.
- **Who they use it on:** The *originators* they fund (mandate the standard) and,
  through them, the *borrowers*.
- **Entry:** Top-down — adopts, then pushes downstream. **This is the wedge.**
- **Lives in:** Module ③ — mandates, the assessment stamp, the investor-PDF
  parser (to encode their box), webhooks/API (pull results into fund reporting).
- **Tier:** Fund / capital-provider — metered, different axis ($1,500–3,000+/mo +
  per-loan). *Does not exist yet.*
- **Coherence verdict:** 🟡 **Product half-serves them; pricing + IA don't.**
  Mandates shipped — but the fund **is not a first-class tenant.** It can only
  exist as an "investor" row inside *a lender's* account, and there is no surface
  where the fund defines its standard once and sees assessments across all the
  originators it funds. **This is the single biggest coherence gap** (see §6).

### 2. "The Spreadsheet Refugee" — small bridge lender
- **Who:** 1–3 people, ~5–20 loans/mo, diligence in Excel + manual SOS / PACER.
- **Why they buy:** Speed (30–60s vs hours), professionalism (the handoff
  artifact), stop missing sanctions / litigation. Usually **referred in by their
  capital provider.**
- **Who they use it on:** Their borrowers (sponsors).
- **Lives in:** Module ① — validation pillars, AI memo, handoff. **Barely touches
  underwriting.**
- **Tier:** Starter $299 / Pro $499.
- **Coherence verdict:** 🟢 **Well served — except the UX shoves Module ② at
  them.** The underwriting workbench (a wall of NOI / cap-rate / DSCR inputs) is
  irrelevant to them and reads as intimidating clutter. The flow should let them
  *ignore* it.

### 3. "The Underwriter" — mid-size bridge shop with in-house underwriting
- **Who:** 5–30 people, sizes loans, has investor relationships.
- **Why they buy:** Replace the Excel UW model **and** the diligence stack in one
  place; per-investor best-execution; defensible memos; route to the right capital.
- **Who they use it on:** Borrowers + their own capital sources.
- **Lives in:** **Everything**, but especially Module ② — the workbench + AI
  copilot is their daily tool.
- **Tier:** The $1,499 Underwriting tier (additive premium — decided 2026-06-23).
- **Coherence verdict:** 🔴 **The acute UX persona.** They live in the analyzer,
  and the analyzer's input bloat + form↔workbench duplication + stale-state is
  their daily friction. The $1,499 tier is *justified by this persona* — but only
  if the analyzer is actually good.

### 4. "The Downstream Adopter" — referred originator / broker
- **Who:** An originator told by their capital provider: "run deals through
  PulseClose to meet our standard / get rep relief."
- **Why they buy:** Capital access (semi-required); faster approval; the
  **mandate stamp**.
- **Who they use it on:** Borrowers, against the fund's mandate.
- **Entry:** Referred → self-serve funnel → trial. **What the funnel is
  conversion substrate for** (not cold acquisition).
- **Lives in:** Module ① + the mandate assessment ("does my deal meet [Fund]'s
  standard?") + handoff back to the fund.
- **Tier:** Starter / Pro (or whatever the fund's program bundles).
- **Coherence verdict:** 🟡 **The stamp is THE feature for them, but it's
  buried** — a card low on a 16-section page. Their flow should be: run validation
  → *immediately* see "✓ meets Insignia's standard" → send it back.

### The subject (not a buyer): "The Sponsor" — the borrower
- The real-estate investor seeking the loan. Occasionally a share-link
  participant. Not a buyer, but **the product's entire quality is how well it
  reads this person** — entity, track record, litigation, sanctions, and now the
  sized deal. Every persona above is asking the same question about the Sponsor:
  *can I trust them with this loan, and how big can it safely be?*

---

## 3. Module × persona map

| | ① Verify | ② Underwrite | ③ Distribute |
|---|---|---|---|
| Spreadsheet Refugee | ✅ core | — | light (handoff) |
| Underwriter | ✅ | ✅ **core** | ✅ |
| Downstream Adopter | ✅ | — | ✅ (mandate stamp) |
| Mandator (fund) | — | — | ✅ **core** |

No persona is differentiated by **check volume** — they're differentiated by
**which module cluster they center on.** That is why the current volume-only
pricing feels off.

---

## 4. Scenario walkthroughs (where the flow coheres vs. breaks)

### The wedge loop — Mandator → Downstream Adopter → Borrower
Fund defines a mandate ✅ → originator runs a borrower ✅ → validation
auto-stamped "meets standard" ✅ → handoff carries the stamp back ✅ → **…but the
fund never sees it in their own surface** ❌ (no fund tenant), and **the
originator had to already be a PulseClose customer** for the loop to close. The
mechanical wedge has a missing middle: the fund can't operate the loop it's
supposed to drive.

### The Underwriter's daily use
New validation ✅ → detail page = ~3-min scroll, ~16 stacked sections, no
scaffolding 🔴 → "Evaluate against investors" ✅ → eligibility form (~14 deal
fields) → workbench renders below with the **same ~14 fields re-passed** + its
own ~12 sizing fields, and **editing the loan amount up top silently stales the
workbench** 🔴 → AI judgment (4 more context boxes) → handoff. Too many inputs,
two engines that don't talk, no single canonical "deal" object.

---

## 5. Pricing × modules × features — coherence audit

Today's tiers are **one axis — check volume** (Starter 20 / Pro 50 / Enterprise
unlimited; "every plan includes everything, plans differ only in volume"). The
personas don't differ by volume; they differ by *module*. [PRICING-STRATEGY.md](./PRICING-STRATEGY.md)
§0 already saw this; the fix is half-decided:

- **Underwriting tier ($1,499)** packages Module ② for the Underwriter — decided
  (additive premium); not yet built (Damon-gated number).
- **Fund tier (metered)** packages Module ③ for the Mandator — still only a line
  in a doc, and **the persona has no product home.**

**Net finding:** the *product* is more complete than the *packaging + IA*. The
three changes that would make it feel coherent and complete:

1. **Make the Fund a first-class citizen** — tenant/role + a cross-originator
   mandate view + the Fund pricing tier. This is what actually *arms the wedge*,
   and it's the weakest link despite mandates shipping.
2. **Redesign the deal analyzer** around a single `deal` object with progressive
   disclosure — Verify-only users never see sizing; Underwriters get one coherent
   sizing surface with no duplication / stale-state.
3. **Re-shape IA + tiers around the three modules / jobs**, not the data model
   and not check-volume alone.

---

## 6. Direction (chosen 2026-06-23): the Fund as a first-class citizen

The capital-provider/fund is the strategic wedge and must become a real product
citizen, not an "investor" row inside a lender's account. What that implies
(to be designed in the UX plan; flagged here as the anchor):

- **A fund tenant/role** that owns mandates directly (define the standard once).
- **A cross-originator mandate surface** — the fund sees, across the originators
  it funds, which validations meet its standard (read-only, consent-scoped).
  *Bumps into multi-tenancy + the "don't replicate the entity-graph layer"
  constraint — design carefully; this is sharing assessment results across
  tenants, not sharing borrower data.*
- **The Fund pricing tier** (metered, Module ③) as that tenant's plan.
- **The mandate stamp promoted** to a top-of-page, persona-facing element for the
  Downstream Adopter (it's currently buried).

This is the through-line: personas → coherent flow → packaging. The UX plan
builds the lender-facing flow *and* the Fund tenant as the two anchors.
