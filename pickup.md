# PulseClose — Session Pickup (2026-03-26)

## What happened this session

Spun out Module 8 (Track Record & Borrower Validation) from the old 12-module PulseClose platform into a standalone product. Built from scratch — did NOT port old code.

### Repo & infra changes
- Old repo renamed: `zach-wade/PulseClose` → `zach-wade/PulseClose_archived`
- Old code lives at `/Users/zachwade/BridgeFlow_archived` (remote updated to archived URL)
- New repo created: `zach-wade/PulseClose` — fresh, clean
- Supabase DB **reset** — all old platform tables dropped, clean 9-table schema applied
- Vercel project repointed: root directory cleared (was `app`), connected to new repo
- Env vars on Vercel carried over from old project (Supabase, Stripe, Anthropic, Sentry, PostHog, Resend)

### What was built
1. **Next.js 16 scaffold** — TypeScript, Tailwind v4, shadcn/ui v4 (base-nova), Geist fonts
2. **Brand identity** — Navy 950 / Blue 500 palette, PulseClose wordmark, bridge lending voice
3. **Auth flow** — Supabase Auth with signup/login, DB trigger auto-creates org + user profile
4. **Dashboard shell** — Navy sidebar with 6 sections (Validations, Entity, Track Record, GC, Litigation, Usage)
5. **Landing page** — Hero, pain points, feature grid, CTA sections
6. **Validation API** — `POST /api/validations` creates record, runs 4 check types in parallel, stores results; `GET /api/validations` lists all; `GET /api/validations/[id]` returns full detail
7. **Stub adapter** — returns realistic demo data labeled [DEMO] for all 4 check types (entity, track record, GC, litigation). Designed to be swapped for real vendor APIs.
8. **Validation detail page** — full report view: entity SOS status, track record table with P&L, litigation screening grid, GC credentials, confidence scores, experience tiers
9. **Dashboard list** — table of all validations with status badges, stats cards
10. **Usage metering** — every adapter call logged to `usage_records` with org_id, check_type, cost
11. **DB schema** — 9 normalized tables (organizations, users, borrower_validations, entity_checks, track_record_entries, gc_validations, litigation_checks, usage_records, audit_log) + RLS on all

### Database
- Supabase project ref: `oazwscmgyqknwatqgtyc`
- 2 migrations applied:
  - `00001_foundation.sql` — all 9 tables + indexes + RLS policies
  - `00002_handle_new_user.sql` — trigger that creates org + user on auth signup

### Tech notes
- shadcn/ui v4 uses `@base-ui/react` — Button uses `render` prop, NOT `asChild`
- Next.js 16 deprecated `middleware.ts` in favor of `proxy` — works but shows warning
- Adapter pattern: `src/lib/adapters/types.ts` defines the interface, `stub.ts` implements demo, `index.ts` returns active adapter based on env vars

---

## What's next (priority order)

### Tier 1: Wire real data (THE product)
Zach is investigating vendor API signups. Once keys are available:

| Vendor | What | Priority | Signup URL |
|--------|------|----------|-----------|
| **Cobalt Intelligence** | SOS entity lookups (all 50 states) | 1st | https://cobaltintelligence.com |
| **ATTOM Data** | Property records, ownership, transactions | 2nd | https://api.gateway.attomdata.com/propertyapi |
| **PACER** | Federal bankruptcy court records | 3rd | https://pacer.uscourts.gov |
| **State licensing boards** | GC license lookups (start with CA CSLB) | 4th | Free public data |

For each vendor:
1. Create `src/lib/adapters/{vendor}.ts` implementing the `ValidationAdapter` interface
2. Add env var check in `src/lib/adapters/index.ts` to use real adapter when key exists
3. Update `cost_cents` in usage records to reflect actual vendor pricing

### Tier 2: Monetization
- **Stripe checkout** — plan selection on signup, subscription management
- **Usage-based billing** — track overage against plan limits, charge via Stripe metered billing
- **PDF export** — proper validation report PDF (currently just browser print)

### Tier 3: Polish for adoption
- **Team invites** — owner invites analysts/viewers to their org
- **Settings page** — org config, plan management, API keys display
- **Email notifications** — validation complete, flags found (Resend is already in env vars)
- **Audit log UI** — who ran what, when (table exists, just needs a page)
- **Onboarding flow** — post-signup wizard to configure org

### Tier 4: Product expansion
- Related entity graph (find all entities with same registered agent/members)
- Continuous monitoring (re-check entity status on schedule)
- Conditions Engine integration (auto-clear "track record verified" condition)
- API access for enterprise customers (external system integration)

---

## File structure

```
src/
  app/
    (auth)/login, signup     Auth pages
    auth/callback            Supabase OAuth callback
    dashboard/
      page.tsx               Validation list (home)
      new/page.tsx           New validation form → POST /api/validations
      validations/[id]/      Validation detail (full report)
      entity/                SOS search (placeholder)
      track-record/          Track record (placeholder)
      gc/                    GC validation (placeholder)
      litigation/            Litigation (placeholder)
      usage/                 Usage & billing (placeholder)
      settings/              Settings (placeholder)
      layout.tsx             Dashboard shell + sidebar
    api/
      validations/route.ts   GET (list) + POST (create + run checks)
      validations/[id]/      GET (full detail with all checks)
    page.tsx                 Landing page
    layout.tsx               Root layout (Geist fonts, Toaster, TooltipProvider)
  components/
    dashboard/sidebar.tsx    Navy sidebar navigation
    ui/                      shadcn/ui components
  lib/
    adapters/
      types.ts               ValidationAdapter interface
      stub.ts                Demo data adapter
      index.ts               Adapter factory (returns stub or real based on env)
    supabase/
      client.ts              Browser client
      server.ts              Server client
      middleware.ts           Session refresh + auth redirect
    types.ts                 Domain types (ValidationStatus, ExperienceTier, etc.)
    utils.ts                 cn() utility
  middleware.ts              Next.js middleware (auth guard)
supabase/
  migrations/
    00001_foundation.sql     9 tables + RLS
    00002_handle_new_user.sql  Auto-create org + user on signup
```

## Deployed at
- **Production:** https://app.pulseclose.com
- **Vercel:** https://pulseclose.vercel.app
- **GitHub:** https://github.com/zach-wade/PulseClose
