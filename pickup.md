# PulseClose — Session Pickup (2026-04-30)

> **For session-resumption.** Strategic and architectural detail lives in the
> dedicated docs — this file orients quickly and points there.
>
> **Read these in order on session start:**
> - This file (you're here)
> - `docs/ROADMAP.md` — P0 Corrections + Expansion plan (S/A/B/C/D/E/F tiers)
> - `docs/DATA-MODEL.md` — full schema incl. the new universal infra tables
> - `STRATEGY.md` — vision, market, long-shot bets
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are right now

**Standalone borrower validation platform for bridge lenders.** Multi-tenant
SaaS at app.pulseclose.com. NPLA conference is the forcing function (June
22-23, 2026; ~7 weeks out).

**P0 corrections + Tier S demo wow are SHIPPED end-to-end** in two big
pushes. Demo path is now qualitatively different from anything else in
the bridge-lending tool space.

---

## What was completed in the last big push (2026-04-30)

### P0 — Corrections (5 PRs)

- **PR 1 (75f83ad):** App bug fixes — FK consistency on entity + GC creation
  paths, monitor cron error handling (per-adapter status + 1h backoff on
  rate limits + email-failure tracking), defensive risk-recompute,
  linkBorrowerToEntity race-condition guard.
- **PR 2 (25530f3):** Foundations — `zod` ^4.4.1, schemas in
  `src/lib/schemas/{jsonb,api}.ts`, `src/lib/async/with-error-log.ts`.
- **PR 3 (2e0760d):** Pre-flight cleanup script + Zod adoption at JSONB
  write sites (signals, handoff, ai_analysis) + investor JSON validator
  with key-by-key errors.
- **PR 4 (45a649c + 630082a + b251743):** Migration `00016_p0_corrections.sql`
  — `org_id` denormalization on snapshot tables, missing timestamps,
  UNIQUE partial indexes on signal tables, `risk_factors.expires_at`,
  JSONB schema_version + CHECK constraints, lender escalation guard,
  `monitor_runs.adapter_results / email_status`, `recompute_risk_factors_atomic`
  RPC. `MONITOR_RUN_RESULTS_ENABLED=true` flipped on Vercel.
- **PR 5 (93be452):** UX polish — handoff save-then-download, empty states,
  ZHVI null fallback factor, address-extraction 422, AI memo poll 90→180s.

### Universal infra + Tier S demo wow (6 PRs)

- **PR 6 (dc34fd5):** Migration `00017_universal_infra.sql` — `documents`
  table + Supabase storage bucket + `notification_preferences` +
  `activity_events`. Helpers: `src/lib/events/emit.ts`,
  `src/lib/notifications/dispatch.ts`, `src/lib/documents/store.ts`.
  Activity emission retrofitted across signals / validations / monitor
  cron / handoff / evaluate.
- **PR 7 (9774386):** S1 Comparative borrower view —
  `GET /api/validations/compare?ids=a,b` + `/dashboard/compare?a=&b=`.
  Dashboard list gains checkbox column + sticky "Compare selected" bar.
- **PR 8 (b311552):** S2 Story Mode AI memo — `ai_analysis` schema v2
  (summary + strengths[] + risks[] + recommendations[]) with dual renderer
  (`src/components/dashboard/ai-memo.tsx`). Old validations stay v1
  forever; new ones write v2. v2 risks have "Why this rating? →" anchor
  that scrolls to the WhyThisRating panel.
- **PR 9 (27716ca):** S3 Litigation case cards — migration `00018_litigation_cases.sql`
  + `src/lib/litigation/{extract,materialize}.ts` + cards UI with filter
  chips (Bankruptcy/Civil/Foreclosure/Lien/Tax + Last 5 years + Pending
  only). Materialization wired into validation create + monitor cron.
  Falls back to legacy `LitigationGrid` when materialized cases empty.
- **PR 10 (5235cc6):** S4 GC inline summary on dashboard — migration
  `00019_gc_summary.sql` + `src/lib/gc/summary.ts` + chip component.
  Color-coded (green/amber/red/gray). Desktop column + mobile chip
  inline next to borrower name.
- **PR 11 (ac7ee9e):** S5 Risk methodology PDF — server-rendered
  `/validations/[id]/risk-methodology` with print CSS, factor decomposition
  in canonical order, signal-override audit trail. "Print risk methodology"
  button on validation detail header.

---

## Database state (as of 2026-04-30)

**Migrations applied (19 total):**
```
00001 foundation                        Core tables
00002 handle_new_user                   Auto-create user/org on signup
00003 ai_analysis                       ai_analysis JSONB
00004 stripe_billing                    Subscription fields
00005 sanctions_screening               sanctions_checks
00006 input_warnings                    input_warnings JSONB
00007 validation_summary_counts         property_count + flag_count cache
00008 verified_flips                    Trust-but-verify results
00009 share_token                       Borrower share-link
00010 domain_entities                   Path B refactor — 15 tables
00011 backfill_domain_entities
00012 fix_validation_entity_fk
00013 handoff_data                      handoff_data jsonb
00014 monitoring                        monitor_subscriptions + monitor_runs
00015 zhvi_zips                         Zillow ZHVI medians
00016 p0_corrections                    org_id denorm, UNIQUE indexes,
                                        schema_version, RPC, etc.
00017 universal_infra                   documents + notification_preferences
                                        + activity_events + storage bucket
00018 litigation_cases                  Materialized litigation cards
00019 gc_summary                        Cached GC chip column
```

**Row counts (still mostly empty per pre-NPLA validation pause):**
- `organizations` = 1, `users` = 1
- `lenders` = ~4,300 global (FDIC + known-bridge denylist)
- `investors` = 3 sample configs
- `zhvi_zips` = 26,283
- All validation/domain tables empty until next real run.
- `documents`, `activity_events`, `notification_preferences`, `litigation_cases`
  all created but empty.

---

## Manual items the user should do (collected from this push)

1. **Click through the demo path in a real browser.** Sign in, run a
   validation (or load a sample), check:
   - Validation detail page renders Story Mode AI memo
   - "Why this rating? →" anchor on a risk row scrolls to the factor
   - Litigation case cards expand + "Open in CourtListener" link works
   - Dashboard list checkbox + Compare bar + `/dashboard/compare?a=&b=`
   - GC chip on dashboard list (desktop column + mobile inline)
   - "Print risk methodology" → `/validations/[id]/risk-methodology` →
     Cmd+P → physically print or save-as-PDF and verify the page-break
     rules look right on real paper. **This was deferred from PR 5; PR 11
     is the first real surface that needs it.**

2. **Dry-run a comparison demo with Damon.** Pick two pre-loaded demo
   validations (one strong, one weak). Walk through:
   - Dashboard → select both → Compare
   - Open Story Mode memo on each → click "Why this rating?" risk
   - Print risk methodology for the weak one
   This is the canonical 5-minute coffee-meeting demo.

3. **NPLA pre-flight, ~1 week out:** verify all migrations idempotent on a
   fresh tenant by spinning up a test org. The `00017` storage bucket
   creation has `on conflict do nothing`; the `00018` partial UNIQUE
   indexes need cleanup-script if any duplicates exist (none in prod
   today).

4. **Storage bucket policies on Supabase dashboard** (optional verification):
   `documents` bucket should be private, 10MB cap, allowed MIME types
   PDF/Excel/CSV/text/JPEG/PNG/HEIC/WebP. Storage RLS policies on
   `storage.objects` are scoped through the `documents` row's `org_id`.

5. **`MONITOR_RUN_RESULTS_ENABLED=true`** is already set on Vercel
   production. Verify in `vercel env ls production` if anything looks off
   in monitor runs (the new columns get written when this is `true`).

---

## What's shipped (master table)

| Feature | Status | Notes |
|---|---|---|
| Auth (Supabase) | Working | |
| Validation flow (4 pillars + sanctions) | Working | Populates all domain FKs |
| Entity / Track-record / GC / Litigation / Sanctions adapters | Working | |
| Trust-but-verify (Realie deed-chain) | Working | Address normalization fixed |
| Borrower share link (paste or upload) | Working | 422 on extraction failure |
| AI risk memo — Story Mode v2 | Working | Dual renderer, schema-versioned |
| Risk-tier rebuild + override-and-rerun | Working | Atomic recompute via RPC |
| Module 1 — Evaluate Deal | Working | Investor criteria w/ key-by-key validator |
| Investor handoff (Excel + PDF) | Working | Save-then-download, dirty tracking |
| Continuous monitoring | Working | Per-adapter status, 1h rate-limit backoff |
| Doc ingestion (lender side) | Working | |
| Share-link upload | Working | |
| Zillow ZHVI deviation + unavailable factor | Working | |
| Comparative borrower view (S1) | Working | `/dashboard/compare` |
| Story Mode AI memo (S2) | Working | v2 with strengths/risks/recommendations |
| Litigation case cards (S3) | Working | Materialized + filter chips + CourtListener link |
| GC inline summary (S4) | Working | Chip on dashboard column + mobile inline |
| Risk methodology PDF (S5) | Working | `/validations/[id]/risk-methodology` |
| Stripe billing | Working | $299 / $499 / $799 |
| Rate limiting | Working | |
| Usage metering | Working | |

---

## Next session — what to pick up

Per [docs/ROADMAP.md](docs/ROADMAP.md) Expansion plan, the next batch in
priority order is **Tier A — capital-provider stickiness** (the
distribution-thesis lever). Suggested PRs 12-15:

- **A1 — Investor PDF parser** (3 days). Upload investor guidelines PDF →
  Claude structured extraction → preview → save as `investor_criteria` rows.
  Uses `documents` table (X1, shipped). Highest-leverage Tier A win for
  NPLA — Damon can demo this live with a real fund's PDF.
- **A2 — Counter-offer / repricing calculator** (2 days). When a deal fails
  an investor's box, compute the minimum delta on each constraint
  (loan, ARV, equity) that would clear it.
- **A3 — Borrower-facing capital-availability PDF** (1.5 days). Once a deal
  evaluates eligible, generate a borrower-facing one-pager.
- **E1 — Deal outcomes capture** (1 day, blocker for A4). Post-close status
  form (Pending/Withdrawn/Funded/Extended/Repaid/Defaulted). Schema +
  capture form. Foundation for A4 investor performance dashboard,
  E2 borrower reputation, E3 cross-tenant consensus.

Or jump to **Tier B retention** for daily-driver features (watchlist,
portfolio dashboard, search, "have we seen this borrower", activity feed
UI, validation diff over time). Activity events are already being emitted
across all state-change endpoints (PR 6) so B5 activity feed UI is just a
read + render layer.

If asked "what's next?" without a specific direction, **A1 investor PDF
parser** is the highest leverage — it's a demo wow moment AND the
distribution-thesis lever AND it directly exercises the universal
`documents` table we shipped.

---

## Vendor adapter chain

```
src/lib/adapters/
  types.ts           Interface definitions (ValidationAdapter)
  extract.ts         Client-side extraction from raw_response JSONB
  stub.ts            Demo data adapter
  cobalt.ts          SOS entity adapter
  realie.ts          Property search + lookupPropertyByAddress
  regrid.ts          Property search — fallback
  attom.ts           Sale history enrichment
  courtlistener.ts   Federal litigation
  cslb.ts            CA GC license
  opensanctions.ts   Sanctions / PEP
  ofac.ts            OFAC SDN direct
  index.ts           Factory + orchestrator
```

| Check Type | Primary | Fallback | Env Var | Status |
|---|---|---|---|---|
| Entity | Cobalt | Cached | `COBALT_INTELLIGENCE_API_KEY` | Working |
| Track Record (search) | Realie | Regrid → stub | `REALIE_API_KEY`, `REGRID_API_TOKEN` | Working |
| Track Record (enrichment) | ATTOM | Skip | `ATTOM_API_KEY` | Working |
| Track Record (verify) | Realie | (none) | `REALIE_API_KEY` | Working |
| GC | CSLB (CA) | NOT AUTOMATED for others | None | Working |
| Litigation | CourtListener | Stub | `COURTLISTENER_API_TOKEN` | Federal only |
| Sanctions / PEP | OpenSanctions | OFAC SDN direct | `OPENSANCTIONS_API_KEY` | Trial expires 2026-05-28 |

## Other key library modules

```
src/lib/domain/upsert.ts          borrower/entity/property/lender + linkBorrowerToEntity
src/lib/risk/factors.ts           Pure compute: 9 factors + tier rule
src/lib/risk/persist.ts           Atomic recompute via RPC
src/lib/ai/analysis.ts            v2 Story Mode prompt
src/lib/ai/regenerate.ts          Memo regen helper
src/lib/evaluate/engine.ts        Module 1 — multi-investor eligibility
src/lib/handoff/builder.ts        HandoffDocument assembly
src/lib/handoff/excel.ts          exceljs workbook generator
src/lib/monitor/runner.ts         Continuous monitoring + adapter_results tracking
src/lib/email/resend.ts           Resend wrapper
src/lib/litigation/extract.ts     CourtListener raw → ExtractedCase
src/lib/litigation/materialize.ts Upsert litigation_cases for a validation
src/lib/gc/summary.ts             buildGCSummary for the dashboard chip
src/lib/events/emit.ts            activity_events emission
src/lib/notifications/dispatch.ts notification_preferences fan-out
src/lib/documents/store.ts        Supabase storage upload + documents row
src/lib/schemas/jsonb.ts          Zod schemas for every JSONB column
src/lib/schemas/api.ts            Zod schemas for API request bodies
src/lib/async/with-error-log.ts   Helper for after()-callback bodies
```

## Scripts

```
scripts/ingest-fdic-lenders.ts          ~4,300 banks → global lenders
scripts/ingest-zhvi-zips.ts             ~26K zip medians from Zillow ZHVI
scripts/seed-sample-investors.ts        3 sample investor configs
scripts/cleanup-active-duplicates.ts    Pre-flight for 00016 UNIQUE indexes
scripts/preflight-00016.ts              Read-only orphan + duplicate scan
scripts/verify-00016.ts                 Post-apply verification
scripts/verify-00017.ts                 Verify universal infra
scripts/verify-rollback.ts              Used post-failed-migration probe
scripts/check-storage-bucket.ts         List Supabase storage buckets
scripts/backfill-litigation-cases.ts    Idempotent litigation_cases backfill
```

---

## Critical context for next session

- **Velocity is days, not weeks.** Eleven PRs (P0 + Tier S + universal
  infra) shipped end-to-end in one extended session. Trust the proven pace.
- **Path B data model is committed to.** Every new feature references
  borrowers/entities/properties/lenders by FK.
- **JSONB columns are schema-versioned.** Every object-shaped JSONB carries
  `schema_version` and a CHECK constraint enforcing it. New shapes go
  through `src/lib/schemas/jsonb.ts`.
- **Universal infra is live.** Use `documents` for every file upload,
  `activity_events` for every state change, `notification_preferences` for
  every outbound alert. No per-feature reinventions.
- **AI Story Mode v2 is the default for new validations.** Old v1 reads
  fall back through the dual renderer. Don't migrate v1 rows backward.
- **Override-and-rerun is the product.** Risk factors recompute atomically
  via the `recompute_risk_factors_atomic` RPC.
- **AI never picks the tier.** `risk_rating` is hard-overwritten server-side
  from the deterministic tier post-AI parse.
- **Ship straight to prod via `git push origin main`** (auto-deploy).
  `supabase db push` for migrations. `MONITOR_RUN_RESULTS_ENABLED=true`
  is set on Vercel.

---

## Reference paths

- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production URL:** https://app.pulseclose.com
- **Vercel project:** `buildfolios-projects-e8f9d80e/pulseclose`
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Module 1 archive (already ported):** `/Users/zachwade/code/archive/pulseclose-archived`
- **Original archive (pre-PulseClose):** `/Users/zachwade/BridgeFlow_archived`

---

## Operations notes

- **OpenSanctions trial expires 2026-05-28.** After that it falls back to
  OFAC SDN direct (free). Renew or upgrade before then.
- **Cobalt key:** rotate when usage cap hits.
- **Deploys:** `git push origin main` triggers production auto-deploy.
  Manual fallback: `vercel deploy --prod --yes`.
- **Supabase migrations:** `supabase db push` after creating new files in
  `supabase/migrations/`.
- **Database wipes** (if needed during dev): REST API DELETEs in dependency
  order — `borrower_validations` first cascades most children.
- **Refresh ZHVI** monthly (~16th when Zillow republishes):
  `set -a; source .env.local; set +a; npx tsx scripts/ingest-zhvi-zips.ts`.
