# PulseClose -- Product Strategy & Future Ideas

*Internal planning document. Last updated April 2026.*

---

## Where we are today

PulseClose is a borrower validation platform for bridge lenders, built by a solo technical founder with one design partner: Insignia Capital Corp. The product just crossed the threshold from "demo with stub data" to "real vendor data flowing through the system" in April 2026.

**What works today:**

- **Entity validation** -- Cobalt Intelligence SOS lookup across all 50 states. Returns entity status, formation date, registered agent, last filing date.
- **Track record verification** -- Regrid owner-name property search surfaces current holdings. ATTOM enriches each property with sale history, acquisition/disposition prices, and hold periods.
- **Litigation screening** -- CourtListener searches federal courts for bankruptcy filings and lawsuits against borrower entities.
- **GC validation** -- CSLB scraping for California contractor licenses. Returns license status, classification, disciplinary actions, bond/insurance info.
- **Billing** -- Stripe integration with three tiers: Starter ($299/mo, 20 checks), Professional ($499/mo, 50 checks), Enterprise ($799/mo, unlimited). Usage metering tracks every vendor API call with org, check type, cost, and timestamp.
- **AI analysis** -- Claude generates underwriting memos from validation data with confidence scores and experience tier classification (Tier 1-4).

The infrastructure is Next.js on Vercel, Supabase for auth and database, RLS on all tables. The schema is normalized -- separate tables for entity checks, track record entries, GC validations, and litigation checks. No JSONB blobs.

This is early. One design partner, zero revenue, product just started returning real data. But the architecture is sound, the vendor integrations are proven, and the core validation workflow works end to end.

---

## Current data gaps

Being honest about what the product cannot do yet:

**Track record is incomplete.** Regrid returns properties currently owned by a borrower entity. ATTOM enriches each address with sale history. But there is no way to search for historical transactions by owner name -- only current holdings. The test borrower (TT Investment Properties) has completed roughly 75 flips over the past decade. PulseClose found 25 current holdings. The 50 completed and sold projects are invisible. This is the single biggest gap in the product. A borrower who has done 75 deals looks like someone who has done 25.

**Litigation is federal only.** CourtListener covers federal courts -- bankruptcy, federal civil suits. Most litigation that matters for bridge lending (mechanic's liens, breach of contract, fraud claims, landlord-tenant disputes) happens at the state level. A borrower with three active state court lawsuits would show as "clear" today.

**GC validation is California only.** CSLB works well for CA contractors, but there is no coverage for any other state. A borrower using a GC in Florida, Texas, or New York gets no validation at all.

**No entity-to-person resolution.** If a borrower operates through five LLCs, PulseClose can validate each LLC individually but cannot discover the full network of entities a person controls. Each LLC is searched in isolation.

**No sanctions or OFAC screening.** The product does not check borrower names or entities against OFAC SDN lists, BIS denied persons, or any other sanctions database. This is a basic compliance check that most lenders expect.

**No foreclosure, lis pendens, or UCC lien data.** ATTOM has these endpoints -- we have the API key -- but the adapters have not been built yet.

**No document verification.** Borrower-submitted documents (insurance certs, financial statements, entity docs) are taken at face value. No OCR extraction, no cross-referencing against validation data.

---

## Competitive landscape

| Company | What they do | Relationship to PulseClose |
|---|---|---|
| **Elementix** | Borrower intelligence, pre-origination. 109.5M transaction database, signature-based entity resolution across LLCs. | Complementary, not competitive. They focus on borrower sourcing and relationship mapping. Could be a data partner for entity resolution. |
| **SFR Analytics / Private Lender Radar** | Borrower sourcing and lender market intelligence. Tracks 40K+ lenders and their borrower relationships. | Different product category. They help lenders find borrowers; PulseClose validates borrowers lenders already have. |
| **Lend Engine** | AI-native loan origination system with built-in borrower validation. | The biggest competitive threat if they execute. An LOS that bundles validation removes the need for a standalone product. Watch closely. |
| **Middesk** | Horizontal KYB platform. Business identity verification, SOS filings, TIN matching, watchlist screening. | Not lending-specific. No track record, no GC validation, no litigation screening. But they could add it. |
| **HouseCanary** | Property analytics and valuation. | Adjacent. Complements PulseClose for property-level risk. Not competitive. |
| **Ocrolus** | Document analysis and data extraction from financial docs. | Complementary. Could solve PulseClose's document verification gap. |
| **Built Technologies** | Construction draw management and inspection. | Adjacent. Their inspection data could feed into GC validation. $83M revenue, well-funded. |

**The gap PulseClose occupies:** No one does combined entity validation + track record verification + GC validation + litigation screening in a single product. GC validation for bridge lending has zero competitors. The question is whether that gap is a real market or a feature that gets absorbed into broader platforms.

---

## Near-term improvements (next 30 days)

### 1. BatchData integration -- historical deed search by owner name

**What:** BatchData offers a self-serve API that can search deed records by owner name, returning historical buy/sell transactions. This closes the biggest data gap -- the difference between showing 25 current holdings and showing 75 completed projects.

**Effort:** ~3 days. New adapter, API integration, merge historical deeds into track record entries.

**Cost:** $0.01 per API call. At current volume, negligible.

**Why now:** This is the single most impactful improvement possible. A borrower's track record is the most important factor in bridge lending underwriting, and we are currently missing 60-70% of it.

### 2. OFAC/sanctions screening

**What:** Check borrower names and entity names against OFAC SDN list and OpenSanctions database. Return clear/match/partial-match with details.

**Effort:** ~2 days. OpenSanctions provides a free bulk download. OFAC SDN list is freely available from Treasury.

**Cost:** Free data. Only cost is storage and matching logic.

**Why now:** Transforms PulseClose from a due diligence tool into a compliance tool. OFAC enforcement on non-bank lenders is intensifying. This is table stakes for any lender with institutional capital.

### 3. Better AI underwriting memos

**What:** Improve the Claude prompt to produce structured memos with specific risk callouts, experience tier justification with supporting evidence, comparable deal analysis, and a clear recommendation summary.

**Effort:** A few hours of prompt engineering and output format iteration.

**Cost:** Marginal increase in token usage, pennies per memo.

**Why now:** The memo is the primary output credit committees see. A better memo makes every other validation more valuable.

### 4. Fix remaining production bugs

**What:** Supabase RLS edge cases (some queries fail silently when profile lookup returns null), error handling for vendor API timeouts, loading states that don't recover gracefully.

**Effort:** 1-2 days.

**Cost:** None.

**Why now:** Before onboarding any paying customer, these need to be solid.

### 5. ATTOM foreclosure/lis pendens endpoints

**What:** ATTOM already provides foreclosure filings and lis pendens data through endpoints we have access to. Build adapter methods to query these per-property and per-borrower.

**Effort:** 1-2 days. Adapter pattern already exists, just new endpoint methods.

**Cost:** Covered under existing ATTOM API key.

**Why now:** Foreclosure history is directly relevant to borrower risk assessment. Free to add with existing credentials.

---

## Medium-term features (next quarter)

### 1. OpenCorporates integration -- person-to-entity discovery

**What:** Given a person's name, find all LLCs, corps, and other entities they are listed as an officer, director, or agent for. Resolves the entity network problem.

**Effort:** ~2 days.

**Cost:** Free tier at 200 requests/month. Paid plans start around $2,800/year.

**Dependency:** None. Self-serve API.

### 2. Unicourt -- state court litigation

**What:** State court case search across 40+ states. Covers the civil litigation, mechanic's liens, and breach of contract cases that CourtListener misses.

**Effort:** ~3 days.

**Cost:** ~$500/month.

**Dependency:** Wait until paying customers justify the recurring cost. Federal-only litigation is acceptable for launch; state coverage is the upgrade.

### 3. Multi-state GC validation

**What:** Build scraping adapters for Florida (DBPR), Texas (TDLR), and New York (NYC DOB) contractor licensing boards. Same pattern as CSLB adapter.

**Effort:** ~1 week per state. Each state has a different website structure and data format.

**Cost:** No API cost. Development time only.

**Dependency:** Customer demand by state. Prioritize based on where design partner's borrowers operate.

### 4. PDF report export

**What:** Generate a structured, downloadable PDF validation report. Cover page, executive summary, detailed findings per check type, confidence scores, flags, and sources.

**Effort:** ~3-4 days. PDF generation in Next.js (react-pdf or puppeteer-based).

**Cost:** Negligible compute.

**Dependency:** None, but get the data quality right first. A PDF locks in whatever the product shows.

### 5. Continuous monitoring

**What:** Scheduled polling for changes: entity status changes (SOS filings), new litigation filings, GC license expirations or suspensions. Alert lenders when a borrower's risk profile changes mid-loan.

**Effort:** ~1 week. Requires job scheduling, change detection logic, and notification system.

**Cost:** Incremental API costs per monitored entity.

**Dependency:** Meaningful customer base to justify the infrastructure. This converts one-time validation fees into recurring subscription revenue -- but only matters when there are enough borrowers being monitored.

### 6. LOS API integrations

**What:** Webhook or REST API that loan origination systems (Bryt, LendingWise, Baseline) can call to trigger validation and receive structured results.

**Effort:** ~1 week for API design, auth, and documentation.

**Cost:** None.

**Dependency:** Requires those LOS vendors to care about PulseClose. This is a BD problem, not a technical one. Build it when a lender asks for it because they use a specific LOS.

---

## Market expansion opportunities

Ranked by attractiveness based on reuse of existing engine, market size, and go-to-market feasibility:

| Rank | Market | Size / Growth | Engine Reuse | Why it works | Key risk |
|------|--------|---------------|-------------|-------------|----------|
| 1 | **DSCR rental loans** | 54% YoY growth in origination volume | ~90% | Same borrowers, same entities, same GCs. Add rental income verification. | Borrower profiles slightly different (buy-and-hold vs. flip). |
| 2 | **SBA 7(a) lending** | $25B/year program | ~80% | New SBA verification requirements create regulatory tailwind. Entity + litigation checks directly applicable. | SBA ecosystem has established vendors. Breaking in requires compliance certification. |
| 3 | **Ground-up construction** | Natural extension of bridge lending | ~85% | GC validation module is a genuine differentiator here. Construction lenders have the most to lose from GC fraud. | Longer project timelines mean monitoring becomes essential, not optional. |
| 4 | **UK bridging finance** | GBP 13.4B market, 150+ lenders | ~60% | Fragmented market with no dominant validation platform. | Requires Companies House + Land Registry integrations. Different legal framework. Non-trivial localization. |
| 5 | **Insurance / subcontractor validation** | Large but diffuse | ~40% | Sell GC validation as an API to insurance carriers underwriting contractor policies. | Different buyer, different sales motion. Distraction risk. |

---

## Long-shot bets (12-24 months)

### 1. Cross-lender borrower reputation graph

**The idea:** As more lenders validate borrowers through PulseClose, accumulate anonymized loan performance outcomes. Did the borrower complete the project on time? Was there a default? Over time, this becomes a "bridge lending FICO" -- a reputation score no individual lender can build alone.

**Why it could be huge:** Bridge lending has no equivalent of a credit bureau. Lenders rely on self-reported track records and word of mouth. A trusted, data-backed reputation score would be worth significant pricing power.

**Why it's hard:** Requires critical mass of lenders sharing outcome data. Lenders view borrower relationships as proprietary. Trust, privacy, and legal structure problems are harder than the technical build.

**What would need to be true:** 20+ active lenders on the platform, a data-sharing agreement that protects individual lender identity, and enough volume to make the scores statistically meaningful.

### 2. Fraud ring detection

**The idea:** Graph analysis across all validations to detect suspicious patterns: the same GC appearing across multiple defaulting borrowers, the same registered agent filing entities for apparently unrelated parties, the same property being valued at wildly different amounts in concurrent loan applications.

**Why it could be huge:** Mortgage fraud on investment properties hit 1-in-43 applications in Q4 2025. Lenders lose billions. Pattern detection across lenders catches what individual lenders cannot see.

**Why it's hard:** Requires significant volume to detect signal above noise. False positives could damage borrower relationships. Start with heuristic rules, graduate to graph neural networks only with sufficient data.

**What would need to be true:** Hundreds of validations per month across multiple lenders. A tolerance among customers for investigative-style flagging.

### 3. Automated underwriting memos

**The idea:** LLM generates a full, credit-committee-ready underwriting memo from validation data. Not a summary paragraph -- a complete 3-5 page memo with risk factors, mitigants, comparables, and recommendation.

**Why it could be huge:** Saves 2-4 hours of analyst time per deal. Fastest path to expanding revenue per validation. Every lender writes these memos.

**Why it's hard:** The Colorado AI Act (effective June 2026) and similar state laws may require explainability and human review for AI-driven lending decisions. The line between "AI-assisted memo" and "AI-driven decision" is legally unclear.

**What would need to be true:** Clear legal guidance on AI in lending decisions, or a product design that keeps the AI firmly in the "tool" category with explicit human-in-the-loop.

### 4. Climate risk scoring

**The idea:** Embed First Street or Jupiter Intelligence property-level flood, fire, and wind risk into validation reports. Show lenders the climate exposure of collateral properties.

**Why it could be huge:** Insurance costs are repricing climate risk faster than property values. A property in a flood zone with a cancelled insurance policy is a different risk than the appraisal suggests.

**Why it's hard:** It isn't technically hard. But climate risk is becoming table stakes -- every proptech platform will offer it. Differentiator value is low.

**What would need to be true:** A customer willing to pay more for climate data in the validation report.

### 5. Satellite construction monitoring

**The idea:** Planet Labs imagery combined with permit data to auto-verify construction milestones for draw management. Lender can see whether a roof was actually installed before releasing a draw.

**Why it could be huge:** Draw fraud is a real and expensive problem. Automated verification could replace or supplement physical inspections.

**Why it's hard:** This is a genuine computer vision challenge. Built Technologies has $83M in revenue and has not fully cracked automated visual inspection. Resolution, cloud cover, angle variation, and the diversity of construction sites make this genuinely difficult.

**What would need to be true:** Dramatic improvement in satellite imagery resolution and CV models, or a willingness to use drone imagery instead of satellite.

### 6. Compliance automation

**The idea:** Automated verification that loan documents meet state-specific regulatory requirements. Fifteen-plus states have tightened private lending laws since January 2025. Lenders operating across states face a patchwork of requirements.

**Why it could be huge:** Compliance is expensive, error-prone, and mandatory. Automation has clear ROI.

**Why it's hard:** Requires deep legal expertise to encode accurately. Errors have legal consequences. Needs ongoing maintenance as regulations change.

**What would need to be true:** A partnership with a compliance-focused law firm, or a very narrow initial scope (one state, one loan type).

---

## Macro tailwinds

- **Private credit expansion.** Private credit AUM at $1.3T, projected to reach $2T by 2027. Banks continuing to retreat from direct lending, creating space for alternative lenders who need better validation tools.
- **Alternative lender market share.** Non-bank lenders now close 37% of non-agency commercial real estate deals, up from ~25% three years ago.
- **Fraud risk elevated.** Mortgage fraud risk on investment property applications hit 1-in-43 in Q4 2025. Lenders are actively looking for better screening.
- **CFPB weakened, states filling the gap.** Federal consumer protection enforcement has pulled back, but state regulators and attorneys general are stepping in. OFAC enforcement specifically is intensifying against non-bank financial entities.
- **CTA gutted for domestic entities.** The Corporate Transparency Act's beneficial ownership requirements were rolled back for domestic companies. Lenders can no longer rely on FinCEN for entity verification -- they have to do it themselves.
- **Structural housing shortage.** 3.8 million home deficit, estimated 7.5 years to close at current build rates. Structurally bullish for fix-and-flip and ground-up construction activity.
- **Tariff-driven cost inflation.** Tariffs pushing construction material costs up approximately 6%, compressing rehab margins. Tighter margins make GC selection and validation more consequential -- a bad GC on a tight-margin flip is the difference between profit and loss.

---

## Macro risks

- **Credit deterioration.** Private lending is growing fast with loosening underwriting standards. A wave of defaults could cause lenders to pull back from the market entirely, shrinking the customer base.
- **State AI regulation.** The Colorado AI Act (June 2026) and similar legislation in other states could constrain AI-driven risk scoring and underwriting memo generation. Compliance requirements are still unclear.
- **Construction cost inflation.** Tariff-driven cost increases could slow fix-and-flip volume if margins compress below viability for borrowers.
- **Large lender internalization.** If the biggest bridge lenders (Kiavi, RCN Capital, Lima One) build internal validation tools, the addressable market for an external product shrinks to mid-market and smaller lenders.
- **AI-native LOS bundling.** Lend Engine or a similar AI-native loan origination system could bundle validation into the LOS, commoditizing standalone validation and making it a feature rather than a product.

---

## Recommended API stack

| Vendor | Function | Status | Self-serve? | Cost | Priority |
|--------|----------|--------|-------------|------|----------|
| **Cobalt Intelligence** | Entity SOS lookup, 50 states | Live | Yes | Per-lookup pricing | Have it |
| **Regrid** | Owner-name property search | Live | Yes | Token-based | Have it |
| **ATTOM** | Sale history, property details | Live (partial) | Yes | Per-call pricing | Have it |
| **CourtListener** | Federal court litigation search | Live | Yes | Free (donate) | Have it |
| **CSLB** | CA contractor license validation | Live | N/A (scraping) | Free | Have it |
| **BatchData** | Historical deed search by owner name | Not started | Yes | $0.01/call | **Now** |
| **OpenSanctions** | OFAC/SDN/sanctions screening | Not started | Yes | Free | **Now** |
| **OpenCorporates** | Person-to-entity discovery | Not started | Yes | Free tier (200/mo), ~$2,800/yr paid | Next quarter |
| **Unicourt** | State court litigation, 40+ states | Not started | Yes | ~$500/mo | Next quarter |
| **DataTree / First American** | Gold-standard deed and title records | Not started | No (enterprise sales) | Enterprise pricing | Later |
| **BuildFax** | Building permit history | Not started | Yes | $1-3/lookup | Later |
| **First Street** | Property-level climate risk (flood/fire/wind) | Not started | Yes | Per-property pricing | Later |
| **Sayari** | Deep entity intelligence, UBO, sanctions | Not started | No (enterprise sales) | $50K+/year | Later |

---

*This is a living document. Updated as the product, market, and competitive landscape evolve.*
