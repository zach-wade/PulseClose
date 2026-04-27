# PulseClose — Session Pickup (2026-04-27)

## Current state of the product

Standalone borrower validation platform for bridge lenders. Real vendor data flowing end-to-end. UI overhauled to surface rich property, litigation, and entity data.

### What's live and working

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (Supabase) | Working | Signup/login, admin client for API routes, auto-create org+profile |
| Landing page (Next.js) | Working | Hero, pain points, features, CTA |
| Marketing site (WordPress) | Updated | Home, Features, Pricing, About, Demo — all pushed via REST API. Theme `front-page.php` updated to render `the_content()`. May need cache purge. |
| Dashboard shell | Working | Navy sidebar, 7 sections |
| Validation flow | Working | Create → parallel checks → detail report → list |
| Entity check (Cobalt) | Real | SOS lookup across 50 states. Shows officers, confidence, filings. Rate limited today — may need to wait. |
| Track record (Realie) | **Real — Primary** | Owner-name search, 126 fields per property. Returns AVM, lender, LTV, liens, foreclosure status, transfer history. Requires state param. $50-150/mo. |
| Track record (Regrid) | Real — Fallback | Falls back to Regrid if Realie fails or no state. $375/mo Standard plan, CA coverage active. |
| Track record (ATTOM) | Real — Enrichment | Sale history per address. Only runs when Regrid is used (Realie already has transfer data). |
| GC validation (CSLB) | Real (CA only) | Scrapes CA CSLB by license number. Other states stub. |
| Litigation (CourtListener) | Real | Federal bankruptcy + lawsuits. Active vs dismissed distinction. Court name, nature of suit, dates shown. |
| AI analysis (Claude) | Working | Runs async (non-blocking). Generates risk memo with pillar assessments. |
| Stripe billing | Working | 3 tiers: $299/$499/$799. Free trial: 3 checks. Usage metered. |
| Sentry | Wired | Client/server/edge configs |
| Rate limiting | Added | Token-bucket on API routes |
| Usage metering | Working | Every vendor API call logged |

### UI Overhaul (just shipped)

Track record table → Portfolio view:
- Columns: Property, Purchase, Est. Value (AVM), Lender, Liens, LTV, Hold, Status
- Portfolio summary: total AVM, equity, lien exposure, avg LTV
- Expandable rows: beds/baths/sqft, year built, zoning, assessed value, transfer chain
- Status shows "Owned" / "Sold" instead of "in_progress" / "completed"

Litigation grid:
- Active cases: red "ACTIVE" badge. Dismissed: muted "DISMISSED" badge
- Court name, nature of suit, cause, filed/terminated dates
- Case numbers link to CourtListener docket page

Entity card:
- Officers/principals from Cobalt
- Confidence level badge (amber if < 80%)
- Recent filings with dates
- Clear error state when Cobalt fails (was silently returning stub data)
- Source URL link

GC card:
- Removed Beta badge and "simulated" text
- CA live, other states show "not automated" message

Validation scoring:
- Experience tier counts total properties (not just completed sales)
- Confidence score calculated from real signals (entity status, property count, litigation severity)
- Dismissed litigation = informational, not flagged. Only active cases drive "flagged" status.
- Fake foreclosure/lis pendens stubs removed from litigation results

### Database

- Supabase project ref: `oazwscmgyqknwatqgtyc`
- 4 migrations applied (foundation, handle_new_user, ai_analysis, stripe_billing)
- Org: "Test Co" (id: `9e580f59-...`) — checks counter may need reset for testing

### Env vars (all in `.env.local` and Vercel)

Supabase (URL, anon key, service role), Anthropic, Cobalt Intelligence, Realie (`REALIE_API_KEY`), Regrid (`REGRID_API_TOKEN`), ATTOM (`ATTOM_API_KEY`), CourtListener (`COURTLISTENER_API_TOKEN`), Stripe (secret, publishable, webhook secret, 6 price IDs), Sentry, PostHog, Resend, WP creds, `NEXT_PUBLIC_APP_URL`

---

## Known issues

### Prod issues
1. **Cobalt rate limiting** — Hit 429 during testing. Entity lookup fails and returns clear error (no longer silently falls back to stub). Wait for rate limit reset or check Cobalt plan limits.
2. **504 risk on heavy validations** — AI analysis is now async/non-blocking and Regrid/Realie fetches have 20s timeouts. `maxDuration=60` set. Should be stable but monitor.
3. **Usage page counts API calls not validations** — Shows "12 checks" when user ran 3 validations (4 API calls each). Confusing but not blocking.
4. **Free trial counter** — `checks_used_this_period` on org needs manual reset for testing. Can reset via Supabase admin query.

### Data gaps
1. **Track record only shows current holdings** — Realie/Regrid return what the borrower owns now. Historical buy/sell chain (completed flips) requires expensive deed search APIs (BatchData $1K/mo annual, DataTree enterprise). This is the biggest product gap.
2. **Litigation is federal only** — CourtListener covers bankruptcy + federal lawsuits. Most lending-relevant litigation (mechanic's liens, contract disputes) happens at state level. Unicourt ($500/mo) would add 40+ states.
3. **GC validation is CA only** — CSLB works, other states need individual scrapers built.
4. **No entity-to-person resolution** — Can't find all LLCs a person controls. OpenCorporates ($2,800/yr) would add this.
5. **No OFAC/sanctions screening** — Free to add (OpenSanctions + OFAC SDN), just not built yet.

---

## Vendor adapter chain

```
src/lib/adapters/
  types.ts          Interface definitions (ValidationAdapter)
  extract.ts        Client-side extraction from raw_response JSONB
  stub.ts           Demo data adapter
  cobalt.ts         Entity + orchestrator (delegates to realie/regrid/attom/courtlistener/cslb)
  realie.ts         Property search — PRIMARY (owner name, requires state, $50-150/mo)
  regrid.ts         Property search — FALLBACK (owner name, no state required, $375/mo)
  attom.ts          Sale history enrichment — only when Regrid used (address-based, $250+/mo)
  courtlistener.ts  Federal litigation search (free, 5K req/day)
  cslb.ts           CA contractor license scrape (free, no API)
  index.ts          Factory: builds adapter with available keys
```

| Check Type | Primary | Fallback | Env Var | Status |
|---|---|---|---|---|
| Entity | Cobalt | Error result (no stub) | `COBALT_INTELLIGENCE_API_KEY` | Working, watch rate limits |
| Track Record | Realie | Regrid → stub | `REALIE_API_KEY`, `REGRID_API_TOKEN` | Working, requires state for Realie |
| Track Record Enrichment | ATTOM | Skip | `ATTOM_API_KEY` | Only runs with Regrid, not Realie |
| GC | CSLB (CA) | Stub (other states) | None | CA working, others need adapters |
| Litigation | CourtListener | Stub | `COURTLISTENER_API_TOKEN` | Working, federal only |

---

## Product strategy

Full strategy doc at `STRATEGY.md`. Key points:

### Near-term (next 30 days)
1. **OFAC/sanctions screening** — OpenSanctions + OFAC SDN. Free. ~2 days.
2. **Better AI memos** — Improve Claude prompt for credit-committee-quality output.
3. **Remaining UI fixes** — Dashboard home (add property/flag counts to list), Usage page (show validations not API calls), Settings (remove mock API key).
4. **PDF report export** — Structured downloadable report.

### Medium-term (next quarter)
1. **OpenCorporates** — person → entity discovery ($2,800/yr)
2. **Unicourt** — state court litigation ($500/mo)
3. **Multi-state GC** — FL, TX, NY contractor board adapters
4. **Continuous monitoring** — poll for entity/litigation/GC changes
5. **LOS integrations** — API for Bryt, LendingWise, Baseline

### Long-shot bets
1. Cross-lender borrower reputation graph
2. Fraud ring detection via graph AI
3. Satellite construction monitoring
4. Compliance automation

### Market expansion
1. DSCR rental loans (54% YoY growth, ~90% engine reuse)
2. SBA lending ($25B/yr, regulatory tailwind)
3. UK bridging finance (GBP 13.4B market)

---

## Competitive landscape

| Company | Relationship | Notes |
|---|---|---|
| Elementix | Complementary | Borrower intelligence/prospecting, not validation. 109.5M transactions, signature-based entity resolution. |
| SFR Analytics | Adjacent | Borrower sourcing, lender market intel |
| Lend Engine | Threat | AI-native LOS with built-in validation. Watch closely. |
| Middesk | Adjacent | Horizontal KYB, not lending-specific |
| HouseCanary | Complementary | Property analytics/AVM, used by 8 of top 10 private lenders |

---

## What needs to happen next (priority order)

### P0: Remaining UI fixes (Phases 7-9 from overhaul plan)
- Dashboard home page: add Properties and Flags columns to validation list table
- Usage page: distinguish "Validations" from "API Calls"
- Settings page: remove hardcoded mock API key
- Litigation standalone page: update data source descriptions

### P1: Get Insignia actually using it
- Reset their check counter or set up a real Stripe subscription
- Walk them through a validation with their own borrower data
- Collect feedback on what's missing or confusing

### P2: Add OFAC screening (free, quick compliance win)

### P3: Historical track record
- The "trust but verify" approach: borrower submits addresses, PulseClose verifies each against Realie/ATTOM
- Need a UI for borrower-submitted track records (address list input)
- Each submitted address gets verified against recorded deeds

---

## File structure

```
src/
  app/
    (auth)/login, signup
    auth/callback
    dashboard/
      page.tsx               Validation list (home)
      new/page.tsx           New validation form
      validations/[id]/      Validation detail (full report)
      entity/                SOS search
      track-record/          Track record search (Realie, requires state)
      gc/                    GC validation (CSLB CA live)
      litigation/            Litigation screening
      usage/                 Usage & billing
      settings/              Org settings + plan management
      layout.tsx             Dashboard shell + sidebar
    api/
      checks/
        entity/              Cobalt SOS lookup
        track-record/        Realie → Regrid → ATTOM
        gc/                  CSLB (CA) / stub
        litigation/          CourtListener
      validations/           CRUD + parallel check runner
      stripe/                Checkout, portal, webhook
      settings/              Org settings API
      usage/                 Usage records API
    page.tsx                 Landing page
    layout.tsx               Root layout
  components/
    dashboard/
      sidebar.tsx            Nav + user info
      track-record-table.tsx Portfolio view with AVM/lender/LTV
      litigation-grid.tsx    Active vs dismissed with court details
      entity-result-card.tsx Officers, confidence, filings
      gc-result-card.tsx     License status, no Beta badge
      shared-types.ts        Interfaces with raw_response
    ui/                      shadcn/ui components
  lib/
    adapters/
      extract.ts             Client-side raw_response extraction
      types.ts               ValidationAdapter interface
      realie.ts              Realie property search (primary)
      regrid.ts              Regrid property search (fallback)
      attom.ts               ATTOM sale history enrichment
      cobalt.ts              Cobalt entity + orchestrator
      courtlistener.ts       CourtListener litigation
      cslb.ts                CSLB GC validation
      stub.ts                Demo data
      index.ts               Adapter factory
    ai/analysis.ts           Claude AI risk analysis
    rate-limit.ts            Token-bucket rate limiter
    stripe/server.ts         Stripe client + helpers
    supabase/                Client, server, admin, middleware, get-user-profile
    types.ts                 Domain types
    utils.ts                 cn() utility
STRATEGY.md                  Product strategy & future ideas
wordpress/
  scripts/                   WP REST API publish scripts
  content/                   Markdown source for pages/posts
```

## Deployed at

- **Production:** https://app.pulseclose.com
- **Vercel:** https://pulseclose.vercel.app
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Marketing:** https://pulseclose.com (WordPress, GoDaddy)
- **Design partner:** Insignia Capital Corp
