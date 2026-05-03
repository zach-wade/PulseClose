# PulseClose — Session Pickup (2026-05-02 end-of-session)

> **For session-resumption.** Strategic and architectural detail lives in the
> dedicated docs — this file orients quickly and points there.
>
> **Read these in order on session start:**
> - This file (you're here)
> - `docs/ROADMAP.md` — **journey-organized** (Stage 1 Intake → Stage 8
>   Outcome) with all old tier features (S/A/B/C/D/E/F) re-slotted into
>   stages, 11 explicit UX gaps (G1.1-G8.1), and 11 cross-cutting design
>   principles. Last meaningful edit: 2026-05-02 (Batch 1 complete + open
>   items sweep).
> - `docs/DATA-MODEL.md` — full schema incl. universal infra tables +
>   canonical-name dedup notes
> - `STRATEGY.md` — vision, market, long-shot bets
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are right now

**Standalone borrower validation platform for bridge lenders.** Multi-tenant
SaaS at app.pulseclose.com. NPLA conference is the forcing function (June
22-23, 2026; ~7 weeks out).

**Production health:** ✅ All 22 PRs since 2026-04-30 live and verified.
The 2026-05-02 testing pass with the Truong xlsx surfaced 7 bugs that
got fixed live, plus a comprehensive robustness sweep applying the new
design principles across the codebase.

**Batch 1 (close the journey) — ✅ COMPLETE.** One continuous flow from
intake to handoff to monitor to activity feed. The platform now feels
like a live workspace, not a one-shot report.

```
Batch 1 ships in order (all 2026-05-02):
  G1.1+G2.1  intake addresses → deed verify at run time         6db0fbc
  G3.1       pillar evidence above operational layer            b3bd964
  G3.2       Send share link to borrower (Resend email)         544381a
  G3.5       sidebar tools removed + page files deleted         412ae07 + 0943fc7
  G5.1       validate → evaluate CTA + URL pre-fill             ab3795e
  G6.2       evaluate → handoff hint card                       ab3795e
  Robustness sweep (max_tokens defense, Realie filter,
    sent_handoff emit, redundant button, cleanup script)        0943fc7
  B5         activity feed UI + per-detail strip + sidebar      149a3dd
```

**The matcher/dedup story** (the headline data-quality work):
```
  Address parser fix (City, ST ZIP envelope strip)              8a5a043
  Name matcher rewrite (tokenize+set, was substring)            bbd4226
  Same fix on borrower-linked-to-entity input warning           48d550e
  Canonical-name dedup migration 00021                          6bceaf0
```
This stuff is now codified as ROADMAP.md cross-cutting principles 8-11
(tokenize-and-set matching; dual-coded SQL/JS dedup keys; backfill plans
for stricter constraints; Claude truncation defense). Future code MUST
follow these — every new matcher / dedup key / Claude consumer that
violates them is on a clear path to silent failure.

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
- **PR 5 (93be452):** UX polish — handoff save-then-download, empty states,
  ZHVI null fallback factor, address-extraction 422, AI memo poll 90→180s.

### Universal infra + Tier S demo wow (6 PRs, 2026-04-30)

- **PR 6 (dc34fd5):** Migration `00017_universal_infra.sql` — `documents`
  + storage bucket + `notification_preferences` + `activity_events`.
  Helpers: `events/emit.ts`, `notifications/dispatch.ts`,
  `documents/store.ts`. Activity emission retrofitted across endpoints.
- **PR 7-11:** S1 Compare / S2 Story Mode / S3 Litigation cards / S4 GC
  inline / S5 Risk methodology PDF. Migrations 00018, 00019.

### Recovery + Quality (4 PRs, 2026-04-30 → 2026-05-01)

- **PR 12 (bf89219):** `internal` plan tier — migration `00020_internal_plan.sql`.
- **PR 13 (a29b328 + 47509a1):** silent snapshot insert failures fix.
  `src/lib/supabase/insert-or-throw.ts` wraps user-visible inserts.
- **PR 14 (9e4d733):** CRITICAL build unblock — `useSearchParams()` needs
  Suspense in Next 16. Compare page wasn't wrapped; broke prerender; PRs
  7-13 hadn't reached prod for ~9 hours.
- **`78ee8d6`:** Cobalt fetch timeout 15s → 30s.

### 2026-05-02 — Reorganization + Batch 1 + Robustness sweep + B5

- **AI memo blank-out fix (8ae2884):** v2 `risks[].severity` enum widened
  to accept `informational`; defensive coercion of unknown severities.
- **ROADMAP reorganized + sidebar cohesion (412ae07):** journey-organized
  primary navigation; 11 UX gaps as G1.1-G8.1; sidebar 7 items → 4.
- **Batch 1.1 G1.1+G2.1 (6db0fbc):** intake addresses → deed verify at
  run time. AI memo regenerates with verified-flip stats.
- **Doc-ingest truncation fix + G3.1 page reorder (b3bd964):** max_tokens
  1024 → 4096 + clearer error + pillar evidence above operational layer.
- **Batch 1.3 G5.1 + G6.2 (ab3795e):** validate → evaluate → handoff CTAs.
- **Address-parser fix (8a5a043):** strip `, City, ST ZIP` envelope.
- **VerifiedTrackRecord textarea pre-fill (cd0674c).**
- **Name-matcher rewrite (bbd4226 + 48d550e):** tokenize + set-inclusion
  for verify-core deed-chain matcher AND borrower-linked-to-entity.
- **Canonical-name dedup (6bceaf0):** migration 00021 +
  `canonicalize_name(text, strip_entity_suffixes)` Postgres function +
  `normalized_canonical` generated columns + JS `canonicalizeName` parity
  + 3 new design principles in ROADMAP.
- **G3.2 Send share link to borrower (544381a):** `POST /api/validations/[id]/send-share-link`
  + Resend email + inline form on VerifiedTrackRecord card.
- **Robustness sweep (0943fc7):** AI memo + extract-addresses max_tokens
  bumped to 4096; Realie owner-filter canonicalized; `sent_handoff`
  activity emit on Excel + PDF download paths; redundant Export PDF
  button removed; orphan tool pages deleted; `scripts/cleanup-canonical-duplicates.ts`
  productized.
- **Open-items doc sweep (1cf5f17):** new design principle 11 (Claude
  truncation defense); G2.4 address parser edge case formalized; pickup
  Open decisions expanded from 2 → 7 with NPLA-tied deadlines; new
  "Operational risk register" section.
- **B5 Activity feed UI (149a3dd):** `GET /api/activity` + `/dashboard/activity`
  feed + per-validation `<ActivityStrip />` + sidebar nav. Closes Batch 1.

---

## Action items for outside persons

Single-source list of everything blocked on someone other than Zach +
Claude. Bundle into the next Damon sync; don't ship anything that
materially depends on these without an answer.

### For Damon (Insignia)

1. **Truong xlsx — what do those 24 addresses represent?** Only 3
   (1259 Almaden, 10245 Bouvais, 7449 Willowwick) show Kim or family
   in Realie's deed chain. The other 20+ have unrelated current owners
   (KIM, AN SOON · CORONA CLAY CO · KIM, AN NGUYEN · LE, AN K · etc.)
   and Realie's transfer history shows no past Kim ownership. Two
   interpretations:
   - (a) **Realie deed-history coverage gap.** Realie has strong CA
     current-ownership but historical transfers depend on county
     scraping. Older flips Kim sold years ago may not surface.
     **C2 BatchData closes this gap.**
   - (b) **Insignia intake template lists financed-but-not-owned
     properties.** Kim could be guarantor / co-signer / fund
     contributor without ever taking deed.
   Demo narrative depends on the answer — "validates a borrower track
   record" means OWNED, not just funded.

2. **Co-borrower modeling (G1.2).** Most TT Investment Properties loans
   have Kim Thanh Thi Truong as co-borrower (likely wife). Schema is
   single-guarantor today. Does Insignia's intake flow need both names
   persisted, or is single-guarantor acceptable for v1? ~1d schema
   change + UI updates if yes. Affects whether G1.2 ships pre- or
   post-NPLA.

3. **Address parser — typical Insignia intake shapes?** `71 WEBBER WAY
   77, BUENA PARK` returned "Address not found" because `77` between
   street and city tripped the parser. What address shapes does
   Insignia typically receive (`Apt 5` / `#5` / `Unit 5` / building
   numbers)? Drives G2.4 fix priority and shape coverage.

4. **AI privacy — Insignia's actual policy?** Borrower intake docs +
   AI memos go through Anthropic. ZDR is on by default. We're shipping
   the 2-day bundle (PII redaction + depersonalized prompt + per-org
   toggle) regardless. Knowing Insignia's stance only affects whether
   we need to pursue ZDR contract or Bedrock-in-tenancy post-NPLA.

5. **Testimonial / quotable line** (from Damon or Noah). Ask through
   working sessions, don't make it a deliverable. NPLA collateral.

---

## Database state (as of 2026-05-02 end-of-session)

**Migrations applied (21 total):**
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
00021 canonical_name_dedup              canonicalize_name() + normalized_canonical
                                        generated cols + org-scoped UNIQUE indexes
```

**Row counts (live as of 2026-05-02):**
- `organizations` = 1 (Test Co, plan=internal)
- `users` = 1
- `borrowers` = 1 (Kim An Truong)
- `entities` = 1 (TT Investment Properties, LLC — 2 stale "TT Investments"
  duplicates merged + deleted during 00021 rollout)
- `properties` = 28
- `lenders` = 3801 global FDIC + ~17 org-scoped (16 duplicate Rocket
  Mortgage rows merged during 00021)
- `investors` = 3 sample configs
- `zhvi_zips` = 26,283
- `borrower_validations` = 6 (test runs from 2026-05-02 — leave or
  cleanup with `scripts/cleanup-broken-validations.ts --delete` if
  starting fresh)
- `track_record_entries` = 150
- `entity_checks` = 6
- `litigation_checks` = 12 (no `litigation_cases` materialized yet
  because nothing was a "found" CourtListener result for Truong)
- `sanctions_checks` = 6
- `verified_flips` = 24 (the Truong addresses; 3 owned_and_held + 20
  never_owned + 1 not_found)
- `risk_factors` = 30 (5 active factors × 6 validations)
- `gc_validations` = 0 (Truong had no GC; never typed)
- `activity_events` = 8 (powering the new B5 feed)
- `documents`, `monitor_subscriptions`, `monitor_runs`,
  `notification_preferences` = 0

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
   Always use the full name. The two stale "TT Investments" entity rows
   are now deleted (cascaded out via 00021 rollout).
2. **Co-borrower Kim Thanh Thi Truong** appears on most loans (likely
   wife). Schema has only one `guarantor` field — use her there or leave
   blank.
3. **Registered agent address per CA SOS:** `KIMAN TRUONG at 1323 ROSALIA
   AVE` — the *1323* property, not *1310* (both are Kim's per the xlsx).

**Use this file to test the doc-ingest + intake-deed-verify path** —
DocIngest now extracts the property addresses too (G1.1 shipped), and the
validation API runs `verifyAddresses()` in `after()` for them. Drop xlsx
→ form pre-fills → click Run → detail page lands with `verified_flips`
populated within ~30s.

---

## Manual items the user should do (post-Batch-1)

1. **Re-test Batch 1 end-to-end with B5 verification.** Drop Truong xlsx
   → run validation → on detail page, scroll to bottom: `<ActivityStrip />`
   should show created + updated events for this run. Click "See all" →
   routes to `/dashboard/activity?subject_id=<id>`.
2. **Test Activity feed at `/dashboard/activity`.** Verb-filter pills
   should work; "Load more" appears when >50 events. Day grouping shows.
3. **Test Send Share Link** (G3.2). On Truong validation, click
   "Send to borrower" on VerifiedTrackRecord card; type your own email
   + a test message; click Send. Should arrive within seconds with the
   borrower-facing share link. Activity feed gets `sent_share_link` row.
4. **Test handoff download → activity event.** Download Excel from
   HandoffCard. Activity feed gets `sent_handoff` row with
   `metadata.artifact = "excel"`.
5. **Walk the demo runbook** at
   `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md`
   (Phase 1-7). Includes the deferred print test for `/handoff/[id]`
   and `/validations/[id]/risk-methodology` — physically print to verify
   page-break / margin / color rules.
6. **NPLA pre-flight, ~1 week out:** verify all 21 migrations idempotent
   on a fresh tenant.
7. **Rotate OpenSanctions trial key** before 2026-05-28. New key in
   `OPENSANCTIONS_API_KEY` in Vercel env (and `.env.local`). Verify
   with one validation post-rotation.
8. **Rotate Cobalt API keys** for demo-day capacity (~6/10). Multiple
   keys in env; rotation logic TBD when implementing — could be
   round-robin in `src/lib/adapters/cobalt.ts` or env-swap pre-demo.

---

## What's shipped (master table)

| Feature | Status | Notes |
|---|---|---|
| Auth (Supabase) | Working | |
| Validation flow (4 pillars + sanctions) | Working | All snapshot inserts wrapped in `insertOrThrow` post PR 13 |
| Entity / Track / GC / Lit / Sanctions adapters | Working | Cobalt timeout = 30s |
| Trust-but-verify (Realie deed-chain) | Working | Address parser fixed; name matcher canonical |
| **Intake addresses → deed-verify at run time (G1.1)** | Working | DocIngest pre-fills textarea; verifyAddresses() runs in after() |
| Borrower share link (paste + xlsx/pdf upload) | Working | 422 on extraction failure; max_tokens 4096 |
| **Send share link to borrower (G3.2)** | Working | Resend email; activity event emitted |
| AI risk memo — Story Mode v2 | Working | Dual renderer; informational severity supported; max_tokens 4096 |
| Risk-tier rebuild + override-and-rerun | Working | Atomic recompute via RPC |
| Module 1 — Evaluate Deal | Working | Pre-fill from URL params; "evaluate against my investors" CTA |
| Investor handoff (Excel + PDF) | Working | Save-then-download; sent_handoff activity event |
| **Validate → evaluate → handoff CTAs (G5.1+G6.2)** | Working | Detail page → evaluate (pre-filled) → handoff prompt |
| Continuous monitoring | Working | Per-adapter status, 1h rate-limit backoff |
| Doc ingestion (lender side) | Working | xlsx/pdf/csv; max_tokens 4096; address extraction wired |
| Share-link upload | Working | max_tokens 4096 |
| Zillow ZHVI deviation + unavailable factor | Working | |
| Comparative borrower view (S1) | Working | Wrapped in Suspense |
| Story Mode AI memo (S2) | Working | v2 with strengths/risks/recs |
| Litigation case cards (S3) | Working | Materialized + filter chips |
| GC inline summary (S4) | Working | Desktop column + mobile inline |
| Risk methodology PDF (S5) | Working | `/validations/[id]/risk-methodology` |
| **Activity feed UI (B5)** | Working | `/dashboard/activity` + per-detail strip + sidebar |
| **Pillar evidence above operational layer (G3.1)** | Working | Pillars between WhyThisRating and Handoff |
| **Sidebar cohesion (G3.5)** | Working | 4 nav items (Validations / Activity / Evaluate / Investors / Usage); standalone tool pages deleted |
| **Canonical-name dedup (00021)** | Working | borrowers / entities / lenders dedup-keyed by canonical token-sorted form |
| **Tokenize-and-set name matcher** | Working | verify-core + validations/route + realie owner-search filter |
| Stripe billing | Working | $299 / $499 / $799 + `internal` (unlimited, SQL-only) |
| Test Co `internal` plan | Live | Unlimited validations for the founder org |
| Sanctions card "Names Screened" | Working | Now includes officers/agent derived from matches |
| Insert-error surfacing | Working | `src/lib/supabase/insert-or-throw.ts` wraps user-visible inserts |
| Rate limiting | Working | |
| Usage metering | Working | |

---

## Open decisions / questions for the user

1. **AI privacy** — ✅ DECIDED 2026-05-02: ship the 2-day bundle
   (PII redaction on doc ingestion + depersonalized AI memo prompt +
   per-org `ai_extraction_enabled` toggle) before A1. Sub-decision still
   open: redact pre-prompt-build (cleaner) vs. post-process Claude
   output (riskier) — pick when starting the bundle. Insignia's actual
   policy still pending Damon (see Action items #4); only affects
   whether we pursue ZDR contract or Bedrock-in-tenancy post-NPLA.

2. **Print-CSS physical test** — `/handoff/[id]` and
   `/validations/[id]/risk-methodology` print rules look right in
   DevTools but page-break behavior under real printer drivers has
   never been physically verified on paper. Deferred manual item from
   PR 5. ~30 min with a printer. Should happen before NPLA.

3. **OpenSanctions trial (expires 2026-05-28)** — ✅ DECIDED 2026-05-02:
   rotate keys to extend trial coverage. System auto-falls-back to
   OFAC SDN direct (free) if a key fails, so even if rotation stops
   working we degrade gracefully (not silently — `monitor_runs.adapter_results`
   surfaces fallback). Re-evaluate paid tier post-NPLA if Insignia
   demos start showing sanctions coverage gaps.

4. **Cobalt rate limits during demo days** — ✅ DECIDED 2026-05-02:
   rotate keys across multiple Cobalt accounts for demo-day capacity.
   Cobalt remains the only SOS scraper provider; if rotation hits
   ceiling during a live demo, fall back to cached `liveData=false`
   pre-loaded for the validation in question.

5. **Co-borrower / multi-guarantor schema (G1.2)** — moved to
   Action items for outside persons (Damon decision). See above.

---

## Next session — what to pick up

**Batch 1 — close the journey: ✅ COMPLETE.** All 7 items shipped including
B5 Activity feed UI (149a3dd). The platform now has a continuous flow
from intake to handoff to monitor to activity feed.

**Recommended next pick:** **AI privacy 2-day bundle** (Open decisions #1
— stance decided 2026-05-02). Implement PII redaction on doc ingestion
+ depersonalized AI memo prompt + per-org `ai_extraction_enabled`
toggle. Sub-decision when starting: pre-prompt-build redaction (cleaner)
vs. post-process Claude output (riskier) — recommend pre-prompt-build.
This unblocks A1.

**Then Batch 2 — Tier A capital stickiness + outcome substrate (8-10d):**
- **A1 — Investor PDF parser** (3d) — NPLA hero feature. Fund manager
  uploads guidelines PDF → Claude extracts criteria → preview → save.
  Damon can demo this live with a real fund's PDF.
- **E1 — Deal outcomes capture** (1d) — blocker for everything
  reputation/performance. Validation detail "Update deal status" button
  with statuses: Withdrawn / Funded / Extended / Repaid / Defaulted.
- **A2 — Counter-offer / repricing calculator** (2d).
- **A3 — Borrower capital-availability PDF** (1.5d).
- **B1 — Borrower watchlist (one-click monitor)** (0.5d).

**Smaller fillers (any time):**
- **Address parser edge cases (G2.4, 0.5d).** Handle `71 WEBBER WAY 77`
  and similar — single small case left from the Truong test.
- **Cobalt entity-name normalizer (~1h).** Adopts the canonical pattern;
  removes noisy "Registered name X differs from search Y" warnings.
- **Confidence-score audit + tooltip (G4.2, 0.5d).** Bare percentage
  today; needs hover with contributing signals OR rename to "Validation
  completeness".
- **Methodology PDF download (G4.1, 0.5d).** Today opens new tab needing
  Cmd+P; should be one-click download via server-render to PDF.

**If asked "what's next?" without direction:** decide AI privacy stance
(Open #1), then ship A1. Both block the highest-leverage NPLA demo
moment.

---

## Vendor adapter chain

```
src/lib/adapters/
  types.ts           Interface definitions (ValidationAdapter)
  extract.ts         Client-side extraction from raw_response JSONB
  stub.ts            Demo data adapter
  cobalt.ts          SOS entity adapter (Cobalt scrapes; we don't)
  realie.ts          Property search + lookupPropertyByAddress
                     owner filter uses canonical token-subset (0943fc7)
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
| Entity | Cobalt (30s timeout) | Cached (`liveData=false`) | `COBALT_INTELLIGENCE_API_KEY` | Working; rate-limit risk for demos |
| Track Record (search) | Realie | Regrid → stub | `REALIE_API_KEY`, `REGRID_API_TOKEN` | Working |
| Track Record (enrichment) | ATTOM | Skip | `ATTOM_API_KEY` | Working |
| Track Record (verify) | Realie | (none) | `REALIE_API_KEY` | Working |
| GC | CSLB (CA only) | NOT AUTOMATED for others | None | Working |
| Litigation | CourtListener | Stub | `COURTLISTENER_API_TOKEN` | Federal only |
| Sanctions / PEP | OpenSanctions | OFAC SDN direct | `OPENSANCTIONS_API_KEY` | **Trial expires 2026-05-28** |

## Other key library modules

```
src/lib/domain/upsert.ts             borrower/entity/property/lender + linkBorrowerToEntity
                                     canonicalizeName() mirrors SQL canonicalize_name()
src/lib/risk/factors.ts              Pure compute: 9 factors + tier rule
src/lib/risk/persist.ts              Atomic recompute via RPC
src/lib/ai/analysis.ts               v2 Story Mode prompt; max_tokens 4096
src/lib/ai/regenerate.ts             Memo regen helper
src/lib/evaluate/engine.ts           Module 1 — multi-investor eligibility
src/lib/handoff/builder.ts           HandoffDocument assembly
src/lib/handoff/excel.ts             exceljs workbook generator
src/lib/monitor/runner.ts            Continuous monitoring + adapter_results tracking
src/lib/email/resend.ts              Resend wrapper
src/lib/litigation/extract.ts        CourtListener raw → ExtractedCase
src/lib/litigation/materialize.ts    Upsert litigation_cases for a validation
src/lib/gc/summary.ts                buildGCSummary for the dashboard chip
src/lib/events/emit.ts               activity_events emission; ActivityVerb union
src/lib/notifications/dispatch.ts    notification_preferences fan-out
src/lib/documents/store.ts           Supabase storage upload + documents row
src/lib/schemas/jsonb.ts             Zod schemas for every JSONB column
src/lib/schemas/api.ts               Zod schemas for API request bodies
src/lib/async/with-error-log.ts      Helper for after()-callback bodies
src/lib/supabase/insert-or-throw.ts  Surface silent insert/update failures
src/lib/track-record/verify-core.ts  Deed-chain matcher (tokenize + set-compare)
                                     parseAddressForState (handles , City, ST ZIP envelope)

src/components/dashboard/activity-feed.tsx    ActivityFeed + ActivityFeedCard renderers
src/components/dashboard/activity-strip.tsx   Per-validation feed card; auto-hides empty
```

## Scripts

```
scripts/ingest-fdic-lenders.ts          ~3,800 banks → global lenders (idempotent)
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
scripts/cleanup-canonical-duplicates.ts Productized 00021 duplicate-merger
                                        (dry-run default; --apply to execute)
scripts/review-validation.ts            Pull full snapshot for a validation_id
scripts/review-validation-quick.ts      Compact one-screen status report —
                                        pillar counts + ai_analysis + flips
scripts/peek-truong-xlsx.ts             One-off — inspect the Truong intake xlsx
```

---

## Critical context for next session

- **Velocity is days, not weeks.** Twenty-two PRs (P0 + universal infra +
  Tier S + recovery + Batch 1 + robustness sweep + B5) shipped end-to-end
  across two sessions.
- **CHECK BUILD STATUS in Vercel after every push.** PR 7-13 didn't reach
  production for ~9 hours because Compare page broke prerender. Even
  with builds passing locally, **Vercel auto-deploy hooks have failed
  silently twice this session** — the manual fallback `vercel deploy
  --prod --yes` is necessary when `vercel ls pulseclose | head -3`
  doesn't show a recent Building / Ready row after `git push`.
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
  `insertOrThrow` from `src/lib/supabase/insert-or-throw.ts`.
- **Dedup keys are canonical, not literal.** Borrower / entity / lender
  dedup uses `normalized_canonical` (Postgres `canonicalize_name()`
  generated column) + JS `canonicalizeName()` mirror in `upsert.ts`.
  Drift between SQL and JS creates infinite duplicates instead of dedupes.
  See ROADMAP cross-cutting principles 8-10.
- **Vendor data ↔ lender input matching uses tokenize+set, never
  substring.** Names (Realie format vs lender format), entity names
  (with vs without LLC), addresses — all use canonical token comparison.
  Substring on lowercased + space-stripped strings is the wrong primitive
  and will silently break demos. See ROADMAP cross-cutting principle 8.
- **Any place we `JSON.parse` a Claude response is a truncation hazard.**
  Use `max_tokens: 4096` minimum, inspect `stop_reason` post-call,
  surface "Document too large — Claude truncated" instead of generic
  parse errors. See ROADMAP cross-cutting principle 11.
- **AI Story Mode v2 is the default for new validations.** Old v1 reads
  fall back through the dual renderer.
- **Override-and-rerun is the product.** Risk factors recompute atomically
  via the `recompute_risk_factors_atomic` RPC.
- **AI never picks the tier.** `risk_rating` is hard-overwritten server-side
  from the deterministic tier post-AI parse.
- **Test Co is on the `internal` plan** (unlimited validations, no Stripe).
- **Cobalt = our SOS scraper provider** (we don't have our own scraper).
  30s fetch timeout. CA SOS via Cobalt can be the slowest. Rate-limit
  risk for demo days.
- **Real Truong test data:** entity is `TT Investment Properties, LLC`,
  borrower is `Kim An Truong`, xlsx at
  `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`.
- **Ship straight to prod via `git push origin main`** (auto-deploy when
  it works). `supabase db push` for migrations. Test Co is a real-data
  test bed.

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

- **OpenSanctions trial expires 2026-05-28** (~26 days). After that it
  falls back to OFAC SDN direct (free). Renew or upgrade before then.
  See Open decisions #3.
- **Cobalt key:** rotate when usage cap hits. Direct API call to verify
  health: `curl -s -m 60 -H "x-api-key: $COBALT_INTELLIGENCE_API_KEY"
  "https://apigateway.cobaltintelligence.com/v1/search?searchQuery=...&state=CA&liveData=true"`.
- **Deploys:** `git push origin main` triggers production auto-deploy
  WHEN the webhook fires. **Vercel has failed to auto-deploy 2x this
  session — always confirm with `vercel ls pulseclose | head -3` and
  fall back to `vercel deploy --prod --yes` if no new build appears.**
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
- **Multi-borrower validations (G1.2)** — Kim Thanh Thi Truong
  (co-borrower on most TT Investment Properties loans) can't be modeled
  cleanly today; schema is single guarantor. Damon-decision item — see
  Open decisions #5.
- **Existing pre-PR-13 validations** in any tenant that ran during the
  ~24h silent-insert window have empty pillar tables and can't be back-
  filled (vendor data not reproducible without re-spending API budget).
  Cleanup: `npx tsx scripts/cleanup-broken-validations.ts --delete`.
- **Print CSS on `/handoff/[id]` and `/validations/[id]/risk-methodology`**
  has not been physically tested on real paper. The print rules look
  right in DevTools but page-break behavior under real printer drivers
  needs a one-time manual check. See Open decisions #2.
- **AI privacy posture** — see Open decisions #1 + #6. Today every
  borrower name + property + sanctions match goes through Anthropic's
  Claude. ZDR is on the contract by default; Insignia hasn't been asked
  their stance. **Decide before A1 (Investor PDF parser).**
- **Person-name 2-token false-positive limit.** Token-set matcher treats
  `"Kim An"` ⊆ `"An Soon Kim"` as a match. Real fix requires DOB / SSN /
  address fingerprinting. Documented in ROADMAP.md → Data integrity. Not
  a bug, but the demo narrative should not lean on 2-token matches.
- **`address_normalized` not USPS-canonical.** Same property ingested in
  different formats creates duplicate property rows. Tracked in ROADMAP.md
  Foundations. ~1-2d when worked. Mitigation: prefer Realie's `addressFull`
  as canonical when available.
- **Address parser edge cases (G2.4)** — `71 WEBBER WAY 77, BUENA PARK`
  returned "Address not found" because the `77` between street and city
  tripped the parser. Fix: tokenize → identify state-code anchor → strip
  everything between, OR fall through to Realie with raw input on parse
  failure. ~0.5d.
- **6 retained borrower_validations rows from 2026-05-02 testing.** Not a
  regression — these are real test runs from the matcher/dedup work and
  should NOT be deleted before re-running validation tests. They are
  what backfill the activity_events feed for visual confirmation. If
  starting genuinely fresh, delete via
  `npx tsx scripts/cleanup-broken-validations.ts --delete`.

---

## Operational risk register (NPLA pre-flight checklist)

Items to run/check/decide before NPLA. Most are not on the roadmap as
"build" items — they're operational. Order by deadline.

| Date | Item | Action | Owner |
|---|---|---|---|
| Now | AI privacy 2-day bundle | ✅ Decided. Ship PII redaction + depersonalized prompt + per-org toggle before A1 starts. | Claude |
| ~5/27 | OpenSanctions key rotation | ✅ Decided. Rotate trial keys; auto-falls-back to OFAC if rotation fails. | User |
| ~6/10 | Cobalt key rotation for demo | ✅ Decided. Rotate across multiple keys; cached `liveData=false` as backstop for any single demo validation. | User |
| ~6/15 | Print test (CSS on paper) | Print `/handoff/[id]` + `/validations/[id]/risk-methodology` on real paper, fix any margins/page-breaks | User |
| ~6/15 | Migration idempotency on fresh tenant | Spin up a 2nd test org, run all 21 migrations clean, validate one xlsx through full flow | User OR Claude via script |
| ~6/15 | Demo collateral | One-page leave-behind, 3 talk tracks (lender / fund / consulting), trial-start mechanic | User |
| Next Damon sync | Outside-person bundle | Walk through Action items #1-5: Truong xlsx interpretation, co-borrower schema, address shapes, Insignia AI policy, testimonial ask | User + Damon |
| ~6/20 | Demo dry-run with Damon | Walk the runbook end-to-end, time it, identify rough edges | User + Damon |
