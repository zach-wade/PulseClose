# PulseClose — Session Pickup (2026-04-28)

## Current state of the product

Standalone borrower validation platform for bridge lenders. Real vendor data
flowing end-to-end. Validation report now includes **5 pillars** (entity, track
record, litigation, sanctions, GC), AI memo with real portfolio metrics, input
sanity checks, and trust-but-verify deed-chain validation. Borrowers can
self-submit flip history via a tokenized share link.

### What's live and working

| Feature | Status | Notes |
|---|---|---|
| Auth (Supabase) | Working | Signup/login, admin client for API routes |
| Landing page (Next.js) | Working | Hero, pain points, features, CTA |
| Marketing site (WordPress) | Working | Home, Features, Pricing, About, Demo |
| Dashboard shell | Working | Navy sidebar, 7 sections |
| Validation flow | Working | Create → 4 parallel checks + sanctions sequential → detail report |
| Entity check (Cobalt) | Real | New key `CgiH9xQq…` (40 chars, in env). 50-state SOS. Retries 429 then falls back to `liveData=false` cached. |
| Track record (Realie) | Real — Primary | Owner-name search, 126 fields per property, transfer history. Requires state. ~$50-150/mo. |
| Track record (Regrid) | Real — Fallback | Owner-name search, no state required, $375/mo Standard. |
| Track record (ATTOM) | Real — Enrichment | Sale history when Regrid is used (Realie already has transfers). |
| Trust-but-verify | **NEW Real** | Realie address-lookup endpoint per submitted address; classifies as owned_and_sold / owned_and_held / never_owned / not_found. Computes hold + profit. ~$0.50/address. |
| Borrower share link | **NEW** | `/share/<token>` tokenized URL where borrower self-submits flip addresses without PulseClose login. |
| GC validation (CSLB) | Real (CA) | Other states return clear "NOT AUTOMATED" badge instead of fake stub data. |
| Litigation (CourtListener) | Real | Federal bankruptcy + civil. Active vs dismissed distinction. |
| Sanctions / PEP | **NEW Real** | OpenSanctions `/match/default` (primary, trial key thru 2026-05-28) covers OFAC SDN + OFAC Consolidated + EU + UN + UK HMT + global PEPs. OFAC SDN direct CSV (free fallback). Screens borrower + entity + officers + registered agent. |
| AI analysis (Claude) | Working | Uses real portfolio metrics (value, equity, LTV, hold, lender concentration). Generates via `after()` from `next/server` — survives serverless lifecycle. Page polls every 6s for up to 90s, auto-updates without refresh. |
| Input sanity checks | **NEW** | Yellow banner on detail page if (a) borrower has LLC/Corp/Trust suffix or (b) borrower doesn't appear in entity's SOS officers/agent. |
| Stripe billing | Working | 3 tiers ($299/$499/$799), free trial 3 checks. |
| Sentry | Wired | Client/server/edge configs. |
| Rate limiting | Added | Token-bucket on API routes including share endpoint. |
| Usage metering | Working | Every vendor API call logged. New `address_verify` and `address_verify_share` types. |

### Validation report sections (in order on detail page)

1. **Input warnings banner** (if any) — yellow alert for off-looking inputs
2. **Summary cards** — Confidence, Experience tier, Properties Found, Flags
3. **AI Risk Assessment** — pending state with pulsing dot while generating; auto-updates
4. **Entity Validation** — Cobalt SOS data, officers, filings, "Borrower IS registered agent" green signal when names match (whitespace-insensitive)
5. **Portfolio & Track Record** — current holdings table with Realie data (AVM, lender, LTV, liens) + expandable per-property details with formatted transfer history
6. **Verified Track Record** — trust-but-verify form + results table + share-link generator
7. **Litigation Screening** — CourtListener active vs dismissed
8. **Sanctions / PEP Screening** — clear / potential match across 6 lists
9. **GC Validation** — CSLB live for CA, NOT AUTOMATED for other states

### Database migrations (9 applied)

```
00001_foundation.sql              Core tables
00002_handle_new_user.sql         Auto-create user/org on signup
00003_ai_analysis.sql             ai_analysis JSONB column
00004_stripe_billing.sql          Subscription fields
00005_sanctions_screening.sql     sanctions_checks table
00006_input_warnings.sql          input_warnings JSONB on validations
00007_validation_summary_counts.sql  Cached property_count + flag_count
00008_verified_flips.sql          Trust-but-verify results table
00009_share_token.sql             Borrower share-link token
```

### Env vars (all in `.env.local` and Vercel production)

Supabase (URL, anon key, service role), Anthropic, **Cobalt Intelligence (new
key 2026-04-28)**, Realie (`REALIE_API_KEY`), Regrid (`REGRID_API_TOKEN`),
ATTOM (`ATTOM_API_KEY`), CourtListener (`COURTLISTENER_API_TOKEN`),
**OpenSanctions (`OPENSANCTIONS_API_KEY`, trial expires 2026-05-28)**, Stripe
(secret, publishable, webhook secret, 6 price IDs), Sentry, PostHog, Resend,
WP creds, `NEXT_PUBLIC_APP_URL`.

---

## Known issues / debt

### Open

1. **AI memo is stale after verified-flips submitted.** The verify endpoint persists results but doesn't trigger an AI re-analysis. The AI memo in the report won't reference the verified flips. Fix: in `/api/track-record/verify` (and share variant), kick off `generateValidationAnalysis` via `after()` with the verified flips included. Requires extending `AnalysisInput` to accept the flips.
2. **Property count + flag count are computed at creation only.** If verified flips arrive later, the dashboard list's Flags column won't reflect them. Recompute when verified-flips change, or compute on read.
3. **Cobalt 429 if usage cap hit again.** Retry + cached fallback are in place but won't help if the new key's cap is exceeded too. Watch the dashboard.
4. **Realie address lookup costs add up.** Each address is one credit. A borrower submitting 30 flip addresses = 30 credits. Consider caching by address+borrower+entity hash to avoid re-running.
5. **Share token is permanent until revoked.** No expiry. Add `share_token_expires_at` and a UI option for "expire after 7 days" for security-conscious lenders.

### Data gaps

1. **Litigation is federal only.** State-court matters (mechanic's liens, contract disputes, most foreclosures) aren't searched. Unicourt ($500/mo) would add 40+ states.
2. **GC validation is CA only.** Other states show clear "NOT AUTOMATED" now, but real adapters for FL/TX/NY would expand TAM. Each state's portal is custom — real research project.
3. **No entity-to-person resolution.** Can't find all LLCs a person controls. OpenCorporates ($2,800/yr) would add this.

---

## Vendor adapter chain

```
src/lib/adapters/
  types.ts           Interface definitions (ValidationAdapter)
  extract.ts         Client-side extraction from raw_response JSONB (transfer dates parsed to ISO, sorted desc)
  stub.ts            Demo data adapter
  cobalt.ts          Entity + orchestrator. Sequential sanctions after entity. 429 retry + liveData=false fallback. Name normalization for flag dedup.
  realie.ts          Property search (owner) + lookupPropertyByAddress (NEW, address)
  regrid.ts          Property search — fallback
  attom.ts           Sale history enrichment — only with Regrid
  courtlistener.ts   Federal litigation
  cslb.ts            CA GC license (only state automated)
  opensanctions.ts   NEW — POST /match/default, scores >= 0.7
  ofac.ts            NEW — direct SDN CSV download, 6h cache, token match
  index.ts           Factory: routes to real adapters when keys present
```

```
src/lib/track-record/
  verify-core.ts     NEW — shared classifier + Realie call loop, used by both
                     /api/track-record/verify (authed) and /api/share/[token]/verify (public)
```

| Check Type | Primary | Fallback | Env Var | Status |
|---|---|---|---|---|
| Entity | Cobalt | Cached (`liveData=false`) | `COBALT_INTELLIGENCE_API_KEY` | Working |
| Track Record (search) | Realie | Regrid → stub | `REALIE_API_KEY`, `REGRID_API_TOKEN` | Working |
| Track Record (enrichment) | ATTOM | Skip | `ATTOM_API_KEY` | Working |
| Track Record (verify by address) | Realie | (none) | `REALIE_API_KEY` | NEW |
| GC | CSLB (CA only) | NOT AUTOMATED for others | None | Honest |
| Litigation | CourtListener | Stub | `COURTLISTENER_API_TOKEN` | Federal only |
| Sanctions / PEP | OpenSanctions | OFAC SDN direct (free) | `OPENSANCTIONS_API_KEY` | Working, trial expires 2026-05-28 |

---

## Product strategy

Full strategy doc at `STRATEGY.md`. Trust-but-verify plan at
`TRACK_RECORD_VERIFY_PLAN.md` (now mostly built). Continuous monitoring plan at
`CONTINUOUS_MONITORING_PLAN.md` (not yet built).

### Near-term (next 30 days)

1. **Get Insignia using it on real deals.** Reset their counter or set up real
   Stripe sub. Walk through a validation with their borrower. Collect feedback.
2. **Continuous monitoring** (per `CONTINUOUS_MONITORING_PLAN.md`) — biggest
   lock-in feature. Weekly re-runs, diff detection, Resend email alerts,
   ~3 days work.
3. **AI re-run after verified flips** — when borrower submits via share link,
   regenerate the AI memo with the new context. Half day.
4. **Auto-update validation counts when verified flips change** — flag count
   on dashboard list should reflect verified-flip status.

### Medium-term (next quarter)

1. **OpenCorporates** — person → entity discovery ($2,800/yr)
2. **Unicourt** — state court litigation ($500/mo)
3. **Multi-state GC** — FL, TX, NY contractor board adapters (each is real research/scrape work)
4. **PDF report polish** — print CSS works now but could be more report-like
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
| Elementix | Complementary | Borrower intelligence/prospecting, not validation. |
| SFR Analytics | Adjacent | Borrower sourcing. |
| Lend Engine | Threat | AI-native LOS with built-in validation. Watch closely. |
| Middesk | Adjacent | Horizontal KYB, not lending-specific. |
| HouseCanary | Complementary | Property analytics/AVM. |

---

## What needs to happen next (priority order)

### P0: Wire up the loose ends from this session

- **AI re-run on verified flips** — extend `generateValidationAnalysis` input
  to include `verified_flips`; call from `/api/track-record/verify` and the
  share endpoint via `after()`. Update prompt to surface verified-flip
  summary stats (X verified, Y realized profit, avg hold) and let the AI
  weight them in its assessment.
- **Recompute flag_count when verified-flips change** so dashboard reflects
  the latest state.

### P1: Get Insignia actually using it

- Reset their check counter or set up real Stripe subscription
- Walk them through a validation with their own borrower data
- Demo the trust-but-verify share link as a differentiator
- Collect feedback on what's missing or confusing

### P2: Continuous monitoring (per `CONTINUOUS_MONITORING_PLAN.md`)

Biggest near-term lock-in feature. ~3 days of focused work.

### P3: Remaining UI polish

- **Usage page**: distinguish "Validations" from "API Calls" (still confusing)
- **Settings page**: remove hardcoded mock API key
- **Litigation standalone page** at `/dashboard/litigation`: update data source
  descriptions
- **PDF export**: more report-like layout (header on each page, page numbers)

### P4: Market expansion

- Multi-state GC adapters (FL/TX/NY) — real research per state
- State court litigation (Unicourt) — paid, broader coverage
- OpenCorporates — person-to-entity discovery

---

## File structure (current)

```
src/
  app/
    (auth)/login, signup
    auth/callback
    share/[token]/        NEW — public borrower-facing page (no auth required)
      page.tsx
      share-submit-form.tsx
    dashboard/
      page.tsx              Validation list with Properties / Flags / AI columns
      new/page.tsx          New validation form (state dropdown, hint copy)
      validations/[id]/     Validation detail with all 5 pillars + verified track record + share link UI
      entity/, track-record/, gc/, litigation/, usage/, settings/
      layout.tsx            Dashboard shell + sidebar
    api/
      checks/{entity,track-record,gc,litigation}/  Single-check endpoints
      validations/          POST creates validation; GET/[id] reads full report (now includes verified_flips)
      validations/[id]/share-token/                NEW — generate/revoke borrower share token
      track-record/verify/  NEW — authed analyst trust-but-verify endpoint
      share/[token]/verify/ NEW — public token-authed verify endpoint
      stripe/, settings/, usage/
    page.tsx, layout.tsx
  components/
    dashboard/
      sidebar.tsx
      track-record-table.tsx     Portfolio view; transfer history formatted, sorted desc
      litigation-grid.tsx        Active vs dismissed
      entity-result-card.tsx     Officers, confidence, filings, "borrower IS agent" signal
      gc-result-card.tsx         CA live; clear NOT AUTOMATED for other states
      sanctions-card.tsx         NEW — clear / potential match
      verified-track-record.tsx  NEW — form + results + share-link generator
      shared-types.ts            EntityCheck, TrackRecordEntry, LitigationCheck, GCValidation, SanctionsCheck, VerifiedFlip
    ui/
      state-select.tsx           NEW — 50-state + DC dropdown
      ... (existing shadcn components)
  lib/
    adapters/
      types.ts                   ValidationAdapter, SanctionsScreenRequest with additional_persons
      extract.ts                 raw_response → typed details; transfer dates ISO, sorted desc
      cobalt.ts                  Orchestrator; 429 retry; cached fallback; non-CA GC = NOT AUTOMATED
      realie.ts                  Owner search + lookupPropertyByAddress (NEW)
      regrid.ts, attom.ts, courtlistener.ts, cslb.ts, stub.ts
      opensanctions.ts           NEW
      ofac.ts                    NEW
      index.ts                   Factory + getSanctionsDataSource()
    track-record/
      verify-core.ts             NEW — classifier + per-address loop, shared by authed + share endpoints
    ai/analysis.ts               Real portfolio metrics; LTV bug fixed; sanctions in prompt
    rate-limit.ts
    stripe/server.ts
    supabase/                    Client, server, admin, middleware (allows /api/share/* through)
    types.ts, utils.ts
STRATEGY.md
TRACK_RECORD_VERIFY_PLAN.md      Mostly built now
CONTINUOUS_MONITORING_PLAN.md    NEW — implementation plan, not yet built
wordpress/                       WP REST API publish scripts + content
supabase/
  migrations/00001 .. 00009
```

---

## Deployed at

- **Production:** https://app.pulseclose.com
- **Vercel:** https://pulseclose.vercel.app (CLI deploys via `vercel --prod` —
  GitHub auto-deploy is NOT configured; recent deploys all came from CLI)
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Marketing:** https://pulseclose.com (WordPress, GoDaddy)
- **Design partner:** Insignia Capital Corp
- **Latest deploy:** `dpl_CmzTKsHaWr7PaKtoMzgCPCvNy4mG` (2026-04-28)

## Operations notes

- **Reset Test Co counter** when "Free trial limit reached" appears: see
  `~/.claude/projects/-Users-zachwade-PulseClose/memory/reference_supabase_lookup.md`
  for the one-liner. Org id `9e580f59-b01d-4cbd-a950-76dd4f32ee6c`, app login
  email `zach@wadeintel.com` (NOT the system email).
- **Cobalt key** rotation may be needed periodically. The new key
  (`CgiH9xQq…`) replaced the old one that hit a usage cap on 2026-04-27.
  Test directly via curl before assuming a key works — Cobalt's dashboard
  request counter is unreliable.
- **OpenSanctions trial expires 2026-05-28.** After that it falls back to
  free OFAC SDN direct. Renew or upgrade before then.
- **Deploys**: GitHub→Vercel auto-deploy is NOT wired up. Always run
  `vercel --prod --yes` after `git push origin main`.
