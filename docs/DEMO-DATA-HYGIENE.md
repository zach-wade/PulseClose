# PulseClose — Demo Data Hygiene

**Tactical reference for keeping the demo tenant clean and reproducible.**
**Last updated:** 2026-05-05.

> **What this is for:** every script, every cleanup procedure, every checklist needed to keep Test Co (or any demo tenant) in a state where you can confidently click through the full E2E flow in front of a customer or partner. Not strategic. Operational.
>
> **Sibling docs:**
> - [E2E-TEST-PLAN.md](./E2E-TEST-PLAN.md) — the 16-phase walk-through this document supports.
> - [NPLA-RUNBOOK.md](./NPLA-RUNBOOK.md) — the conference-day operating manual.
> - `pickup.md` — current state, latest commit, open decisions.

---

## 1. Canonical test borrower: Kim An Truong / TT Investment Properties LLC

**File path:** `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`

**Why this borrower:** real Insignia data. Damon provided the file in late 2025 as the test bed. Using a real borrower (vs synthetic data) means the validation pipeline exercises every adapter under realistic load — Cobalt finds an active CA entity, Realie has the deeds, OpenSanctions has noisy partial matches we have to disambiguate, and the Truong family ownership pattern (entity + co-borrower spouse + multi-property portfolio) stress-tests the canonical-name dedup logic that 00021 codified.

**Three sheets in the xlsx:**
- **Borrower Track Record** — ~30 historical flips since 2017, TT Investment Properties LLC + Kim An Truong individually.
- **Active** — 14 active Insignia loans, ~$17M outstanding, 8.5-9% rates. Includes **1310 Rosalia Ave** ($1.6M, 5/2027 maturity, 8.75%) — the canonical demo property.
- **Re-Writes** — 4 loans, $5M.

**Three critical corrections from the file** (verbatim from `pickup.md`, do not paraphrase — these are landmines):

> 1. **Real entity name is "TT Investment Properties, LLC"** — earlier tests
>    used "TT Investments" (abbreviation) which triggered noisy sanctions
>    matches against "TT International Investment Management" (UK firm).
>    Always use the full name. The two stale "TT Investments" entity rows
>    are now deleted (cascaded out via 00021 rollout).
> 2. **Co-borrower Kim Thanh Thi Truong** appears on most loans (likely
>    wife). Schema has only one `guarantor` field — use her there or leave
>    blank.
> 3. **Registered agent address per CA SOS:** `KIMAN TRUONG at 1323 ROSALIA
>    AVE` — the *1323* property, not *1310* (both are Kim's per the xlsx).

**Use this xlsx to test:**
- Doc-ingest extraction (G1.1) — drop xlsx → form pre-fills.
- Intake → deed-verify pipeline (G1.1+G2.1) — confirms `verified_flips` populates within ~30s on the detail page.
- Round-trip privacy proof (AI memo) — full names should appear in the memo, proving tokenize/depersonalize/unredact actually works end-to-end.
- Activity feed visual — the 6 retained validations from 2026-05-02 backfill the feed for visual confirmation. Do NOT delete those before a demo.

---

## 2. Fresh-tenant procedure (~10 min start-to-first-validation)

When you need a brand-new test org from zero — for a new design partner, for a clean-room reproducibility check, or to verify migration idempotency before NPLA.

### Migration order (00001 → 00025)

The migration order is fixed; run them as a stack. `supabase db push` from a clean repo applies the full sequence:

```
00001 foundation                    Core tables (organizations, users, borrowers, etc.)
00002 handle_new_user               Auto-create user/org on signup trigger
00003 ai_analysis                   ai_analysis JSONB
00004 stripe_billing                Subscription fields
00005 sanctions_screening           sanctions_checks
00006 input_warnings                input_warnings JSONB
00007 validation_summary_counts     property_count + flag_count cache
00008 verified_flips                Trust-but-verify results
00009 share_token                   Borrower share-link
00010 domain_entities               Path B refactor — 15 tables
00011 backfill_domain_entities
00012 fix_validation_entity_fk
00013 handoff_data                  handoff_data jsonb
00014 monitoring                    monitor_subscriptions + monitor_runs
00015 zhvi_zips                     Zillow ZHVI medians
00016 p0_corrections                org_id denorm + UNIQUE indexes + RPC
00017 universal_infra               documents + activity_events + storage bucket
00018 litigation_cases              Materialized litigation cards
00019 gc_summary                    Cached GC chip column
00020 internal_plan                 `internal` plan tier (unlimited)
00021 canonical_name_dedup          canonicalize_name() + generated cols + unique indexes
00022 ai_privacy                    organizations.ai_extraction_enabled toggle
00023 deal_outcomes                 E1 — outcome capture per validation
00024 investor_extractions          A1 — investor PDF extraction audit trail
00025 borrower_monitor              B1 — monitor_subscriptions.borrower_id + critical_only
```

### Spin-up procedure

```bash
# 1. Create the new tenant org via signup (or via SQL if you have service-role).
#    A signup auto-creates user + org via 00002 handle_new_user trigger.

# 2. Apply all 25 migrations on the Supabase project:
supabase db push

# 3. Seed lender + ZHVI reference data (idempotent — safe to run on existing tenants):
set -a; source .env.local; set +a
npx tsx scripts/ingest-fdic-lenders.ts     # ~3,800 banks → global lenders
npx tsx scripts/ingest-zhvi-zips.ts        # ~26K zip medians from Zillow ZHVI

# 4. Seed sample investors for the evaluate flow:
npx tsx scripts/seed-sample-investors.ts   # 3 sample investor configs

# 5. Promote the new org to `internal` plan (unlimited validations, no Stripe):
ORG_ID=<new_org_uuid> npx tsx scripts/promote-to-internal.ts

# 6. Drop the Truong xlsx → run validation. Detail page should land
#    with all four pillars green within ~60s.
```

**Time estimate:** ~10 minutes start to first validation, assuming `supabase db push` runs clean (the 00021 migration may need pre-flight cleanup — see `cleanup-canonical-duplicates.ts` below).

---

## 3. Cleanup script catalog

Every script in `scripts/` — what it does, when to use it, what NOT to delete.

### Cleanup / surgery scripts

#### `scripts/cleanup-active-duplicates.ts`

- **What:** Pre-flight cleanup for 00016's UNIQUE indexes. Detects rows that violate the new uniqueness rules before the index is created.
- **When to use:** Before re-running 00016 on a tenant that has accumulated duplicates from older code.
- **Mode:** `--dry-run` default. Inspects, reports, doesn't write. Pass `--apply` to merge.
- **Don't run on:** Tenants past 00016 — already enforced.

#### `scripts/cleanup-broken-validations.ts`

- **What:** Finds validations with empty pillar tables (`entity_checks`, `track_record_entries`, `litigation_checks` all 0 rows) — heuristic for runs that died mid-pillar via the silent-insert bug fixed in PR 13.
- **When to use:** After fixing a major insert path, when re-running broken validations isn't possible (vendor data not reproducible without re-spending API budget).
- **Mode:** Read-only by default. Pass `--delete` to actually delete.
- **CRITICAL — what NOT to delete:** **The 6 retained Truong validations from 2026-05-02 testing.** Per pickup.md: *"Not a regression — these are real test runs from the matcher/dedup work and should NOT be deleted before re-running validation tests. They are what backfill the activity_events feed for visual confirmation."* Confirm with `select id, created_at, status from borrower_validations order by created_at desc limit 10;` first.
- **Default org:** Test Co (`9e580f59-b01d-4cbd-a950-76dd4f32ee6c`). Override with `ORG_ID=<uuid>` env var.

#### `scripts/cleanup-canonical-duplicates.ts`

- **What:** Productized version of the 00021 inline merge surgery. Detects rows in `borrowers` / `entities` / `lenders` that share a `normalized_canonical` value within their dedup scope; merges by re-pointing FK references to the oldest row, then deleting duplicates.
- **When to use:** Before applying 00021's UNIQUE indexes if a tenant has accumulated duplicates that would violate the new constraints. The migration's post-apply NOTICE block surfaces the count and points here.
- **Mode:** `--dry-run` default. `--apply` to actually merge.
- **Idempotent.** Running it twice is safe; second pass finds zero dupes.

#### `scripts/find-test-co.ts`

- **What:** Diagnostic. Finds Test Co + reports plan, usage state, recent activity.
- **When to use:** Before any cleanup operation, to confirm you're targeting the right org.
- **Read-only.**

#### `scripts/promote-to-internal.ts`

- **What:** Flips an org's plan to `internal` (unlimited, non-billable, no Stripe).
- **When to use:** Setting up a new founder / QA / demo tenant. Test Co is on this plan.
- **Mode:** Idempotent (running it twice is a no-op).
- **Requires:** `ORG_ID` env var (defaults to Test Co's id).
- **Note:** `internal` plan is NOT exposed in the upgrade matrix UI (per pickup.md). Set via SQL or this script only.

### Data-inspection scripts

#### `scripts/review-validation.ts`

- **What:** Pulls full snapshot for a `validation_id` — entity, track record, litigation, sanctions, GC, AI memo, risk factors, verified flips.
- **When to use:** Debugging a specific validation that's misbehaving on the detail page.
- **Read-only.**

#### `scripts/review-validation-quick.ts`

- **What:** Compact one-screen status report — pillar counts + ai_analysis + flips.
- **When to use:** Quick "did this validation actually run?" check during a demo dry-run.
- **Read-only.**

#### `scripts/peek-truong-xlsx.ts`

- **What:** One-off — inspects the Truong intake xlsx (sheet names, row counts, column shapes).
- **When to use:** When the xlsx changes (Damon sends a new version) and you want to see what doc-ingest will encounter.
- **Read-only.**

### Data-loading scripts

#### `scripts/ingest-fdic-lenders.ts`

- **What:** Loads ~3,800 FDIC-registered banks into the global `lenders` table.
- **When to use:** New tenant setup; FDIC data refresh.
- **Idempotent.** Running again on an existing dataset upserts by `fdic_cert_id`.

#### `scripts/ingest-zhvi-zips.ts`

- **What:** Loads ~26K zip-level Zillow Home Value Index medians into `zhvi_zips`.
- **When to use:** New tenant setup. **Refresh monthly ~16th when Zillow republishes.**
- **Idempotent.** Upserts by `zip_code`.
- **Run command:** `set -a; source .env.local; set +a; npx tsx scripts/ingest-zhvi-zips.ts`.

#### `scripts/seed-sample-investors.ts`

- **What:** Seeds 3 sample investor configs for the evaluate flow.
- **When to use:** New tenant setup, or when the demo investor data has been accidentally edited.
- **Idempotent.** Upserts by name.

### Migration-support scripts

#### `scripts/preflight-00016.ts`

- **What:** Read-only orphan + duplicate scan for 00016 P0 corrections.
- **When to use:** Before applying 00016 on a fresh tenant.
- **Read-only.**

#### `scripts/verify-00016.ts`

- **What:** Post-apply verification for 00016. Checks `org_id` denormalization, UNIQUE indexes, schema_version constraints, RPC presence.
- **When to use:** After running 00016 on any tenant.
- **Read-only.**

#### `scripts/verify-00017.ts`

- **What:** Post-apply verification for 00017 universal infra (documents, activity_events, notification_preferences, storage bucket).
- **When to use:** After running 00017.
- **Read-only.**

#### `scripts/verify-rollback.ts`

- **What:** Used post-failed-migration probe. Checks state after a rolled-back migration to confirm partial-state cleanup.
- **When to use:** Only if a migration partially applied and you've rolled it back.
- **Read-only.**

#### `scripts/check-storage-bucket.ts`

- **What:** Lists Supabase storage buckets — confirms the `documents` bucket created in 00017 exists.
- **When to use:** New tenant setup verification.
- **Read-only.**

#### `scripts/backfill-litigation-cases.ts`

- **What:** Idempotent backfill for `litigation_cases` materialization (00018).
- **When to use:** After 00018 on a tenant with existing litigation_check rows that predate the materialized table.
- **Idempotent.**

---

## 4. Pre-demo checklist (60-min and 5-min versions)

Before any real demo with someone outside the founder team. Critical because Vercel auto-deploy has failed silently 2x recently (per pickup.md), Cobalt rate limits are real, and conference wifi is unpredictable.

### 60-minute version (when you have lead time)

| # | Check | How |
|---|---|---|
| 1 | Vercel last deploy status | `vercel ls pulseclose | head -5`. Confirm last commit is "Ready", not "Building" or absent. Manual fallback: `vercel deploy --prod --yes`. |
| 2 | Latest commit live | Match `git log -1 --format=%h` to the hash on the most recent Vercel "Ready" row. |
| 3 | Truong validation rerun | Drop `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx` on `/dashboard/new`. Run validation. All 4 pillars resolve within ~60s; AI memo within ~120s. Verified flips populate within ~30s. |
| 4 | AI privacy toggle = enabled | Settings → Organization → AI & Privacy. Confirm "Enabled" state. |
| 5 | Cobalt key health check | `curl -s -m 60 -H "x-api-key: $COBALT_INTELLIGENCE_API_KEY" "https://apigateway.cobaltintelligence.com/v1/search?searchQuery=tt%20investment%20properties&state=CA&liveData=true"`. Returns JSON with `results` array, not 429 / 401. |
| 6 | OpenSanctions key check | Run a fresh validation; confirm sanctions card returns clean (not "API key invalid" fallback to OFAC). |
| 7 | Last 5 activity events look clean | `/dashboard/activity`. No partial / errored events at the top. |
| 8 | Test Co plan = `internal` | `npx tsx scripts/find-test-co.ts`. Confirms unlimited, no Stripe friction during demo. |
| 9 | Print test (if first time) | Cmd+P on `/handoff/[id]` and `/validations/[id]/risk-methodology`. (One-time, before the first physical-paper demo.) |
| 10 | Browser cache cleared / fresh window | Don't demo from a session with stale state. |

### 5-minute version (when you got pulled into a demo unexpectedly)

| # | Check | How |
|---|---|---|
| 1 | Production loads | Open `https://app.pulseclose.com/dashboard` — confirm sidebar renders. |
| 2 | Truong validation exists | Click into Validations → confirm at least one Truong run is on the list. |
| 3 | AI privacy enabled | Settings tab → AI & Privacy "Enabled". |
| 4 | Activity feed populated | `/dashboard/activity` → not empty. |
| 5 | Use a retained Truong run | Don't run a fresh validation on conference wifi. Use an existing one for the live walkthrough. |

---

## 5. Post-demo cleanup

After a demo with someone **outside** the founder team. Goal: leave the tenant in a state nobody else's data is in. Do NOT delete the 6 retained Truong validations from 2026-05-02 testing.

### What to wipe

- **Any new `borrower_validations` rows** created during the demo session.
- **Any new `investors`** created during the demo (e.g. if you uploaded a fund's PDF as a demo).
- **Any new `borrowers` / `entities` / `properties`** created during the demo (cascades from validation deletion will mostly handle this; check `created_at`).
- **Any `audit_log` rows** from the demo session you don't want in long-term audit history.
- **Any `documents`** uploaded during the demo (especially borrower-side PDFs).

### SQL cleanup (run as service-role from Supabase admin or psql)

```sql
-- Replace <demo_start_ts> with the timestamp the demo started.
-- All operations scoped to Test Co; double-check before running.

-- 1. Inspect what's about to go
select id, borrower_id, status, created_at
from borrower_validations
where org_id = '9e580f59-b01d-4cbd-a950-76dd4f32ee6c'
  and created_at > '<demo_start_ts>'
order by created_at desc;

-- 2. Delete demo validations (cascades to pillar tables, verified_flips,
--    risk_factors, deal_outcomes, monitor_subscriptions for that validation)
delete from borrower_validations
where org_id = '9e580f59-b01d-4cbd-a950-76dd4f32ee6c'
  and created_at > '<demo_start_ts>';

-- 3. Delete demo investors created during the session
delete from investors
where org_id = '9e580f59-b01d-4cbd-a950-76dd4f32ee6c'
  and created_at > '<demo_start_ts>';

-- 4. Delete demo documents (especially borrower PDFs)
delete from documents
where org_id = '9e580f59-b01d-4cbd-a950-76dd4f32ee6c'
  and created_at > '<demo_start_ts>';

-- 5. (Optional) trim audit_log noise
delete from audit_log
where org_id = '9e580f59-b01d-4cbd-a950-76dd4f32ee6c'
  and created_at > '<demo_start_ts>';

-- 6. Verify Truong baseline survived
select id, created_at from borrower_validations
where org_id = '9e580f59-b01d-4cbd-a950-76dd4f32ee6c'
order by created_at asc
limit 10;
-- Expect to see ~6 rows with created_at on or before 2026-05-02.
```

### Persistent domain rows are intentionally NOT deleted

Per `cleanup-broken-validations.ts` header comment:

> *Persistent domain rows (borrowers / entities / properties / lenders / signals) are intentionally NOT deleted — they're keyed by org_id and survive validation re-runs. Re-running on the same borrower will reuse the existing domain rows via upsert.*

Same logic for post-demo: leave Kim An Truong, TT Investment Properties LLC, and the 28 properties in place. They're the domain entities the next validation will upsert into.

---

## 6. Database-state baseline (healthy demo-ready Test Co)

Copy of the row counts from `pickup.md` "Database state" section (live as of 2026-05-04). If your row counts diverge significantly from this baseline, something has been deleted or duplicated and should be investigated before a demo.

```
organizations               = 1     (Test Co, plan=internal)
users                       = 1
borrowers                   = 1     (Kim An Truong)
entities                    = 1     (TT Investment Properties, LLC)
properties                  = 28
lenders                     = 3801  global FDIC + ~17 org-scoped
investors                   = 3     sample configs (seed-sample-investors.ts)
zhvi_zips                   = 26283
borrower_validations        = 6     test runs from 2026-05-02 — DO NOT DELETE
track_record_entries        = 150
entity_checks               = 6
litigation_checks           = 12    (no litigation_cases materialized — Truong has 0 federal cases)
sanctions_checks            = 6
verified_flips              = 24    (3 owned_and_held + 20 never_owned + 1 not_found)
risk_factors                = 30    (5 active factors × 6 validations)
gc_validations              = 0     (Truong had no GC; never typed)
activity_events             = 8     (powering the B5 feed)
documents                   = 0
monitor_subscriptions       = 0
monitor_runs                = 0
notification_preferences    = 0
```

### How to verify

```bash
# Run review-validation-quick on each of the 6 Truong runs:
for id in $(supabase db query "select id from borrower_validations where org_id = '9e580f59-b01d-4cbd-a950-76dd4f32ee6c' order by created_at asc" --no-headers); do
  npx tsx scripts/review-validation-quick.ts $id
done
```

Each should report all four pillars populated + AI memo present + verified_flips count > 0 on the runs that included intake addresses.

---

## 7. Backup + restore (informal)

We don't run scheduled backups. The safety net is **Supabase point-in-time recovery (PITR)** — included on the Pro plan and configured at the project level.

### If we corrupt the demo tenant

1. **Diagnose first.** Use `scripts/find-test-co.ts` and `scripts/review-validation.ts` to confirm what's actually broken vs what's just unfamiliar. Most "corruption" is actually a single bad row, not a database-wide event.
2. **PITR option (Supabase dashboard).** Project → Database → Backups → Point-in-time recovery → choose timestamp. Restore creates a new database; you migrate the connection string. Use this only if the corruption is wide-scale (multiple tables, multiple orgs).
3. **Targeted SQL restore option.** If only Test Co is affected, faster path: pick a clean timestamp from a recent `borrower_validations` row, identify the bad inserts/updates, and roll those back manually via SQL.
4. **Last resort: rebuild Test Co from scratch.** Section 2's fresh-tenant procedure. ~10 minutes. Drop Truong xlsx → rerun validations to backfill activity feed.

### Pre-demo backup (paranoid mode)

Before a high-stakes demo (NPLA, paid-pilot kickoff):

```sql
-- Snapshot the critical tables to a side-schema for instant restore
create schema if not exists demo_backup_2026_06_22;
create table demo_backup_2026_06_22.borrower_validations as
  select * from borrower_validations
  where org_id = '9e580f59-b01d-4cbd-a950-76dd4f32ee6c';
-- Repeat for verified_flips, risk_factors, ai_analysis-bearing tables.
```

After the demo, `drop schema demo_backup_2026_06_22 cascade;`.

---

## 8. Common mid-demo failure modes + recovery

When something goes wrong in front of a customer. **Narrate, don't apologize.** The recovery path itself is part of the demo if you frame it correctly.

### Cobalt 429 (rate-limited)

**Symptom:** Entity card shows "rate-limited" sub-state; entity data not present.
**Recovery:** *"This is the rate-limit backoff path I built — when Cobalt hits its ceiling, we serve from cache and surface the adapter status so the lender knows. The rest of the validation continues."* Then point to `monitor_runs.adapter_results` story for credibility.
**Prevention:** Cobalt key rotation (NPLA Week 3 task). Cached `liveData=false` pre-loaded for any specific demo validation.

### Realie no-match on a borrower-supplied address

**Symptom:** "Address not found" on a property.
**Recovery:** Paste the canonical demo addresses (1310 Rosalia Ave, San Jose, CA 95128 — Truong's primary; 1259 Almaden / 10245 Bouvais — owned-and-held). Narrate the parser fix story (commit 8a5a043).
**Prevention:** Stick to the 3 known-good Truong addresses for live demos.

### AI memo timeout (>180s)

**Symptom:** AI memo card shows "Generating…" or blank.
**Recovery:** *"Risk factors compute deterministically — they're already done. The AI memo is the narrative layer; it'll regenerate via the toggle on the WhyThisRating panel."* Show the WhyThisRating panel; point to the regenerate trigger.
**Prevention:** `max_tokens 4096` already in place per principle 11. Pre-warm the demo validation so the memo is already cached.

### Email send failure (Resend paused / rate-limited)

**Symptom:** "Send to borrower" CTA toast shows error.
**Recovery:** *"Resend is having a moment. In a real lender flow you'd send via email; for the demo I'll just paste the URL — let me show you what the borrower sees."* Open the share link in incognito.
**Prevention:** Verify Resend status pre-demo (Section 4 checklist).

### Vercel deploy failure (last commit not live)

**Symptom:** A feature you know shipped isn't visible. Or a known bug is still present.
**Recovery:** Don't pretend. *"Hold on, let me check the deploy state."* Open Vercel dashboard, run `vercel deploy --prod --yes` if needed. While it deploys (~90s), continue with the parts of the demo that don't depend on the latest commit.
**Prevention:** Section 4 checklist — verify `vercel ls pulseclose | head -5` before any demo.

### Conference wifi drops mid-demo

**Symptom:** Page won't load, requests timeout.
**Recovery:** Switch to phone hotspot (set up pre-event). If that fails, fall back to a recorded Loom on iPad. *"Let me show you a recording I made of this exact flow — the live system is doing the same thing right now, the wifi just picked the wrong moment."*
**Prevention:** Tether ready; recorded Loom backup; demo from local cached pages where possible (open the validation detail page before wifi dies).

### OpenSanctions trial expired

**Symptom:** Sanctions card shows fallback to OFAC SDN direct (different render).
**Recovery:** *"This is the auto-fallback to OFAC direct — we built this exact path because trial keys expire. Validation continues; we just lose the broader PEP coverage until we rotate the key."*
**Prevention:** Rotate keys before 2026-05-28 (NPLA Week 5 task in NPLA-RUNBOOK.md).

### Claude returns truncated JSON

**Symptom:** "Document too large — Claude truncated" error in doc-ingest or share-extract or A1 PDF parser.
**Recovery:** *"The doc-ingest is convenience; the form takes 30 seconds either way."* Fall back to manual fill. For A1 PDF parser specifically: split the PDF into 2-3 sections and upload sequentially (criteria-key UPSERT handles the merge).
**Prevention:** Truncation defense per principle 11. `max_tokens 4096`. Don't demo with PDFs >10 pages without pre-testing.

### Stripe checkout error (paid-tier demos only)

**Symptom:** Demo trying to show a paid-tier upgrade flow; Stripe webhook lags.
**Recovery:** Use the `internal`-plan tenant for the bulk of demo. Don't demo billing live; show screenshots of the upgrade flow if asked. *"We bypass billing for the founder org — Stripe behavior is well-documented but I won't demo it on the conference wifi."*
**Prevention:** Don't demo Stripe live, period. Show the matrix and price points; route real billing conversations to a follow-up call.

---

## Appendix: Quick reference

- **Test Co org id:** `9e580f59-b01d-4cbd-a950-76dd4f32ee6c`
- **Truong xlsx:** `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`
- **Production URL:** https://app.pulseclose.com
- **Vercel project:** `buildfolios-projects-e8f9d80e/pulseclose`
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **Demo runbook:** [NPLA-RUNBOOK.md](./NPLA-RUNBOOK.md)
- **E2E test plan:** [E2E-TEST-PLAN.md](./E2E-TEST-PLAN.md)
- **Pickup state:** `pickup.md`
