# PulseClose — Pricing Strategy

**Current tiers, packaging gaps, and three hypotheses to test post-NPLA.**
**Last updated:** 2026-05-05.

> **Sibling docs:**
> - [STRATEGY.md](../STRATEGY.md) — older strategic context (April 2026; stale on tier specifics).
> - [ROADMAP.md](./ROADMAP.md) — feature catalog. Pricing decisions reference features by their roadmap codes (A1, B1, etc.).
> - [NPLA-RUNBOOK.md](./NPLA-RUNBOOK.md) — Damon-question items in Section 5 of THIS doc are tied to the NPLA agenda.
> - `pickup.md` — current state, including the "free trial" 3-check pre-subscription gate.

---

## 1. Tier rationale (current)

Today's tiers per `src/lib/stripe/server.ts`:

| Plan | Price | Check limit | Stripe price IDs |
|---|---|---|---|
| **internal** | $0 | unlimited | none (SQL-only, never goes through checkout) |
| **starter** | $299/mo | 20 checks | `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL` |
| **professional** | $499/mo | 50 checks | `STRIPE_PRICE_PROFESSIONAL_MONTHLY`, `STRIPE_PRICE_PROFESSIONAL_ANNUAL` |
| **enterprise** | $799/mo | 999,999 (effectively unlimited) | `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_ANNUAL` |

Source code:

```ts
export const PLANS = {
  internal: { name: "Internal", checkLimit: Number.POSITIVE_INFINITY, price: 0, ... },
  starter: { name: "Starter", checkLimit: 20, price: 299, ... },
  professional: { name: "Professional", checkLimit: 50, price: 499, ... },
  enterprise: { name: "Enterprise", checkLimit: 999999, price: 799, ... },
} as const;
```

### Why these three numbers

The $299 / $499 / $799 anchors come from the early-2026 sizing exercise and reflect three implicit assumptions:

1. **The $300 floor.** Below $300/mo, B2B SaaS turns into a self-serve prosumer product. PulseClose is a pro tool used inside a lender's underwriting flow — sub-$300 pricing signals "casual" and undercuts the perceived seriousness of the validation output.
2. **The 20-check cap (~$15/check effective).** A typical small bridge lender ($50M-$100M AUM) closes ~10-25 deals/quarter. 20 checks/month ≈ enough for a steady but not-yet-scaled lender; pushes growth-stage lenders into Pro.
3. **The 50-check shoulder.** Pro is for the lender doing 30-50 deals/quarter ($100M-$300M AUM). At $499/$50 = ~$10/check effective, the volume discount is real but not so steep that we can't afford the vendor cost.
4. **Enterprise as a soft cap.** $799 with 999,999 checks is the "we're not really worried about volume here, talk to us" price. It's unlimited in practice; the 999,999 number is a sentinel rather than a real ceiling.

### Unit economics (vendor cost per check)

This is where the pricing logic lives — what each validation actually costs us in vendor calls:

| Vendor | Pillar | Per-call cost | Notes |
|---|---|---|---|
| Cobalt Intelligence | Entity (SOS) | TODO — verify in code / billing portal | Cobalt has tiered pricing; per-call cost varies by state and live-vs-cached. See `src/lib/adapters/cobalt.ts` |
| Realie | Track Record (deed-chain verify) | TODO — verify | Used heavily on intake-address verification (G1.1) |
| Realie (search) | Track Record (search) | TODO — verify | Primary owner-name search adapter |
| Regrid | Track Record fallback | TODO — verify | Fallback to Realie |
| ATTOM | Track Record enrichment | TODO — verify | Sale history per property |
| OpenSanctions | Sanctions / PEP | $0 trial / paid TBD | **Trial expires 2026-05-28.** Falls back to OFAC SDN direct (free) on rotation failure. |
| OFAC SDN | Sanctions fallback | $0 | Free Treasury data |
| CourtListener | Litigation | $0 | Federal-only |
| CSLB | GC | $0 | CA-only public scraping |
| Anthropic | AI memo + doc-ingest | ~$0.05-0.20/validation | Variable on memo length; max_tokens 4096 |
| Resend | Email | ~$0.001/email | Negligible per-validation |
| Supabase | DB + storage | ~$0/validation | Fixed-cost not per-call |

**TODO marker — how to fill it in:**
1. Audit `src/lib/adapters/*.ts` for any explicit per-call price annotations or env vars.
2. Pull last 30 days of vendor invoices (Cobalt, Realie, ATTOM, OpenSanctions paid tier when applicable) → divide by completed validation count for the period.
3. Cross-reference `usage_records` in the DB for the per-vendor call counts the system already logs.
4. Settle on a single "average vendor cost per validation" number — likely in the $3-8 range for most-pillars-firing runs. Below $3 means we under-fired adapters; above $10 means we should investigate (track-record enrichment loops).

**Why this matters for tier rationale:** if the average validation costs us $5 in vendor spend, then:
- Starter (20 checks @ $299) = $100 vendor cost / $299 revenue → 67% gross margin.
- Pro (50 checks @ $499) = $250 vendor cost / $499 revenue → 50% gross margin.
- Enterprise (unlimited @ $799) = ~$300-500 vendor cost / $799 revenue → 38-63% gross margin (usage-dependent; the "abusive enterprise" risk is real but small at our scale).

If the actual vendor cost is closer to $10/validation, Pro tier breaks. **Until the TODO above is filled, treat the current tier prices as un-validated against unit economics.** This is one of the highest-leverage analytical tasks for the post-NPLA week.

---

## 2. Internal plan rationale

`internal` plan migration: `00020_internal_plan.sql`. Code reference: `src/lib/stripe/server.ts` lines 12-19.

### Why we have it

- **Founder org (Test Co).** Zach is shipping changes daily and running test validations against real Truong data. Stripe billing on a founder account would (a) be billed back to the company unnecessarily, (b) hit check caps mid-development, (c) trigger Stripe-side weirdness (e.g. webhooks firing in a dev session).
- **QA tenants (future).** When we add automated end-to-end testing tenants — synthetic-data orgs that re-run the full E2E flow nightly — they need unlimited checks and zero billing.
- **Insignia design-partner specifics.** During the design-partner phase before they convert to a real Pro/Enterprise contract, Insignia runs on an internal-equivalent tier so neither side is messing with billing while we shape the product.

### Why it's not exposed in the upgrade matrix UI

Per `src/lib/stripe/server.ts` comment lines 8-11:

> *`internal` is reserved for non-billable accounts (founder/QA/demo orgs). It carries no Stripe price IDs, never goes through checkout, and bypasses both the monthly check cap and the free-tier 3-check pre-subscription gate (see api/validations/route.ts). Set an org to this plan via SQL — it's not exposed in /dashboard/settings.*

If `internal` were in the upgrade matrix, a customer could see it and ask why they can't have it. Hiding it keeps the public-facing tier story coherent (Starter → Pro → Enterprise) while letting us privately operate the founder org and any future QA/QV/sandbox tenants.

### How to set it

`scripts/promote-to-internal.ts` — see [DEMO-DATA-HYGIENE.md Section 3](./DEMO-DATA-HYGIENE.md). One-shot, idempotent, defaults to Test Co.

### When to convert an `internal` to a real tier

- **Insignia going from design-partner to paid customer.** Will negotiate a custom contract (fund-tier or Enterprise+); `internal` was a transitional state.
- **A QA tenant getting promoted to a real customer account** — should not happen often; QA infrastructure should stay separate.
- **Never** convert `internal` → `starter` quietly. The migration of an existing usage history into a billed tier would surface every SQL-only test as a "real" check and could create surprise invoices.

---

## 3. Pricing gaps right now

What the current 3-tier model doesn't cover. Each is an opportunity rather than a bug, but worth naming explicitly so we can prioritize.

### No fund tier (LP-side pricing)

Current tiers are all lender-side. With Batch 2 shipping (A1 investor PDF parser, E1 deal outcomes, B1 borrower watchlist), we're building investor-side surface area — but the pricing layer doesn't reflect this.

A fund principal evaluating PulseClose today would have to slot into Enterprise, which is priced for a lender doing high-volume validations, not a fund LP cross-checking 50-200 deals/yr across multiple funds.

### No per-seat pricing

Current tiers are org-flat. A 5-person credit committee pays the same as a single founder. This is intentional for the early stage (seats add friction; check caps are the natural metering boundary), but at Pro+ this becomes a real revenue gap. A 10-person team running 50 checks/month is paying $499 — same as a solo lender running 50 checks. The seat-count signal of value isn't captured.

**Watch for:** Pro-tier customers who have 5+ active users; this is where seat pricing would add the most ARR with the least friction.

### No per-state premium

The TransUnion-gated G2.2 (address validation) is cost-asymmetric — TransUnion charges per-call, and bulk addresses for a multi-state borrower can stack quickly. Ditto BatchData (C2) when it lands — per-call costs at scale on borrowers with 50+ addresses get expensive.

Today these costs would land in our gross margin. We don't have a per-feature premium for state-coverage tiers (e.g. "CA + NY + TX validation included; multi-state +$X/mo").

### No API-call billing (D5 deferred)

Current model is monthly-cap on validations. There's no API-call surcharge for, e.g.:
- A lender re-running a validation 5 times to test override-and-rerun behavior — counts as 5 against cap or 1?
- A monitor cron firing weekly on 50 borrowers — those are 50 validations/week per borrower; how do they meter?
- Future API access for direct integration (D5 in the roadmap, deferred) — REST API calls billed per-call.

D5 (programmatic API) is deferred but will need its own pricing surface — likely usage-based metering via Stripe's metered billing.

---

## 4. Three packaging hypotheses to test post-NPLA

Per the NPLA-RUNBOOK Section 5 Damon-question items, we use NPLA conversations to validate which of these three resonate.

### Hypothesis A — Fund tier ($1,499-2,499/mo)

**For:** fund principals doing ~50-200 deals/yr across borrower portfolios; LPs doing borrower-level due-diligence on the funds they're allocating to.

**Includes everything in Enterprise plus:**
- **A1 — Investor PDF parser.** Already shipped. Centerpiece of the fund-tier value prop. *"Upload your fund's investment criteria PDF; PulseClose parses, validates, and routes future borrowers against your matrix automatically."*
- **A2 — Counter-offer / repricing calculator** (deferred — 2 days). For deals that fail eligibility at base terms, suggest counter-offers ("drop loan $25K → passes at 7.75%"). High-value for fund principals doing custom deal structuring.
- **A3 — Borrower capital-availability PDF** (deferred — 1.5 days). Borrower-facing single-pager when they qualify at ≥1 investor. Storage in `documents` (`purpose='borrower_capital_summary'`).
- **B1 — Borrower watchlist.** Already shipped. Track borrowers across multiple validations / deals over time.
- **A4 — Per-investor performance dashboard** (future — 3-5 days). Aggregate deal-outcome data (E1) by investor; show fund-level pass-through rates, default rates, time-to-funding distributions.
- **Multi-fund support** — same org can have N investor configs; per-investor dashboards roll up; cross-investor comparison.

**Why $1,499-2,499:** anchored at ~3-5x Enterprise. Fund principals' deal volume × per-deal value is much higher than lender-side; willingness-to-pay scales accordingly. Lower bound ($1,499) is for funds doing 50-100 deals/yr; upper bound ($2,499) is for active GP-of-funds doing 200+ deals/yr.

**Test at NPLA:** in fund-principal conversations (Track B in NPLA-RUNBOOK.md), explicitly ask: *"If we built investor-side tools — PDF parser, performance dashboard, watchlist across funds — would your team use it? At what price?"*

**Risk:** fund principals categorize this as "fund data" (Preqin, Pitchbook) rather than "borrower data" and pattern-match to data-vendor pricing ($5-10K/mo). We need to position upstream — actual borrower-level data, not aggregated returns.

### Hypothesis B — Per-validation overage at Starter and Pro tiers

**Mechanism:** $30/check over the cap, charged via Stripe metered billing. Pro tier (50 checks @ $499) goes from "hard cap" to "soft cap with per-check overage."

**Why $30:** roughly the marginal value of the validation to the lender ($30 → ~$500 in deal-team time saved per validation if you believe the front-of-the-leave-behind 3.5-hour claim). Below $20 it feels like a discount; above $40 it discourages overage and pushes lenders to upgrade tier (which we may not want — overage should be friction-free).

**Mechanism:** Stripe's metered-billing API. We already log every validation with `usage_records`; just need to wire that to a Stripe meter and bill at month-end.

**Test at NPLA:** in lender conversations (Track A), ask: *"Would you rather pay $30/check on overage, or get bumped to the next tier the moment you hit cap?"* Two distinct populations are likely:
- **Predictable-volume lenders** prefer hard cap → tier upgrade. They want budget predictability.
- **Spiky-volume lenders** prefer overage → spread cost. They have variable-quarter pipeline.

**Risk:** overage feels like nickel-and-diming if implemented poorly. Counter: clear in-app indicator ("3 of 50 checks remaining" → "12 over cap this month, $360 in overage"), with a 1-click upgrade CTA at the cap line.

### Hypothesis C — Annual prepay discount

**Mechanism:** 2 months free on annual commitment. So:
- Starter annual = $2,990/yr (vs $3,588 monthly = 17% off).
- Pro annual = $4,990/yr (vs $5,988 monthly = 17% off).
- Enterprise annual = $7,990/yr (vs $9,588 monthly = 17% off).
- (Hypothesis A) Fund tier annual = $14,990-24,990/yr.

**Stripe wiring:** already in place. `STRIPE_PRICE_*_ANNUAL` env vars exist; just need to surface annual toggle in checkout flow and adjust price IDs in `getPlanFromPriceId()`.

**Why this matters most for fund tier.** Lender-side $299 → $2,990 commitment is reasonable. Fund-side $1,499-2,499 → $14,990-24,990 annual commitment is a real check that requires CFO sign-off. The annual discount is the lever that turns fund-tier from "want it but not now" to "let's get it on the FY budget."

**Test at NPLA:** mention annual pricing as a casual aside; gauge response. *"And we offer 2 months free on annual — most of our lender customers prefer that."* (Pricing nudge — we don't have lender customers to back this claim yet, but the hypothesis is that lenders will read it as a credibility signal rather than dig in.)

**Risk:** if churn is high in early customers (it will be, in any new SaaS), annual upfront overstates revenue and creates downstream cancellation friction. Mitigation: pro-rate refunds in the Stripe portal; absorb the customer-success hit on early cancels rather than enforce annual lock-in legally.

---

## 5. Damon-question items (NPLA agenda)

The fastest way to validate the three hypotheses is to ask Damon directly during the Week 4 pre-coordination call, then re-test with the broader NPLA crowd.

| Question | Why we ask | Decision it informs |
|---|---|---|
| *"If we offered an LP-side tier — investor PDF parser, performance dashboard, watchlist — what would your team pay for that?"* | Validates Hypothesis A and gives a price anchor from a real fund. | Whether to launch fund tier post-NPLA at $1,499 or $2,499. |
| *"Would per-validation overage feel like nickel-and-diming, or like a relief valve?"* | Validates Hypothesis B from the customer-experience angle. | Whether to wire metered billing or stick with hard caps. |
| *"What would Insignia's annual budget for borrower validation tooling look like, ballpark?"* | Anchor for Pro vs Enterprise vs Fund tier sizing. | Whether the $799 Enterprise ceiling is too low for high-volume lenders. |
| *"If you got an investor-side dashboard — funded vs defaulted by GP, average time to funding, repeat-borrower flags — at what price does it become a no-brainer?"* | Specific price discovery for the most differentiated future feature (A4). | Whether A4 ships at fund tier, or as a paid add-on. |
| *"How much do you spend on borrower validation today, all-in (vendor calls + analyst time)?"* | Anchor for total addressable spend per lender. | Pricing ceiling — we should never price above 50% of all-in current spend. |

---

## 6. Stripe wiring

### Current state (working)

- **Checkout:** `/api/stripe/checkout` — creates checkout session, redirects to Stripe-hosted page, returns customer to dashboard on success.
- **Portal:** `/api/stripe/portal` — Stripe-hosted billing portal for subscription management.
- **Webhook:** `/api/stripe/webhook` — handles subscription.created / updated / deleted events, syncs plan to `organizations.plan` column.

### What's missing for Pro+ migration paths

If we ship Hypothesis A (fund tier) post-NPLA, several wiring gaps need to close:

1. **Proration on plan-change.** Customer on Pro for 15 days, upgrades to Fund tier — Stripe prorates by default, but our UI doesn't surface the prorated charge clearly. Risk: customer sees a charge they don't understand.
2. **Plan-change UX in the dashboard.** Today the upgrade matrix is a static comparison; no in-app "switch to Fund tier" button. Customer has to manually go through Stripe portal to change, which is fine but loses the conversion moment.
3. **Downgrade-with-overage.** If Hypothesis B ships (metered overage), a downgrade mid-period needs to handle: settled overage on the prior plan + clean cap reset on the new plan + clear UI on what's been billed vs what's pending.
4. **Annual conversion path.** Customer on monthly Pro, asks for annual — today they cancel + re-subscribe. Should be a single "switch to annual" button with proration handled.

These are straightforward Stripe API work — ~2-3 days for all four if tackled together. Schedule for the post-NPLA / pre-Fund-tier-launch window.

### What's working that we shouldn't break

- The `internal` plan bypass is critical — never put the upgrade matrix UI in front of an internal-plan org.
- The 3-check pre-subscription gate (per pickup memory: "currently 3-check pre-subscription gate") gives prospects a free taste before billing kicks in. Don't remove this without an alternative trial mechanism in place.

---

## 7. Internal/external naming alignment

A landmine from early 2026 that the 00020 migration cleaned up. Worth documenting because it'll come up again every time we add a plan.

### What happened

- The original `organizations.plan` CHECK constraint listed `pro` (3 chars).
- The runtime config in `src/lib/stripe/server.ts` used `professional` (12 chars).
- A signup flow assigned `professional`; the CHECK constraint rejected it; signups failed silently in some paths and loudly in others.

### How 00020 fixed it

- Updated the CHECK constraint to include `professional` and `internal`.
- Aligned all references (server.ts, pricing UI, webhook handlers, scripts) on the long form.
- Backfilled existing `pro` rows to `professional`.

### Lesson for future plan additions

- **Single source of truth.** Plan names live in `src/lib/stripe/server.ts` `PLANS` const. The CHECK constraint must match exactly. Add the migration FIRST; align the code SECOND; deploy together.
- **Naming convention.** Lowercase, no abbreviations, no hyphens. `professional` not `pro`, `enterprise` not `ent`, `internal` not `int`, future `fund` not `f`.
- **Migration template** (paste into any new plan migration):

```sql
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('starter', 'professional', 'enterprise', 'internal', '<new_plan>'));
```

- **Test post-deploy.** SQL: `SELECT plan, COUNT(*) FROM organizations GROUP BY plan;` — every value should match a key in `PLANS`. Any orphan reveals a sync bug.

---

## 8. Future tiers + lifecycle decisions

When to introduce, when to deprecate, when to evolve.

### When to introduce **Custom (white-glove)**

Top funds will outgrow Fund tier. Custom is the answer.

**Trigger:** any single customer asks for ≥2 of:
- Dedicated infrastructure (own Supabase project, own vendor API quotas).
- Custom adapter (a vendor we don't currently support — e.g. a state-court-data API specific to their portfolio).
- White-label branding (their logo, their domain, their borrowers).
- SLA contract (uptime guarantees, support response times).
- Volume above ~500 validations/month (vendor cost ceiling on Enterprise stops making sense).

**Pricing:** annual contract starting $30K-$60K. Negotiated. Not on a pricing page.

**Operational impact:** doesn't scale by ourselves. Don't introduce until we have a customer-success person or a co-founder with capacity to run it.

### When to deprecate **Starter**

Starter at $299 / 20 checks captures the "small lender curious about validation" segment. It's also the tier most likely to churn in month 2-3 (low check usage, "we'll come back when we're bigger").

**Deprecate when:**
- Pro and Fund tier together generate >80% of monthly recurring revenue.
- Starter conversion-to-Pro within 90 days drops below 20%.
- Vendor unit costs rise (e.g. Cobalt price hike) such that Starter's gross margin drops below 50%.

**Replacement path:** discontinue net-new Starter signups; existing Starter customers grandfather indefinitely or until they upgrade naturally.

### When to introduce **Free Trial** (real, not just the 3-check gate)

Today: 3-check pre-subscription gate (per pickup memory). This is a soft "play with it before paying" mechanism but isn't framed as a Free Trial — there's no time limit, no upgrade nudge, no email automation.

**Introduce a real 14-day trial when:**
- Conversion from 3-check gate → Starter is below 10%. This signals the gate is too soft (people get value without paying and never convert).
- We have a marketing site driving inbound (post-Wade Intel content + state-of-validation posts), so trial signups are net-new not founder-curated.
- Resend / nurture-email sequence is built so trial users get drip education before the trial ends.

**Trial mechanics:** 14 days, full Pro tier features (50 checks), credit card NOT required upfront. Day 7 check-in email; day 13 "trial ends tomorrow" email; day 15 auto-downgrade to gated state requiring upgrade to continue.

### Pricing-page discipline

Don't show all four+ tiers at once. Public pricing page should show:
- Starter (until deprecated).
- Professional.
- Enterprise.
- "Talk to us" CTA covering Custom + Fund tier (until Fund tier hits scale and goes self-serve).

Hiding internal + custom + fund tier from public pricing keeps the page coherent and pushes the right customers toward conversation rather than self-serve checkout.

---

## Appendix: Reference paths

- **Stripe config:** `src/lib/stripe/server.ts`
- **Stripe API routes:** `src/app/api/stripe/checkout/`, `src/app/api/stripe/portal/`, `src/app/api/stripe/webhook/`
- **Internal-plan migration:** `supabase/migrations/00020_internal_plan.sql`
- **Promote-to-internal script:** `scripts/promote-to-internal.ts`
- **Validation API (3-check gate logic):** `src/app/api/validations/route.ts`
- **Plan rationale precursor:** [STRATEGY.md](../STRATEGY.md) (April 2026)
- **Roadmap (feature codes referenced):** [ROADMAP.md](./ROADMAP.md)
- **NPLA Damon-questions linkage:** [NPLA-RUNBOOK.md](./NPLA-RUNBOOK.md) Section 5
