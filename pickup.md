# PulseClose — Session Pickup (2026-04-29)

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

**Migrations applied (12 total):**
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
```

**Row counts:** all validation/domain tables empty. `organizations` = 1, `users` = 1.

**Schema is ready for fresh validations** to flow through the new model. New
code in Session 2 needs upsert-or-find helpers that populate the FKs on
validation creation.

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
| AI risk memo (Claude) | Working — *being rebuilt in Session 3* | Currently produces opaque tier; rules-driven rebuild pending |
| Input sanity warnings | Working | LLC suffix on borrower, borrower not in officers |
| Stripe billing | Working | $299/$499/$799 |
| Rate limiting | Working | Token-bucket on API routes |
| Usage metering | Working | Every vendor API call logged |

---

## Next session — Session 2 of data-model refactor

**Goal:** rewire the API and UI to read/write through the new domain-entity model. Without this, new validations don't populate the FKs, the new tables stay empty, and the override/risk-tier work in Session 3 has nothing to grip.

**Build steps:**
1. **Upsert-or-find helpers** — `src/lib/domain/upsert.ts` with `upsertBorrower`, `upsertEntity`, `upsertProperty`, `upsertLender`. Each takes (org_id, identifying-fields) and returns the existing record or inserts a new one.
2. **Wire validation creation** — `src/app/api/validations/route.ts` POST handler should call `upsertBorrower` + `upsertEntity` and set `primary_borrower_id` + `primary_entity_id` on the new validation row alongside the existing text fields.
3. **Wire vendor result handlers** — when entity_check / track_record_entries / litigation_check rows are written, also populate the FKs (`entity_id`, `property_id`, `lender_id`, etc.) by calling the upsert helpers.
4. **FDIC lender ingestion** — download the FDIC institutions CSV (`https://banks.data.fdic.gov/api/institutions`, free, ~6,000 records), populate `lenders` classifications. One-time + periodic refresh.
5. **Signal-write API** — endpoint `POST /api/signals` that takes `{borrower_id, property_id?, signal_key, signal_value, reason}` and inserts a `borrower_property_signals` (or appropriate table) row. Triggers re-derivation in Session 3.
6. **UI updates (light touch)** — switch reads from text columns to FK joins where it materially helps (e.g., entity badge with FK-derived SOS data; lender classification badge). The existing text columns stay populated for transition; we drop them later.

**Out-of-scope for Session 2:** the risk-tier rebuild itself (Session 3), the "Why this rating?" UI (Session 3), the override-rerun trigger logic (Session 3).

**After Session 2 + 3 complete:** Module 1 archive port, investor handoff Excel/PDF, continuous monitoring, doc ingestion, etc. — see `docs/ROADMAP.md` Pre-NPLA lane.

---

## Vendor adapter chain (unchanged from prior session)

```
src/lib/adapters/
  types.ts           Interface definitions (ValidationAdapter)
  extract.ts         Client-side extraction from raw_response JSONB
  stub.ts            Demo data adapter
  cobalt.ts          Entity + orchestrator
  realie.ts          Property search + lookupPropertyByAddress
  regrid.ts          Property search — fallback
  attom.ts           Sale history enrichment
  courtlistener.ts   Federal litigation
  cslb.ts            CA GC license
  opensanctions.ts   Sanctions / PEP screening
  ofac.ts            OFAC SDN direct CSV (free fallback)
  index.ts           Factory
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

## Critical context for next session

- **Path B data model is committed to.** Borrowers, entities, properties, lenders are first-class persistent entities. Validations are snapshots. Don't propose collapsing back to text-column-only model.
- **Override-and-rerun is the product, not just transparent factors.** When the risk-tier rebuild ships in Session 3, the "Why this rating?" UI must include inline override actions ("Mark as primary residence") that re-derive factors and re-run the AI memo.
- **No outside-Damon outreach pre-NPLA.** All lender/fund customer development goes through Damon. Don't propose cold outreach plans, lender interviews, or pre-NPLA marketing campaigns.
- **Capacity is unconstrained on Zach's side.** Don't sandbag estimates on capacity assumptions. The bottleneck is structure clarity (Insignia partnership) and external blocks (Nexys API access, TransUnion logins), not throughput.
- **Architecture decisions over short-term shipping.** When a fast-ship choice and a clean-refactor choice present, default to clean. Product is new, legacy weight is small.
- **Investor handoff Excel/PDF is the strategic deliverable.** The artifact every NPLA meeting hinges on — fund people care most about it. Build to the shape Damon described on 4/28; validate against a real Insignia handoff if Damon shares one.
