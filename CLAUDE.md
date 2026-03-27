# PulseClose

Standalone borrower validation product for bridge lenders. Spun out from Module 8 of the original PulseClose platform (archived at `/Users/zachwade/BridgeFlow_archived`).

## What this product does

Automated borrower entity, track record, and credential validation for bridge lending:
1. **Entity Validation** — SOS lookup across 50 states, ownership verification, related entity search
2. **Track Record Verification** — Property records, project outcomes, experience tier classification (1-4)
3. **GC Validation** — Contractor license, permit history, insurance verification
4. **Litigation Screening** — PACER bankruptcy, foreclosures, lis pendens, lawsuits
5. **Validation Report** — Structured per-borrower report with confidence scores and flags

## Tech stack

- **Framework:** Next.js (App Router), React, TypeScript
- **Styling:** Tailwind CSS v4, shadcn/ui
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **AI:** Anthropic Claude SDK
- **Billing:** Stripe (usage-based metering)
- **Fonts:** Geist Sans / Geist Mono

## Project structure

```
src/
  app/
    (auth)/         # Login, signup (public routes)
    auth/           # Supabase auth callback
    dashboard/      # Main app (requires auth)
      entity/       # SOS entity search
      gc/           # GC validation
      litigation/   # Litigation screening
      new/          # New validation form
      track-record/ # Track record verification
      usage/        # Usage & billing
      settings/     # Org settings
    api/            # API routes
    page.tsx        # Landing page
  components/
    ui/             # shadcn/ui components
    dashboard/      # Dashboard-specific components
  lib/
    supabase/       # Supabase client (browser, server, middleware)
    types.ts        # Domain types
    utils.ts        # Utilities
supabase/
  migrations/       # PostgreSQL migrations
```

## Brand

- **Name:** PulseClose (PascalCase, one word, never "Pulse Close")
- **Primary:** Navy 950 (#0F172A), **Accent:** Blue 500 (#3B82F6)
- **Voice:** Direct, competent, specific. No buzzwords. Use bridge lending terminology naturally.
- **Design partner:** Insignia Capital Corp

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
```

## Key decisions

- Usage metering from Day 1 — every vendor API call logged with org_id, check_type, cost, timestamp
- Normalized schema (separate tables per check type) instead of JSONB blob — enables proper querying and audit
- RLS on all tables scoped to org via users table lookup
- Vendor API calls go through adapter interfaces with stubs for development
