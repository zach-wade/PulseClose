# PulseClose — Session Pickup (2026-04-29 EOD)

> **For session-resumption.** Strategic and architectural detail lives in the
> dedicated docs — this file orients quickly and points there.
>
> **Read these in order on session start:**
> - `docs/ROADMAP.md` — Now / Pre-NPLA / Post-NPLA / Backlog with Decisions Log
> - `docs/DATA-MODEL.md` — target schema, signals/overrides design, migration plan
> - `STRATEGY.md` — vision, market, long-shot bets
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md` — index of durable preferences and project facts

---

## Where we are right now

**Standalone borrower validation platform for bridge lenders.** Multi-tenant
SaaS at app.pulseclose.com. One design partner: Insignia Capital Corp.
Forcing function: **NPLA conference June 22-23, 2026** (attendee mode via
Damon's warm intros). Win = 3 of {fund intros, lender intros, demos,
consulting leads}.

**Insignia partnership structure is being shaped** — leaning toward a JV-type
venture or JV-fund where the tech goes in-house and Zach holds equity, with
the SaaS option staying live as a parallel track. Zach owns all PulseClose IP
regardless. See `docs/ROADMAP.md` North Star section + memory
`project_insignia_partnership_paths.md`.

**Database is empty as of 2026-04-29 wipe** — the test validations from prior
sessions (Truong et al.) were intentionally cleared after the data-model
refactor, since the product is brand new and re-running the same borrowers is
trivial. Auth/orgs preserved (1 organization, 1 user).

---

## Session 2026-04-29 — what happened

Substantial session that moved the product from "ad-hoc roadmap" to
"structured plan with grounded decisions, plus first chunk of execution."

**Strategic work:**
- Reviewed Noah-call dev-handoff doc + Insignia 4/28 meeting transcript.
- Discovered already-shipped items the doc treated as TODO (OFAC UI, LTV fix).
- Captured Noah's actual demand: rules-driven risk scoring with override
  mechanic, not just transparency. See Decisions Log entries 2026-04-28/29 in
  `docs/ROADMAP.md`.
- Defined NPLA win (3 of {fund intros, lender intros, demos, consulting
  leads}, attendee mode).
- Established IP/structure thesis: Zach owns IP, structure is compensation.
- Established distribution thesis: capital-provider endorsement is the only
  organic distribution path; investor handoff is the strategic deliverable.

**Documents created:**
- `docs/ROADMAP.md` — Now / Pre-NPLA / Post-NPLA / Backlog + Decisions Log + Out-of-Scope (~232 lines)
- `docs/DATA-MODEL.md` — full target schema with signals/overrides design (~279 lines)

**Memory entries added (index at MEMORY.md):**
- `feedback_no_local_dev` — Zach ships straight to prod via `vercel --prod`; don't propose `npm run dev`
- `project_risk_tier_bridge_icp` — extended-hold flag must exclude primary-residence + bank-financed
- `project_distribution_thesis` — capital-provider endorsement is the only organic path
- `feedback_velocity_sizing` — sizing is days at Zach + Claude pace, not weeks
- `project_insignia_partnership_paths` — 4 plausible structures; build dual-use; Module 1 generalized
- `feedback_damon_only_outreach` — no independent lender/fund outreach pre-NPLA; Damon is sole conduit; capacity unconstrained
- `feedback_long_term_architecture` — clean-refactor beats fast-ship; product is new, no legacy weight

**Schema work executed (Session 1 of 3 in data-model refactor):**
- Migration `00010_domain_entities.sql` — 15 new tables (borrowers, entities, properties, lenders, property_ownership, signal tables, risk_factors, Module 1 tables) + nullable FKs on existing tables + RLS + indexes. Applied to prod.
- Migration `00011_backfill_domain_entities.sql` — backfill from existing data with 1:1 dedup. Applied (then data was wiped, so it's now a no-op file in history).
- Migration `00012_fix_validation_entity_fk.sql` — corrective for 00011's strict-equality bug that pointed validations at shell entity rows. Applied (also moot post-wipe).
- Wiped legacy validation data via REST API DELETEs. Cascade-FKs handled per-validation children cleanly.

---

## Database state (as of 2026-04-29 EOD)

**Migrations applied (15 total):**
```
00001_foundation                   Core tables
00002_handle_new_user              Auto-create user/org on signup
00003_ai_analysis                  ai_analysis JSONB column
00004_stripe_billing               Subscription fields
00005_sanctions_screening          sanctions_checks table
00006_input_warnings               input_warnings JSONB on validations
00007_validation_summary_counts    Cached property_count + flag_count
00008_verified_flips               Trust-but-verify results table
00009_share_token                  Borrower share-link token
00010_domain_entities              Path B refactor — 15 new tables + nullable FKs
00011_backfill_domain_entities     Backfill (moot after wipe but in history)
00012_fix_validation_entity_fk     Corrective FK update (also moot post-wipe)
00013_handoff_data                 borrower_validations.handoff_data jsonb
00014_monitoring                   monitor_subscriptions + monitor_runs
00015_zhvi_zips                    Zillow ZHVI by-zip median value lookup (~26K zips)
```

**Row counts:** validation/domain tables ready for fresh data.
- `organizations` = 1, `users` = 1
- `lenders` = ~4,300 (FDIC banks + 15 known-bridge entries via global rows, org_id=null)
- `investors` = 3 sample configs (Colchis-style, Oakhurst-style, Mandalay-style)
- `zhvi_zips` = 26,283 zips with median values

**Sessions 2 + 3 of the data-model refactor shipped end-to-end.** New
validations populate every FK on creation; signal POST re-derives risk
factors and regenerates the AI memo; "Why this rating?" UI surfaces the
override loop.

---

## What's shipped (still valid post-wipe)

| Feature | Status | Notes |
|---|---|---|
| Auth (Supabase) | Working | Signup/login |
| Validation flow | Working | Create → 4 parallel checks + sanctions sequential → detail report |
| Entity check (Cobalt) | Working | 50-state SOS, 429 retry, cached fallback |
| Track record (Realie + Regrid + ATTOM) | Working | Owner-name search + transfer history + sale enrichment |
| Trust-but-verify (Realie address lookup) | Working | Per-address deed-chain validation |
| Borrower share link | Working | `/share/<token>` for borrower-submitted flip addresses |
| GC validation (CSLB) | Working | CA only; "NOT AUTOMATED" for other states |
| Litigation (CourtListener) | Working | Federal bankruptcy + civil |
| Sanctions / PEP (OpenSanctions + OFAC SDN) | Working | Trial key expires 2026-05-28 |
| AI risk memo (Claude) | Working — rules-driven | Receives factor list + deterministic tier; risk_rating hard-overwritten server-side from computed tier |
| Risk-tier rebuild (Why this rating?) | Working | Deterministic factors, override-and-rerun via POST /api/signals; signal write triggers memo regen |
| Module 1 — Evaluate Deal | Working | Multi-investor eligibility engine, JSONB criteria_value rules, leverage matrix + adjusters |
| Investor handoff (Excel + PDF) | Working | exceljs workbook + printable HTML at /handoff/[id]; manual fields editable on validation detail |
| Continuous monitoring | Working | Vercel cron daily 9 UTC; per-sub cadence; emails on changes_found via Resend |
| Doc ingestion (lender side) | Working | PDF/Excel/CSV → Claude extraction → /dashboard/new pre-fill |
| Share-link upload | Working | Borrower can upload PDF/Excel/CSV → addresses extracted into textarea |
| Zillow ZHVI deviation | Working | market_outlier informational factor when AVM is 2x+ or 0.5x- the zip median |
| Input sanity warnings | Working | LLC suffix on borrower, borrower not in officers |
| Stripe billing | Working | $299/$499/$799 |
| Rate limiting | Working | Token-bucket on API routes |
| Usage metering | Working | Every vendor API call logged |

---

## Next session — what to pick up

The Now lane and the code-buildable Pre-NPLA items are all shipped and
deployed. What's left is external- or content-bound:

**Pre-NPLA, blocked-or-content:**
- **Insignia testimonial / case study.** Ask Damon for a quotable line.
  Distribution-multiplier per the strategy thesis.
- **Demo collateral.** Three talk tracks (lender / fund / consulting),
  one-page PDF leave-behind, trial-start mechanic.
- **TransUnion address validation.** Adapter is ~1 day once Noah's
  logins land. Keep watching for them.
- **Background-check provider scoping.** LexisNexis / Westlaw /
  Unicourt eval. Don't sign anything pre-NPLA — just identify the
  candidate so we can claim "state-court coverage coming."
- **Demo deal preparation.** Pre-load 2-3 polished borrower validations
  (real or synthetic) that produce rich, clean output across all
  pillars. These are the demos walked into NPLA meetings — must work
  flawlessly.

**Post-NPLA / structure-dependent:** Module 1 expansion with named
investor PDFs (need actual Colchis/Oakhurst PDFs from Damon), Nexys
LOS write-back (blocked on Nexys API), state-court litigation
provider integration ($500-2K/mo), multi-state GC adapters.

**Backlog ideas worth picking up if a session opens:**
- Auto-recommend supplemental conditions (e.g., "Bitcoin source +
  loan > $10M → recommend personal tax transcript"). Small rules
  layer on top of existing data.
- Operating-agreement collection adapter (for the brokered channel).
- State-specific endorsement validator (per-state research; bigger).
- ICP picker (Bridge/Bank/DSCR/Brokered/Private credit) — defer until
  a non-Bridge customer asks.

If the user opens with "what's next?" and there's no specific ask, the
right answer is to push for **Insignia testimonial collection** — it's
the single highest-leverage thing left before NPLA, and it's a Damon
ask, not a code task.

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
  opensanctions.ts   Sanctions / PEP screening
  ofac.ts            OFAC SDN direct CSV (free fallback)
  index.ts           Factory + orchestrator
```

## Other key library modules

```
src/lib/domain/upsert.ts      borrower/entity/property/lender + linkBorrowerToEntity
src/lib/risk/factors.ts       Pure compute: 9 named factors + tier rule
src/lib/risk/persist.ts       Fetch + join + compute + store risk_factors
src/lib/ai/analysis.ts        AI memo prompt; receives factors+tier; risk_rating overwritten server-side
src/lib/ai/regenerate.ts      Memo regen helper (used by signal POST + share verify)
src/lib/evaluate/engine.ts    Module 1 — multi-investor eligibility engine
src/lib/handoff/builder.ts    HandoffDocument assembly from validation graph
src/lib/handoff/excel.ts      exceljs workbook generator
src/lib/monitor/runner.ts     Continuous monitoring runSubscription + diff + email
src/lib/email/resend.ts       Tiny fetch-based Resend wrapper
```

## Scripts

```
scripts/ingest-fdic-lenders.ts      ~4,300 banks → global lenders rows
scripts/ingest-zhvi-zips.ts         ~26K zip medians from Zillow ZHVI
scripts/seed-sample-investors.ts    3 sample investor configs for Module 1 demo
```

| Check Type | Primary | Fallback | Env Var | Status |
|---|---|---|---|---|
| Entity | Cobalt | Cached (`liveData=false`) | `COBALT_INTELLIGENCE_API_KEY` | Working |
| Track Record (search) | Realie | Regrid → stub | `REALIE_API_KEY`, `REGRID_API_TOKEN` | Working |
| Track Record (enrichment) | ATTOM | Skip | `ATTOM_API_KEY` | Working |
| Track Record (verify by address) | Realie | (none) | `REALIE_API_KEY` | Working |
| GC | CSLB (CA only) | NOT AUTOMATED for others | None | Honest |
| Litigation | CourtListener | Stub | `COURTLISTENER_API_TOKEN` | Federal only |
| Sanctions / PEP | OpenSanctions | OFAC SDN direct (free) | `OPENSANCTIONS_API_KEY` | Trial expires 2026-05-28 |

---

## Reference paths (frequently needed)

- **Module 1 archive (for porting in Pre-NPLA):** `/Users/zachwade/code/archive/pulseclose-archived` — `evaluate-engine.ts`, `eligibility-tab.tsx` (409 lines), API + tests, dashboard route, design spec at `bridge-platform/modules/investor-eligibility.md`, HTML prototype.
- **Original archive (pre-PulseClose):** `/Users/zachwade/BridgeFlow_archived`
- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production URL:** https://app.pulseclose.com
- **Vercel project ref:** pulseclose. **Auto-deploy on push to main is wired up as of 2026-04-29** (GitHub integration was disconnected and reconnected to fix a silently-broken state). Push to main = production deploy. CLI `vercel --prod --yes` still works as a manual fallback.
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose

---

## Operations notes

- **OpenSanctions trial expires 2026-05-28.** After that it falls back to OFAC SDN direct (free). Renew or upgrade before then.
- **Cobalt key** rotation: current key `CgiH9xQq…` (40 chars). Rotate when usage cap hits. Test with curl before assuming a new key works — Cobalt's dashboard counter is unreliable.
- **Deploys:** `git push origin main` triggers a production deploy automatically (auto-deploy fixed 2026-04-29). CLI `vercel --prod --yes` available as manual fallback.
- **Supabase migrations:** `supabase db push` after creating new files in `supabase/migrations/`. CLI installed via Homebrew at `/opt/homebrew/bin/supabase`. Login persists per machine (`supabase login`).
- **Database wipes** (if needed during dev): REST API DELETEs in dependency order — `borrower_validations` first cascades most children. See session-2026-04-29 transcript for the curl pattern.
- **Test Co counter** reset: see `~/.claude/projects/-Users-zachwade-PulseClose/memory/reference_supabase_lookup.md` for one-liner. Org id `9e580f59-b01d-4cbd-a950-76dd4f32ee6c` (probably need to re-create after wipe).

---

## Vercel cron + monitoring

- `vercel.json` declares a daily `0 9 * * *` cron at `/api/cron/monitor`.
- The route reads due `monitor_subscriptions` (next_run_at <= now,
  enabled=true), batches up to 25/run, dispatches `runSubscription`,
  emails recipients via Resend on changes_found.
- Set `CRON_SECRET` env if Vercel injects it; route accepts no auth
  (404s if you forget) but rejects mismatched bearer if env is set.
- Set `RESEND_API_KEY` and optionally `RESEND_FROM_EMAIL` for emails.
- Set `NEXT_PUBLIC_APP_URL` for the link in monitoring emails.

## Critical context for next session

- **Path B data model is committed to.** Borrowers, entities, properties, lenders are first-class persistent entities. Validations are snapshots. Don't propose collapsing back to text-column-only model.
- **Override-and-rerun is the product, not just transparent factors.** When the risk-tier rebuild ships in Session 3, the "Why this rating?" UI must include inline override actions ("Mark as primary residence") that re-derive factors and re-run the AI memo.
- **No outside-Damon outreach pre-NPLA.** All lender/fund customer development goes through Damon. Don't propose cold outreach plans, lender interviews, or pre-NPLA marketing campaigns.
- **Capacity is unconstrained on Zach's side.** Don't sandbag estimates on capacity assumptions. The bottleneck is structure clarity (Insignia partnership) and external blocks (Nexys API access, TransUnion logins), not throughput.
- **Architecture decisions over short-term shipping.** When a fast-ship choice and a clean-refactor choice present, default to clean. Product is new, legacy weight is small.
- **Investor handoff Excel/PDF is the strategic deliverable.** The artifact every NPLA meeting hinges on — fund people care most about it. Build to the shape Damon described on 4/28; validate against a real Insignia handoff if Damon shares one.
