# PulseClose — Session Pickup (2026-04-30)

> **For session-resumption.** Strategic and architectural detail lives in the
> dedicated docs — this file orients quickly and points there.
>
> **Read these in order on session start:**
> - This file (you're here)
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

**Validation tables empty** — fresh run-ready. Domain entities, lenders,
investors, and ZHVI medians are all seeded.

---

## What was completed in the last big push (2026-04-29)

The Now lane and the entire code-buildable Pre-NPLA lane shipped end-to-end
in a single sustained run. Highlights:

**Data-model refactor (Sessions 2 + 3):**
- All four creation paths (validations, share verify, /api/checks/track-record, /api/checks/litigation) now populate every domain FK on creation via `src/lib/domain/upsert.ts` helpers.
- `borrower_entities` M:M populated with role tagging.
- FDIC ingestion: ~4,300 banks classified as `bank` plus 15 known-bridge entries (Insignia, Velocity, Lima One, RCN, Anchor, Kiavi, Yabi, Roc, Genesis, CoreVest, Temple View, Sharestates, Patch of Land, PeerStreet, Colchis).
- `POST /api/signals` for borrower / property / borrower×property / entity scopes with prior-active superseding.

**Risk tier rebuild (Session 3):**
- Pure compute in `src/lib/risk/factors.ts` over 9 named factors with Bridge ICP exclusions (extended_hold excludes primary-residence + bank-financed per memory).
- Tier rule: any active critical → HIGH; ≥2 active moderate → MEDIUM; else LOW.
- AI memo prompt rebuilt to receive factor list + tier; `risk_rating` is hard-overwritten server-side from the computed tier so the AI literally cannot disagree with the math.
- "Why this rating?" UI panel with inline `Mark as primary residence` overrides per affected property; signal POST fans out re-derivation + AI memo regen via `after()`.
- `flag_count` now derived from active risk_factors (Truong-style drift fixed).

**Module 1 — Evaluate Deal v1:**
- Multi-investor eligibility engine adapted from the archive to the JSONB `investor_criteria` schema.
- normalize → basic checks → leverage matrix → rate adjusters pipeline.
- `/dashboard/evaluate` form-and-results page, `/dashboard/evaluate/[id]` deep-link, `/dashboard/evaluate/investors` admin with JSON criteria editor.
- 3 sample investor configs seeded against prod (Colchis-style, Oakhurst-style, Mandalay-style).

**Investor handoff (the NPLA centerpiece):**
- `src/lib/handoff/builder.ts` assembles a HandoffDocument from the validation graph (with verified_flips overlaying track_record where deed-confirmed).
- exceljs Cover + Properties workbook (`/api/handoff/[id]/excel`).
- Server-rendered printable HTML (`/handoff/[id]`) with @page rules + branded styling.
- `HandoffCard` on validation detail with preparer info + narrative editor + Excel/PDF buttons.
- Manual fields stored on `borrower_validations.handoff_data` jsonb (00013).

**Continuous monitoring:**
- `monitor_subscriptions` + `monitor_runs` (00014).
- Vercel cron daily at 09:00 UTC; per-subscription cadence (daily/weekly/monthly).
- Re-runs Cobalt entity, CourtListener, OpenSanctions/OFAC; diffs against latest snapshot; emails recipients via Resend on `changes_found`.
- `MonitorCard` on validation detail with toggle + cadence + recipient management + run history.

**Doc ingestion:**
- `/api/ingest/borrower-doc` (lender side) — PDF / Excel / CSV → Claude extraction → `/dashboard/new` form pre-fill.
- `/api/share/[token]/extract-addresses` (borrower side) — same file types, extracts a deduped address list into the share-link textarea.

**Zillow ZHVI deviation:**
- 26,283 zip medians ingested from the public Zillow ZHVI bulk CSV.
- `market_outlier` informational risk factor when AVM is ≥2x or ≤0.5x the zip median.

**AI rerun on verified flips:**
- Share-link `/verify` route fires `regenerateAiMemoForValidation` via `after()` once verified_flips land.
- AI prompt has a dedicated VERIFIED TRACK RECORD block when flips are present.

---

## Database state (as of 2026-04-30)

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
00011_backfill_domain_entities     Backfill (no-op post-wipe but in history)
00012_fix_validation_entity_fk     Corrective FK update (also moot post-wipe)
00013_handoff_data                 borrower_validations.handoff_data jsonb
00014_monitoring                   monitor_subscriptions + monitor_runs
00015_zhvi_zips                    Zillow ZHVI by-zip median value lookup
```

**Row counts:**
- `organizations` = 1, `users` = 1
- `lenders` = ~4,300 global (FDIC banks + known-bridge denylist, org_id=null)
- `investors` = 3 sample configs in the dev org
- `zhvi_zips` = 26,283 zips with median values
- All validation/domain tables are empty until the next real run.

---

## What's shipped

| Feature | Status | Notes |
|---|---|---|
| Auth (Supabase) | Working | Signup/login |
| Validation flow | Working | Create → 4 parallel checks + sanctions sequential → detail report; populates all domain FKs |
| Entity check (Cobalt) | Working | 50-state SOS, 429 retry, cached fallback |
| Track record (Realie + Regrid + ATTOM) | Working | Owner-name search + transfer history + sale enrichment |
| Trust-but-verify (Realie) | Working | Per-address deed-chain; flips through verified_flips |
| Borrower share link | Working | Paste-or-upload addresses; AI extracts from PDF/Excel/CSV |
| GC validation (CSLB) | Working | CA only; "NOT AUTOMATED" for other states |
| Litigation (CourtListener) | Working | Federal bankruptcy + civil |
| Sanctions / PEP (OpenSanctions + OFAC SDN) | Working | Trial key expires 2026-05-28 |
| AI risk memo (Claude) | Working — rules-driven | Receives factor list + deterministic tier; risk_rating hard-overwritten server-side |
| Risk-tier rebuild (Why this rating?) | Working | Deterministic factors, override-and-rerun via POST /api/signals; signal write triggers memo regen |
| Module 1 — Evaluate Deal | Working | Multi-investor eligibility engine, JSONB criteria_value rules, leverage matrix + adjusters |
| Investor handoff (Excel + PDF) | Working | exceljs workbook + printable HTML at /handoff/[id]; manual fields editable on validation detail |
| Continuous monitoring | Working | Vercel cron daily 09:00 UTC; per-sub cadence; emails on changes_found via Resend |
| Doc ingestion (lender side) | Working | PDF/Excel/CSV → Claude extraction → /dashboard/new pre-fill |
| Share-link upload | Working | Borrower can upload PDF/Excel/CSV → addresses extracted into textarea |
| Zillow ZHVI deviation | Working | market_outlier informational factor when AVM is 2x+ or 0.5x- the zip median |
| Input sanity warnings | Working | LLC suffix on borrower, borrower not in officers |
| Stripe billing | Working | $299/$499/$799 |
| Rate limiting | Working | Token-bucket on API routes |
| Usage metering | Working | Every vendor API call logged |

---

## Next session — what to pick up

The Now lane and every code-buildable Pre-NPLA item is shipped and deployed.
What's left is external- or content-bound:

**Pre-NPLA, blocked-or-content:**
- **Insignia testimonial / case study.** Ask Damon for a quotable line —
  hours saved per loan, false positives caught, deal-quality signals
  surfaced. Distribution-multiplier per the strategy thesis (every NPLA
  meeting opens with "Insignia uses this and says X"). Highest-leverage
  thing left.
- **Demo deal preparation.** Pre-load 2-3 polished borrower validations
  (real or synthetic but realistic) that produce rich, clean output across
  all pillars. Must work flawlessly — no Cobalt rate limits, no missing
  data, no "trust me, normally it works." These are the demos walked into
  NPLA meetings.
- **Demo collateral.** Three talk tracks (lender / fund / consulting),
  one-page PDF leave-behind, trial-start mechanic.
- **TransUnion address validation.** Adapter is ~1 day once Noah's logins
  land. Keep watching for them.
- **Background-check provider scoping.** LexisNexis / Westlaw / Unicourt
  eval. Don't sign anything pre-NPLA — just identify the candidate so we
  can claim "state-court coverage coming."

**Post-NPLA / structure-dependent:** Module 1 expansion with named investor
PDFs (need actual Colchis/Oakhurst PDFs from Damon), Nexys LOS write-back
(blocked on Nexys API), state-court litigation provider integration
($500-2K/mo), multi-state GC adapters.

**Backlog ideas worth picking up if a session opens:**
- Auto-recommend supplemental conditions (e.g., "Bitcoin source + loan
  > $10M → recommend personal tax transcript"). Small rules layer on
  top of existing data.
- Operating-agreement collection adapter (for the brokered channel).
- State-specific endorsement validator (per-state research; bigger).
- ICP picker (Bridge / Bank / DSCR / Brokered / Private credit) — defer
  until a non-Bridge customer asks.

If the user opens with "what's next?" and there's no specific ask, the
right answer is to push for **Insignia testimonial collection** + locking
in 2-3 polished demo deals — those two unblock NPLA more than any
additional code.

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

| Check Type | Primary | Fallback | Env Var | Status |
|---|---|---|---|---|
| Entity | Cobalt | Cached (`liveData=false`) | `COBALT_INTELLIGENCE_API_KEY` | Working |
| Track Record (search) | Realie | Regrid → stub | `REALIE_API_KEY`, `REGRID_API_TOKEN` | Working |
| Track Record (enrichment) | ATTOM | Skip | `ATTOM_API_KEY` | Working |
| Track Record (verify by address) | Realie | (none) | `REALIE_API_KEY` | Working |
| GC | CSLB (CA only) | NOT AUTOMATED for others | None | Honest |
| Litigation | CourtListener | Stub | `COURTLISTENER_API_TOKEN` | Federal only |
| Sanctions / PEP | OpenSanctions | OFAC SDN direct (free) | `OPENSANCTIONS_API_KEY` | Trial expires 2026-05-28 |

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

---

## Vercel cron + monitoring

- `vercel.json` declares a daily `0 9 * * *` cron at `/api/cron/monitor`.
- The route reads due `monitor_subscriptions` (next_run_at <= now,
  enabled=true), batches up to 25/run, dispatches `runSubscription`,
  emails recipients via Resend on changes_found.
- Set `CRON_SECRET` env if Vercel injects it; route accepts no auth header
  if env is unset, but rejects mismatched bearer if env is set.
- Set `RESEND_API_KEY` and optionally `RESEND_FROM_EMAIL` for emails.
- Set `NEXT_PUBLIC_APP_URL` for the validation link in monitoring emails.

---

## Reference paths

- **Module 1 archive (already ported, retained for reference):** `/Users/zachwade/code/archive/pulseclose-archived` — `evaluate-engine.ts`, `eligibility-tab.tsx`, API + tests, design spec at `bridge-platform/modules/investor-eligibility.md`, HTML prototype.
- **Original archive (pre-PulseClose):** `/Users/zachwade/BridgeFlow_archived`
- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production URL:** https://app.pulseclose.com
- **Vercel project ref:** pulseclose. Auto-deploy on push to main is wired up. Push to main = production deploy. CLI `vercel --prod --yes` available as manual fallback.
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose

---

## Operations notes

- **OpenSanctions trial expires 2026-05-28.** After that it falls back to OFAC SDN direct (free). Renew or upgrade before then.
- **Cobalt key** rotation: current key `CgiH9xQq…` (40 chars). Rotate when usage cap hits. Test with curl before assuming a new key works — Cobalt's dashboard counter is unreliable.
- **Deploys:** `git push origin main` triggers a production deploy automatically. CLI `vercel --prod --yes` available as manual fallback.
- **Supabase migrations:** `supabase db push` after creating new files in `supabase/migrations/`. CLI installed via Homebrew at `/opt/homebrew/bin/supabase`. Login persists per machine (`supabase login`).
- **Database wipes** (if needed during dev): REST API DELETEs in dependency order — `borrower_validations` first cascades most children. See session-2026-04-29 transcript for the curl pattern.
- **Test Co counter** reset: see `~/.claude/projects/-Users-zachwade-PulseClose/memory/reference_supabase_lookup.md` for one-liner. Org id `9e580f59-b01d-4cbd-a950-76dd4f32ee6c`.
- **Refresh ZHVI** monthly (~16th when Zillow republishes): `set -a; source .env.local; set +a; npx tsx scripts/ingest-zhvi-zips.ts`.

---

## Critical context for next session

- **Path B data model is committed to.** Borrowers, entities, properties, lenders are first-class persistent entities. Validations are snapshots. Don't propose collapsing back to text-column-only model.
- **Override-and-rerun is the product, not a workaround.** "Why this rating?" panel includes inline override actions ("Mark as primary residence") that re-derive factors and re-run the AI memo. This is shipped — don't propose alternative architectures to the same end.
- **AI never picks the tier.** The prompt says so explicitly, and `risk_rating` is hard-overwritten server-side from the deterministic tier. If a request feels like "let the AI decide tier," it's wrong; route it back through factors.ts.
- **No outside-Damon outreach pre-NPLA.** All lender/fund customer development goes through Damon. Don't propose cold outreach plans, lender interviews, or pre-NPLA marketing campaigns.
- **Capacity is unconstrained on Zach's side.** Don't sandbag estimates on capacity assumptions. The bottleneck is structure clarity (Insignia partnership), external blocks (Nexys API access, TransUnion logins, real Insignia investor PDFs from Damon), and content tasks (testimonial, demo deals), not throughput.
- **Architecture decisions over short-term shipping.** When a fast-ship choice and a clean-refactor choice present, default to clean. Product is new, legacy weight is small.
- **Investor handoff Excel/PDF is the strategic deliverable.** It's shipped, but validate against a real Insignia handoff via Damon if possible — current shape follows the 4/28 description, not a real reference.
- **Ship straight to prod via `git push origin main`** (auto-deploy). No `npm run dev` proposals.
