# PulseClose

Multi-tenant borrower-validation SaaS for bridge lenders. Live at
`app.pulseclose.com`. Marketing site is a separate WordPress install at
`pulseclose.com` (content version-controlled in [wordpress/](wordpress/)).

**Parent brand:** Wade Intel (`wadeintel.com`) — operator-led lender
tech methodology firm. PulseClose is the product implementation; Wade
Intel + Build Buy Borrow newsletter (`buildbuyborrow.substack.com`) +
the open 5-Concept Loan Framework (GitHub `wade-intel/loan-framework`,
mirror at `/Users/zachwade/code/active/wade-intel-loan-framework`) are
the authority + distribution stack.

## Read these on session start

- [pickup.md](pickup.md) — current session state (refresh as we work)
- [STRATEGY.md](STRATEGY.md) — product strategy + architecture overview
- [docs/ROADMAP.md](docs/ROADMAP.md) — journey-organized backlog with cross-cutting design principles
- [docs/DATA-MODEL.md](docs/DATA-MODEL.md) — schema reference
- [docs/E2E-TEST-PLAN.md](docs/E2E-TEST-PLAN.md) — full feature inventory as a customer walkthrough
- [docs/DISTRIBUTION-STRATEGY.md](docs/DISTRIBUTION-STRATEGY.md) — 2026 distribution playbook
- [docs/PRIVACY-POSTURE.md](docs/PRIVACY-POSTURE.md) — AI privacy bundle + compliance posture (Insignia/Damon answer-able)
- [docs/VENDOR-LEDGER.md](docs/VENDOR-LEDGER.md) — every external dependency + rotation calendar
- [docs/IDEAS.md](docs/IDEAS.md) — unscoped feature ideas with "unblocks when" conditions (NOT the prioritized roadmap)
- Memory: `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

## What the product does

5-pillar borrower validation, run in parallel via vendor adapters,
scored deterministically with an AI memo for narrative:

1. **Entity validation** — Cobalt Intelligence SOS lookup across 50 states. Ownership verification. Officers + registered agent extraction.
2. **Track record verification** — Realie property search → ATTOM enrichment for sale history (Regrid as fallback). Trust-but-verify deed-chain matcher against borrower-submitted addresses.
3. **GC validation** — CSLB scrape for CA contractors. Other states pending.
4. **Litigation screening** — CourtListener federal courts (bankruptcy + civil). Materialized into structured cards.
5. **Sanctions / PEP screening** — OpenSanctions with OFAC SDN direct as auto-fallback.

Plus: deterministic risk-factor compute + tier rebuild, override-and-rerun via atomic RPC, Story Mode v2 AI memo, investor evaluation engine, investor handoff (Excel + PDF), continuous monitoring, deal outcome capture, activity feed.

**Underwriting (shipped 2026-06-22/23) — the product is now a verification + underwriting gateway, not just borrower validation:**

6. **Underwriting Workbench (Module 10)** — deterministic loan sizing (`src/lib/underwriting/sizing.ts`): max loan = MIN across LTV/LTC/LTARV/DSCR/debt-yield, names the binding constraint, value-add returns sketch. Per-investor best-execution overlay sizes at each investor's caps + priced rate.
7. **AI UW Copilot (Module 6)** — `src/lib/underwriting/judgment.ts`: Opus 4.8 reads the engine's numbers through Damon's 5-dimension framework (sponsor/economics/market/structure/exit) + 5-concept lens → deal-killers + a pursue/pursue-with-conditions/pass stance, through the full AI privacy harness. **AI never sets the loan amount — the deterministic engine does** (same rule as the tier).

Surfaced on `/dashboard/evaluate`; persisted in `uw_models` (00040); `/api/underwrite` + `/api/underwrite/[id]/judge`. Plus a **self-serve funnel** (public landing + `/pricing`, 14-day/50-check trial, usage meter, onboarding emails, PostHog events).

See [STRATEGY.md](STRATEGY.md) for full feature surface + the 2026-06-23 reposition, [docs/UX-PLAN.md](docs/UX-PLAN.md) for the coherent-product UX plan, and [docs/ROADMAP.md](docs/ROADMAP.md) for the post-NPLA sequence.

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Styling:** Tailwind CSS v4, base-ui (NOT shadcn — `<DialogTrigger render={<Button />}>` pattern, not `asChild`)
- **Database:** Supabase (PostgreSQL + Auth + RLS + Storage)
- **AI:** Anthropic Claude SDK (Story Mode v2 memos, doc-ingest extraction, investor PDF parser — all gated by per-org `ai_extraction_enabled` toggle, see [PRIVACY-POSTURE.md](docs/PRIVACY-POSTURE.md))
- **Billing:** Stripe (3 paid tiers + `internal` SQL-only)
- **Email:** Resend
- **Error tracking:** Sentry
- **Marketing site CMS:** GoDaddy Managed WordPress (REST API published from [wordpress/](wordpress/))
- **Deploys:** Vercel (autodeploy from `main`; manual fallback `vercel deploy --prod --yes` when webhook silently fails)

## Project structure

```
src/
  app/
    (auth)/                   # Login, signup
    auth/                     # Supabase auth callback
    dashboard/
      validations/[id]/       # Detail page (pillars + memo + handoff + monitor + outcome)
      activity/               # B5 activity feed
      compare/                # S1 comparative borrower view
      evaluate/               # Module 1 evaluate-against-investors
      evaluate/investors/     # Investor management + A1 PDF parser
      new/                    # New validation form
      settings/               # Org / Team / API + AI privacy toggle
      usage/                  # Usage meter
    share/[token]/            # Public borrower-facing share link
    handoff/[id]/             # Printable handoff view
    validations/[id]/risk-methodology/  # Printable methodology
    api/                      # Backend routes
  components/
    ui/                       # base-ui primitives (Button, Dialog, Card, ...)
    dashboard/                # Validation cards, activity feed/strip, monitor card, deal-outcome card, AI memo, ...
  lib/
    adapters/                 # Vendor adapters (cobalt, realie, regrid, attom, courtlistener, cslb, opensanctions, ofac)
    ai/                       # check-enabled, redact, redact-pii, analysis, regenerate
    domain/                   # upsert helpers (borrower / entity / property / lender) — canonical-name dedup
    risk/                     # factors.ts (9 deterministic factors) + persist.ts (atomic RPC)
    schemas/                  # JSONB Zod schemas (jsonb.ts) + API request schemas (api.ts)
    events/                   # activity_events emit
    notifications/            # notification_preferences fan-out
    documents/                # storage upload + documents row
    supabase/                 # client / server / admin / insert-or-throw
    monitor/                  # runner.ts (per-validation re-run + change diff)
    handoff/                  # builder + excel
    track-record/             # verify-core.ts (deed-chain matcher, parseAddressForState)
    investors/                # extract.ts (A1 Claude prompt + parse) + validator.ts
    evaluate/                 # engine.ts (multi-investor eligibility; min_dscr/min_debt_yield criteria)
    underwriting/             # sizing.ts (loan sizing engine) + per-investor.ts + judgment.ts (AI UW copilot) + facts.ts
    analytics/                # PostHog client + server capture (no-op without keys)
    litigation/               # extract + materialize
supabase/
  migrations/                 # 42 migrations (00001-00042); latest: 00040 uw_models, 00041 org trial, 00042 trial-email flags
wordpress/                    # Marketing-site content + publish scripts (separate from app)
docs/                         # All strategic + operational docs
scripts/                      # ETL / cleanup / verification (FDIC ingest, ZHVI refresh, cleanup-broken-validations, etc.)
```

## Brand

- **Name:** PulseClose (PascalCase, one word, never "Pulse Close")
- **Primary:** Navy 950 (#0F172A), **Accent:** Blue 500 (#3B82F6)
- **Voice:** Direct, competent, specific. No buzzwords. Use bridge lending terminology naturally.
- **Design partner:** Insignia Capital Corp
- **Full design system:** [docs/design-system.md](docs/design-system.md)

## Commands

```bash
# App
npm run dev          # Start dev server (rarely used per memory — ship straight to prod)
npm run build        # Production build (always sanity-check before push)
npm run lint         # ESLint

# Database
supabase db push     # Apply pending migrations
npx tsx scripts/<name>.ts  # ETL / cleanup / verification

# Marketing site
npx tsx wordpress/scripts/audit.ts                       # Refresh WP snapshots
npx tsx wordpress/scripts/publish-blog.ts [--publish]    # Push blog posts
npx tsx wordpress/scripts/publish-glossary.ts            # Push glossary
npx tsx wordpress/scripts/publish-guides.ts              # Push state guides
npx tsx wordpress/scripts/update-all-pages.ts            # Push top-level pages

# Deploy
git push origin main                          # Autodeploy
vercel ls pulseclose | head -5                # Confirm deploy landed
vercel deploy --prod --yes                    # Manual fallback when webhook fails
```

## Key architectural decisions

- **Path B normalized data model** — borrower / entity / property / lender are first-class FK-referenced; validations are snapshots referencing them. Snapshot tables carry `org_id` for RLS perf. (April 2026 doc claim "no JSONB blobs" was always wrong — see below.)
- **JSONB used heavily, schema-versioned** — every JSONB column has a Zod schema in [src/lib/schemas/jsonb.ts](src/lib/schemas/jsonb.ts), a `schema_version` field, and a CHECK constraint.
- **RLS on every table** scoped to `org_id`; admin client bypasses RLS only for cross-org operations.
- **Override-and-rerun is the product** — `recompute_risk_factors_atomic` RPC for atomic risk-factor recompute + AI memo regeneration.
- **AI never picks the tier** — Claude explains, deterministic factors decide. `risk_rating` is hard-overwritten server-side.
- **Snapshot inserts use `insertOrThrow`** — silent insert failures surface as errors.
- **Usage metering Day 1** — every vendor API call logged with `org_id`, `check_type`, `cost_cents`, timestamp.
- **Vendor adapters with fallback chains** — see [docs/VENDOR-LEDGER.md](docs/VENDOR-LEDGER.md). OpenSanctions auto-falls-back to OFAC, Realie to Regrid, etc.
- **AI privacy bundle (00022) gates every Claude call** — per-org toggle (fails CLOSED), regex PII scrub on text inputs, token-based depersonalization for memo. See [docs/PRIVACY-POSTURE.md](docs/PRIVACY-POSTURE.md) and ROADMAP cross-cutting principle 12.
- **Canonical-name dedup is dual-coded** — Postgres `canonicalize_name()` + JS `canonicalizeName()` mirror. Drift creates infinite duplicates.
- **Tokenize-and-set name matching, never substring.** ROADMAP principle 8.
- **Truncation defense on every Claude consumer.** `max_tokens` ≥ 4096, inspect `stop_reason`, surface friendly error. ROADMAP principle 11.

## Cross-cutting design principles

12 codified in [docs/ROADMAP.md](docs/ROADMAP.md). Read them before
adding a new endpoint, matcher, dedup key, or Claude consumer.
