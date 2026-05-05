# PulseClose / Wade Intel — Distribution Strategy 2026

**Last meaningful edit: 2026-05-05** — replaces the lead role of
[seo-strategy.md](seo-strategy.md), which now lives as a tactical
sub-doc covering programmatic SEO specifically.

---

## TL;DR — the core pivot

**Stop trying to rank. Start trying to be cited.**

The 2024-2025 search landscape changed two things permanently:

1. **Click-through on organic listings collapsed 58-61% on AI-Overview-present queries.** Zero-click searches are now ~70% of all queries. Programmatic SEO that worked in 2022 (mass-produce per-state pages, rank, harvest clicks) is a 1/10th-leverage play in 2026.
2. **Hand-raisers from AI-search traffic convert 11x better than traditional organic** (HockeyStack 2025). 58% of B2B tech buyers now use AI search in initial vendor research, up from 17% in 2023. The asset isn't dead — the *job-to-be-done* changed from "rank for clicks" to "be the cited primary source LLMs use to answer the query."

For PulseClose / Wade Intel that means: **rebuild the content engine around GEO/AEO** (FAQPage schema, named-expert byline, primary-source data, monthly refresh dates) and **invest the saved cycles in capital-provider authority** (Insignia / Damon, NPLA, founder-led LinkedIn, the Build Buy Borrow newsletter).

---

## The brand stack

This doc explicitly threads three brands. Get this right and every other distribution decision falls out of it.

### Wade Intel (parent / authority brand)

`wadeintel.com`. Operator-led lender tech methodology firm. Owns the
*category language* for borrower validation in private lending.

- Newsletter: **Build Buy Borrow** at `buildbuyborrow.substack.com`
- Open framework: **5-Concept Loan Framework**, GitHub `wade-intel/loan-framework`, CC BY 4.0
- Voice: Operator perspective, named expert (Zach Wade), specific over generic, no buzzwords
- Distribution role: Authority signal, methodology home, where industry quotes come from. **Never pitches PulseClose directly.**

### PulseClose (product)

`pulseclose.com` (WordPress marketing) + `app.pulseclose.com` (Next.js
authenticated product).

- The implementation of the methodology Wade Intel publishes
- Distribution role: The thing Wade Intel content points at when "okay, how do I actually run this"
- Pricing: $299 / $499 / $799 (see [PRICING-STRATEGY.md](PRICING-STRATEGY.md))

### The Lenny model, applied here

Lenny → Maven; Patrick McKenzie → Stripe; Adam Robinson → Lavender.

> Newsletter / framework / open content builds the category authority. The product is sold to the audience the authority attracts, not by the authority itself.

The practical rule: **Wade Intel content has at most a single
sidebar/footer mention of PulseClose.** Headlines and CTAs in Wade Intel
content always point to "read the methodology" or "apply the framework."
If the reader wants the product they'll click through; if they don't,
the authority compounds anyway.

---

## What the 2026 SEO/GEO landscape actually looks like

### The old game

- Mass-produce templated pages (50 state SOS guides, 100 county lien guides, 100+ glossary terms)
- Rank #1-3 organic for long-tail commercial queries
- Convert 1-3% of clicks to signups

This worked through ~2022. Two things broke it:

### The breakage

1. **Google Helpful Content System** (HCS, 2022-2024) widened the "quality discount" so that high-volume thin templated content now suppresses ranking *across the whole site*, not just the templated pages. HCS penalties take 6-18 months to recover from. ([Knowlee pSEO Playbook 2026](https://www.knowlee.ai/blog/programmatic-seo-playbook-2026))
2. **AI Overviews** in Google + Perplexity + ChatGPT Search collapsed click-through. Seer Sept 2025: organic CTR fell 61% on AIO queries. ALM antitrust filings: 58% click reduction for top-ranked pages. ([Seer AIO CTR Sept 2025](https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update))

### The new game (GEO / AEO — Generative Engine Optimization / Answer Engine Optimization)

The job is to be cited *inside* the AI Overview / ChatGPT answer / Perplexity panel, not to rank below it. The patterns:

| Signal | Why it matters | Implementation |
|---|---|---|
| **FAQPage schema** | Highest-CTR structured-data shape for AI citations | Every methodology page gets `<script type="application/ld+json">` with explicit Q-A pairs |
| **40-word direct answers** under H3 questions | LLMs prefer self-contained answer blocks | First paragraph after each H3 is a direct definition / answer |
| **Named-expert byline** | LLMs anchor citations on expertise signals | "Methodology authored by Zach Wade, Wade Intel — validated against production runs at Insignia Capital Corp" |
| **Primary-source data** | Perplexity disproportionately cites unique data | Quarterly proprietary-data drops from anonymized PulseClose validations |
| **Monthly refresh dates** | ChatGPT recency bias — 95-position swing observed for refreshed pub dates | Every page has a `Last reviewed YYYY-MM-DD` field, swept monthly |
| **Reddit presence** | Perplexity cites Reddit at 46.7% top-citation rate | Founder account (Zach Wade) answers substantive Qs in r/RealEstateInvesting, r/HardMoneyLoans weekly |
| **Topical-cluster cross-linking** | Niche topical authority outranks domain authority for specific Q&As | Glossary term → state guide → product page; pillar post → 4 supporting posts |
| **llms.txt** | Possibly zero measured upside today; ship it anyway | 30-min insurance, do not budget for it |

The shape of the queries we're playing for in 2026:

- *"How do I validate a borrower's track record on a fix-and-flip loan?"*
- *"What's the difference between an active and forfeited Texas LLC for a bridge loan?"*
- *"How do private lenders run litigation checks on borrowers?"*
- *"What experience tier should I require for a $2M ground-up construction bridge?"*
- *"Bridge loan borrower red flags"*

These are LLM-mediated queries first, search-engine queries second. The
content has to be designed to win the citation, not the click.

---

## Effort allocation, May-Oct 2026 (~26 weeks)

| Channel | % effort | What it actually means weekly | Why this number |
|---|---|---|---|
| **Capital-provider authority** (Insignia / Damon, NPLA, design-partner conversations) | **30%** | ~12 hr/wk: Damon syncs, NPLA prep, design-partner intros, follow-up | Memory says this is *the* organic distribution path. Fund it accordingly. |
| **Founder-led LinkedIn** (Wade Intel positioning) | **20%** | ~8 hr/wk: 2-3 substantive posts/wk, ICP comments daily, framework excerpts | 95% of decision-makers cite TL influence ([Edelman-LinkedIn 2026](https://www.linkedin.com/business/marketing/blog/trends-tips/b2b-marketing-insights-creators-thought-leadership)); biggest underweighted lever |
| **Build Buy Borrow newsletter** | **15%** | ~6 hr/wk: 1 long-form Tuesday post + ICP narrowing + repurpose to LinkedIn | Compounding asset; flywheel candidate |
| **GEO/AEO content engine** (existing pSEO refresh + 1 pillar/month) | **15%** | ~6 hr/wk: monthly refresh sweep, 1 deep pillar/month | Rescue the 15 state guides + 20 glossary terms already shipped |
| **5-Concept Framework** (open standard) | **10%** | ~4 hr/wk: chapter writing, GitHub PR review, citation tracking | OSS distribution only works if the artifact is genuinely cite-able |
| **NPLA conference** (June 22-23) | **10%** averaged across the 7-week ramp | Front-loaded May-June, ~0% July-Sept | 7 weeks is too tight for a serious play; focused sprint then back to compounding work |

**Totals to 100%.** No slot for: paid ads, broad outbound, podcast guesting, generic tradeshow attendance. All of those compound 5-10x worse than the lanes above at this stage.

---

## Programmatic SEO — keep / kill / rescope

| Asset | Verdict | Action |
|---|---|---|
| 15 state SOS guides authored | **RESCOPE → DEPLOYED** | Shipped 2026-05-05 with FAQPage schema + named-expert byline + last-reviewed dates as drafts. Promote to publish per [seo-strategy.md](seo-strategy.md). |
| 35 unwritten state SOS guides | **KILL** | Reallocate cycles. The 15 we have cover ~85% of bridge loan volume. |
| 100 county lien guides | **KILL** | Worst HCS-risk shape (templated thin content); near-zero LLM-citation upside. |
| 80 unwritten glossary terms | **CAP at 25-30** | The first 20 are shipped. Add 5-10 high-intent terms (e.g., "experience tier classification", "non-recourse bridge loan"). Stop. |
| 1 of 12 pillar posts written | **KEEP, ACCELERATE** | 1 deep pillar/month through Oct = 6 pillars total. Each is named-expert primary-source, 2,000-3,500 words, FAQ schema. |
| 5-Concept Framework (GitHub) | **KEEP, INVEST** | Treat as open standard, not marketing asset. Each chapter: problem statement, formal definitions, worked examples, citation guidelines. |
| Build Buy Borrow newsletter | **KEEP, CADENCE** | 1× / week Tuesday 9am ET. Quarterly proprietary-data drops. |
| llms.txt | **SHIP, DON'T BUDGET** | 30-min job, no measured upside yet. |
| NPLA AC sponsorship | **KILL** | Walk in with Damon. Pitch Scottsdale (Oct 25-27) speaking slot now. |
| LinkedIn founder-led | **KEEP, FUND IT** | 20% of cycles — the biggest underweighted lever. |

---

## The Build Buy Borrow newsletter as flywheel

### Cadence

**1 long-form post / week. Tuesday 9am ET.** Don't try for 2-3 posts/wk
solo; consistency over volume. Every 12 weeks, one post is a "data drop"
post (proprietary stats from anonymized PulseClose validations) — this
is the citation bait that gets quoted in trade pubs and inside LLM
answers.

### 8-week format rotation

1. **Methodology deep-dive** — a chapter from the 5-Concept Framework, fleshed out with bridge-lending specifics
2. **Anonymized case study** — "what we learned from N validations on bridge loans this month." Insignia is the only customer for now; use that as the data source, never the name.
3. **Industry POV / hot take** — regulation, market shift, vendor space. Strong opinion.
4. **Tool/teardown** — review a competitor honestly, including their strengths. Earns credibility.
5. (Repeat 1-4)

### Conversion CTAs

- **Default footer** on every post: *"Working on borrower validation? PulseClose handles entity, track record, GC, and litigation in one report. [Try PulseClose]"*
- **Every 3rd post**, embed a direct CTA: *"If you run a bridge-lending shop and want a free validation on your next deal, reply to this email."* Damon-style direct CTA — converts 10x footer link.
- **Quarterly data-drop posts** end with: *"Want this kind of data on your own portfolio? PulseClose subscribers get it monthly. [Start a 3-check trial]"*

### Realistic 12-month target

- 1,500-2,500 free subs (lender-titled — narrow ICP, fewer "growth marketers")
- 30-60 product trials (5-10% conversion off relevant subs)
- 5-10 paid customers (15-20% trial-to-paid)

That math works at PulseClose's $299-$799/mo price points.
Substack-paid is not the goal — newsletter-as-MQL-list is.

---

## LinkedIn founder-led (the underweighted lever)

### Why this matters

- 95% of decision-makers say thought leadership directly influences purchase decisions ([Edelman-LinkedIn 2026](https://www.linkedin.com/business/marketing/blog/trends-tips/b2b-marketing-insights-creators-thought-leadership))
- B2B decision-makers are 75% more likely to engage with founder-led video than corporate ads
- LinkedIn Lead Gen forms convert at 15-20% vs 4-9% for site forms
- Fintech audiences specifically have "AI-radar" — synthetic content gets dismissed fast. Substance and specificity win.

### Cadence

- **2-3 substantive posts/wk** under Zach Wade's personal account. Wade Intel as company-page secondary.
- **Daily 5-10 thoughtful comments** on lender-tech / private-lending posts in your feed. (More algorithmic leverage than your own posts in early days.)
- **Repurpose every Build Buy Borrow post** into a 3-5 part LinkedIn series with a "read the full piece" CTA back to the newsletter.

### Format mix

- **Operator hot takes** (60% of posts) — "Most bridge lenders still validate borrowers in a Google Sheet. Here's why that's now an existential risk:"
- **Framework excerpts** (20%) — chapter from the 5-Concept Framework with a worked example
- **Behind-the-build** (20%) — what we're building at PulseClose this week, why, what we learned. *Sparingly* — earns trust without being product-pitchy.

### What NOT to do

- No LinkedIn carousels with 8 buzzwords per slide. AI-radar.
- No "10 things I learned from 1000 validations" listicles unless the data is real.
- No engagement-bait poll questions ("Agree or disagree?"). Burns credibility fast.
- No company-page-only posting. Founder posts beat company posts decisively.

---

## NPLA Atlantic City — June 22-23, 2026

7 weeks out. **Skip booth + sponsorship.** Walk in as Damon's plus-one.
Goal: 8-12 lender intros, 3-5 design-partner-quality conversations, 1
testimonial line from Damon or Noah for the leave-behind.

Full runbook in [NPLA-RUNBOOK.md](NPLA-RUNBOOK.md). Highlights:

- **Pre-event (4 weeks out):** ship a "State of Borrower Validation in Private Lending — May 2026" data drop on Build Buy Borrow + LinkedIn. This is the warm-up; gives Damon a tangible thing to hand people before NPLA.
- **At event:** 3-min / 8-min / 15-min demo runbooks. Three persona talk tracks (lender / fund / consulting).
- **Post-event:** sequenced follow-up within 48h. CTA to a 30-min call, not "let's chat."
- **Scottsdale (Oct 25-27):** pitch a methodology talk to NPLA program committee NOW. Speaking > sponsoring at this stage.

---

## Open-source framework as primary source

The **5-Concept Loan Framework** at `wade-intel/loan-framework` is the
trojan horse. CC BY 4.0 means a competitor *could* fork it — that's a
feature, not a bug. The standard becomes "the Wade Intel framework" by
virtue of being the primary source.

### Treat it like a standard, not a marketing asset

Each chapter must include:
- Clear problem statement (what is this concept solving?)
- Formal definitions (so it can be cited unambiguously)
- Worked examples (PulseClose-style validations using the framework)
- Citation guidelines (so others link back consistently)

### How it drives PulseClose

- Lender reads the framework, agrees with the methodology
- Lender sees PulseClose footnoted as the implementation
- Lender clicks through (or asks Damon)
- Lender trials → converts

This is the long arc. 6-12 month payback. Not ROI-trackable post-hoc;
either you become the cite or you don't.

### Nearer-term plays

- **GitHub stars + forks** — soft authority signal, easy to track
- **Citations in Scotsman Guide / Originate Report / AAPL blog** — 1 trade-pub citation outweighs 10 own-domain pages for LLM authority
- **Conference talks referencing the framework** (Scottsdale Oct, AAPL Nov)
- **Linkedin posts unpacking one concept** at a time

---

## Conferences (which to attend, which to skip)

| Event | Date | Verdict |
|---|---|---|
| NPLA Atlantic City | 2026-06-22/23 | **Walk in with Damon.** No booth. |
| AAPL annual (Las Vegas) | 2026-11-09/10 | **Attend for the network.** No booth pre-customer-density. $699 early-bird non-member. |
| NPLA Scottsdale | 2026-10-25/27 | **Pitch a speaking slot NOW.** 5 months out. Speaking > sponsoring at this stage. |
| IMN private-credit conferences | Various | Fund-side, not lender-side. Skip until A1 (investor PDF parser) drives a fund-tier customer. |
| Scotsman Guide events | Various | Treat as a PR vehicle for *customers* (Insignia could submit to Top Private Lenders ranking), not us. Goal: get Wade Intel quoted in a Scotsman Guide piece. |

---

## Measurement

### Leading indicators (review monthly)

- Build Buy Borrow subs (target trajectory: 100/200/400/800/1500 over 5 months)
- LinkedIn followers + post engagement rate
- GitHub stars on `wade-intel/loan-framework`
- Backlinks to wadeintel.com (trade pubs especially)
- Mentions / citations in AI search results — manual sample queries weekly
- Newsletter → trial conversion (first measurable in month 4-5)

### Lagging indicators (review quarterly)

- Paid customers acquired via each channel (UTM + signup source field)
- Customer LTV by acquisition channel
- Direct-conversation pipeline from NPLA / Damon network
- Insignia testimonial captured (binary)

### What we are NOT measuring

- Organic traffic to wadeintel.com or pulseclose.com (search rank). 2026 reality: this is increasingly disconnected from revenue. Track it as a hygiene metric only.
- "Demo requests" from the marketing site — most product trials will come from Damon-network or newsletter direct-CTA, not the public marketing form.
- llms.txt-attributed traffic. No measured signal yet; ship it as insurance.

---

## What this doc deliberately doesn't cover

- **Paid acquisition** — not in scope at this stage. When CAC math becomes legible (post-NPLA, 5+ paying customers), revisit.
- **Outbound sales** — Damon-only outreach pre-NPLA per memory. Outbound to non-Damon lenders is on hold.
- **Partnership programs** — not until we have a referrable trial flow.
- **Multi-language / non-US expansion** — irrelevant pre-product-market-fit.

---

## Sources

The 2026 distribution landscape research feeding this doc:

- [Nico Digital — Programmatic SEO 2026 Playbook](https://www.nicodigital.com/digital-marketing/programmatic-seo-2026-playbook/)
- [Knowlee — Programmatic SEO Playbook 2026](https://www.knowlee.ai/blog/programmatic-seo-playbook-2026)
- [Averi.ai — Programmatic SEO for B2B SaaS 2026](https://www.averi.ai/blog/programmatic-seo-for-b2b-saas-startups-the-complete-2026-playbook)
- [Frase — What is GEO 2026](https://www.frase.io/blog/what-is-generative-engine-optimization-geo)
- [Frase — How to Get Cited by AI Search Engines](https://www.frase.io/blog/how-to-get-cited-by-ai-search-engines-the-complete-geo-playbook)
- [Frase — FAQ Schema for AI Search](https://www.frase.io/blog/faq-schema-ai-search-geo-aeo)
- [ALM Corp — Answer Engine Optimization 2026](https://almcorp.com/blog/answer-engine-optimization-2026/)
- [ALM Corp — AI Overviews CTR 2026](https://almcorp.com/blog/google-ai-overviews-organic-ctr-2026/)
- [Seer Interactive — AIO Impact on CTR Sept 2025](https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update)
- [Stackmatix — AEO Best Practices 2026](https://www.stackmatix.com/blog/aeo-answer-engine-optimization-practices-2026)
- [LLMrefs — AEO Complete Guide 2026](https://llmrefs.com/answer-engine-optimization)
- [Averi — B2B SaaS Citation Benchmarks 2026](https://www.averi.ai/how-to/chatgpt-vs.-perplexity-vs.-google-ai-mode-the-b2b-saas-citation-benchmarks-report-(2026))
- [Authority Tech — ChatGPT vs Perplexity B2B Pipeline 2026](https://authoritytech.io/blog/chatgpt-vs-perplexity-vs-google-ai-overviews-b2b-pipeline-2026)
- [LinkedIn Business — 2026 B2B Marketing Insights](https://www.linkedin.com/business/marketing/blog/trends-tips/b2b-marketing-insights-creators-thought-leadership)
- [LinkBoost — LinkedIn Thought Leadership 2026](https://blog.linkboost.co/linkedin-thought-leadership-2026/)
- [B2B Playbook — 2026 Demand Gen Strategy](https://theb2bplaybook.com/b2b-demand-generation-strategy-2026)
- [Concurate — Top SaaS Newsletters 2026](https://concurate.com/top-saas-newsletters/)
- [Command.ai — How Lenny's Newsletter Grew](https://www.command.ai/blog/lenny-rachitsky-newsletter-growth/)
- [Simon Owens — Realistic Conversion Rate for Paid Newsletters](https://simonowens.substack.com/p/whats-a-realistic-conversion-rate)
- [AAPL Annual Conference](https://aaplonline.com/conference/)
- [NPLA Conference June 2026 Atlantic City](https://nplaconference.com/conferences/june-2026-atlantic-city-nj/)
- [Scotsman Guide — Top Private Lenders Rankings](https://www.scotsmanguide.com/rankings/top-private-lenders/)
