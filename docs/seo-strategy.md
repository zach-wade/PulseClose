# PulseClose SEO Strategy (programmatic + on-page)

**Last updated 2026-05-05.** Rescoped from the original March 31, 2026
plan after research showed traditional programmatic SEO has decayed
hard since Google's Helpful Content System (HCS) updates and the rise
of AI Overviews / LLM-mediated search.

> This is now a **tactical sub-doc**. The lead distribution doc is
> [DISTRIBUTION-STRATEGY.md](DISTRIBUTION-STRATEGY.md), which covers
> the broader Wade-Intel-as-authority + Build-Buy-Borrow-as-flywheel
> playbook. This doc covers programmatic SEO and on-page content
> specifically — the GEO/AEO retrofit on what's already shipped, plus
> what to build next.

---

## TL;DR — what changed and what we kept

The original plan was 300+ pages: 50 state SOS guides, 50 contractor
license guides, 100 county lien searches, 100+ glossary terms, 30 city
markets, 12 pillar blog posts. Total estimated effort: 6+ months solo.

**The 2026 reality** (full sources in [DISTRIBUTION-STRATEGY.md](DISTRIBUTION-STRATEGY.md)):

- Organic CTR fell 58-61% on AI-Overview-present queries (Seer Sept 2025; ALM antitrust filings)
- HCS-suppression risk: high-volume thin templated content now penalizes the *whole site*, not just the templated pages
- LLM citations convert 11x better than traditional organic clicks (HockeyStack 2025)
- 58% of B2B tech buyers now use AI search in initial vendor research

**The pivot:** stop trying to rank, start trying to be cited. Same
calorie count, dramatically different outcome.

### Keep / Kill / Rescope

| Asset | Verdict | Status (2026-05-05) |
|---|---|---|
| 15 state SOS guides | RESCOPE → DEPLOYED | Drafts on WP via `publish-guides.ts`. FAQPage schema + named-expert byline + last-reviewed date baked in. Promote to `publish` after a final read. |
| 35 unwritten state SOS guides | KILL | The 15 we have cover ~85% of bridge volume. Reallocating cycles. |
| 100 county lien guides | KILL | Worst HCS-risk shape. Near-zero LLM citation upside. |
| 50 contractor license guides | KILL pre-NPLA | Revisit only after a multi-state customer asks. |
| 100+ glossary terms | CAP at 25-30 | First 20 deployed (drafts). Add 5-10 high-intent terms (e.g. "experience tier classification", "non-recourse bridge loan"). Stop. |
| 12-post blog calendar | RESCOPE → 6 pillars / 6 months | 1 written + deployed. 1 deep pillar/month through October. Each is named-expert primary-source, 2,000-3,500 words, FAQ schema. |
| 30 city market pages | KILL | Lowest-priority tier; abandon. |

---

## What's deployed today (as of 2026-05-05)

All content lives in WordPress at `pulseclose.com`, version-controlled
in this repo's [wordpress/](../wordpress/) directory.

### Top-level pages (5 published, 1 draft)

| URL | Status | Source |
|---|---|---|
| `pulseclose.com/` (Home) | publish | `wordpress/scripts/update-home.ts` |
| `pulseclose.com/about/` | publish | `wordpress/scripts/update-all-pages.ts` |
| `pulseclose.com/features/` | publish | same |
| `pulseclose.com/pricing/` | publish | same |
| `pulseclose.com/demo/` | publish | same |
| `pulseclose.com/privacy-policy/` | draft | manual |

### Blog posts (1 draft)

| URL | Status | Source |
|---|---|---|
| `/posts/bridge-loan-borrower-due-diligence` | draft | `wordpress/content/posts/bridge-loan-borrower-due-diligence.md` |

Pillar TOFU post. Authored before GEO retrofit; needs a pass to
restructure into explicit Q-A blocks before promoting to publish.

### Glossary (20 drafts under `/glossary/`)

Source: [`wordpress/content/glossary/terms.ts`](../wordpress/content/glossary/terms.ts).
Slugs: bridge-loan, hard-money-loan, fix-and-flip, loan-to-value, lis-pendens,
mechanics-lien, registered-agent, good-standing, sos-filing,
beneficial-ownership, bankruptcy, foreclosure, notice-of-default,
deed-of-trust, judgment-lien, construction-holdback, draw-schedule,
general-contractor-license, workers-compensation, experience-tier.

Each term renders with **FAQPage schema** (the highest-CTR
structured-data shape for AI citations) and the named-expert byline
("Methodology authored by Zach Wade, Wade Intel — validated against
production runs at Insignia Capital Corp").

### State guides (15 drafts under `/guides/sos-lookup/`)

Source: [`wordpress/content/guides/sos-states.ts`](../wordpress/content/guides/sos-states.ts).
States: California, Florida, Texas, New York, Arizona, Nevada,
Colorado, Georgia, North Carolina, Tennessee, Ohio, Illinois,
Pennsylvania, New Jersey, Maryland.

Each state guide renders with FAQPage schema using the canonical
bridge-lender query shapes:
- "How do I look up an LLC or corporation in [state]?"
- "What entity statuses should bridge lenders watch for in [state]?"
- "What data is available from the [state] [portal]?"
- "What are the common [state] SOS gotchas for lenders?"

---

## Publish workflow

```
# Draft (default)
npx tsx wordpress/scripts/publish-blog.ts
npx tsx wordpress/scripts/publish-glossary.ts
npx tsx wordpress/scripts/publish-guides.ts

# Promote to publish (after review on WP admin)
npx tsx wordpress/scripts/publish-blog.ts --publish
npx tsx wordpress/scripts/publish-glossary.ts --publish
npx tsx wordpress/scripts/publish-guides.ts --publish

# Single item by slug
npx tsx wordpress/scripts/publish-glossary.ts lis-pendens

# Audit current state
npx tsx wordpress/scripts/audit.ts
# → snapshots in wordpress/audit/
```

Idempotent — re-running upserts by slug. Safe to run repeatedly to
push edits.

---

## GEO/AEO retrofit checklist

Apply to every existing piece of content + every new piece going
forward. The publish scripts already bake most of this in; this
checklist is the manual review pass.

- [ ] **FAQPage schema** as `<script type="application/ld+json">` — Q-A pairs explicit, not just embedded in prose. Done by default in [`publish-glossary.ts`](../wordpress/scripts/publish-glossary.ts) + [`publish-guides.ts`](../wordpress/scripts/publish-guides.ts).
- [ ] **40-word direct answer** as the first paragraph after each H3 question. Manual pass needed for the existing pillar blog post.
- [ ] **Named-expert byline** on every page: "Methodology authored by Zach Wade, Wade Intel". Done by default.
- [ ] **`Last reviewed YYYY-MM-DD`** date on every page. Done by default; sweep monthly to refresh.
- [ ] **Cross-links** glossary → state guide → product page. Manual pass on each new term.
- [ ] **Internal Author byline link** to a Zach Wade author page (TODO — not yet built on WP).
- [ ] **Schema.org Person markup** for the author byline (TODO).
- [ ] **Open Graph + Twitter Card meta** on every page (managed by WordPress theme; verify monthly).
- [ ] **Submit URL to Bing IndexNow** after publish (TODO — not yet wired).
- [ ] **llms.txt at `pulseclose.com/llms.txt`** listing canonical methodology pages (TODO — 30-min job; ship as insurance, no measured upside).

---

## Target keywords (what we're trying to win citations for)

The shape of 2026 query intent. Note: we're optimizing to be **cited
inside the AI Overview / ChatGPT answer / Perplexity panel**, not to
rank below it. So "ranking #1" is a weaker leading indicator than
"appears in AI-generated answer".

### Commercial intent (highest LLM-citation value)

| Query | Page | Status |
|---|---|---|
| "borrower verification software" | features | published |
| "bridge loan underwriting software" | features | published |
| "automated borrower due diligence" | future pillar #2 | not written |
| "borrower track record verification" | future pillar #3 | not written |
| "contractor license verification for lenders" | future pillar #4 | not written |
| "litigation screening for loan underwriting" | future pillar #5 | not written |

### Problem-aware (mid-funnel)

| Query | Page | Status |
|---|---|---|
| "bridge lender due diligence checklist" | bridge-loan-borrower-due-diligence | draft |
| "bad borrower red flags hard money" | future pillar #6 | not written |
| "the problem with self-reported track records" | covered in pillar #1 | partial |

### Informational (top-funnel — glossary + state guides win these)

Already in the deployed set:
- "what is lis pendens" → `/glossary/lis-pendens/`
- "what is good standing" → `/glossary/good-standing/`
- "experience tier classification" → `/glossary/experience-tier/`
- "[state] secretary of state entity search" → `/guides/sos-lookup/[state]/`

### Competitor capture (low priority pre-NPLA)

`LendingWise alternative`, `Juniper Square alternative for bridge
lenders` — defer until we have ≥3 paying customers willing to be
referenced.

---

## 6 deep pillar posts to write (May-Oct 2026)

One per month. Each: 2,000-3,500 words, named expert byline, 8-12 H3
question blocks with 40-word direct answers, FAQPage schema, primary
data quote where possible.

| Month | Title (working) | Target query |
|---|---|---|
| May | "How to validate a bridge loan borrower in 2026: the 4-pillar method" | published as draft; needs GEO retrofit before promoting |
| June | "Why most borrower track records are wrong (and how to verify them)" | "borrower track record verification" |
| July | "The bridge lender's contractor risk audit: a state-by-state framework" | "contractor license verification for lenders" |
| Aug | "Federal vs state litigation screening for private lenders" | "litigation screening for loan underwriting" |
| Sep | "Anti-money-laundering for bridge lenders: the OFAC checklist" | "OFAC screening private lender" |
| Oct | "Borrower fraud detection: 9 patterns we found in 100+ validations" | proprietary data drop — citation bait |

The October post is the **proprietary data drop** — uses anonymized
PulseClose validation data to cite specific patterns. This is the kind
of unique-data post Perplexity disproportionately cites and that turns
into Build Buy Borrow flywheel content.

---

## Technical SEO checklist

### Already done

- [x] WordPress + Yoast on `pulseclose.com` (managed by GoDaddy)
- [x] Top-level pages with hand-authored title + meta
- [x] FAQPage schema in publish-glossary.ts + publish-guides.ts (auto-rendered)
- [x] Named-expert byline auto-added by publish scripts
- [x] Last-reviewed timestamp on every page (publish scripts)
- [x] WordPress sitemap auto-generated by Yoast
- [x] `app.pulseclose.com/robots.ts` correctly disallows all (auth product, not for indexing)

### To do

- [ ] Submit pulseclose.com sitemap to Google Search Console + Bing Webmaster
- [ ] IndexNow API integration on publish (Bing prefers; Vercel supports)
- [ ] Monthly refresh sweep — re-run publish scripts so `Last reviewed` updates (manual cron or GitHub Action)
- [ ] Author bio page at `/about/zach-wade/` with Schema.org Person markup
- [ ] llms.txt at `pulseclose.com/llms.txt`
- [ ] WordPress theme audit — Core Web Vitals (LCP < 2.5s, CLS < 0.1, INP < 200ms)

---

## What we're NOT doing (and why)

Reference for future-Zach when tempted to scope-creep:

- **No paid ads** — CAC math isn't legible at this stage. Revisit when 5+ paying customers land.
- **No SaaS-directory pushes** (G2, Capterra, GetApp) until we have ≥3 quote-able customers.
- **No competitor-comparison pages** until those competitors are ranking for queries we're losing.
- **No mass guest-posting outreach** — capital-provider endorsement is the only organic distribution path that works in this niche; trade-pub citations come *because* of methodology authority, not from cold pitches.
- **No mid-2024 pSEO tactics** (programmatic city pages, mass-generated state pages with thin content, internal-linking farms). HCS-decayed.
- **No keyword cannibalization auditing** — we have 36 pieces of content total, not 1,000. Not worth the tooling cost yet.

---

## Measurement

### Leading indicators (review monthly)

- Pages crawled by Google + Bing
- Indexed pages (target: 36 → 41 by month 6)
- Mentions in AI Overviews / ChatGPT / Perplexity answers — manual sample queries weekly
- Backlinks (target: 5 from trade pubs by Oct 2026)

### Lagging indicators (review quarterly)

- Organic sessions to pulseclose.com (hygiene metric only — see DISTRIBUTION-STRATEGY)
- Trial signups attributed to organic (UTM-tracked)
- Newsletter signups attributed to glossary / state guide pages

### NOT a metric

- Keyword rank position (decoupled from revenue post-AIO)
- Total page count (we're optimizing for citation density, not page count)

---

## Cost estimate

| Item | Monthly |
|---|---|
| WordPress hosting (GoDaddy Managed WP) | $20-30 |
| Schema.org + JSON-LD (in-house, free) | $0 |
| Google Search Console + Bing Webmaster (free) | $0 |
| Yoast SEO Premium (optional) | $99/yr |
| **Total** | **~$30/mo** |

Content is in-house (Zach + Claude). Programmatic page generation is
already automated via the publish scripts.

---

## See also

- [DISTRIBUTION-STRATEGY.md](DISTRIBUTION-STRATEGY.md) — the lead doc; what role pSEO + on-page content plays in the broader 2026 distribution strategy
- [../wordpress/README.md](../wordpress/README.md) — operational reference for the publish workflow
