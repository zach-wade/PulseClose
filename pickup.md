# PulseClose — Session Pickup (2026-05-02)

> **For session-resumption.** Strategic and architectural detail lives in the
> dedicated docs — this file orients quickly and points there.
>
> **Read these in order on session start:**
> - This file (you're here)
> - `docs/ROADMAP.md` — **journey-organized** (Stage 1 Intake → Stage 8
>   Outcome) with all old tier features (S/A/B/C/D/E/F) re-slotted into
>   stages and 11 explicit UX gaps (G1.1-G8.1) as first-class items
> - `docs/DATA-MODEL.md` — full schema incl. universal infra tables
> - `STRATEGY.md` — vision, market, long-shot bets
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are right now

**Standalone borrower validation platform for bridge lenders.** Multi-tenant
SaaS at app.pulseclose.com. NPLA conference is the forcing function (June
22-23, 2026; ~7 weeks out).

**P0 corrections + universal infra + Tier S demo wow + recovery PRs are
SHIPPED end-to-end.** Production is healthy as of 2026-05-02. See
"What was completed" below for the recovery story.

**2026-05-02 — Roadmap reorganized + UX cohesion fixes shipped.** ROADMAP.md
rewrote primary navigation around the 8-stage lender journey (Intake → Run
→ Investigate → Decide → Route → Hand off → Monitor → Outcome) instead of
S/A/B/C/D/E/F tiers; surfaced 11 UX disconnects as first-class items
(G1.1-G8.1); single ordered batch sequence replaces parallel tier
schedules. Sidebar nav simplified — 4 standalone single-check tools
(Entity / Track Record / GC / Litigation) removed from primary nav since
they contradicted the unified-validation flow (G3.5). Recommended next
work: **Batch 1** (close the journey: G1.1 doc-addresses → verified flips,
G3.1 VerifiedTrackRecord above fold, G5.1 evaluate CTA, G6.2 handoff CTA,
B5 activity feed UI).

---

## What was completed in the last big push

### P0 — Corrections (5 PRs, 2026-04-30)

- **PR 1 (75f83ad):** App bug fixes — FK consistency on entity + GC creation
  paths, monitor cron error handling (per-adapter status + 1h backoff on
  rate limits + email-failure tracking), defensive risk-recompute,
  linkBorrowerToEntity race-condition guard.
- **PR 2 (25530f3):** Foundations — `zod` ^4.4.1, schemas in
  `src/lib/schemas/{jsonb,api}.ts`, `src/lib/async/with-error-log.ts`.
- **PR 3 (2e0760d):** Pre-flight cleanup script + Zod adoption at JSONB
  write sites + investor JSON validator with key-by-key errors.
- **PR 4 (45a649c + 630082a + b251743):** Migration `00016_p0_corrections.sql`
  — `org_id` denormalization on snapshot tables, missing timestamps,
  UNIQUE partial indexes, `risk_factors.expires_at`, JSONB schema_version
  + CHECK constraints, lender escalation guard, `monitor_runs.adapter_results
  / email_status`, `recompute_risk_factors_atomic` RPC.
  `MONITOR_RUN_RESULTS_ENABLED=true` flipped on Vercel.
- **PR 5 (93be452):** UX polish — handoff save-then-download, empty states,
  ZHVI null fallback factor, address-extraction 422, AI memo poll 90→180s.

### Universal infra + Tier S demo wow (6 PRs, 2026-04-30)

- **PR 6 (dc34fd5):** Migration `00017_universal_infra.sql` — `documents`
  table + Supabase storage bucket + `notification_preferences` +
  `activity_events`. Helpers: `events/emit.ts`, `notifications/dispatch.ts`,
  `documents/store.ts`. Activity emission retrofitted across endpoints.
- **PR 7 (9774386):** S1 Comparative borrower view — `/dashboard/compare`.
- **PR 8 (b311552):** S2 Story Mode AI memo — `ai_analysis` schema v2 with
  dual renderer.
- **PR 9 (27716ca):** S3 Litigation case cards — migration
  `00018_litigation_cases.sql` + extract/materialize + cards UI.
- **PR 10 (5235cc6):** S4 GC inline summary — migration `00019_gc_summary.sql`
  + chip component (desktop column + mobile inline).
- **PR 11 (ac7ee9e):** S5 Risk methodology PDF — server-rendered printable
  at `/validations/[id]/risk-methodology`.

### Recovery + Quality (4 PRs, 2026-04-30 → 2026-05-01)

- **PR 12 (bf89219):** `internal` plan tier — migration `00020_internal_plan.sql`.
  PLANS gains `internal` with `Infinity` checkLimit, no Stripe price IDs.
  Bypasses both monthly cap and 3-check pre-subscription gate. Test Co
  flipped to `internal` (`scripts/promote-to-internal.ts`); usage UI shows
  "Unlimited" instead of a meaningless progress bar.
- **PR 13 (a29b328 + 47509a1):** **P0 — silent snapshot insert failures.**
  Discovered reviewing validation 790adc76. 00016 made `org_id NOT NULL` on
  4 snapshot tables but app code didn't pass org_id; `.insert()` errors
  were silently swallowed. New `src/lib/supabase/insert-or-throw.ts` helper
  surfaces failures; org_id added to ~12 insert sites
  (validations/route.ts × 5, monitor/runner.ts × 3, api/checks/* × 4) plus
  user-visible silent inserts wrapped (verified_flips × 2,
  deal_eligibility_results, investor_criteria). Also: sanctions card UX
  shows officers/agent in "Names Screened" (derived from match
  query_names); handoff body UX loosened email schema + field-level
  errors + amber hint.
- **PR 14 (9e4d733):** **CRITICAL — production builds had been failing for
  ~9 hours** since PR 7 shipped. Next 16 requires `useSearchParams()`
  consumers to be wrapped in a Suspense boundary; the Compare page wasn't.
  Vercel kept serving the pre-PR-7 deploy — meaning **PRs 7-13 never
  reached production until this fix landed.** Wrapped ComparePage in
  Suspense with a skeleton fallback.
- **`78ee8d6`:** Cobalt fetch timeout 15s → 30s. CA SOS scrapes (which
  Cobalt does on our behalf — we don't have our own scraper) can take 14s+;
  15s budget was right at the wire.

### 2026-05-02 follow-ups

- **AI memo blank-out fix (8ae2884):** v2 schema's `risks[].severity` enum
  was too narrow (`critical | moderate | minor`). The deterministic
  `risk_factors` table emits 5 severities (`critical | moderate | minor |
  informational | none`); the prompt tells Claude to copy the factor
  block's severity verbatim, so `informational` (e.g. `market_outlier`)
  legitimately appears in v2 memos and rejected the whole shape.
  Widened enum + interface + prompt to accept `informational`; added
  defensive coercion in `analysis.ts` (any unknown severity → `minor`)
  so future drift can't blank the memo. Renderer shows informational
  rows with sky-blue accent + Info icon (distinct from amber/red risks).
- **Sidebar cohesion fix (this commit):** Removed 4 standalone single-check
  tool nav items (Entity Search / Track Record / GC Validation /
  Litigation) per G3.5. The unified validation flow is the canonical
  path; module-shaped sidebar contradicted the journey. Page files at
  `/dashboard/{entity,gc,litigation,track-record}/page.tsx` kept (unlinked)
  pending decision to delete.
- **Runbook reconciliation (`~/.claude/plans/ok-so-now-what-delightful-lark.md`):**
  Caught 2 fictional UI claims — "Property addresses" input on `/dashboard/new`
  (doesn't exist; Realie auto-discovers via owner-name search) and
  "GC: manual" chip for no-GC validations (renders em-dash; "manual"
  only appears when GC ran for non-CA state). Fixed both + added a new
  Phase 1.5 for the `VerifiedTrackRecord` deed-verify path.
- **ROADMAP reorganized around the journey (this commit):** see
  [docs/ROADMAP.md](docs/ROADMAP.md). 8 stages × 4 cross-cutting surfaces;
  every prior tier feature kept its tier code; 11 UX gaps surfaced as
  G1.1-G8.1; one ordered batch sequence.

---

## Database state (as of 2026-05-02)

**Migrations applied (20 total):**
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
00016 p0_corrections                    org_id denorm, UNIQUE, schema_version, RPC
00017 universal_infra                   documents + notification_preferences
                                        + activity_events + storage bucket
00018 litigation_cases                  Materialized litigation cards
00019 gc_summary                        Cached GC chip column
00020 internal_plan                     `internal` plan tier (unlimited)
```

**Row counts:**
- `organizations` = 1 (Test Co, plan=internal)
- `users` = 1
- `lenders` = ~4,300 global (FDIC + known-bridge denylist)
- `investors` = 3 sample configs
- `zhvi_zips` = 26,283
- **`borrowers` / `entities` / `properties` retained** from prior runs:
  - Kim An Truong (borrower id `d4d94670-86cd-48b2-a6fe-e0d26dba96aa`)
  - "TT INVESTMENTS" + "TT INVESTMENTS, LLC" entities (the latter was the
    real CA SOS hit, formed 2011-09-20, agent KIMAN TRUONG at 1323 Rosalia)
  - 25 properties from the prior Realie pull
- `borrower_validations` = 0 (both broken-pillar test runs cleaned up via
  `scripts/cleanup-broken-validations.ts`)
- `documents`, `activity_events`, `notification_preferences`,
  `litigation_cases` exist but empty.

---

## Truong demo test data — IMPORTANT

**Real intake xlsx at:** `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`

3 sheets:
- **Borrower Track Record** — ~30 historical flips since 2017,
  TT Investment Properties LLC + Kim An Truong individually
- **Active** — 14 active Insignia loans, ~$17M outstanding, 8.5-9% rates.
  Includes **1310 Rosalia Ave** ($1.6M, 5/2027 maturity, 8.75%)
- **Re-Writes** — 4 loans, $5M

**Critical corrections from the file:**
1. **Real entity name is "TT Investment Properties, LLC"** — earlier tests
   used "TT Investments" (abbreviation) which triggered noisy sanctions
   matches against "TT International Investment Management" (UK firm).
   Always use the full name.
2. **Co-borrower Kim Thanh Thi Truong** appears on most loans (likely
   wife). Schema has only one `guarantor` field — use her there or leave
   blank.
3. **Registered agent address per CA SOS:** `KIMAN TRUONG at 1323 ROSALIA
   AVE` — the *1323* property, not *1310* (both are Kim's per the xlsx).

**Use this file to test the Excel doc-ingest path** (`/api/ingest/borrower-doc`)
when running fresh validations on `/dashboard/new`. It's the canonical
real-world test for the lender intake flow.

---

## Manual items the user should do

1. **Re-run a validation post AI-memo-fix** to confirm Story Mode v2
   renders cleanly with `informational` severity rows. Use:
   - Borrower: `Kim An Truong`
   - Entity: `TT Investment Properties, LLC` ← use the FULL name
   - State: `CA`
   - Verify pillar tables populate AND the AI memo renders all 4 risk
     rows (one of them — `market_outlier` — should be sky-blue
     informational, distinct from amber/red).
2. **Test doc ingestion with the xlsx** above — drop into upload zone on
   `/dashboard/new`. Today only the borrower/entity/GC fields pre-fill.
   Once Batch 1 G1.1 ships, the property addresses will also pre-fill
   and run through deed verification automatically.
3. **Walk the demo runbook** at
   `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md`
   (Phase 1-7, updated 2026-05-02). Includes the deferred print test for
   `/handoff/[id]` and `/validations/[id]/risk-methodology` — physically
   print to verify page-break / margin / color rules.
4. **NPLA pre-flight, ~1 week out:** verify all migrations idempotent on
   a fresh tenant.
5. **Decide on AI/data privacy stance** before serious lender outreach
   AND before A1 ships (A1 adds another Claude consumer). Recommended:
   ship the 2-day bundle (PII redaction + depersonalized prompt + per-org
   `ai_extraction_enabled` toggle) before any non-Insignia outreach.

---

## What's shipped (master table)

| Feature | Status | Notes |
|---|---|---|
| Auth (Supabase) | Working | |
| Validation flow (4 pillars + sanctions) | Working | All snapshot inserts wrapped in `insertOrThrow` post PR 13 |
| Entity / Track / GC / Lit / Sanctions adapters | Working | Cobalt timeout = 30s |
| Trust-but-verify (Realie deed-chain) | Working | Address normalization fixed |
| Borrower share link (paste + xlsx/pdf upload) | Working | 422 on extraction failure |
| AI risk memo — Story Mode v2 | Working | Dual renderer, schema-versioned |
| Risk-tier rebuild + override-and-rerun | Working | Atomic recompute via RPC |
| Module 1 — Evaluate Deal | Working | Investor criteria validator surfaces key-by-key errors |
| Investor handoff (Excel + PDF) | Working | Save-then-download, dirty tracking, loose email + amber hint |
| Continuous monitoring | Working | Per-adapter status, 1h rate-limit backoff |
| Doc ingestion (lender side) | Working | xlsx/pdf/csv |
| Share-link upload | Working | |
| Zillow ZHVI deviation + unavailable factor | Working | |
| Comparative borrower view (S1) | Working | Wrapped in Suspense |
| Story Mode AI memo (S2) | Working | v2 with strengths/risks/recs |
| Litigation case cards (S3) | Working | Materialized + filter chips |
| GC inline summary (S4) | Working | Desktop column + mobile inline |
| Risk methodology PDF (S5) | Working | `/validations/[id]/risk-methodology` |
| Stripe billing | Working | $299 / $499 / $799 + `internal` (unlimited, SQL-only) |
| Test Co `internal` plan | Live | Unlimited validations for the founder org |
| Sanctions card "Names Screened" | Working | Now includes officers/agent derived from matches |
| Insert-error surfacing | Working | `src/lib/supabase/insert-or-throw.ts` wraps user-visible inserts |
| Rate limiting | Working | |
| Usage metering | Working | |

---

## Open decisions / questions for the user

1. **Insignia + outside AI** — borrower intake docs and AI memos go through
   Anthropic. Asked but not yet decided. Options outlined in the
   conversation:
   - Anthropic ZDR contract (cleanest answer, ~$5-15K/mo enterprise tier)
   - **PII redaction pre-flight on doc ingestion** (~1 day, ship-able)
   - **Depersonalized AI memo prompt** (placeholders not real names, ~0.5 day)
   - **Per-org `ai_extraction_enabled` toggle** (~0.5 day)
   - AWS Bedrock with Anthropic in customer tenancy (post-NPLA, big lift)

   Recommendation: ship the 2-day bundle (#2 + #3 + #4) before serious
   lender outreach. Ask Damon what Insignia's actual policy is before
   committing to ZDR cost.

2. **What to do with the Truong xlsx** — the user has it; runbook calls for
   testing doc ingest with it. Either Claude tests via API or user walks
   the UI manually.

---

## Next session — what to pick up

Per [docs/ROADMAP.md](docs/ROADMAP.md) Recommended sequence, the next batch
in priority order is **Batch 1 — close the journey** (5-6 days). One
continuous flow from intake to handoff, instead of 5 disconnected screens.

- **G1.1 + G2.1 — Doc-ingest addresses → Verified Track Record at run
  time** (0.5d). DocIngest already extracts `property_addresses: string[]`
  but the form ignores it. Wire it through so deed-chain runs alongside
  the 4 pillars on first submit. Closes the address paradox + sets up
  the demo "drop xlsx → see deed-verified flips" wow.
- **G3.1 — VerifiedTrackRecord above the fold** (0.5d). Pull the card up
  next to the Track Record pillar; auto-populate from intake doc.
- **G5.1 — "Evaluate against my investors →" CTA** on validation detail
  (0.5d). Routes to `/dashboard/evaluate` with this validation pre-loaded.
- **G6.2 — "Generate handoff for top-match investor" CTA** on evaluate
  results (0.5d).
- **G3.5 — Drop standalone tool pages from sidebar** ✅ (shipped 2026-05-02).
  Page files unlinked but kept in `/dashboard/{entity,gc,litigation,track-record}/`
  for now — delete in a follow-up if confirmed unused.
- **B5 — Activity feed UI** (2d). Universal `activity_events` already
  populating; this is just the read+render layer. New page `/dashboard/activity`
  + per-detail-page strip showing borrower-side events (G3.3).
- **G3.2 — "Send share link" CTA** on detail page (0.5d). Resend template +
  copy-link modal. Activity event `sent_share_link`.

Then **Batch 2 — Tier A capital stickiness + outcome substrate** (8-10d):
- AI privacy 2-day bundle (PII redaction + depersonalized prompt + per-org
  toggle) — decide before A1.
- A1 Investor PDF parser (3d) — NPLA hero feature.
- E1 Deal outcomes capture (1d) — blocker for everything reputation/
  performance.
- A2 Counter-offer (2d), A3 Borrower capital PDF (1.5d), B1 Watchlist (0.5d).

If asked "what's next?" without direction: **start Batch 1 with G1.1**.
It's a half-day fix that turns the demo from "current holdings" to
"deed-verified track record" — the single biggest wow available.

---

## Vendor adapter chain

```
src/lib/adapters/
  types.ts           Interface definitions (ValidationAdapter)
  extract.ts         Client-side extraction from raw_response JSONB
  stub.ts            Demo data adapter
  cobalt.ts          SOS entity adapter (Cobalt scrapes; we don't)
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
| Entity | Cobalt (30s timeout) | Cached (`liveData=false`) | `COBALT_INTELLIGENCE_API_KEY` | Working |
| Track Record (search) | Realie | Regrid → stub | `REALIE_API_KEY`, `REGRID_API_TOKEN` | Working |
| Track Record (enrichment) | ATTOM | Skip | `ATTOM_API_KEY` | Working |
| Track Record (verify) | Realie | (none) | `REALIE_API_KEY` | Working |
| GC | CSLB (CA only) | NOT AUTOMATED for others | None | Working |
| Litigation | CourtListener | Stub | `COURTLISTENER_API_TOKEN` | Federal only |
| Sanctions / PEP | OpenSanctions | OFAC SDN direct | `OPENSANCTIONS_API_KEY` | **Trial expires 2026-05-28** |

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
src/lib/supabase/insert-or-throw.ts  Surface silent insert/update failures
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
scripts/find-test-co.ts                 Find Test Co + plan/usage state
scripts/promote-to-internal.ts          Flip an org to `internal` plan
scripts/cleanup-broken-validations.ts   Find + delete broken-pillar validations
scripts/review-validation.ts            Pull full snapshot for a validation_id
scripts/peek-truong-xlsx.ts             One-off — inspect the Truong intake xlsx
```

---

## Critical context for next session

- **Velocity is days, not weeks.** Fourteen PRs (P0 + universal infra +
  Tier S + recovery) shipped end-to-end across two sessions.
- **CHECK BUILD STATUS in Vercel after every push.** PR 7-13 didn't reach
  production for ~9 hours because Compare page broke prerender. `vercel ls
  pulseclose | head -3` shows recent deploys; "Error" status means stale
  prod is still serving requests.
- **Path B data model is committed to.** Every new feature references
  borrowers/entities/properties/lenders by FK.
- **JSONB columns are schema-versioned.** Every object-shaped JSONB carries
  `schema_version` and a CHECK constraint. New shapes go through
  `src/lib/schemas/jsonb.ts`.
- **Universal infra is live.** Use `documents` for every file upload,
  `activity_events` for every state change, `notification_preferences` for
  every outbound alert. No per-feature reinventions.
- **Snapshot inserts MUST pass org_id and use `insertOrThrow`.** Wrap any
  new insert into `entity_checks`, `track_record_entries`,
  `litigation_checks`, `gc_validations`, or other user-visible tables with
  `insertOrThrow` from `src/lib/supabase/insert-or-throw.ts`. Silent
  insert failures hid for ~24h before discovery.
- **AI Story Mode v2 is the default for new validations.** Old v1 reads
  fall back through the dual renderer. Don't migrate v1 rows backward.
- **Override-and-rerun is the product.** Risk factors recompute atomically
  via the `recompute_risk_factors_atomic` RPC.
- **AI never picks the tier.** `risk_rating` is hard-overwritten server-side
  from the deterministic tier post-AI parse.
- **Test Co is on the `internal` plan** (unlimited validations, no Stripe).
  `ORG_ID=<uuid> npx tsx scripts/promote-to-internal.ts` flips any other
  org. Internal plan never appears in the upgrade matrix.
- **Cobalt = our SOS scraper provider** (we don't have our own scraper).
  30s fetch timeout. CA SOS via Cobalt can be the slowest.
- **Real Truong test data:** entity is `TT Investment Properties, LLC`,
  borrower is `Kim An Truong`, xlsx at
  `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`.
- **Ship straight to prod via `git push origin main`** (auto-deploy).
  `supabase db push` for migrations.

---

## Reference paths

- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production URL:** https://app.pulseclose.com
- **Vercel project:** `buildfolios-projects-e8f9d80e/pulseclose`
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Module 1 archive (already ported):** `/Users/zachwade/code/archive/pulseclose-archived`
- **Original archive (pre-PulseClose):** `/Users/zachwade/BridgeFlow_archived`
- **Demo runbook plan:** `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md`
- **Truong intake xlsx:** `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`

---

## Operations notes

- **OpenSanctions trial expires 2026-05-28** (~4 weeks). After that it
  falls back to OFAC SDN direct (free). Renew or upgrade before then.
- **Cobalt key:** rotate when usage cap hits. Direct API call to verify
  health: `curl -s -m 60 -H "x-api-key: $COBALT_INTELLIGENCE_API_KEY"
  "https://apigateway.cobaltintelligence.com/v1/search?searchQuery=...&state=CA&liveData=true"`.
- **Deploys:** `git push origin main` triggers production auto-deploy.
  **Always check `vercel ls pulseclose | head -3` for "Ready" status —
  silent build failures cost us 9 hours once.** Manual fallback:
  `vercel deploy --prod --yes`.
- **Supabase migrations:** `supabase db push` after creating new files in
  `supabase/migrations/`.
- **Database wipes** (if needed during dev): cascading deletes via
  `borrower_validations`. `scripts/cleanup-broken-validations.ts` finds
  rows with empty pillar tables (heuristic) and offers `--delete`.
- **Refresh ZHVI** monthly (~16th when Zillow republishes):
  `set -a; source .env.local; set +a; npx tsx scripts/ingest-zhvi-zips.ts`.

---

## Known regressions / risks to watch

- **Sanctions card "Names Screened"** — derives officers from matches'
  `query_name`. Works when there ARE matches; on a clean run, the
  additional_persons list is invisible. Future fix: persist
  `additional_persons text[]` on `sanctions_checks`.
- **Multi-borrower validations** — Kim Thanh Thi Truong (co-borrower on
  most TT Investment Properties loans) can't be modeled cleanly today;
  schema is single guarantor. Real-world usage will hit this.
- **Existing pre-PR-13 validations** in any tenant that ran during the
  ~24h silent-insert window have empty pillar tables and can't be back-
  filled (vendor data not reproducible without re-spending API budget).
  Cleanup: `npx tsx scripts/cleanup-broken-validations.ts --delete`.
- **Print CSS on `/handoff/[id]` and `/validations/[id]/risk-methodology`**
  has not been physically tested on real paper. The print rules look
  right in DevTools but page-break behavior under real printer drivers
  needs a one-time manual check.
- **AI privacy posture** — see Open decisions above. Today every borrower
  name + property + sanctions match goes through Anthropic's Claude. ZDR
  is on the contract by default; Insignia hasn't been asked their stance.
