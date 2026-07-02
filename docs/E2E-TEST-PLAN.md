# PulseClose — End-to-End Test Plan (customer walkthrough)

**Last updated 2026-05-05.** Walks the entire product as a real lender
would experience it, top-to-bottom. Designed so you can read it once
and run through every surface in ~90 minutes — pause-and-resume via the
Phase headers.

> **Setup (do once before starting):**
> 1. Production URL: https://app.pulseclose.com
> 2. Test data: `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`
> 3. Logged in as the founder org (Test Co, plan=internal, unlimited).
> 4. Have a second incognito window ready for the borrower share-link
>    portion (Phase 8) and the AI-disabled path (Phase 13).
>
> **Pass / fail conventions:**
> - ✅ Renders correctly + no console errors + Supabase row appears.
> - ⚠️ Renders but with a quality issue (wording, spacing, missing data).
> - ❌ Errors out, blocks the next step, or shows wrong data.
>
> Capture screenshots / notes on anything ⚠️ or ❌ so we can fix in a
> follow-up sweep.

---

## Phase 0 — First-touch + nav

The lender's first 60 seconds in the platform. If anything here feels
off, the rest of the journey is uphill.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 0.1 | Open `https://app.pulseclose.com` (no session) | Lands on landing page with "Log in" CTA | Brand: navy + accent blue, no buzzwords |
| 0.2 | Click Log in → enter credentials → submit | Lands on `/dashboard` | Magic-link flow if used; Supabase auth callback resolves |
| 0.3 | Read sidebar | 4 nav items: Validations / Activity / Evaluate / Investors / Usage (+ Settings under user) | No legacy single-check pages (G3.5 — they were deleted) |
| 0.4 | Tab through sidebar items, confirm each route loads cleanly | All routes render | No 500s; no flashes of unstyled content |
| 0.5 | Open user menu → Settings → confirm 3 tabs (Organization / Team / API Keys) | All tabs render | Plan badge shows `internal`; "Internal — unlimited checks" footnote present |

---

## Phase 1 — Settings & AI privacy

| # | Action | Expected | Watch for |
|---|---|---|---|
| 1.1 | Settings → Organization tab | Org Details card + AI & Privacy card + Current Plan card | Toggle defaults to **Enabled** |
| 1.2 | Read AI & Privacy description | Mentions "PulseClose strips SSNs / phones / emails from spreadsheet & CSV inputs" + "PDFs go to Claude's native PDF support intact" + "tokens for borrower / entity / property / lender names" | Honest about the PDF gap (audit-fix #3) |
| 1.3 | Click Disable | Optimistic flip → toast "AI extraction disabled" → button label "Enable" | Reload — state persists |
| 1.4 | Re-enable | Toast "AI extraction enabled" | (Will gate Phase 13 later) |
| 1.5 | Team tab | Lists current users; Invite form shows "Coming soon" | Disabled state is opacity-50 + pointer-events-none |
| 1.6 | API Keys tab | Mock key shown masked; copy button works | Note: keys are mock for v1 |

---

## Phase 2 — Intake (Stage 1)

The drop-the-xlsx moment. This is where the lender says "oh, that's
fast" — or doesn't.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 2.1 | Sidebar → New (or Validations → New) | `/dashboard/new` form opens | Form fields: borrower_name, borrower_entity_name, entity_state, guarantor_name, addresses textarea, optional GC fields |
| 2.2 | Drop the **Truong xlsx** onto the doc-ingest box | Within ~5s: form fields populate (Kim An Truong / TT Investment Properties LLC / CA / Kim Thanh Thi Truong); addresses textarea fills with ~50 lines | Doc-ingest extracts addresses too (G1.1) — confirm 50-cap is respected |
| 2.3 | Inspect the addresses textarea | Each address on its own line, includes `, City, ST ZIP` envelope | Address parser fix (8a5a043) — shouldn't be raw multi-line garbage |
| 2.4 | Click Run validation | Redirects to `/dashboard/validations/[id]` in `pending` state | Loading skeletons render in pillar areas |
| 2.5 | (Bonus) Try a corrupt xlsx or PDF over 10MB | Friendly error: "File too large" or "Could not parse extraction response" | Don't break the form; user can fall back to manual fill |

---

## Phase 3 — Validation run (Stage 2)

The pillars resolve asynchronously via `after()` callbacks. The page
should refresh itself as adapters return.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 3.1 | Watch the detail page after submit | Within ~30s: confidence score + experience tier appear | All four summary chips populate |
| 3.2 | Confirm Cobalt SOS lookup landed | Entity card shows real SOS data: Active / suspended / formation date / registered agent | If Cobalt rate-limited (429), backoff path should still let the page render — sub-status shown |
| 3.3 | Track Record pillar | ~28 properties appear in the table; portfolio value, equity, LTV computed | Lender names link or display cleanly |
| 3.4 | VerifiedTrackRecord block (G3.1 places it ABOVE the operational layer) | Within ~30s: "X confirmed sold / Y held / Z never owned" appears for the submitted addresses | Real Truong test: 3 owned_and_held + 20 never_owned + 1 not_found |
| 3.5 | Litigation card | "Federal-only" disclaimer present; `0 found` for Truong (no federal cases) | If it says "federal" without saying "only" we have a wording gap |
| 3.6 | Sanctions card | OpenSanctions screen result; **Names Screened** lists borrower + entity + officers + agent | Should NOT have stale "TT Investments" → false-positive UK firm match (worked around via canonical naming) |
| 3.7 | GC card | "No GC provided" if blank, or full license/insurance/disciplinary chips if filled | CSLB only covers CA — for non-CA test, expect "manual" path |
| 3.8 | AI memo (Story Mode v2) | Renders within ~60s with strengths / risks / recommendations sections | **References "Kim An Truong" / "TT Investment Properties, LLC" by full name** (proves AI privacy round-trip works) |

---

## Phase 4 — Override-and-rerun (Stage 4)

PulseClose's product is "the lender disagrees, the system recomputes" —
make sure that loop is tight.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 4.1 | Find a property in Track Record marked as a primary residence flag (occupancy_role) | Set the signal `is_primary_residence: true` via the inline override | Risk factors recompute atomically (no flicker showing zero factors) |
| 4.2 | Confirm extended_hold factor for that property is now **excluded** | Why This Rating shows it as excluded with the override reason | Memo regenerates (queued via `after()`, ~30s) |
| 4.3 | Manually flip occupancy back | Factor returns; AI memo regenerates again | `regenerated_memo` activity event |
| 4.4 | Try overriding the lender_classification on a property | `lender_classification_override` should affect lender_concentration math | Override-and-rerun is the product, not a workaround |

---

## Phase 5 — Evaluate against investors (Stage 5)

The validate → evaluate → handoff arc (Batch 1 closed this).

| # | Action | Expected | Watch for |
|---|---|---|---|
| 5.1 | On the detail page, click **"Evaluate against my investors →"** | Routes to `/dashboard/evaluate/[id]` with deal form pre-filled with borrower / entity / properties | URL pre-fill (G5.1) |
| 5.2 | Add deal-level fields: loan amount, FICO, experience level, property type | Per-investor eligibility cards appear | Each shows pass/fail + breakdown |
| 5.3 | Drill into one investor | See the engine's per-rule pass/fail trace | If any rule shows raw key like `min_fico` instead of human label, ⚠️ |
| 5.4 | Click **"Generate handoff for top-match investor"** | Routes back to detail page → HandoffCard pre-fills with that investor's terms | (G6.2) |

---

## Phase 6 — Handoff (Stage 6)

| # | Action | Expected | Watch for |
|---|---|---|---|
| 6.1 | HandoffCard on detail page | "Save before download" pattern; narrative + preparer name + email fields | Save persists `handoff_data` JSONB |
| 6.2 | Click Download Excel | Workbook downloads; opens in Excel/Numbers cleanly | Activity feed gets `sent_handoff` with `metadata.artifact = "excel"` |
| 6.3 | Click Download PDF | PDF downloads; opens in viewer | Same activity event with `artifact = "pdf"` |
| 6.4 | Open `/handoff/[id]` directly (the printable view) | Renders the same data in print-friendly layout | **Deferred manual: physically print** to verify margins/page-breaks before NPLA |
| 6.5 | Open `/validations/[id]/risk-methodology` | Renders the methodology PDF view | Same print test caveat — see Open decisions #2 in pickup.md |

---

## Phase 7 — Investor management + A1 PDF parser (NEW Batch 2)

This is the NPLA hero feature. If you have a real fund's guidelines
PDF, use it — otherwise generate a fake one with 5-10 criteria lines
to exercise the path.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 7.1 | `/dashboard/evaluate/investors` | Lists existing investors (3 sample seeds + any you've created) | Each card shows criteria count badge |
| 7.2 | Click "Create" with a new display name | Auto-seeds 8 starter criteria rows | Card appears immediately |
| 7.3 | On any investor card, click **"Upload PDF"** | Modal opens with drop zone | "PDF only, max 15MB" |
| 7.4 | Drop a fund guidelines PDF | "Extracting…" state for ~30s, then preview table | Each row shows criteria_key + JSON value + confidence badge (high/medium/low) |
| 7.5 | Inspect confidence chips | High = green-ish (default), Medium = secondary, Low = outline + auto-deselected | Unknown criteria_keys show "unknown key" outline badge |
| 7.6 | Toggle a row off, edit a JSON value inline | Selection state updates; bad JSON shows "Invalid JSON" inline | "Accept" disables until JSON is valid |
| 7.7 | Click **"Accept N rows"** | Toast "Saved N criteria rows"; modal closes; card refreshes with new criteria | Old rows for the same `criteria_key` get `effective_to=today`; new rows have `source='pdf_parse'` |
| 7.8 | Verify activity in `/dashboard/activity` | Two `extracted_investor_criteria` rows: one stage="extracted", one stage="accepted" | Audit trail closed |
| 7.9 | Disable AI in Settings → re-try Upload PDF | Modal shows: "AI extraction is disabled for this organization. Enable it in Settings → AI & Privacy, or paste the criteria manually via Edit criteria." | 503 with code AI_DISABLED |
| 7.10 | Re-enable AI; re-extract; pick **0 rows** + click Accept | Toast: "Select at least one row to save." | Won't fire empty save |
| 7.11 | Try uploading a non-PDF (e.g. .xlsx) | 415 with "PDF only for v1" message | Clean error |

---

## Phase 8 — Borrower share link (Stage 3 — borrower side)

Tests the share-link UX from outside the lender's session.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 8.1 | On the detail page, click **"Send to borrower"** on VerifiedTrackRecord | Inline form: borrower email + custom message | (G3.2) |
| 8.2 | Send to your own email | Resend email arrives within seconds | Activity feed: `sent_share_link` |
| 8.3 | Open the share link in **incognito** (no auth) | Borrower-facing page renders with property list | No PulseClose chrome / sidebar |
| 8.4 | Paste 3 manual addresses → Verify | Each address goes through Realie deed-chain check | Returns within ~10s |
| 8.5 | Upload an xlsx of addresses | Claude extracts addresses → preview list → submit | Toast: "Extracted N addresses — review before submitting" |
| 8.6 | Disable AI in Settings, then retry the share-link upload | 503 friendly toast: "AI extraction is disabled..." | Borrower can still paste manually |
| 8.7 | (Lender side, after borrower verifies) Refresh the detail page | VerifiedTrackRecord block updates with new flips | AI memo regenerates with verified-flip stats |

---

## Phase 9 — Continuous monitoring + B1 borrower watchlist (NEW Batch 2)

| # | Action | Expected | Watch for |
|---|---|---|---|
| 9.1 | Scroll to MonitorCard on detail page | "Off — Enable monitoring" button visible | (Default off — opt-in) |
| 9.2 | Click Enable monitoring | Card flips to "weekly" cadence; user's email auto-added to recipients | Activity: `subscribed_to_monitor` (scope=validation) |
| 9.3 | Add a second recipient email | Badge appears; persists on reload | Email validation happens server-side |
| 9.4 | Toggle **"Email only on critical changes"** | Checkbox state persists | (B1 — `critical_only` column) |
| 9.5 | Pause monitoring | Card switches to "Off"; activity gets `unsubscribed_from_monitor` | Sub row stays (enabled=false) — not deleted |
| 9.6 | Below the per-validation block, find **"Watch this borrower"** | Sub-section with Watch borrower button + cadence + critical-only | (B1 — borrower-level template) |
| 9.7 | Click "Watch borrower" | Toggle flips; copy reads "Every new validation for [borrower] auto-enables monitoring" | Activity: `subscribed_to_monitor` (scope=borrower) |
| 9.8 | Run a NEW validation for the same borrower (drop Truong xlsx again) | After POST, the new validation has an enabled monitor sub | Activity metadata: `inherited_from_borrower=true` |
| 9.9 | (Optional) Trigger cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://app.pulseclose.com/api/cron/monitor` | Returns `{ processed, changes_found, errors, remaining_due }` | Borrower-level template should NOT appear in `processed` (cron filters `validation_id IS NOT NULL`) |
| 9.10 | If a sub had a real change (e.g. entity status flip), check inbox | Email arrives with subject "PulseClose: N changes on [borrower]" | Critical-only filter respected: a filing-date drift won't email if `critical_only=true` |
| 9.11 | Stop watching the borrower | Toggle flips; activity gets `unsubscribed_from_monitor` (scope=borrower) | Existing per-validation subs stay — only the template is disabled |

---

## Phase 10 — Deal outcome capture (NEW Batch 2 — E1)

The substrate for everything reputation. Without rows here, E2/A4/A5
have nothing to feed on.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 10.1 | Scroll to DealOutcomeCard between Monitor and Activity | Card shows "No outcome recorded yet" + Set outcome button | Empty state present |
| 10.2 | Click **Set outcome** | Modal opens with 5-status grid (Withdrawn / Funded / Extended / Repaid / Defaulted) + per-status icon | Status selector is a button grid, not a dropdown |
| 10.3 | Pick **Funded** → set close_date + funded_amount → Save | Toast "Outcome set to Funded"; card re-renders with badge + dl entries (close date, funded amount, last updated) | Activity feed: `reported_outcome` with status + funded_amount metadata |
| 10.4 | Click **Update** → switch to **Defaulted** → enter default_cause → Save | UPSERT replaces the row (status=defaulted, prior fields cleared) | Last status wins — idempotent |
| 10.5 | Click Update → **Extended** → fill extension_reason → Save | Card re-renders with the new field | Confirms per-status fields render correctly |
| 10.6 | Click Update → **Repaid** with no extra fields → Save | "No additional fields needed for this status" message in modal | Validates withdrawn/repaid don't require fields |
| 10.7 | Verify in DB (via Supabase admin or psql): `select * from audit_log where action='deal_outcome.set' order by created_at desc limit 5;` | Each Save creates a fresh row | Compliance audit chain intact |

---

## Phase 11 — Activity feed (B5)

| # | Action | Expected | Watch for |
|---|---|---|---|
| 11.1 | Sidebar → Activity (or `/dashboard/activity`) | Reverse-chrono feed with day grouping (Today / Yesterday / dates) | Actor name + verb + subject all rendered cleanly |
| 11.2 | Verb-filter pills | Click `reported_outcome` | Feed filters to outcome events only |
| 11.3 | Click `extracted_investor_criteria` filter | Feed filters to A1 events; should see both `stage="extracted"` and `stage="accepted"` rows | Metadata renders in subtitle |
| 11.4 | Click `subscribed_to_monitor` | Filter to monitor subscriptions; see both validation-scope and borrower-scope events | scope visible somewhere |
| 11.5 | "Load more" | Appears when >50 events; loads next page | Pagination cleanly transitions |
| 11.6 | On a validation detail page, scroll to ActivityStrip at bottom | Shows recent events for THIS validation only | "See all" → routes to `/dashboard/activity?subject_id=<id>` |
| 11.7 | Visit the subject-filtered URL directly | Same filtered feed | URL is shareable |

---

## Phase 12 — Compare (S1) + Validations list

| # | Action | Expected | Watch for |
|---|---|---|---|
| 12.1 | `/dashboard/validations` | List of all validations with tier badges + flag counts | Sortable / filterable |
| 12.2 | Click any validation | Detail page renders | Same flow as Phase 3+ |
| 12.3 | `/dashboard/compare` | Two-borrower side-by-side picker | Wraps in Suspense (PR 14 fix) |
| 12.4 | Pick 2 validations, hit Compare | Side-by-side delta view | Tier / experience / pillar status diffs visible |

---

## Phase 13 — AI privacy disabled path (full sweep)

Settings → AI & Privacy → Disable. Now retry the AI surfaces.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 13.1 | Drop xlsx into doc-ingest | 503 with friendly message: "AI extraction is disabled for this organization." | DocIngest component surfaces error |
| 13.2 | Run a new validation manually (fill the form by hand) | Validation completes; risk factors compute deterministically; **no AI memo** appears | Detail page shows "AI memo disabled" placeholder OR no memo block |
| 13.3 | Open Settings → upload PDF on an investor | 503 with friendly message + suggestion to use Edit criteria | A1 modal handles AI_DISABLED specifically |
| 13.4 | Borrower share-link upload (incognito) | 503 toast + paste-manually fallback works | (Phase 8.6 covered this) |
| 13.5 | Re-enable AI | Run another validation → memo regenerates normally | Confirm the gate is the only blocker |

---

## Phase 14 — Edge cases & error handling

These are the "didn't think to test" cases that bite during demos.

| # | Action | Expected | Watch for |
|---|---|---|---|
| 14.1 | Submit validation with empty addresses textarea | Run completes; verified_flips block hidden / shows empty state | No "0 addresses verified" alarm |
| 14.2 | Address with weird shape: `71 WEBBER WAY 77, BUENA PARK, CA 90621` | Returns "Address not found" gracefully (G2.4 — open) | Don't crash the run |
| 14.3 | Borrower name shorter than 3 chars (e.g. "AB") | Risk factors compute; no name-redaction false-positives in memo | (MIN_REAL_LENGTH=3 in redact.ts) |
| 14.4 | Try uploading 50+ addresses | First 50 land; rest truncated with note | (50-cap in extract route) |
| 14.5 | Invalid investor JSON in Edit criteria | Save returns 400 with key-by-key errors | UI highlights bad rows |
| 14.6 | Disable monitoring on a sub mid-run (set `enabled=false` while cron is running) | Cron completes the in-flight run; next tick skips | No half-state |
| 14.7 | Cobalt rate-limited (429) during a validation | Backoff path emits `rate_limited` adapter status; entity card shows "rate-limited" sub-state | Validation still completes; user can retry later |
| 14.8 | OpenSanctions API key invalid | Auto-falls-back to OFAC SDN direct | Sanctions card still renders |
| 14.9 | Claude returns truncated JSON (max_tokens hit) | doc-ingest / share-extract / investor PDF: "Document too large — Claude truncated" | (Principle 11 — truncation defense) |
| 14.10 | Try to view another org's validation by ID-guessing in URL | 404, not 403 | RLS blocks; cleaner 404 prevents probing |

---

## Phase 15 — Usage & billing

| # | Action | Expected | Watch for |
|---|---|---|---|
| 15.1 | `/dashboard/usage` | Current period meter + per-check breakdown | Test Co is `internal` plan — unlimited |
| 15.2 | (If on a paid plan) Hit cap | Validation form returns 402 | Upgrade CTA visible |
| 15.3 | Manage Billing button (if Stripe sub) | Routes to Stripe customer portal | Returns cleanly |

---

## Phase 16 — Final checklist before NPLA

| # | Item | How to verify |
|---|---|---|
| 16.1 | All 51 migrations idempotent on a **fresh** tenant (00001–00051) | Spin up a 2nd test org; run `supabase db push` from scratch; validate one xlsx through full flow |
| 16.2 | Print test on real paper | Cmd+P on `/handoff/[id]` and `/validations/[id]/risk-methodology`; check page-breaks, margins, color rules |
| 16.3 | OpenSanctions key rotated before 2026-05-28 | New trial key in `OPENSANCTIONS_API_KEY` (Vercel + .env.local); run one validation with sanctions-positive borrower |
| 16.4 | Cobalt key rotation strategy in place by ~6/10 | Either round-robin in `cobalt.ts` or env-swap pre-demo; document in pickup |
| 16.5 | Vercel auto-deploy webhook reliability | Confirm last 5 git pushes auto-deployed via `vercel ls pulseclose | head -8` (some have failed silently this session — fall back to `vercel deploy --prod --yes` if no fresh row) |
| 16.6 | Demo runbook walked end-to-end | `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md` Phase 1-7 |
| 16.7 | Damon decisions in (see pickup.md "Action items for outside persons") | Truong xlsx interpretation, co-borrower modeling, address shapes, Insignia AI policy, testimonial |

---

## What this plan deliberately doesn't cover

- **Cron scheduling correctness over time.** The cron runs daily at 9
  UTC; you can manually trigger via curl + secret to test the
  pipeline, but cadence drift over weeks/months requires real time.
- **Email deliverability under load.** Resend handles single sends
  fine; bulk burst (50+ subs flipping at once) is untested.
- **Real Stripe charge / refund flow.** The internal plan bypasses
  metering; paid-plan smoke testing requires a real test card and a
  pricing-tier validation that goes over the cap.
- **Multi-org isolation under contention.** RLS works in single-org
  tests; cross-tenant under load requires a 2nd active org.
- **Mobile + tablet layouts.** Some cards have `md:` breakpoints (GC,
  Track Record, MonitorCard) but mobile UX is untested. Important
  before public launch, not for the Damon demo.

---

## Bug-finding heuristics (where bugs hide)

When you ⚠️ or ❌ something, check whether it falls in these patterns
before opening a fix:

1. **Truncation class** (Principle 11) — any `JSON.parse` on a Claude
   response. If the rendered output is missing data, check
   `stop_reason: "max_tokens"` first.
2. **Canonical-name dedup divergence** (Principle 10) — if you see
   duplicate borrower / entity / lender rows, the SQL
   `canonicalize_name()` function and JS `canonicalizeName()` mirror
   may have drifted.
3. **Tokenize-and-set matching** (Principle 8) — if a name comparison
   misses or false-matches, ensure both sides went through token-set
   not substring.
4. **Activity event missing from feed** — confirm the verb is in the
   `ActivityVerb` union in `src/lib/events/emit.ts`. If not, no
   typecheck would catch it; `extracted_investor_criteria` /
   `subscribed_to_monitor` / `unsubscribed_from_monitor` /
   `reported_outcome` were all added in 2026-05-03 → 2026-05-04.
5. **AI privacy gate firing wrong** — `isAiEnabled` fails CLOSED on
   any DB error (audit-fix #1). If a real DB hiccup causes false
   "disabled" 503s, that's the trade-off; we accept it over leaking
   PII during the hiccup.
6. **PII redaction leak** — if the AI memo cites a property by
   street-only form (no city/state/zip) without unredacting to the
   full address, the alias system in `redact.ts` may have missed a
   shape. Check `findLeftoverTokens` warnings in server logs.

---

## Where to look up everything else

- **Strategy / vision:** `STRATEGY.md`
- **Stage-organized roadmap:** `docs/ROADMAP.md`
- **Schema:** `docs/DATA-MODEL.md`
- **Session-pickup state:** `pickup.md`
- **Memory (preferences, partnership context):** `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`
- **Demo runbook:** `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md`
