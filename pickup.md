# PulseClose — Session Pickup (2026-05-07 start of day)

> **For session-resumption.** Strategic + architectural detail lives in
> the dedicated docs — this file orients quickly and points there.
>
> **Read on session start, in order:**
> - This file (you're here)
> - `docs/ROADMAP.md` — journey-organized backlog with cross-cutting design principles
> - `docs/IDEAS.md` — unscoped feature ideas with "unblocks when" conditions (NEW yesterday)
> - `docs/DATA-MODEL.md` — full schema (now through 00038)
> - `STRATEGY.md` — Wade Intel parent + product strategy
> - `docs/E2E-TEST-PLAN.md` — 17-phase customer walkthrough
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are

NPLA conference is **June 22-23, 2026 (~6.5 weeks out).**

**Yesterday (2026-05-06) — heavy day:**
- 4 audit-fix rounds (rounds 1-4) clearing the entire 17-item polish
  backlog, then a 13-finding deep re-audit, then surgical fixes for the
  3 most critical re-audit items, then Upstash + FK-script for the
  remaining medium items. M4 (Upstash) deferred on env-var setup only.
- **Started Test 3 walkthrough** (the override-and-rerun flow — the
  headline NPLA capability). Tests 3a (universal factor override) and
  3b (editable track record) passed after several UX bugs were found
  and fixed live during testing.
- **Test 3c (manual property add) interrupted** — user added a property
  successfully but reported the AI memo didn't update with the new
  data. Root cause found + shipped: three mutation surfaces
  (UnifiedPropertyTable, LitigationCases, AddGCCard) were wired to
  `refetch` instead of `handleSignalApplied`, so memo polling never
  kicked in after edits. Fixed in `40cfe35` (last commit of the day).
- **Logo + favicon shipped** — pulse-waveform mark on Navy 950 rounded
  square, Blue 500 stroke. Wired into sidebar lockup, handoff PDF
  header, browser favicon, apple-touch-icon. Old favicon.ico deleted.
- **Property-table consolidation Phase 1 shipped** — single unified
  card with provenance badges (verified / public-record / claimed-only
  / manual) replaces the old paired Track Record + Verified Track
  Record cards. Phase 2 (DB-layer collapse — drop verified_flips,
  fold into track_record_entries) documented in IDEAS.md and
  ROADMAP.md as G3.6.
- **Independent UX audit ran end-to-end** — 25 findings across critical
  / high / medium / low. Top 3 prioritized fixes identified. The audit
  found a real architectural seam between `/dashboard/evaluate` and
  the handoff "Intended investor" picker that the UI doesn't bridge.
  Most findings still pending — see "UX audit backlog" below.

**Production health:** ✅ All commits live. Vercel auto-deploy clean
throughout. 12 commits to main yesterday.

---

## Resume here

**Step 1 — Hard-refresh the browser** (`Cmd+Shift+R`) when you open
`app.pulseclose.com/dashboard`. The favicon work added explicit
metadata.icons with a `?v=2` cache-buster and deleted the old
`favicon.ico`. Browsers cache favicons aggressively — if you don't
hard-refresh you'll still see the generic globe. Verify the **pulse
mark** is in the browser tab.

**Step 2 — Verify Test 3c memo regen.** Open the Truong validation:
```
https://app.pulseclose.com/dashboard/validations/75411344-75a0-4a60-bd7d-8340f227a672
```
You added a manual property yesterday but the memo was stale at the
time. With `40cfe35` shipped, now: edit any field on any property (or
apply/remove an override) → toast says "Tier + AI memo recomputing"
→ within 30-60s the AI Risk Assessment card refreshes with new
narrative. If it does, Test 3c is done.

**Step 3 — Continue the test walkthrough.** Next is **Test 3d** below.

---

## Test walkthrough state

**Tests passed:** 1 (B4 borrower-search guard), 2 (E2 borrower roll-up
page), **3a** (universal factor override), **3b** (editable track
record).

**Test 3c — Manual property add.** Add succeeded. Memo regen pending
verification after fix in `40cfe35`. Hard-refresh + edit any field →
within 60s memo should update. Mark passed.

### Test 3d — Litigation case edit + add + delete (next)
1. Same Truong validation. Scroll to **Public Records / Litigation** card.
   Truong's CourtListener returned matches so cases should be present.
2. **Pencil any case** → edit dialog opens (now pre-fills correctly
   thanks to `c9d1836`).
3. Change `status` to "dismissed", `lender_notes` to "Reviewed with
   borrower's counsel — frivolous nuisance suit". Click **Save**.
4. Expect: case re-renders with new status. Blue "Lender note" block
   appears below the case title. AI memo regenerates within 60s
   (polling now wired correctly per `40cfe35`).
5. Open dialog again, click **Delete case** in the dialog → confirm.
   Case removed. Tier + memo recompute.
6. Click **"Add case"** in the card header — fills in a manual case
   (state court, etc).

### Test 3e — Handoff audit trail
1. After 2-3 edits/overrides above, scroll to **"Investor handoff"**
   card.
2. Click **"Open PDF view"**.
3. Expect: new section **"Lender edits applied"** with headline counts
   ("3 track-record edits · 1 factor override · 1 litigation removal")
   and a chronological table.
4. **NEW:** the "Reason" column now distinguishes `Factor exclusion: …`
   from edit reasons (commit `2286b5f` M8 fix).
5. **NEW:** the brand bar at top shows the pulse mark + "PulseClose"
   wordmark (commit `79374d7`).
6. Try **"Download Excel"** — Cover sheet has the same summary; Audit
   Log worksheet has split `Edit reason` + `Factor exclusion reason`
   columns.

### Test 4 — A4 + A5 investor performance
Requires running an evaluation first. Truong has no `deal_evaluations`
rows yet.
1. Click **"Evaluate against my investors"** in validation header.
2. Fill the evaluate form (loan amount, purchase price, etc) and run.
3. Head to `/dashboard/evaluate/investors`. Each investor card should
   show a compact strip: "1 evaluation · pass-rate · funded count".
4. Click **"Performance"** on an investor → detail page with verdict
   mix + outcome mix + sparkline (if rate samples exist).
5. **Known UX gap (audit C1, H high):** the dropdown in the handoff
   "Intended investor" picker doesn't tag investors with their
   eval status. If you pick an investor that wasn't in the eval, the
   handoff PDF will show the explicit "No eligibility terms have been
   computed for this investor — run an evaluation that includes them"
   message (shipped `79374d7`). The dropdown-tagging fix is in the
   pending UX backlog.

### Test 5 — F1 + F2 scenarios
1. On the evaluate results page, scroll past investor results.
2. **F1 — "Compare leverage tiers"** button (needs purchase_price set).
   Three-column matrix: 65/75/80% LTV × per-investor pass/conditional/fail.
3. **F2 — Rate stress test** card. +0 / +100 / +200bps buttons.

### Test 6 — D2 Slack / Teams notifications
1. Settings → **Notifications** tab.
2. "Add notification" → Slack channel + incoming-webhook URL +
   `monitor_change` event_type. **NEW:** SSRF defense rejects
   private/loopback IPs at create time (commit `c37804c` M1).
3. Test-send icon → Slack channel receives "PulseClose channel test".

### Test 7 — D5 public REST API
1. Settings → **API Keys** tab. New API key, copy the plaintext token.
2. `curl https://app.pulseclose.com/api/public/v1/validations -H "Authorization: Bearer pck_live_..."`
3. Try `/api/public/v1/validations/{id}` for full detail.

### Test 8 — D4 bookmarklet (NEW: should now work)
1. Settings → API Keys → bottom card has **"Validate with PulseClose"**
   anchor.
2. **Drag** the link to bookmarks bar (don't click). Per `c1b94cc`,
   React 19 was previously stripping the `javascript:` URL — fixed by
   setting href via DOM ref after mount.
3. Bookmark should now show **the pulse mark favicon** in the bar.
4. Go to Zillow, highlight an address, click bookmarklet.
5. New tab opens at `/dashboard/new` pre-filled.

### Test 9 — G7.3 pause monitoring
1. Settings → Org → "Pause monitoring (demo mode)" → 2h.
2. Open any Truong validation → MonitorCard shows amber
   "Org-wide pause active" banner.
3. Settings → "Resume now" → banner disappears.

### Test 10 — Merge admin UI
1. Navigate `/dashboard/admin` directly (no sidebar link — UX audit
   flagged this as fix #5; not yet shipped).
2. Expect: "No duplicate groups found" — that's the correct empty state.
3. **NEW (audit):** if duplicates DO appear and you merge, the
   `merge_records_atomic` RPC (00036) now handles the full FK list
   including `borrower_public_profiles.borrower_id` (was silently
   destroying public profiles before). Run
   `npx tsx scripts/verify-merge-fks.ts` to check FK list completeness
   against schema.

### Test 11 — Activity feed (NEW since yesterday)
1. Sidebar → **Activity**.
2. Apply + remove a factor override on a Truong validation.
3. Activity feed should show TWO entries:
   - "X overrode extended_hold on Y — '<reason snippet>'"
   - "X removed override on extended_hold for Y"
4. Click the **Overrides** filter pill — should match BOTH events plus
   any signal applies (commit `057bdea` extended the API to accept
   comma-separated verbs).

---

## UX audit backlog (from end-to-end audit, mostly NOT shipped)

The audit found 25 findings. Top-priority items not yet addressed:

### Critical
- **Eval ↔ handoff seam.** `chosen_investor_id` picker doesn't know
  which investors have been evaluated for this validation. Fix:
  decorate dropdown options with `(evaluated · pass)` / `(not evaluated)`
  + when an unevaluated investor is picked, inline "Run eval for this
  investor →" link. ~30 lines.
- **`/dashboard/evaluate` doesn't pass `validation_id`.** Form arrives
  from validation-detail with `borrower=` query param but no
  `validation_id`. Resulting `deal_evaluation` row has `validation_id`
  null, so the handoff intended-investor lookup misses entirely. ~20
  lines, removes the eval-to-handoff friction.
- **AI memo "Generating…" can hang forever** with no error state.
  Polling stops after 30 attempts; if Claude failed, no retry button.

### High
- Borrower-side photo upload doesn't ask which property the photo
  belongs to (single dropdown above upload).
- `/dashboard/admin` reachable only by typed URL (add sidebar link
  gated on owner/internal).
- `/investor` placeholder shows queue rows by UUID, not borrower name.
- "Route to investor" success — investor doesn't get notified.
- New-validation form doesn't tell user "30-60s typical."
- Empty dashboard for new tenant has no path to onboarding investors.
- AI privacy disable silently kills memo with no in-page indicator.

### Medium / Low
~12 more findings, mostly polish. Logged in IDEAS.md and the
audit-tool transcript.

**The 3 fixes I'd ship first** (per the audit summary):
1. Decorate handoff investor dropdown + inline "Run eval" link
2. Pass `validation_id` end-to-end through the eval flow
3. Add Admin sidebar link + investor-side queue showing borrower names

These three close the most painful seams (the one user just hit) and
make the surface area outside the headline flow feel "complete around
the edges."

---

## Yesterday's commits (in shipping order)

```
40cfe35  Wire mutation surfaces to handleSignalApplied (memo polls after edits)
bcf3f85  Surface field-level Zod errors on Add property dialog
831f092  Property-table consolidation Phase 1 + favicon force-refresh + Phase 2 docs
057bdea  Fix override activity logging + memo regen race on remove
c9d1836  Fix track-record + litigation edit dialogs not pre-filling values
79374d7  Logo + favicon, intended-investor empty state, brand doc update
c1b94cc  Fix bookmarklet — React 19 was stripping javascript: URLs
ed69b4c  Fix 3 UX bugs surfaced by Test 3a walkthrough (memo poll restart, status badge, portfolio API)
0f4f96a  docs/IDEAS.md — capture unscoped feature ideas with "unblocks when" conditions
5c5980c  Audit fix round 4: M4 Upstash + C1 follow-up FK script
c37804c  Audit fix round 3: 2H + 4M + 3L (memo regen lock, monitor cron lease, truncation defense, SSRF, dispatch parallel, etc.)
2a405e4  Audit fix round 2: C2 regression + C1 + H4 (logEdit batch, merge FK list, share-link IDOR)
2286b5f  Polish backlog clear-out: 4 high + 8 medium + 5 low audit items
```

---

## Database state

**Migrations applied (38 total):** 00001-00038 inclusive.

Recent additions:
```
00027  monitor_pause              organizations.monitor_paused_until
00028  api_keys                   api_keys (hashed bearer tokens)
00029  address_canonical          USPS-style normalize_address rewrite
00030  public_profiles            borrower_public_profiles (E4 schema)
00031  investor_users             investor_users + investor_deal_queue
00032  bank_statements            bank_statement_summaries (C5 substrate)
00033  photo_verification         property_photo_verifications (C1 substrate)
00034  lender_overrides           data_edits + factor_overrides + source/lender_notes columns
00035  merge_atomic               merge_records_atomic RPC (initial; FK list incomplete)
00036  merge_atomic_complete_fks  merge_records_atomic with full FK list + public_profiles unique-handling
00037  ai_memo_version            borrower_validations.ai_analysis_version (regen lock — semantically inverted, removed in 057bdea but column kept for future token-claim use)
00038  introspect_fks             _introspect_merge_target_fks RPC (used by scripts/verify-merge-fks.ts)
```

---

## Items NOT addressed (deferred / blocked / manual)

### Deferred follow-ups (from earlier audits)
- **Property model Phase 2** — collapse `verified_flips` into
  `track_record_entries`. Plan in IDEAS.md → "Property model
  consolidation" + ROADMAP G3.6. Unblocks when Phase 1 proves out
  in 1-2 weeks of usage.
- **Token-claim AI regen concurrency control** — current regen is
  last-write-wins (works for single-user). Documented in IDEAS.md →
  "Multi-user / team workflow." Unblocks when multi-underwriter editing
  surfaces a wrong-memo bug.
- **D5 POST endpoint** — public REST is GET-only.
- **Liquidity factor reading bank statement data** — substrate stored
  (00032), threshold needs calibration.
- **photo_verified signal write** — verifications stored (00033),
  distance threshold needs calibration.
- **F3 investor self-serve signup flow** — investor_users table exists,
  no UI; lender INSERTs via SQL today.
- **F1 multi-dimension scenarios** — only LTV varies. LTC / ARV / FICO
  / loan_amount picker is v2.

### UX audit backlog
See "UX audit backlog" section above. ~22 findings still pending.

### Blocked on outside persons / vendor $
| Item | Blocked on |
|---|---|
| **C2** BatchData historical deeds | Vendor $ ($200-500/mo) |
| **C3** Reverse phone/email | Vendor $ (Hunter.io / NumVerify) |
| **D1** Email-forward intake | Resend inbound paid feature |
| **D3** Calendar integration | Post-NPLA per ROADMAP |
| **E3** Anonymized cross-tenant consensus | 10+ lenders + legal review |
| **E4 full** public profile renderer | Waits on E3 density |
| **F3 full** investor review UI | Post-NPLA per ROADMAP |
| **G1.2** Co-borrower modeling | Damon decision |
| **G2.2** TransUnion address validation | Noah's logins |
| **G2.3** Multi-state GC adapters | Per-jurisdiction research |

### Manual items (you)
1. **Add WP secrets to Build-Folio Anthropic Cloud env** before
   2026-06-01 14:08 UTC. claude.ai/code → enter session → env selector
   → Build-Folio settings gear → paste WP_URL/WP_USER/WP_APP_PASSWORD
   from `.env.local`.
2. **Print physical paper test** of `/handoff/[id]` +
   `/validations/[id]/risk-methodology`. (Hold-over from prior session.)
3. **OpenSanctions key rotation** by 2026-05-28.
4. **Cobalt key rotation** for demo capacity by ~2026-06-10.
5. **Activate Upstash Redis for rate limiter** — code is shipped + falls
   back to per-lambda in-memory until env vars exist. Steps:
   (a) sign up at upstash.com, (b) create a Redis database (Global
   tier free), (c) Vercel project → settings → environment variables
   → add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`,
   (d) redeploy. No code change; `src/lib/rate-limit.ts` auto-detects.
6. **Hard-refresh browser** (`Cmd+Shift+R`) on first visit today to
   bust cached old favicon.

---

## Critical context for next session

- **Test walkthrough is mid-flight.** Resume at Test 3c verification
  (just edit any property field → confirm memo regenerates within 60s),
  then Test 3d. Don't restart from Test 1 — those passed.
- **Tons of UX bugs were found via testing yesterday.** The user is
  driving testing surface-by-surface and the model is "find bug →
  fix on the spot → ship → continue testing." Maintain that rhythm
  rather than batching fixes.
- **CHECK BUILD STATUS** in Vercel after every push (history of silent
  webhook failures).
- **The unified property table is new.** If you see code referring to
  `TrackRecordTable` or the old "Verified Track Record" card-with-rows
  layout, that's stale — the page now uses
  `<UnifiedPropertyTable>` and a slimmer `<VerifiedTrackRecord>` card
  that only carries the workflow surface (share link + paste form).
  See `src/components/dashboard/unified-property-table.tsx`.
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
- **Truong test validation:** `/dashboard/validations/75411344-75a0-4a60-bd7d-8340f227a672`
- **Last shipped commit:** `40cfe35` (mutation polling wiring)
- **Demo runbook plan:** `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md`
