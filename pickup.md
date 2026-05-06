# PulseClose — Session Pickup (2026-05-06 — Override spike + audit pass)

> **For session-resumption.** Strategic and architectural detail lives in the
> dedicated docs — this file orients quickly and points there.
>
> **Read these in order on session start:**
> - This file (you're here)
> - `docs/ROADMAP.md` — journey-organized backlog with cross-cutting design principles
> - `docs/DATA-MODEL.md` — full schema (now through 00033)
> - `STRATEGY.md` — Wade Intel parent + product strategy
> - `docs/DISTRIBUTION-STRATEGY.md` — 2026 distribution playbook
> - `docs/E2E-TEST-PLAN.md` — 17-phase customer walkthrough for pre-NPLA smoke testing
> - `docs/PRIVACY-POSTURE.md` — AI privacy bundle + SOC 2 gap inventory
> - `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are right now

**Standalone borrower validation platform for bridge lenders.** Multi-tenant
SaaS at app.pulseclose.com. NPLA conference is the forcing function (June
22-23, 2026; ~7 weeks out).

**Production health:** ✅ All commits since 2026-04-30 live and verified.
Vercel auto-deploy fired clean for every push in this batch.

**The roadmap is empty of buildable items.** Plus a major spike
shipped 2026-05-06 PM expanding the override-and-rerun product-promise
from narrow signal-keys to "any factor + any vendor field can be
overridden by lender domain knowledge with audit trail visible to the
receiving investor."

---

## ✅ COMPLETE 2026-05-06 PM — Override-and-rerun expansion (4 commits) + audit pass (2 fix commits)

User caught a real product gap during testing: vendor data is
incomplete by design (we deferred BatchData / state courts / county
liens / photo verification at scale on cost), but the shipped
override system was narrow (signal-keys only on
is_primary_residence / is_bank_financed). If the lender knew more
than the vendors (frivolous nuisance suit, hold months wrong, missing
property), they couldn't input it. The tier we computed was theater.

**Override expansion (4 commits):**

| Commit | What it ships |
|---|---|
| `700788a` 1/4 | Migration 00034: `data_edits` (audit log), `factor_overrides` (manual factor exclude with reason). POST/DELETE `/api/factor-overrides`. WhyThisRating gets per-factor "Override" button → free-text reason → recompute + AI memo regen. "Remove override" affordance reverts. Engine-derived primary_residence still takes precedence. |
| `5c13f39` 2/4 | PATCH `/api/track-record/[id]` (7 editable fields with audit log), DELETE same, POST `/api/validations/[id]/track-record` (manual add via canonical dedup, source='manual'). Same shape for litigation_cases. UI: pencil per row → edit dialog. "Add property" / "Add case" buttons. Manual rows tagged amber. lender_notes render inline. |
| `ac53a5e` 3/4 | builder.ts grows `lender_edits` aggregate. Excel cover renders headline counts; new "Audit Log" worksheet. PDF view renders chronological table before narrative. Methodology PDF gets "Lender data edits" section. The receiving investor + credit committee see exactly what was edited, when, and why. |
| `a18f2d7` B6 fix | Compare-to-prior button label now shows the prior validation's date or time (same-day shows H:MM). Compare page renders M/D/YY HH:MM in same-day banner + per-card timestamps. |

**Audit pass on the morning's 20 features (2 fix commits):**

User asked me to re-review for similar misses. Six real ones found:

| Commit | What it fixes |
|---|---|
| `a34885f` audit fix 1/4 | **D2:** monitor cron's `notifyChanges` now calls `dispatchNotification` in addition to direct sendEmail. Without this, every Slack/Teams pref configured in Settings was theater — the only emit point bypassed dispatch. **G7.3 indicator:** validation API returns `org_monitor_paused_until`; MonitorCard renders amber "Org-wide pause active" banner. |
| `db98471` audit fix 2/4 | **F3:** RouteToInvestorButton on validation detail header — lists configured investors, idempotent route. Without this, F3 substrate was unreachable from the UI. **C5 + C1:** borrower share page gets BankStatementUpload + PropertyPhotoUpload cards. Lender side: new BorrowerUploadsCard on validation detail with combined view. `GET /api/validations/[id]/borrower-uploads` endpoint. |

**Audit-pass misses NOT fixed (deferred to follow-up):**
- **D5 POST endpoint** — public REST is GET-only. POST refactor needs extracting heavy logic from 850-line internal POST. ~1d follow-up.
- **Liquidity factor** reading bank statement data — substrate stores it, factor needs threshold calibration with real data.
- **photo_verified signal** write — verifications stored, distance threshold needs calibration.
- **F3 investor signup flow** — investor_users table exists, no self-serve signup. Lender INSERTs rows via SQL today.
- **F1 multi-dimension scenarios** — only LTV varies. Picker for LTC / ARV / FICO / loan_amount is v2.

---

## ✅ COMPLETE 2026-05-06 AM — Final roadmap clear-out (20 features, one session)

Twenty features shipped end-to-end in a single autonomous run. Each one
git-pushed independently to prod, typechecked clean, build verified.

**Reputation / analytics layer (built on E1 substrate):**
| Item | Commit | What it ships |
|---|---|---|
| **E2** Borrower reputation / lender-relationship history | `b1e9fa1` | Server-computed reputation (no new table). Validation count, tier mix, outcome mix, signal-correction rate, funded total. `<BorrowerHistoryCard />` on validation detail + new `/dashboard/borrowers/[id]` roll-up page. |
| **A4 + A5** Investor performance + rate sparkline | `7934b46` | Per-investor pass/conditional/fail rates + outcome mix from E1 + funded $ + average loan + default rate. SVG rate-history sparkline (A5). Compact strip on admin list + full card on new `/dashboard/evaluate/investors/[id]`. |
| **B4** "Have we seen this borrower" intake guard | `8d618ad` | Debounced lookup on `/dashboard/new`. Match strategy: exact canonical → subset (2+ tokens) → prefix safety net. Inline amber hint with click-through to E2 roll-up. |
| **B6** Validation diff over time | `26159d5` | "Compare to prior" CTA on validation detail when borrower has earlier validation. Links to existing `/dashboard/compare`. New banner on compare when both validations are same borrower. |

**Capital-side polish:**
| Item | Commit | What it ships |
|---|---|---|
| **G6.1** Handoff references chosen investor | `59c2458` | `chosen_investor_id` on `handoff_data` JSONB. Builder pulls investor + most-recent eligibility result. Excel cover sheet + `/handoff/[id]` PDF render an "Intended investor" block with terms + rationale. |
| **G5.2** Structured criteria editor | `8f696ab` | Replaces bare-textarea JSON view. Per-criteria-key widgets (chip-toggles for state lists / loan_types, percent-decimal for max_ltv/ltc/ltarv, native number/checkbox/json-fallback). JSON mode toggle for power users. |
| **F1 + F2** Scenario comparison + rate stress | `3dc3074` | Re-runs same deal at 65/75/80% LTV in parallel; investor-row × leverage-column matrix view. +0/+100/+200bps client-side rate shock on frozen verdicts. |

**Notification + integration breadth:**
| Item | Commit | What it ships |
|---|---|---|
| **D2** Slack/Teams/Webhook notifications | `eeb4c0b` | Wires the 3 channels through the universal `notification_preferences` fan-out. Slack uses incoming-webhook block format; Teams uses MessageCard; webhook is a generic JSON POST. Settings → Notifications tab to manage prefs + test-send button. |
| **G7.3** Pause monitoring during demo | `9f805f3` | Per-org `monitor_paused_until` (00027). Cron filters subs whose org is paused. Settings UI 2h / 1d / 3d preset buttons + "Resume now". |
| **D5** Public REST API | `cdd0fd0` | Hashed-at-rest API keys (00028). `pck_live_<24-byte base64url>`. Endpoints: `GET /api/public/v1/{validations, validations/{id}, validations/{id}/handoff[?format=excel], borrowers/{id}}`. Settings → API Keys tab with one-time plaintext display + revoke. |
| **D4** Browser bookmarklet | `ae44081` | URL-param prefill on `/dashboard/new` (?borrower / ?entity / ?state / ?address / ?source=bookmarklet). Settings → API Keys gets a draggable bookmarklet that grabs `window.getSelection()` + `document.title` and routes to /dashboard/new. |

**Trust-but-verify signal lift:**
| Item | Commit | What it ships |
|---|---|---|
| **C4** Address consistency cross-check | `aa3874c` | New informational risk factor `address_consistency`. Three checks: self-served registered agent, cross-state operation (entity state ∉ property states with N≥3), duplicate property addresses. Surfaces in WhyThisRating + risk methodology PDF + AI memo. |
| **C6** Public records expansion + scope disclosure | `116a9f4` | Litigation card renamed "Public records". Coverage disclosure: "Source: CourtListener federal — state/county records not yet automated." When "All" filter active, cases group by category (bankruptcy / civil / lien / tax / foreclosure) with colored sub-headers. |
| **C5** Bank statement parser substrate | `32ac943` | `bank_statement_summaries` (00032) with 90-day expiry. POST `/api/share/[token]/extract-bank-statement` runs Claude PDF extraction → ending balance / NSF count / monthly inflow + outflow / period. Liquidity factor + share-page UI ship as follow-ups. |
| **C1** Geo-tagged photo verification substrate | `6883ef0` | `property_photo_verifications` (00033). Hand-rolled JPEG EXIF walker (avoids CommonJS lib). POST `/api/share/[token]/upload-photo` runs EXIF → Claude vision verdict (plausible_property / stock_or_synthetic / indoor_only / unknown) → distance from property geocode. Lender-side card + photo_verified signal write ship as follow-ups. |

**Foundations cleanup:**
| Item | Commit | What it ships |
|---|---|---|
| Cobalt entity-name normalizer canonicalized | `761a576` | Replaces ad-hoc regex with `canonicalizeName({ stripEntitySuffixes: true })` + token-set subset match. Stops noisy false-positive "differs from" warnings. ROADMAP principle 8. |
| Property `address_normalized` USPS canonicalization | `84fee1c` | `normalize_address()` rewrite (00029) — street-suffix expansion (st→street, ave→avenue, etc.), directional collapse (north→n), unit-separator family. JS mirror in `upsert.ts`. Forced regeneration on existing rows + duplicate-count `RAISE NOTICE`. |
| Cross-borrower / cross-entity / cross-lender merge UI | `8281df0` | Productizes `cleanup-canonical-duplicates.ts`. `GET /api/admin/duplicates`, `POST /api/admin/merge`, `/dashboard/admin` page with "Keep this" button per row. Owner/admin only. |

**Investor-side substrate (post-NPLA full ship):**
| Item | Commit | What it ships |
|---|---|---|
| **E4** Public borrower profile schema | `b94ee06` | `borrower_public_profiles` (00030). Slug + `is_published` + per-element `profile_data` JSONB opt-ins (validation count / tier history / outcome counts / lender names / property count). Schema-only — full feature waits on E3 cross-tenant density. |
| **F3** Investor-side deal queue | `e306ee0` | `investor_users` + `investor_deal_queue` (00031). Cross-side RLS (lender org-scoped, investor self-scoped). POST `/api/investor-queue` to route a deal idempotently. `/investor` placeholder landing page that lists queued deals under RLS. Full review UI ships post-NPLA. |

---

## Database state (as of 2026-05-06)

**Migrations applied (33 total):** 00001-00033 inclusive. The seven new
ones from today:

```
00027 monitor_pause                     organizations.monitor_paused_until
00028 api_keys                          api_keys (hashed bearer tokens)
00029 address_canonical                 USPS-style normalize_address rewrite
00030 public_profiles                   borrower_public_profiles (E4 schema)
00031 investor_users                    investor_users + investor_deal_queue
00032 bank_statements                   bank_statement_summaries (C5 substrate)
00033 photo_verification                property_photo_verifications (C1 substrate)
```

---

## Carry-forward action items (manual / external)

These survive every shipped batch — they're not roadmap items I can
ship from the keyboard.

### For the user (you)

1. **Add WP secrets to Build-Folio Anthropic Cloud env** before
   2026-06-01 14:08 UTC. claude.ai/code → enter any session → click env
   selector at top of chat → Build-Folio settings gear → paste
   `WP_URL`, `WP_USER`, `WP_APP_PASSWORD` from `.env.local`. Otherwise
   the monthly WP refresh routine (`trig_017PQNaJ2eN6X86T7bo6Zu7Y`)
   fails-clean (no harm, just a no-op cloud session).
2. **Smoke-test today's surfaces in prod.** Twenty features shipped
   without a UI walkthrough. Priorities:
   - **E2 + B4** — drop the Truong xlsx. Hint banner should fire on the
     borrower-name field. New validation detail shows the History card
     (since Truong now has multiple validations). Click "View all" →
     `/dashboard/borrowers/[id]` lists the lot.
   - **A4 + A5** — open `/dashboard/evaluate/investors/{id}` for any
     investor that's been evaluated against. Verdict mix + outcome
     mix + sparkline render. Compact strip on the admin list.
   - **G5.2** — open Edit Criteria. Should be the structured form, not
     the JSON textarea. Toggle to JSON mode + back.
   - **G6.1** — pick a chosen investor on a HandoffCard, save, open
     PDF view. "Intended investor" block renders.
   - **D2** — Settings → Notifications → add a Slack webhook → Send
     test → verify it lands in the channel.
   - **D5** — Settings → API Keys → create one → copy → curl the
     `/api/public/v1/validations` endpoint with the bearer.
   - **D4** — Settings → API Keys → drag the bookmarklet to bookmarks.
     On Zillow, highlight an address, click the bookmarklet → new
     validation pre-filled.
   - **F1 + F2** — run an evaluation, click "Compare leverage tiers" →
     three-column matrix. Try +100/+200bps stress.
   - **C4** — re-run any validation; watch for the new
     `address_consistency` factor in WhyThisRating.
   - **G7.3** — Settings → Org → "Pause monitoring (demo mode)" → 2h
     button. Verify monitor cron skips the org.
   - **Merge UI** — `/dashboard/admin` (need owner/admin role). Lists
     current canonical-key collisions if any exist.
3. **Print physical paper test** — `/handoff/[id]` and
   `/validations/[id]/risk-methodology` print rules look right in
   DevTools but page-break behavior under real printer drivers has
   never been verified on paper. ~30 min with a printer. Should
   happen before NPLA.
4. **OpenSanctions key rotation** before 2026-05-28. Auto-falls-back
   to OFAC SDN direct if rotation fails (graceful, surfaced in
   `monitor_runs.adapter_results`).
5. **Cobalt key rotation** for demo-day capacity (~2026-06-10). Multiple
   keys in env; rotate pre-demo.

### For Damon (Insignia)

1. **Truong xlsx — what do those 24 addresses represent?** Open
   question from previous session. Demo narrative depends on it.
2. **Co-borrower modeling (G1.2)** — Schema is single-guarantor;
   Truong has Kim Thanh Thi Truong on most loans. ~1d schema +
   UI. Defer until Insignia confirms intake template shape.
3. **Address parser typical Insignia intake shapes?** What format
   does Insignia receive (`Apt 5` / `#5` / `Unit 5` / building
   numbers)? Drives further parser work if needed.
4. **AI privacy — Insignia's actual policy?** Bundle is shipped
   regardless; knowing their stance only affects whether we pursue
   ZDR contract or Bedrock-in-tenancy post-NPLA.
5. **Testimonial / quotable line** (Damon or Noah). NPLA collateral.

---

## What's blocked (won't ship until something external happens)

These are the only roadmap items not shipped:

| Item | Blocked on |
|---|---|
| **C2** BatchData historical deeds | Vendor $ commit ($200-500/mo) |
| **C3** Reverse phone/email | Vendor $ commit (Hunter.io / NumVerify) |
| **D1** Email-forward intake | Resend inbound paid feature |
| **D3** Calendar integration | Post-NPLA per ROADMAP (not blocking on $) |
| **E3** Anonymized cross-tenant consensus | Customer density (10+ lenders) + legal anonymization review |
| **G1.2** Co-borrower / multi-guarantor | Damon decision (intake template shape) |
| **G2.2** TransUnion address validation | Noah's logins |
| **G2.3** Multi-state GC adapters (FL/TX/NY) | Per-jurisdiction research time |

Plus follow-up halves of items that landed substrate-only this session:
- **C5** liquidity risk factor + share-page upload UI (need calibration data)
- **C1** lender-side photo viewer + `photo_verified` signal write (need EXIF
  data from real uploads to calibrate distance threshold)
- **E4** public `/borrower/{slug}` page + share-link opt-in UI (waits on E3 density)
- **F3** investor-side full review UI (post-NPLA per ROADMAP)
- **D2** SMS channel (no provider chosen)

---

## What's shipped (master table — current as of 2026-05-06)

The pre-2026-05-06 master table from prior sessions still applies; new
rows from today below.

### Pre-2026-05-06 baseline

All Tier S + Batch 1 + AI Privacy bundle + Batch 2 + Batch 3 + filler
features through 2026-05-05 EOS — see prior pickup snapshot in git
history at `cfe4ffd` if needed.

### 2026-05-06 additions

| Feature | Status | Notes |
|---|---|---|
| **E2** Borrower reputation / history | Working | History card on validation detail + `/dashboard/borrowers/[id]` roll-up |
| **A4** Investor performance dashboard | Working | Compact strip + full detail page; verdict + outcome mix |
| **A5** Rate-history sparkline | Working | Inline SVG on full performance card |
| **B4** "Have we seen" intake guard | Working | Debounced canonical lookup with click-through |
| **B6** Validation diff over time | Working | "Compare to prior" CTA + diff banner on compare page |
| **G6.1** Handoff references chosen investor | Working | Excel + PDF render Intended Investor block |
| **G5.2** Structured criteria editor | Working | Per-key widgets + JSON mode toggle |
| **D2** Slack/Teams/Webhook notifications | Working | Plus per-pref test-send button |
| **G7.3** Pause monitoring during demo | Working | Per-org pause window; cron skip verified |
| **D5** Public REST API | Working | Hashed bearer keys; one-time plaintext display |
| **C4** Address consistency cross-check | Working | New informational factor in WhyThisRating |
| **C6** Public records categorized + disclosed | Working | Renamed card + per-category sub-blocks + scope line |
| **C5** Bank statement parser substrate | Endpoint live | Liquidity factor + UI follow-up |
| **C1** Photo verification substrate | Endpoint live | Lender-side viewer + signal write follow-up |
| **D4** Browser bookmarklet | Working | URL-param prefill + draggable bookmarklet |
| **F1 + F2** Scenario + stress | Working | Multi-LTV matrix + bps shock toggle |
| Cobalt name normalizer canonicalized | Working | Same canonical primitive as everywhere else |
| USPS address canonicalization (00029) | Working | Forced regen on existing rows |
| Merge admin UI | Working | `/dashboard/admin` |
| **E4** Public profile schema (00030) | Schema only | Full UI post-density |
| **F3** Investor deal queue (00031) | Substrate + placeholder UI | Full UI post-NPLA |

---

## Doc map (where to find what)

Unchanged from 2026-05-05. The 12 cross-cutting design principles in
`docs/ROADMAP.md` continue to govern new code. Today's commits
exercise principles 8 (canonical match — Cobalt, B4 lookup), 9 (dual-
coded SQL/JS dedup — USPS address), 10 (backfill plan — 00029 force
regen), 11 (Claude truncation defense — C5/C1/A4 max_tokens + stop_reason),
and 12 (AI privacy bundle — C5/C1 require AI gate + scrub).

---

## Critical context for next session

- **The roadmap is empty of buildable items.** Next session, the user
  brings new ideas, or we pivot to NPLA prep / collateral / testimonial
  outreach. Do NOT pick up "next roadmap item" — there isn't one.
- **Velocity is days, not weeks.** Twenty features shipped end-to-end
  today (E2 → C1) across one autonomous run.
- **CHECK BUILD STATUS in Vercel after every push.** Webhook fired
  clean for every commit today; previous sessions saw silent failures.
- **Path B data model + JSONB schema versioning + insertOrThrow + RLS
  org-scoped + canonical token-set matching + dual-coded dedup keys
  + truncation-defended Claude consumers + AI privacy bundle on every
  Claude call** — every new line of code today follows these.
- **Test Co is on the `internal` plan** (unlimited validations, no
  Stripe).
- **Real Truong test data:** entity is `TT Investment Properties, LLC`,
  borrower is `Kim An Truong`, xlsx at
  `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`.
- **Ship straight to prod via `git push origin main`** (auto-deploy when
  it works). `supabase db push` for migrations.

---

## Reference paths

- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production URL:** https://app.pulseclose.com
- **Vercel project:** `buildfolios-projects-e8f9d80e/pulseclose`
- **Supabase project ref:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Truong intake xlsx:** `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`
