# PulseClose — Session Pickup (2026-05-11 start of day)

> **For session-resumption.** Strategic + architectural detail lives in
> the dedicated docs — this file orients quickly and points there.
>
> **Read on session start, in order:**
> - This file (you're here)
> - `docs/ROADMAP.md` — journey-organized backlog with cross-cutting design principles
> - `docs/IDEAS.md` — unscoped feature ideas with "unblocks when" conditions (grew this session)
> - `docs/DATA-MODEL.md` — full schema (now through 00039)
> - `STRATEGY.md` — Wade Intel parent + product strategy
> - `docs/E2E-TEST-PLAN.md` — 17-phase customer walkthrough
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are

NPLA conference is **June 22-23, 2026 (~6 weeks out).**

**This session (2026-05-08 → 2026-05-11) — Noah-review loop end to end:**

- **Noah Davis reviewed PulseClose live on the Truong validation.** First
  capital-partner-credible reviewer. Validated continuous monitoring,
  the track-record auto-validation workflow, and the handoff report as
  a capital-partner deliverable. Pushed back hard on AI-given
  characterization without drill-down ("anything you have, without the
  ability to drill down, is not helpful") and immediately spotted
  matcher false positives ("most of those are not her" — Fullerton +
  Cypress hits for a SJ-only borrower).
- **Saved as memory:** `feedback_drill_down_over_characterization.md`
  and `project_noah_truong_review_open_loops.md`. Future sessions
  inherit Noah's principles.
- **Shipped 5 commits** addressing matcher leaks, drill-down
  completeness, the litigation discrepancy, a full verify-tray
  architecture that gates the AI memo behind a "Preliminary" marker
  until pending Flow B matches are reviewed, and the workflow signal
  end to end (banner + memo tag + handoff stamp).
- **Wiped Truong end-to-end** via `scripts/reset-validation.ts` so the
  verify-tray work can be tested against a clean re-run. Borrower +
  6 stale validations + signals all gone. Reset script is durable for
  future use.

**Production health:** ✅ All commits live. Vercel auto-deploy clean
throughout. 5 commits to main this session.

---

## Resume here

**Step 1 — Hard-refresh** (`Cmd+Shift+R`) on `app.pulseclose.com/dashboard`
before testing — favicon + CSS may still be cached from last week.

**Step 2 — Re-create Truong from `/dashboard/new`** with the same xlsx
(`/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`).
This is the headline test for the whole week's work. Expect:

1. After ~30-60s, validation detail page renders.
2. **Headline property table** shows only her real Santa Clara County
   properties (verified + auto-promoted).
3. **Verify tray** below the property table lists the Fullerton /
   Cypress / Brea-area hits with low confidence + a "different metro"
   reason inline. Should be roughly the same names Noah called out.
4. **Top of page**: amber banner *"Memo is preliminary — N property
   matches pending review"* with "Review now →" jump.
5. **AI memo card**: amber "Preliminary · N pending" badge in the
   header.
6. **Litigation card** should now show **Amador v. TT Investment
   Properties, LLC** (N.D. Cal. 2013) — the case that previously fell
   through the materialization gap.
7. Click any pending tray row → confirm or reject. Memo + tier
   regenerate; banner + preliminary badges disappear when tray is empty.
8. **Investor handoff** PDF: same "PRELIMINARY" banner stamped at the
   top until tray cleared.

If all 8 land, **send Noah the corrected report** unprompted — that
closes his loop and earns the next review.

**Step 3 — Resume the test walkthrough** at Test 3d (litigation case
edit + add + delete) once you've confirmed Truong renders cleanly.

---

## Test walkthrough state

**Tests passed (prior sessions):** 1 (B4 borrower-search guard),
2 (E2 borrower roll-up page), 3a (universal factor override),
3b (editable track record).

**Tests 3c-3e were mid-flight when Noah's review redirected the
session.** Truong was wiped to allow re-testing of the verify-tray
architecture. Re-run them after Step 2 confirms the headline + tray
work.

### Test 3d — Litigation case edit + add + delete
On a freshly-re-created Truong, the Amador case should now appear (the
fix in `f2b0d40` repaired the courtlistener/extract/materialize 3-bug
chain). Edit pencil → change status, add lender_notes → save. AI memo
regenerates within 60s.

### Test 3e — Handoff audit trail + Preliminary marker
With pending tray rows AND a few overrides applied, the handoff PDF
should now show: brand bar + pulse mark, the "Lender edits applied"
section, AND the new amber "PRELIMINARY" banner at the top until the
tray is cleared.

### Tests 4-11 — unchanged from prior pickup
F1/F2 scenarios, D2 Slack/Teams, D5 public REST, D4 bookmarklet,
G7.3 pause, admin merge UI, activity feed. Nothing about them changed
this session; see git log for prior pickup if needed.

---

## This session's commits (in shipping order)

```
05773bb  Preliminary memo marker + review-status banner
cf913a8  Verify tray + confidence scoring for Flow B owner-name search hits
fce599b  Factor-evidence rows hyperlink into the underlying data card
f2b0d40  Fix litigation_cases materialization (3 bugs in one chain)
296daa8  Noah-review fixes: matcher false-positives + drill-down evidence
```

Plus: Truong wiped end-to-end (6 validations + borrower + signals) via
`scripts/reset-validation.ts` after debug evidence was captured. Reset
script is in-tree for future use.

---

## What the verify-tray architecture does (new this session)

Two parallel matching flows feed `track_record_entries`:

- **Flow A — per-address verify** (`verify-core.ts`). Borrower's xlsx
  → look up each address in Realie → walk deed chain → confirm
  borrower/entity. High precision. Output: `verified_flips`.
- **Flow B — statewide owner-name search** (`realie.ts:234`). Realie
  CA-wide owner search. High recall but common-name leakage (Noah's
  Truong issue). Output: `track_record_entries` with
  `review_status='pending_review'`.

After Flow A completes, `scoreAndPromotePendingRows` runs and computes
a 0-100 confidence score per pending row from five signals:

| Signal | Weight | Source |
|---|---|---|
| SOS officer/agent matches deed owner | +25 | Cobalt entity_checks |
| Address in xlsx geo cluster (same city) | +25 | verified_flips |
| Address in same zip-3 (metro proxy) | +12 | verified_flips |
| Address outside cluster | **-15** | verified_flips |
| Deed transfer history corroborates | +20 | Realie raw_response.transfers |
| SOS entity filing ID matches | +15 | strict-equality name match |

Rows clearing **80/100** auto-promote to `auto_accepted` (headline).
Below threshold stays in `pending_review` (verify tray) with score +
breakdown stored on the row so the UI explains WHY each match scored
where it did.

`PATCH /api/track-record/[id]/review` with `{action: "confirm" | "reject"}`
handles the lender's decision; both actions log to `data_edits`,
recompute risk factors, and regenerate the AI memo.

**Gap 5 (APN/tax-assessor)** deferred to IDEAS.md — per-county adapter
work is multi-week. Start with Santa Clara + LA + Orange when the
first verify-tray false-promote slips through.

**Preliminary memo workflow signal** layers on top: when
`pending_review_count > 0`, the AI memo card gets a "Preliminary · N
pending" badge, the top of the validation page shows an amber banner
with a jump to the tray, and the handoff PDF + Excel cover sheet stamp
"PRELIMINARY — Lender review incomplete" so capital partners see the
same cue if the lender ships a handoff before finishing the tray.

---

## Litigation chain fix (this session, `f2b0d40`)

Truong's CourtListener search found a real federal case (Amador v. TT
Investment Properties, N.D. Cal. 2013) but the validation page showed
nothing while the handoff PDF correctly surfaced it. Three independent
bugs:

1. **`courtlistener.ts`** declared `CLDocket` in snake_case but
   `/search/?type=d` returns Solr-style camelCase. Fixed: read both.
2. **`extract.ts`** had the same field-name bug. Fixed: read both.
3. **`materialize.ts`** used Supabase upsert with `onConflict` pointing
   at **partial** unique indexes. PostgREST rejects partial-index
   targets — every materialization silently failed across the whole
   product. Fixed: replaced with explicit select-then-update/insert.

Verified end-to-end against Truong's stored data. The Amador case now
materializes correctly with court / dates / category / status.

---

## Database state

**Migrations applied (39 total):** 00001-00039 inclusive.

Latest:
```
00037  ai_memo_version            borrower_validations.ai_analysis_version (regen lock)
00038  introspect_fks             _introspect_merge_target_fks RPC (verify-merge-fks.ts)
00039  track_record_review        review_status + review_confidence + review_signals
                                  + reviewed_at + reviewed_by_user_id on track_record_entries
```

Existing rows defaulted to `review_status='auto_accepted'` so
pre-00039 validations render unchanged. New Flow B inserts → `pending_review`.

---

## Items NOT addressed (deferred / blocked / manual)

### Pre-NPLA blockers still open (from Noah review)
- **Live-retest the litigation drill-down bug** Noah hit on 2026-05-07.
  Static read showed the click path intact, so it may have been stale
  or in the share/handoff surface. Verify on the fresh Truong re-run.
- **Lender concentration evidence shows raw UUIDs** — needs lender-name
  enrichment. Logged in IDEAS.md → "Drill-down + matcher follow-ups".
- **"Minor" labels on non-pillar surfaces** (monitor card, activity
  feed, property provenance badges) — pillar cards now distinguish
  CHECK FAILED vs minor finding; sweep the rest before NPLA.

### Drill-down + matcher follow-ups (IDEAS.md)
- Realie fallback usage telemetry (catch silent entity-name misses)
- ATTOM identity match audit (same class of bug as Realie was)
- Display-side ownership filter on `/api/validations/[id]`
- Property row → Realie/deed source link
- Claimed-only rows expand-and-edit
- AI memo factor citations (pillar prose → factor IDs)
- APN / tax-assessor (per-county; start with Santa Clara + LA + Orange)

### Earlier deferred follow-ups
- Property model Phase 2 (collapse `verified_flips` into `track_record_entries`)
- Token-claim AI regen concurrency control (multi-user)
- D5 POST endpoint (public REST is GET-only)
- Liquidity factor reading bank statement data
- photo_verified signal write (verifications stored, threshold uncalibrated)
- F3 investor self-serve signup flow
- F1 multi-dimension scenarios (only LTV varies today)

### UX audit backlog (from 2026-05-06 audit, mostly NOT shipped)
~22 findings still pending. Top 3 from that audit:
1. Decorate handoff investor dropdown with eval status + inline "Run eval" link
2. Pass `validation_id` end-to-end through the eval flow
3. Add Admin sidebar link + investor-side queue showing borrower names

### Blocked on outside persons / vendor $
Unchanged from prior pickup: C2 BatchData, C3 reverse phone/email,
D1 email-forward intake, D3 calendar, E3 anonymized consensus,
E4 full public profile, F3 full investor UI, G1.2 co-borrower,
G2.2 TransUnion, G2.3 multi-state GC.

### Manual items (you)
1. **Re-create Truong + send Noah the corrected report** once Step 2
   in "Resume here" passes (closes Noah's loop — high priority).
2. **Add WP secrets to Build-Folio Anthropic Cloud env** before
   2026-06-01 14:08 UTC.
3. **Print physical paper test** of `/handoff/[id]` +
   `/validations/[id]/risk-methodology`.
4. **OpenSanctions key rotation** by 2026-05-28.
5. **Cobalt key rotation** for demo capacity by ~2026-06-10.
6. **Activate Upstash Redis for rate limiter** — code shipped, awaiting
   env vars (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
7. **Hard-refresh browser** on first visit today.

---

## Critical context for next session

- **Truong is at zero state** — borrower + 6 stale validations
  cascaded away this session. Step 2 above is to recreate her. Don't
  try to navigate to the old URL
  (`/dashboard/validations/75411344-…`) — it 404s now.
- **Verify-tray architecture is new** and untested live. The 80/100
  auto-promote threshold is a first guess; watch for false-promote
  (legit-looking but actually-not-her rows that the score waved
  through) and false-reject (her real properties scored low for
  surprising reasons). Tune `AUTO_PROMOTE_THRESHOLD` in
  `src/lib/track-record/review.ts` if either happens.
- **Tightened tokenSetMatch** (`verify-core.ts:114`) now requires
  strict equality after stripping noise tokens (Jr/Sr/III etc.).
  Borrowers who typed a middle name on intake but the deed only shows
  first+last will now register as `not_found` instead of being
  auto-claimed. Intentional per Noah's safer-to-reject default — but
  if it causes recall regressions on real deeds we'll see them as
  false-negative verifications.
- **Noah's principles** are now memory: drill-down beats AI
  characterization; every factor/badge must click into source evidence;
  opaque "minor" labels are worse than none. Apply to all new UI work.
- **CHECK BUILD STATUS** in Vercel after every push (history of silent
  webhook failures).
- **The unified property table is the headline surface;** verify tray
  is below it. Pending and rejected rows are excluded from the
  headline. Handoff PDF excludes both as well.
- **ROADMAP cross-cutting principles 8-12** govern all new code
  (canonical token matching, dual-coded dedup, max_tokens 4096+
  stop_reason, AI privacy bundle on every Claude call, JSONB
  schema_version).

---

## Reference paths

- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production URL:** https://app.pulseclose.com
- **Vercel project:** `buildfolios-projects-e8f9d80e/pulseclose`
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Truong intake xlsx:** `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`
- **Truong test validation:** wiped — recreate via `/dashboard/new`
- **Last shipped commit:** `05773bb` (preliminary marker + banner)
- **Reset script:** `scripts/reset-validation.ts <validation_id> [--delete] [--hard]`
- **Memory:** `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`
