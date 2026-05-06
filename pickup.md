# PulseClose — Session Pickup (2026-05-05 EOS — Batch 3 + filler set complete)

> **For session-resumption.** Strategic and architectural detail lives in the
> dedicated docs — this file orients quickly and points there.
>
> **Read these in order on session start:**
> - This file (you're here)
> - `docs/ROADMAP.md` — **journey-organized** (Stage 1 Intake → Stage 8
>   Outcome) with all old tier features (S/A/B/C/D/E/F) re-slotted into
>   stages, **12** cross-cutting design principles (#12 added 2026-05-05
>   covering AI-privacy-bundle as required gate on every Claude consumer).
>   Status snapshot last updated 2026-05-04.
> - `docs/DATA-MODEL.md` — full schema incl. universal infra tables +
>   canonical-name dedup notes
> - `STRATEGY.md` — **fully rewritten 2026-05-05.** Wade Intel parent
>   brand context, current product state through Batch 2, Path B + JSONB
>   architecture, distribution thesis, IP/partnership posture, pricing
>   hypotheses, forward roadmap.
> - `docs/DISTRIBUTION-STRATEGY.md` — **NEW 2026-05-05.** The 2026
>   distribution playbook (replaces lead role of seo-strategy.md).
>   Wade Intel + Build Buy Borrow + 5-Concept Framework + PulseClose stack.
> - `docs/E2E-TEST-PLAN.md` — **NEW 2026-05-05.** 17-phase customer
>   walkthrough of every surface for pre-NPLA smoke testing.
> - `docs/PRIVACY-POSTURE.md` — **NEW 2026-05-05.** Insignia-answerable
>   Q&A + AI privacy bundle + SOC 2 gap inventory.
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are right now

**Standalone borrower validation platform for bridge lenders.** Multi-tenant
SaaS at app.pulseclose.com. NPLA conference is the forcing function (June
22-23, 2026; ~7 weeks out).

**Production health:** ✅ All commits since 2026-04-30 live and verified.

---

## ✅ RESOLVED 2026-05-05 — Anthropic Cloud routine + environment investigation

**Status:** Investigation complete. User decided to keep the monthly WP refresh routine + add WP secrets to the Build-Folio env. The 4 prior build-folio routines are legitimate and will be left alone.

### What was found

- **The "Build-Folio" environment** (`env_01RNWmw8TJ4rZMPEAfpRTjTk`) is legitimate and was provisioned on the user's account before any Claude session created routines against it. Verified by inspecting `~/.claude/projects/-Users-zachwade-code-active-build-folio/9ded08ea-...jsonl` — at the very first `/schedule` invocation (2026-05-01T06:54:47Z, build-folio session) the env was already enumerated by the skill. No session called create-environment via API. Most likely auto-provisioned the first time the user enabled Claude Code on the web with name auto-derived from the repo, or manually added via the in-session UI and forgotten.
- **The environments UI exists, just not where the user looked.** Per https://code.claude.com/docs/en/claude-code-on-the-web#configure-your-environment, environment management lives at **claude.ai/code → enter any session → click the environment selector at top of chat → "Add environment" or settings icon next to existing env**. There is NO top-level "Settings → Environments" page. console.anthropic.com is unrelated (that's the API platform).
- **Available on Max.** Routines + cloud environments are research-preview but available on Pro/Max/Team/Enterprise per docs.
- **Secrets format:** `KEY=value` per line, no quotes. No dedicated secrets store yet — visible to anyone who can edit the env. Fine for single-user accounts.
- **No API for env CRUD.** `RemoteTrigger` only manages routines. Environments are web-UI only. Routine deletion is also browser-only at https://claude.ai/code/routines.

### Action item still pending — user must do manually

**Add WP secrets to Build-Folio env before 2026-06-01 14:08 UTC:**

1. claude.ai/code → enter any session → click env selector at top of chat
2. Find Build-Folio in dropdown → click settings/gear icon
3. In Environment variables field, paste (values from `.env.local`):
   ```
   WP_URL=<from .env.local>
   WP_USER=<from .env.local>
   WP_APP_PASSWORD=<from .env.local>
   ```
4. Save

If not done by 6/1, routine will fail-clean ("missing env vars" abort per prompt) — no harm, just a no-op cloud session.

### What's currently provisioned (verified via `RemoteTrigger list` 2026-05-05)

**5 routines on user's account `59fd52c9-a602-4ed9-b946-25849ab4be2b`:**

| Routine ID | Name | Created | Repo | Status |
|---|---|---|---|---|
| `trig_01354yHreiPenFJ94aD196vK` | "MEMPROF cleanup — disable on build-folio-worker if still set" | 2026-05-01 06:55Z | build-folio | scheduled 5/8 |
| `trig_01RFD8xVQxpJVjd67XEHp2Hw` | "Build-Folio Phase 3a verification + worker drain check" | 2026-05-02 04:36Z | build-folio | run_once_fired |
| `trig_01MhTqfoJRhbkQ8zjUELRjk9` | "Phase 2 verification + Phase 1 PR 5 cleanup" | 2026-05-02 08:37Z | build-folio | scheduled 5/8 |
| `trig_01E9avoEkgamHt3j2cyhxTpY` | "Storage fix 24h soak verification (commit 3ec9dc1b)" | 2026-05-02 09:49Z | build-folio | run_once_fired |
| **`trig_017PQNaJ2eN6X86T7bo6Zu7Y`** | **"Monthly WP content refresh (GEO recency lift)"** | **2026-05-05 23:30Z** | **PulseClose** | **scheduled 6/1 14:08Z** |

All attached to `env_01RNWmw8TJ4rZMPEAfpRTjTk` (Build-Folio). The 4 build-folio routines are legitimate session work and were left in place.

**Batch 1 (close the journey) — ✅ COMPLETE 2026-05-02.** One continuous
flow from intake to handoff to monitor to activity feed.

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

**AI privacy 2-day bundle — ✅ SHIPPED 2026-05-03.** Per-org
`ai_extraction_enabled` toggle, regex PII scrub on text doc inputs,
token-based depersonalization for the AI memo (Claude never sees
borrower / entity / property names in the memo path). 5 audit-pass
fixes including a critical address-shortening leak that synthetic
round-trip testing surfaced.

```
AI privacy bundle:
  00022 + check-enabled + redact-pii + redact + settings UI    4515531
  Audit-pass fixes (fail-closed, alias forms, leak scan)        a277c23
```

**Batch 2 (capital stickiness + outcome substrate) — ✅ COMPLETE
2026-05-04.** Three features in sequence:

```
Batch 2 ships in order (all 2026-05-04):
  E1   Deal outcomes capture (00023 + dual-log + DealOutcomeCard)  27a31f4
  A1   Investor PDF parser (00024 + extract.ts + extract-modal)    3f36429
  B1   Borrower watchlist (00025 + critical_only + inheritance)    3d2c273
```

E1 unlocks E2/E3/A4/A5 (everything reputation/performance). A1 is the
NPLA hero feature — Damon can demo a real fund's PDF live. B1 closes
G7.1 (lock-in evaporation when lender forgets to enable monitoring).

**Batch 3 + filler set — ✅ COMPLETE 2026-05-05 EOS.** Ten features
in sequence, end of day after the doc-engine push and routine
investigation:

```
Batch 3 + filler ships in order (all 2026-05-05):
  A2   Counter-offer / repricing calculator                       7b344bc
  A3   Borrower capital-availability PDF                          c48049e
  B2   Portfolio health dashboard (/dashboard/portfolio)          aa2ee49
  B3   Validation search + filter + CSV export                    907f550
  G2.4 Address parser (WEBBER WAY 77 + missing state)             34fe15e
  G4.1 Methodology PDF one-click download (?print=1 autoprint)    c1b9c56
  G4.2 Confidence → "Completeness" + audit tooltip                76e4b91
  G3.4 Add GC after the fact on validation detail                 3605592
  G7.1 Org-level monitor-by-default (00026)                       e709a23
  G7.2 "Next run in N hours" indicator on MonitorCard             70b29e8
```

A2 + A3 round out the evaluate → handoff arc (counter-offer
suggestions inline + borrower-facing one-pager). B2 is the
"first thing the lender opens in the morning" view at
`/dashboard/portfolio` — KPI strip + tier mix + outcome mix + 12-row
attention list. B3 puts top-of-dashboard search + status/tier chips
+ CSV export on the validations list. G2.4 fixes the Truong-test
address parser (`71 WEBBER WAY 77, BUENA PARK` now resolves). G4.1
turns the methodology download into one click. G4.2 fixes the
misleading "Confidence" label (it's signal completeness, not a
model score). G3.4 lets a lender add a GC to an existing validation
without re-running. G7.1 + G7.2 tighten the monitoring loop:
org-level "auto-monitor every new validation" toggle + relative
"in 3d" countdown.

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

### 2026-05-03 — AI privacy 2-day bundle (a277c23)

- **00022 + check-enabled (4515531):** per-org `ai_extraction_enabled`
  toggle (default true; orgs opt OUT). `requireAiEnabled(orgId)` gates
  every Claude call (borrower-doc, share-extract, AI memo). 503 with
  code `AI_DISABLED` for the UI to handle. Settings page gets an "AI &
  Privacy" card on the Org tab.
- **redact-pii.ts (4515531):** regex-based scrub of SSN / phone / email
  from text-derived doc inputs (xlsx / csv / txt). Counts logged.
  PDFs ride the per-org toggle — pre-extracting text would lose table
  structure.
- **redact.ts + analysis.ts (4515531):** token-based depersonalization.
  borrower / entity / guarantor / registered_agent / property /
  lender / GC / litigation party / sanctions match names get replaced
  with `[[TOKEN]]` placeholders BEFORE the prompt is sent. Parsed
  response walked + unredacted before storage. Leftover-token scan
  catches model-side token corruption.
- **Audit-pass fixes (a277c23):** 5 bugs caught reviewing critically.
  Fail-CLOSED on lookup error (was fail-open, would have leaked PII
  during DB hiccups). Schema example aligned with token instruction
  (was contradicting). Settings UI honestly calls out the PDF gap.
  CRITICAL leak: `1310 Rosalia Ave` (street form) wasn't caught by the
  full-form `1310 Rosalia Ave, San Jose, CA 95128` map entry — added
  `addressVariants()` (street alias) + `entityVariants()` (legal-suffix
  stripped alias). byToken map switched to first-write-wins so
  `[[PROPERTY_1]]` unredacts to the canonical full address, not the
  street alias.

### 2026-05-04 — Batch 2 (capital stickiness + outcome substrate)

- **E1 — Deal outcomes capture (27a31f4):** new `deal_outcomes` table
  (00023) + dual-log (audit_log + activity_events `reported_outcome`).
  Status enum `withdrawn|funded|extended|repaid|defaulted`. Per-status
  optional fields in `outcome_data` JSONB (close_date, funded_amount,
  extension_reason, default_cause). UPSERT on validation_id
  (idempotent). `DealOutcomeCard` rendered between Monitor and Activity
  on the validation detail page.
- **A1 — Investor PDF parser (3f36429):** new
  `investor_criteria_extractions` audit table (00024). PDF → Claude
  extract → preview modal → accept-and-supersede flow. First new Claude
  consumer post-bundle — `requireAiEnabled` enforced; PII scrub
  applied; no depersonalization needed (criteria are categorical).
  `extract.ts` produces `{ criteria_key, criteria_value, confidence }`
  rows. Modal lets user toggle rows + edit JSON inline before save.
  Token counts persisted for cost analytics.
- **B1 — Borrower watchlist (3d2c273):** alters `monitor_subscriptions`
  (00025) — `borrower_id` (nullable FK), `critical_only` (bool),
  drops `validation_id` NOT NULL, scope_check CHECK (per-validation
  XOR per-borrower). New `/api/borrowers/[id]/monitor` route. Cron
  filters `validation_id IS NOT NULL` so it skips template rows.
  `runner.notifyChanges` filters by severity when `critical_only=true`.
  `validations` POST reads borrower-level template after `upsertBorrower`
  and materializes a per-validation sub on every new validation, with
  `inherited_from_borrower=true` activity metadata. MonitorCard gets a
  "Watch this borrower" toggle below the per-validation controls;
  both scopes get a critical-only checkbox.

### 2026-05-05 — Doc engine + WP content publish + scheduled routine

**Three parallel tracks landed.**

**(a) E2E test plan (commit `972cf6e`).** `docs/E2E-TEST-PLAN.md` — 17-phase
customer walkthrough of every surface, top-to-bottom. Pre-NPLA smoke
checklist with ✅/⚠️/❌ buckets per row. Captures all features through
Batch 2 + AI privacy bundle audit-fix details.

**(b) WordPress content engine + 36 drafts pushed (commit `14fa771`).**

Discovery: I missed that the WordPress marketing site code lives in
[wordpress/](wordpress/) until the user pushed back. Once I `ls`-ed
root and found it, the picture clarified — `pulseclose.com` is GoDaddy
Managed WordPress, content is version-controlled here, published via
TS scripts that hit the WP REST API.

3 new publish scripts wired to existing `wp-client.ts`:
- `wordpress/scripts/publish-blog.ts` — reads `content/posts/*.md`, lightweight md→HTML, upserts via wp-client. Default draft.
- `wordpress/scripts/publish-glossary.ts` — reads `content/glossary/terms.ts`, renders each term with **FAQPage schema** + named-expert byline + last-reviewed date. Auto-creates parent /glossary/ page.
- `wordpress/scripts/publish-guides.ts` — reads `content/guides/sos-states.ts`, renders each state with 4-question FAQPage schema. Auto-creates parent /guides/ + /guides/sos-lookup/ pages.

All idempotent. `--publish` flag promotes; single-slug arg refreshes
one item. GEO/AEO-ready output (per the 2026 research — see
DISTRIBUTION-STRATEGY): FAQPage schema + named-expert byline +
last-reviewed timestamps + cross-links + product CTA blocks baked in.

Pushed to pulseclose.com as drafts:
- 1 pillar post: `/posts/bridge-loan-borrower-due-diligence`
- 20 glossary terms: `/glossary/{bridge-loan, hard-money-loan, fix-and-flip, loan-to-value, lis-pendens, mechanics-lien, registered-agent, good-standing, sos-filing, beneficial-ownership, bankruptcy, foreclosure, notice-of-default, deed-of-trust, judgment-lien, construction-holdback, draw-schedule, general-contractor-license, workers-compensation, experience-tier}`
- 15 state SOS guides: `/guides/sos-lookup/{california, florida, texas, new-york, arizona, nevada, colorado, georgia, north-carolina, tennessee, ohio, illinois, pennsylvania, new-jersey, maryland}`

**Audit snapshots refreshed** in `wordpress/audit/{pages,posts}-snapshot.json`.

**(c) Strategy + operational doc overhaul (commit `14fa771`).**

User explicitly said original SEO strategy was "a dying SEO strategy. we
need to do better." Did web research on 2026 SEO/GEO landscape via
general-purpose agent — research summary in
docs/DISTRIBUTION-STRATEGY.md "Sources" section (Seer / ALM /
HockeyStack / Edelman / etc., 25+ citations).

**6 NEW docs:**
| File | Lines | Purpose |
|---|---|---|
| `docs/DISTRIBUTION-STRATEGY.md` | ~330 | New lead doc; replaces seo-strategy.md as head reference. Wade Intel parent + Lenny model + 30/20/15/15/10/10 effort split (capital-provider authority / LinkedIn / newsletter / GEO retrofit / open framework / NPLA). KEEP/KILL/RESCOPE table. |
| `docs/NPLA-RUNBOOK.md` | ~416 | 7-week pre-NPLA sprint, 3/8/15-min demo runbooks, 3 persona talk tracks, leave-behind one-pager outline, 48h follow-up flow, Scottsdale Oct speaking pitch, booth-decision matrix, op-risk register, success metrics. |
| `docs/DEMO-DATA-HYGIENE.md` | ~467 | Truong canonical, fresh-tenant 10-min spin-up, full script catalog (16 scripts categorized), 60-min and 5-min pre-demo checklists, mid-demo failure modes + recovery. |
| `docs/PRICING-STRATEGY.md` | ~332 | Tier rationale verified vs `src/lib/stripe/server.ts`, four pricing gaps, three post-NPLA hypotheses (fund tier $1,499-2,499 / per-validation overage / annual prepay), Damon-question items. |
| `docs/VENDOR-LEDGER.md` | ~541 | 17-vendor table with env vars / pricing / fallbacks / incident playbooks. 2026 rotation calendar (OpenSanctions 5/28, Cobalt ~6/10, NPLA 6/22-23). Cost-ledger estimate flagging TODOs. |
| `docs/PRIVACY-POSTURE.md` | ~401 | Table-by-table PII / retention / RLS inventory. 3-component AI privacy bundle (toggle + scrub + tokenization). 8 pre-canned Insignia/Damon Q&A. SOC 2 gap inventory tagged ACCEPTED RISK / PRE-NPLA / POST-NPLA. 3-tier Anthropic escalation path. |

**4 doc rewrites:**
- **`STRATEGY.md`** — full rewrite. The April 2026 doc had multiple
  wrong claims ("no JSONB blobs", "no sanctions"). New version covers
  Wade Intel parent context, current pillar surface through Batch 2,
  Path B + JSONB architecture reality, distribution thesis,
  IP/partnership posture, pricing hypotheses, forward roadmap, long-shot
  bets, "what changed since April 2026" reconciliation table.
- **`docs/seo-strategy.md`** — rescoped from 300+ programmatic pages to
  a tactical sub-doc under DISTRIBUTION-STRATEGY. KEEP/KILL/RESCOPE
  table reflects what's deployed (15 guides + 20 glossary + 1 post).
  6-pillar blog calendar through October.
- **`docs/ROADMAP.md`** — status snapshot updated through 2026-05-04.
  **Cross-cutting principle #12 added**: AI privacy bundle is a required
  gate on every Claude consumer (`requireAiEnabled` + `scrubPii` +
  token-based depersonalization where applicable). 3 new decisions-log
  entries (2026-05-03 AI privacy, 2026-05-04 Batch 2, 2026-05-05
  distribution rewrite).
- **`docs/design-system.md`** — scope-note header clarifying which
  sections apply to auth product vs WordPress marketing site. §9 page
  specs (glossary, programmatic guide) updated for FAQ schema +
  named-expert byline + GEO/AEO framing.

**Archived (to `docs/archive/`):**
- `CONTINUOUS_MONITORING_PLAN.md` (pre-shipment plan; feature shipped via 00014 + B1 evolved past it)
- `TRACK_RECORD_VERIFY_PLAN.md` (pre-shipment plan; feature shipped via verify-core.ts + canonical-name dedup evolved past it)
- + `docs/archive/README.md` explaining why

**Refreshed:**
- `CLAUDE.md` — killed stale "no JSONB blobs" claim, added Wade Intel
  parent context, updated tech-stack notes (base-ui not shadcn), added
  current project structure, added full reading list pointing at the 6
  new docs.

**(d) Scheduled monthly content refresh routine — SEE INVESTIGATION
SECTION ABOVE.** `trig_017PQNaJ2eN6X86T7bo6Zu7Y`, scheduled 2026-06-01
14:08 UTC, attached to `env_01RNWmw8TJ4rZMPEAfpRTjTk` (Build-Folio
environment, pre-existing on user's account, mystery origin). User has
asked to NOT touch this further until investigated. Will fail-clean on
first run if WP secrets aren't on that environment.

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

## Database state (as of 2026-05-05 EOS)

**Migrations applied (26 total):**
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
00022 ai_privacy                        organizations.ai_extraction_enabled toggle
00023 deal_outcomes                     E1 — outcome capture per validation
00024 investor_extractions              A1 — investor PDF extraction audit trail
00025 borrower_monitor                  B1 — monitor_subscriptions.borrower_id +
                                        critical_only + scope_check
00026 org_monitor_default               G7.1 — organizations.monitor_new_validations_by_default
                                        (org-level auto-monitor toggle)
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

## Manual items the user should do (post-2026-05-05)

0. **Add WP secrets to Build-Folio Anthropic Cloud env** before 6/1.
   claude.ai/code → enter any session → click env selector at top of
   chat → Build-Folio settings gear → Environment variables → paste
   `WP_URL=...`, `WP_USER=...`, `WP_APP_PASSWORD=...` from `.env.local`
   (no quotes, one per line). Otherwise `trig_017PQNaJ2eN6X86T7bo6Zu7Y`
   fails-clean on 2026-06-01.

1. **Smoke-test Batch 2 on prod.**
   - **E1:** open any validation, scroll to "Deal outcome" card,
     click "Set outcome" → Funded → enter close_date + funded_amount
     → Save. Card should re-render with the saved status. `/dashboard/activity`
     gets a `reported_outcome` row.
   - **A1:** `/dashboard/evaluate/investors` → "Upload PDF" on a
     sample investor → upload a real fund's guidelines PDF → preview
     opens with extracted rows + confidence chips → tweak / deselect
     → Accept N rows. Investor card should re-render with new
     criteria; `investor_criteria` rows have `source='pdf_parse'`;
     `investor_criteria_extractions` has the audit row with token
     counts.
   - **B1:** on a validation detail page, scroll to MonitorCard →
     "Watch this borrower" toggle → Watch borrower. Run a NEW
     validation for the same borrower (drop the Truong xlsx again) →
     after POST, the new validation should auto-have an enabled
     monitor sub with `inherited_from_borrower=true` in the activity
     metadata. Toggle critical-only on; induce a non-critical change
     (filing-date drift); confirm no email.
2. **Re-test Batch 1 / AI privacy bundle end-to-end** if you haven't
   yet:
   - Drop Truong xlsx → run validation → AI memo references "Kim An
     Truong" / "TT Investment Properties, LLC" by full name (round-trip
     proof). Activity strip shows events.
   - Open Settings → AI & Privacy → Disable → re-upload xlsx → expect
     503 with friendly message. Re-enable.
3. **Walk the demo runbook** at
   `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md`
   (Phase 1-7) AND the new in-repo runbook at `docs/NPLA-RUNBOOK.md`.
   Includes the deferred print test for `/handoff/[id]` and
   `/validations/[id]/risk-methodology` — physically print to verify
   page-break / margin / color rules.
4. **NPLA pre-flight, ~1 week out:** verify all 25 migrations
   idempotent on a fresh tenant.
5. **Rotate OpenSanctions trial key** before 2026-05-28. New key in
   `OPENSANCTIONS_API_KEY` in Vercel env (and `.env.local`). Verify
   with one validation post-rotation.
6. **Rotate Cobalt API keys** for demo-day capacity (~6/10). Multiple
   keys in env; rotation logic TBD when implementing — could be
   round-robin in `src/lib/adapters/cobalt.ts` or env-swap pre-demo.
7. **Review WP drafts and decide promotion timing.** 36 pages on
   pulseclose.com are currently drafts (1 pillar post + 20 glossary +
   15 state guides). Re-running the matching publish script with
   `--publish` flips a single slug to publish. See `docs/seo-strategy.md`
   for the GEO retrofit checklist and what to verify before promotion.
8. **Pitch NPLA Scottsdale (Oct 25-27) speaking slot.** 5 months out;
   submit a methodology talk abstract NOW. Full pitch in
   `docs/NPLA-RUNBOOK.md`.
9. **Set up Build Buy Borrow newsletter cadence** — 1× / week Tuesday
   9am ET per `docs/DISTRIBUTION-STRATEGY.md`. First post + 8-week
   format rotation defined there.

---

## Doc map (where to find what)

After the 2026-05-05 doc overhaul:

| Doc | Purpose |
|---|---|
| `pickup.md` | This file. Session pickup, current state, investigation flags. |
| `STRATEGY.md` | Product strategy. Wade Intel parent + current state + roadmap. |
| `CLAUDE.md` | Tech stack, project structure, key architectural decisions. |
| `docs/ROADMAP.md` | Journey-organized backlog + 12 cross-cutting design principles + decisions log. |
| `docs/DATA-MODEL.md` | Schema reference. |
| `docs/E2E-TEST-PLAN.md` | 17-phase customer walkthrough for pre-NPLA smoke testing. |
| `docs/DISTRIBUTION-STRATEGY.md` | 2026 distribution playbook (lead doc; replaces seo-strategy.md). |
| `docs/seo-strategy.md` | Programmatic SEO sub-doc. KEEP/KILL/RESCOPE table + 6-pillar blog calendar. |
| `docs/NPLA-RUNBOOK.md` | 7-week sprint to NPLA + demo runbooks + Scottsdale speaking pitch. |
| `docs/DEMO-DATA-HYGIENE.md` | Truong canonical, fresh-tenant procedure, full script catalog. |
| `docs/PRICING-STRATEGY.md` | Tier rationale + fund-tier hypothesis. |
| `docs/VENDOR-LEDGER.md` | 17-vendor incident playbook + rotation calendar. |
| `docs/PRIVACY-POSTURE.md` | Insignia-answerable Q&A + AI privacy bundle + SOC 2 gap inventory. |
| `docs/design-system.md` | Brand / color / typography (auth product + WordPress site). |
| `docs/archive/` | Pre-shipment plans for shipped features. Historical only. |
| `wordpress/README.md` | Marketing-site publish workflow. |

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
| **AI privacy bundle (00022)** | Working | per-org `ai_extraction_enabled` toggle + PII scrub + tokenized memo prompt + leftover-token safety scan |
| **Deal outcomes capture (E1, 00023)** | Working | DealOutcomeCard between Monitor and Activity; UPSERT on validation_id; dual-log to audit_log + activity_events |
| **Investor PDF parser (A1, 00024)** | Working | "Upload PDF" on investor card → Claude → preview modal → accept-and-supersede; audit trail in `investor_criteria_extractions` with token counts |
| **Borrower watchlist (B1, 00025)** | Working | "Watch this borrower" toggle on MonitorCard; new validations auto-inherit; critical-only filter on both scopes |
| **Counter-offer / repricing (A2)** | Working | Inline suggestions on fail/conditional investor cards: loan-amount drops with predicted rate/points + borrower-side targets + structural flags |
| **Borrower capital-availability PDF (A3)** | Working | `/borrower-summary/[id]` printable; "Borrower summary" button on evaluate detail when ≥1 eligible |
| **Portfolio health dashboard (B2)** | Working | `/dashboard/portfolio` — KPI strip + tier mix + outcome mix (E1) + 12-row attention list. Sidebar PieChart icon. |
| **Validation search + filter + CSV (B3)** | Working | Top-of-dashboard search (borrower + entity), status chips, tier chips, "Export CSV" button (filtered) |
| **Address parser (G2.4)** | Working | Splits on first comma + strips explicit unit designators + strips trailing alphanumerics after street suffix |
| **Methodology PDF one-click (G4.1)** | Working | `?print=1` autofires print dialog on load; toolbar Print button on direct visits |
| **Completeness label + tooltip (G4.2)** | Working | "Confidence" → "Completeness" everywhere; detail page tooltip explains the +/- formula |
| **Add GC after the fact (G3.4)** | Working | AddGCCard renders when no `gc_validations`; POST `/api/validations/[id]/gc` runs CSLB + recompute + emits `added_gc` |
| **Org-level monitor default (G7.1, 00026)** | Working | Settings → Org tab toggle; new validations get a weekly sub when no borrower template AND org default is on |
| **"Next run in N hours" indicator (G7.2)** | Working | MonitorCard shows relative time (in 3d / in 5h / in 12m) above absolute timestamp |
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

**Batch 1 ✅ COMPLETE 2026-05-02.**
**AI privacy bundle ✅ SHIPPED 2026-05-03.**
**Batch 2 ✅ COMPLETE 2026-05-04 (E1 + A1 + B1).**
**Doc engine + WP content publish ✅ SHIPPED 2026-05-05.**
**Anthropic Cloud routine investigation ✅ RESOLVED 2026-05-05.**
**Batch 3 + filler set ✅ COMPLETE 2026-05-05 EOS (A2 + A3 + B2 + B3 + G2.4 + G4.1 + G4.2 + G3.4 + G7.1 + G7.2).**

**Carry-forward action items (manual, not code):**
1. Add `WP_URL` / `WP_USER` / `WP_APP_PASSWORD` to the Build-Folio
   Anthropic Cloud env at claude.ai/code → enter any session → env
   selector → settings gear — before 2026-06-01 14:08 UTC. If skipped,
   the monthly WP refresh routine fails-clean (no harm).
2. Smoke-test Batch 3 surfaces in prod when convenient:
   - A2 — make an evaluation against a deliberately-tight investor
     (e.g. low max LTV) and confirm counter-offer text appears.
   - A3 — open `/borrower-summary/[id]` for an evaluation with ≥1
     pass; verify print preview is one page, named lenders rendered.
   - B2 — `/dashboard/portfolio` should show non-zero tier mix +
     attention list for the Truong test data.
   - B3 — search "Truong", filter "verified", click "Export CSV";
     confirm csv has only the verified rows.
   - G2.4 — re-run validation that historically failed
     `71 WEBBER WAY 77, BUENA PARK`; should resolve now.
   - G3.4 — open a validation that was created without a GC; the
     AddGCCard should render in place of the old empty section.
   - G7.1 — flip the toggle in Settings → Org; create a new
     validation; confirm a default monitor sub gets created.

**Recommended next pick — pre-NPLA polish + reputation:**

- **E2 — borrower lender-relationship history** (~2d). Surface E1
  outcome rows on the borrower's record; "Truong has funded 3, repaid
  2, defaulted 0 with this org." Builds on the deal_outcomes substrate.
- **E3 — public testimonial from Damon/Noah** (collateral). Asked
  via working sessions per memory; not a code task.
- **A4 — investor performance over time** (~1.5d). Track which
  investor terms close vs reprice vs lose. A1 + E1 substrate is
  there; this is the analytics layer on top.
- **A5 — pricing-history per investor** (~1.5d). Show how an
  investor's quoted rates have moved; highlight outliers.
- **G1.2 — co-borrower / multi-guarantor schema** (~1d schema +
  UI). Damon-decision (Action items #2). Defer until Insignia confirms
  template shape.

**Smaller fillers (none currently in pickup; new ones welcome):**
- **G7.3 (suggested)** — "Pause monitoring during demo" toggle +
  resume-after-N-days. Avoid surprise emails to Damon mid-demo.
- **B4 (suggested)** — borrower-detail roll-up page (`/dashboard/
  borrowers/[id]`) showing all validations + outcomes + monitor
  state. Currently the borrower record is implicit.

**Distribution / content track (per `docs/DISTRIBUTION-STRATEGY.md`):**
- Promote the 36 WP drafts to publish after a review pass
- Pitch Scottsdale Oct (NPLA) speaking slot (do this in May)
- First Build Buy Borrow Tuesday post + 8-week rotation
- 5 more pillar blog posts (Jun-Oct)
- Author bio page at `/about/zach-wade/` with Schema.org Person markup
- llms.txt at `pulseclose.com/llms.txt`

**If asked "what's next?" without direction:** smoke-test the
Batch 3 surfaces above first — they're shipped but not yet
demo-validated. Then E2 + A4 to start the reputation/analytics
layer that compounds with E1's data accumulation. NPLA is in
~7 weeks; demo polish + a referenceable outcome from Insignia
matter more than feature count from here.

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
- ~~**Address parser edge cases (G2.4)** — `71 WEBBER WAY 77, BUENA PARK`
  returned "Address not found" because the `77` between street and city
  tripped the parser.~~ ✅ Fixed 2026-05-05 (`34fe15e`). Parser now
  splits on first comma, strips explicit unit designators (Apt/Unit/#),
  and strips trailing alphanumerics after a street-suffix word. Re-test
  on the original Truong address before declaring closed.
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
| Done | Anthropic Cloud routine investigation | ✅ Resolved 2026-05-05. Build-Folio env is legitimate (auto-provisioned). Routine kept; user adds WP secrets via claude.ai/code env editor. | User + Claude |
| Before 6/1 | Add WP secrets to Build-Folio env | claude.ai/code → session → env selector → Build-Folio settings gear → paste WP_URL/WP_USER/WP_APP_PASSWORD from `.env.local`. Otherwise monthly routine fails-clean. | User |
| Done | AI privacy 2-day bundle | ✅ Shipped 2026-05-03 (`a277c23`). | Claude |
| ~5/27 | OpenSanctions key rotation | ✅ Decided. Rotate trial keys; auto-falls-back to OFAC if rotation fails. | User |
| ~6/01 | Monthly WP refresh (scheduled) | Will run as `trig_017PQNaJ2eN6X86T7bo6Zu7Y` UNLESS deleted/disabled. Will fail-clean if Build-Folio env doesn't have WP secrets. | Anthropic Cloud agent |
| ~6/10 | Cobalt key rotation for demo | ✅ Decided. Rotate across multiple keys; cached `liveData=false` as backstop for any single demo validation. | User |
| ~6/15 | Print test (CSS on paper) | Print `/handoff/[id]` + `/validations/[id]/risk-methodology` on real paper, fix any margins/page-breaks | User |
| ~6/15 | Migration idempotency on fresh tenant | Spin up a 2nd test org, run all 25 migrations clean, validate one xlsx through full flow | User OR Claude via script |
| ~6/15 | Demo collateral | One-page leave-behind, 3 talk tracks (lender / fund / consulting), trial-start mechanic | User (full plan in docs/NPLA-RUNBOOK.md) |
| Next Damon sync | Outside-person bundle | Walk through Action items #1-5: Truong xlsx interpretation, co-borrower schema, address shapes, Insignia AI policy, testimonial ask | User + Damon |
| ~6/20 | Demo dry-run with Damon | Walk the runbook end-to-end, time it, identify rough edges | User + Damon |
