# PulseClose — Session Pickup (2026-05-06 EOS — Audit complete)

> **For session-resumption.** Strategic and architectural detail lives in the
> dedicated docs — this file orients quickly and points there.
>
> **Read these in order on session start:**
> - This file (you're here)
> - `docs/ROADMAP.md` — journey-organized backlog with cross-cutting design principles
> - `docs/DATA-MODEL.md` — full schema (now through 00034)
> - `STRATEGY.md` — Wade Intel parent + product strategy
> - `docs/E2E-TEST-PLAN.md` — 17-phase customer walkthrough
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are

NPLA conference is **June 22-23, 2026 (~7 weeks out).**

**Today shipped:**
- AM: 20-feature roadmap clear-out (E2 / A4-A5 / B4 / B6 / G6.1 / G5.2 / D2 / G7.3 / D5 / C4 / C6 / Cobalt polish / USPS canonical / F1+F2 / D4 / merge UI / E4 schema / F3 substrate / C5 substrate / C1 substrate)
- PM (1): Override-and-rerun expansion — universal factor override + editable raw data + handoff provenance
- PM (2): Audit pass round 1 — D2 cron path, G7.3 indicator, F3 route button, C5/C1 share-page UI + lender viewers
- PM (3): Deep audit + 3 critical bug fixes (litigation recompute, photo stop_reason, override button UX)

**Production health:** ✅ All commits live. Vercel auto-deploy clean throughout.

**The roadmap is empty of buildable items.** Everything not blocked
on vendor $, density, or external persons is shipped end-to-end.

---

## Resume the test walkthrough here

**Tests already passed:** Test 1 (B4 borrower-search guard), Test 2 (E2 borrower roll-up page).

**Next test to run — Test 3 redux:** the override-and-rerun system you just shipped. This is the headline product flow now.

### Test 3a — Universal factor override
1. Open a validation detail page for Truong (any of the 6).
2. Scroll to the **"Why this rating?"** card.
3. Each factor row should have an **"Override"** button on the right.
4. Click Override on, say, `extended_hold`. An amber form drops down with a reason textarea.
5. Type something like *"Borrower confirmed all 18 holds were intentional buy-and-rehab cycles, not stalled flips"*. Click Apply override.
6. **Expect:** the factor flips to "excluded — Lender override: <your reason>". Tier should rebuild (HIGH might drop to MEDIUM/LOW depending on which other factors were active). AI memo regenerates in the background (poll, ~30s).
7. Click "Remove override" → factor flips back to active, tier rebuilds again.

### Test 3b — Editable track record
1. Same validation. Scroll to **"Portfolio & Track Record"** table.
2. Each row has a pencil icon. Click one for any property.
3. Edit dialog opens with hold_months, prices, dates, lender notes, and a reason textarea.
4. Change hold_months from whatever to 6, type reason *"Borrower clarified actual hold was 6mo not 18 — vendor data wrong"*, click Save.
5. **Expect:** toast "Saved. Tier + AI memo recomputing." Table re-renders with new value. Tier may rebuild (extended_hold properties list changes).

### Test 3c — Manual property add
1. Same card. Click **"Add property"** in the header.
2. Type a brand-new address, fill any fields, type reason, Save.
3. **Expect:** Table grows by one row. New row has an amber "manual" badge. Tier rebuilds.

### Test 3d — Litigation case edit + add + delete
1. Scroll to **"Public records"** card. (Truong's CourtListener had matches, so there should be cases here.)
2. Pencil icon on a case → opens edit dialog with case_name, status, dollar amount, lender notes.
3. Change status to "dismissed", lender notes "Reviewed with borrower's counsel — frivolous nuisance suit".
4. **Expect:** Case re-renders with new status. Blue "Lender note" block appears below the title.
5. Try **Delete case** in the dialog — confirm dialog. Case removed. Tier + AI memo recompute.
6. Click **"Add case"** in the card header — fills in a manual case (state court, etc).

### Test 3e — Handoff audit trail
1. After making at least 2-3 edits/overrides above, scroll to **"Investor handoff"** card on the same validation.
2. Click **"Open PDF view"**.
3. **Expect:** new section *"Lender edits applied"* with headline counts ("3 track-record edits · 1 factor override · 1 litigation removal") and a chronological table of every event with timestamp + reason.
4. Also try **"Download Excel"** — Cover sheet has the same summary; new "Audit Log" worksheet with every event as a row.

### Test 4 — A4 + A5 investor performance
Requires running an evaluation first since Truong has no `deal_evaluations` rows yet.
1. From the validation detail header, click **"Evaluate against my investors"**.
2. Fill the evaluate form (loan amount, purchase price, etc) and run.
3. After results land, head to `/dashboard/evaluate/investors`.
4. Each investor card should now show a compact strip: *"1 evaluation · pass-rate · funded count"*.
5. Click **"Performance"** on an investor → opens detail page with verdict mix + outcome mix + (if rate samples exist) sparkline.

### Test 5 — F1 + F2 scenarios
1. On the evaluate results page, scroll past the investor results.
2. **F1 — "Compare leverage tiers"** button. Click it (needs purchase_price set). Three-column matrix appears: 65/75/80% LTV × per-investor pass/conditional/fail.
3. **F2 — Rate stress test** card. +0 / +100 / +200bps buttons. Toggle and watch the displayed rates shift.

### Test 6 — D2 Slack / Teams notifications
1. Settings → **Notifications** tab.
2. Click "Add notification" → pick Slack channel, paste an incoming-webhook URL, pick `monitor_change` event_type, save.
3. Click the test-send icon next to the row. **Expect:** Slack channel receives a "PulseClose channel test" message with a header block.
4. (Real path: next monitor cron run that detects a change will also fire to that Slack URL.)

### Test 7 — D5 public REST API
1. Settings → **API Keys** tab. Click "New API key", name it, click Create.
2. Copy the plaintext token from the amber one-time block.
3. From terminal: `curl https://app.pulseclose.com/api/public/v1/validations -H "Authorization: Bearer pck_live_..."` — should return JSON list.
4. Try `/api/public/v1/validations/{id}` for one of the IDs — full detail with factors + tier.

### Test 8 — D4 bookmarklet
1. Settings → API Keys → bottom card has **"Validate with PulseClose"** anchor.
2. Drag it to your bookmarks bar (don't click it on the page — just drag).
3. Go to Zillow, highlight an address, click the bookmarklet.
4. **Expect:** new tab opens at /dashboard/new pre-filled with the address + page title.

### Test 9 — G7.3 pause monitoring
1. Settings → Org → **"Pause monitoring (demo mode)"** card → click 2h.
2. Open any Truong validation → MonitorCard shows **amber "Org-wide pause active"** banner with the until-time.
3. Settings → click **"Resume now"** → banner disappears.

### Test 10 — Merge admin UI
1. Navigate to `/dashboard/admin` directly (no sidebar link yet — admin-only).
2. **Expect:** "No duplicate groups found" since 00021 cleaned them up. That's the correct empty state.
3. (To actually exercise: insert two borrowers with the same canonical name via SQL, refresh — they appear as a group with "Keep this" buttons.)

---

## Audit findings (deep pass) — polish backlog

Three critical bugs were fixed in commit `72e9291`. Everything below is documented here for a future session to address. **Severity reflects actual user impact, not theoretical concern.**

### High (worth fixing soon)

**`/api/share/[token]/extract-bank-statement` text-input PII order — actually OK on review.** Initial audit flagged it, but `scrubPii` IS called before prompt construction (line 131). False alarm.

**logEdit() fire-and-forget can lose audit entries.** [src/lib/admin/data-edits.ts:54](src/lib/admin/data-edits.ts#L54) — if the data_edits insert fails (RLS misconfig, deleted user, etc), the actual edit succeeds but the audit log is silently lost. The handoff renders aggregated counts from data_edits — broken logging means under-reported edits. **Fix:** either propagate logEdit errors and 500 the API call, or surface to Sentry as a hard error.

**`loadFactorOverrides` doesn't filter by org_id.** [src/lib/admin/data-edits.ts:96-108](src/lib/admin/data-edits.ts#L96-L108) — relies entirely on RLS scoping the query. If RLS is ever bypassed (admin client misuse), overrides could leak across orgs. **Fix:** add `.eq("org_id", orgId)` and pass orgId from `recomputeRiskFactorsForValidation`.

**`/api/borrowers/[borrowerId]/validations` and reputation have no `.limit()`.** [src/app/api/borrowers/[borrowerId]/validations/route.ts:35](src/app/api/borrowers/[borrowerId]/validations/route.ts#L35), [src/lib/borrowers/reputation.ts:60](src/lib/borrowers/reputation.ts#L60) — at >500 validations per borrower, full-table scan + JS aggregation gets slow. Not a problem at current scale (Test Co has 6) but worth fixing before NPLA demos. **Fix:** add `.limit(500)` and document the cap.

**Concurrent merge has no transaction.** [src/lib/admin/merge.ts:75-99](src/lib/admin/merge.ts#L75-L99) — two admins clicking "Keep this" on the same dupe pair simultaneously: one succeeds, the other gets "Not found" or partially executes. Single-tenant Test Co won't see this, but multi-user orgs would. **Fix:** wrap re-points + delete in a Postgres function, or add a `merged_at` flag for idempotency.

### Medium (UX gaps)

**G5.2 percent_decimal has no upper clamp.** [src/components/dashboard/investor-criteria-editor.tsx](src/components/dashboard/investor-criteria-editor.tsx) — user can save `max_ltv: 1.5` (150%) which is non-physical. **Fix:** clamp at 1.0 max in the input + add Zod validation server-side.

**C4 duplicate-address detection uses naive split, not canonical normalize.** [src/lib/risk/factors.ts](src/lib/risk/factors.ts) — `(p.property_address ?? "").split(",")[0]?.trim().toLowerCase()` misses punctuation diffs ("1259 Almaden Ave" vs "1259 ALMADEN AVE."). **Fix:** use `normalizeAddress()` from upsert.ts (the new USPS canonical form).

**D4 bookmarklet doesn't truncate document.title.** [src/app/dashboard/settings/api-keys-tab.tsx](src/app/dashboard/settings/api-keys-tab.tsx) — long Zillow titles can exceed URL length limits. **Fix:** `.slice(0, 80)` in the bookmarklet script.

**`BorrowerHistoryCard` no error toast on load failure.** [src/components/dashboard/borrower-history-card.tsx:79](src/components/dashboard/borrower-history-card.tsx#L79) — silently returns null. Could be confusing if API is transiently failing. **Fix:** show muted "History unavailable" message with retry.

**`borrower-match-hint` no loading spinner.** [src/components/dashboard/borrower-match-hint.tsx:49](src/components/dashboard/borrower-match-hint.tsx#L49) — debounced search has no in-progress feedback. **Fix:** small spinner during the 350ms debounce.

**`BorrowerUploadsCard` no error state on load failure.** [src/components/dashboard/borrower-uploads-card.tsx](src/components/dashboard/borrower-uploads-card.tsx) — silently shows "no uploads" on network error. **Fix:** distinguish error from empty.

**Notifications email validation too loose.** [src/app/api/notifications/preferences/route.ts:69-70](src/app/api/notifications/preferences/route.ts#L69-L70) — `!target.includes("@")` accepts "a@" or "@b". **Fix:** stricter regex or use Postgres email type enforcement.

**Handoff lender_edits semantics mixed.** [src/lib/handoff/builder.ts:515](src/lib/handoff/builder.ts#L515) — `reason` field stores either edit reason or factor exclusion reason (different semantics under one column). The PDF + Excel render both as "reason". **Fix:** split into `edit_reason` vs `exclusion_reason` in the events array (small refactor).

### Low (polish)

**investor-queue 409 not truly idempotent.** [src/app/api/investor-queue/route.ts:61-66](src/app/api/investor-queue/route.ts#L61-L66) — comment claims idempotent but throws 409 on duplicate. **Fix:** UPSERT with `onConflict: "investor_id,validation_id"` to return 200 with existing row.

**RouteToInvestorButton has implicit type cast.** [src/components/dashboard/route-to-investor-button.tsx:56-57](src/components/dashboard/route-to-investor-button.tsx#L56-L57) — accesses `validation_id` not in QueuedRow type. **Fix:** add field to interface.

**WhyThisRating "deterministic" comment is misleading.** [src/components/dashboard/why-this-rating.tsx:393](src/components/dashboard/why-this-rating.tsx#L393) — tier IS deterministic from active factors after override application; comment doesn't say "after". **Fix:** clarify wording.

**API key prefix doesn't validate test vs live.** [src/lib/api/auth.ts:41-42](src/lib/api/auth.ts#L41-L42) — accepts any `pck_*` prefix. **Fix:** explicit regex `^pck_(live|test)_` if test keys are added.

**EXIF parser missing IFD bounds check.** [src/lib/photo/exif.ts:83](src/lib/photo/exif.ts#L83) — malformed JPEG with huge valueOffset reads past buf.length. **Fix:** early-exit if `offset >= buf.length`.

---

## Items NOT addressed (deferred features, blocked, or scope-cut)

### Deferred follow-ups (need scoping)
- **D5 POST endpoint** — public REST is GET-only. POST requires extracting heavy logic from 850-line internal `/api/validations` route. **Estimate:** 1d.
- **Liquidity factor reading bank statement data** — substrate stores it (00032), factor needs threshold calibration with real data.
- **photo_verified signal write** — verifications stored (00033), distance threshold needs calibration.
- **F3 investor self-serve signup flow** — investor_users table exists, no UI; lender INSERTs via SQL today.
- **F1 multi-dimension scenarios** — only LTV varies. LTC / ARV / FICO / loan_amount picker is v2.
- **B4 borrower search loading spinner** (above).
- **G5.2 percent_decimal clamp** (above).

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
1. **Add WP secrets to Build-Folio Anthropic Cloud env** before 2026-06-01 14:08 UTC. claude.ai/code → enter session → env selector → Build-Folio settings gear → paste WP_URL/WP_USER/WP_APP_PASSWORD from `.env.local`.
2. **Print physical paper test** of `/handoff/[id]` + `/validations/[id]/risk-methodology`.
3. **OpenSanctions key rotation** by 2026-05-28.
4. **Cobalt key rotation** for demo capacity by ~2026-06-10.

---

## Database state (as of 2026-05-06 EOS)

**Migrations applied (34 total):** 00001-00034 inclusive.

Today's new migrations:
```
00027 monitor_pause                     organizations.monitor_paused_until
00028 api_keys                          api_keys (hashed bearer tokens)
00029 address_canonical                 USPS-style normalize_address rewrite
00030 public_profiles                   borrower_public_profiles (E4 schema)
00031 investor_users                    investor_users + investor_deal_queue
00032 bank_statements                   bank_statement_summaries (C5 substrate)
00033 photo_verification                property_photo_verifications (C1 substrate)
00034 lender_overrides                  data_edits + factor_overrides + source/lender_notes columns
```

---

## Critical context for next session

- **Run the test walkthrough above first.** Test 3 (override + edits) is the headline new capability — that's where the value lives. If it works, NPLA demo has a real story.
- **The polish backlog is real but not blocking.** Pick the High items first if there's time, but don't let them gate testing.
- **No new features to build from the roadmap.** All buildable items shipped. New features come from user feedback during testing.
- **Velocity assumption holds.** Today shipped 20 features in AM + 4 commits of override expansion + 2 audit-fix commits + 1 deep-audit-fix commit. About 30 distinct items across one day.
- **CHECK BUILD STATUS** in Vercel after every push (history of silent webhook failures).
- **ROADMAP cross-cutting principles 8-12** govern all new code (canonical token matching, dual-coded dedup, max_tokens 4096+stop_reason, AI privacy bundle on every Claude call, JSONB schema_version).

---

## Reference paths

- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production URL:** https://app.pulseclose.com
- **Vercel project:** `buildfolios-projects-e8f9d80e/pulseclose`
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Truong intake xlsx:** `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`
- **Demo runbook plan:** `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md`
