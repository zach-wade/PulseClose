# Vendor Ledger

Single source of truth for every external dependency PulseClose calls in
production. Each row is the contract surface (env var, pricing tier,
renewal/rotation date, fallback, incident playbook). Cross-references
`pickup.md` "Operational risk register" and "Open decisions"; this doc is
the formalized version of what that register sketches.

Maintained alongside `docs/PRIVACY-POSTURE.md` (sub-processor list — what
data each vendor receives) and `pickup.md` (live operational notes).

Last reviewed: 2026-06-25. Owner: Zach Wade.

---

## Vendor inventory

| # | Vendor | Purpose | Env var(s) | Pricing/Tier | Renewal/Rotation | Fallback | Incident playbook |
|---|---|---|---|---|---|---|---|
| 1 | **Cobalt Intelligence** | SOS entity (50 states) — now the FALLBACK behind the free-SOS layer | `COBALT_INTELLIGENCE_API_KEY` | Per-call (trial quota exhausted in prod) | Rotate keys; de-rented for CA/CO/NY (vendors 1a/1b) | Free-SOS layer first → `sos_entities` cache → else entity UNAVAILABLE → partial/conditional | See §1 |
| 1a | **CALICO (CA SOS)** | CA business-entity lookup — free primary, de-rents Cobalt for CA | `CALICO_API_KEY` | **Free** (Azure APIM; self-serve key at calicodev.sos.ca.gov) | Rotate via portal; no quota published — handle 429 | Cobalt (vendor 1) | `src/lib/adapters/sos-free.ts` `lookupCalico`; per-name only, ≤150, no filing history; auth fail = HTTP 503 |
| 1b | **Socrata (CO/NY SOS)** | CO/NY business-entity lookup — free primary, de-rents Cobalt | `SOCRATA_APP_TOKEN` (optional, raises rate limit) | **Free** (open data; no key required) | None | Cobalt (vendor 1) | `sos-free.ts` `lookupSocrata`; CO `4ykn-tg5h` (real status), NY `n9v6-gdp6` (active-only); live SoQL name query + cache |
| 1c | **FL Sunbiz (SFTP bulk)** | FL business-entity BULK load (officers incl.) — de-rents Cobalt for FL | None (`Public`/`PubAccess1845!` constants) | **Free** (Ch.119 public SFTP) | Quarterly full (Jan/Apr/Jul/Oct) + daily updates; cron via `scripts/ingest-sos.ts --full` | Cobalt (vendor 1) | `scripts/sos-sources.ts` + `ingest-sos.ts`; fixed-width 1440-char; source `fl_sunbiz` in `sos_entities` (ALWAYS_FRESH, skips TTL) |
| 2 | **Realie** | Property + deed-chain (primary) | `REALIE_API_KEY` | Per-call premium | Annual (TBD) | Regrid | See §2 |
| 3 | **Regrid** | Property fallback | `REGRID_API_TOKEN` | Per-call | Annual (TBD) | Stub adapter (demo data) | See §3 |
| 4 | **RentCast** | Sale-history enrichment | `RENTCAST_API_KEY` | Per-call | Annual (TBD) | Skip enrichment, return Regrid as-is | See §4 |
| 5 | **CourtListener** | Federal litigation (PACER + RECAP) | `COURTLISTENER_API_TOKEN` | Free, 5K req/day | None (free token) | Stub adapter | See §5 |
| 6 | **OpenSanctions** | Sanctions/PEP screening | `OPENSANCTIONS_API_KEY` | **Trial — expires 2026-05-28** | Rotate trial keys; paid tier post-NPLA | OFAC SDN direct | See §6 |
| 7 | **OFAC SDN direct** | Sanctions fallback (CSV) | None (Treasury endpoint) | Free | n/a | n/a (this IS the floor) | See §7 |
| 8 | **CSLB** | CA contractor licenses | None (HTML scrape) | Free | n/a | "not_automated" surface for non-CA | See §8 |
| 9 | **Anthropic Claude** | LLM (consumers; see PRIVACY-POSTURE.md) | `ANTHROPIC_API_KEY` | Pay-as-you-go | Rotate quarterly; ZDR by default; **⚠️ AUDIT MODEL IDS at each Anthropic model-retirement date** — a retired id silently 404s every consumer (this broke the AI memo 2026-06-15→25, finding #23). Current ids: opus-4-8 / sonnet-4-6. | Per-org `ai_extraction_enabled=false` toggle | See §9 |
| 10 | **Resend** | Transactional email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Free tier (3K/mo) → paid | When volume exceeds 3K/mo | Skip silently (logged) | See §10 |
| 11 | **Supabase** | Postgres + Auth + Storage + RLS | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Pro plan (project ref `oazwscmgyqknwatqgtyc`) | Annual; PITR retention TBD | None — full outage = full outage | See §11 |
| 12 | **Vercel** | Hosting + autodeploy | (provided by platform) | Pro plan (`buildfolios-projects-e8f9d80e/pulseclose`) | Annual | `vercel deploy --prod --yes` (manual) | See §12 |
| 13 | **GitHub** | Source + CI trigger | (provided) | Free tier (`zach-wade/PulseClose`) | n/a | Local repo + push to alt remote | See §13 |
| 14 | **Stripe** | Billing | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, 6 × `STRIPE_PRICE_*` | Standard rate (3 plans + `internal`) | n/a | Manual invoicing if outage | See §14 |
| 15 | **Sentry** | Error tracking | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Team plan | Annual | Vercel logs as floor | See §15 |
| 16 | **WordPress / GoDaddy Managed WP** | Marketing site (pulseclose.com) | `WP_URL`, `WP_USER`, `WP_APP_PASSWORD` | GoDaddy Managed WP plan | Annual | Static fallback page | See §16 |
| 17 | **PostHog** | Product analytics | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Free tier | When event volume tier-bumps | Drop client-side | See §17 |

---

## §1 — Cobalt Intelligence

**Purpose:** Only SOS scraping provider in our stack. Used for entity status,
formation date, registered agent, officers, filing history. We do not run
our own SOS scrapers.

**Where it's called:** the pipeline routes entity lookups through DB-first
`src/lib/sos/lookup.ts` → `lookupEntityCached` (shared `sos_entities` cache,
00050) and only calls Cobalt on a miss, writing resolved results back (de-rent,
2026-06-25). The adapter itself is `src/lib/adapters/cobalt.ts` (also the
orchestrator — re-exports Realie/Regrid/etc.). 30s fetch timeout. `cobaltSearch()`
retries with exponential backoff + jitter (4 live attempts) then a retried
`liveData=false` cached attempt before surfacing the 429 honestly.

**Pricing:** Per-call, volume-tiered. Some states (CA in particular) are
the slowest; TX / DE require long-poll via `retryId` (`pollForResult()`,
30 retries × 5s).

**Renewal/rotation:** Decided 2026-05-02 — rotate keys across multiple
Cobalt accounts for NPLA demo-day capacity (`pickup.md` Open decisions #4).
Implementation TBD: round-robin in `cobalt.ts` or env-swap pre-demo.

**Fallback:** the `sos_entities` cache + (future) free-state bulk ingest (FL/CA)
are the de-rent path. If Cobalt is down AND the entity isn't cached,
`lookupEntity()` returns a `not_found`-shaped result with `_error: true` in
`raw_response` — the pipeline marks the entity UNAVAILABLE (not "not found"),
drops overall_status to `partial`, and the mandate treats it as CONDITIONAL
(re-run), never an auto-fail (#13/#22/#18). **prod trial quota is exhausted →
Cobalt 429s** until a key is rotated or free-state ingest lands.

**Incident playbook:**
1. Verify health: `curl -s -m 60 -H "x-api-key: $COBALT_INTELLIGENCE_API_KEY" "https://apigateway.cobaltintelligence.com/v1/search?searchQuery=Apple&state=CA&liveData=true"`
2. If 429s: rotate key in Vercel env, redeploy, retry. If multiple keys
   exhausted, the live demo can run with `liveData=false` (cached, days-old).
3. If extended outage: surface a "manual entity verification" callout in
   the validation detail page; Damon-track demos paused until restored.
4. Post-incident: log to `pickup.md` "Known regressions" if a new failure
   shape emerges.

---

## §2 — Realie

**Purpose:** Primary property search + deed-chain verification (rich data:
ownership, transfer history, lender, liens, AVM, LTV, foreclosure status).
Two endpoints used: `/public/premium/owner/` (owner-name search) and
`/public/property/address/` (single-address lookup for trust-but-verify).

**Where it's called:** `src/lib/adapters/realie.ts`. 20s fetch timeout.
Owner-search post-filtered with `canonicalTokens()` + `tokensSubset()` —
mirrors `canonicalize_name()` SQL function and `canonicalizeName()` JS
(commit `0943fc7`, ROADMAP cross-cutting principle 8). Without this filter
Realie's prefix-match returns `KIM, AN SOON` for owner search "Kim An
Truong" and we silently mismatch.

**Pricing:** Per-call premium endpoint. Coverage: strong CA current
ownership; historical transfers depend on county scraping (gap noted in
Damon Action item #1 — the Truong xlsx interpretation question).

**Renewal/rotation:** Annual contract (renewal date — TBD, surface from
billing).

**Fallback:** Regrid (§3). If Realie throws or returns 0 results AND
`req.state` is set, the orchestrator (`createCobaltAdapter.searchProperties`)
tries Regrid. Final fallback is `stubAdapter`.

**Incident playbook:**
1. If 401/403: rotate `REALIE_API_KEY`. Log to Sentry.
2. If 5xx or timeout: surface to Sentry; downstream Regrid fallback fires
   automatically; verify in `monitor_runs.adapter_results`.
3. If data quality complaint (false owner match): check
   `canonicalTokens()` + `tokensSubset()` filter is applied; verify
   `canonicalize_name()` SQL hasn't drifted from JS.

---

## §3 — Regrid

**Purpose:** Property fallback when Realie misses or has no state param.
Owner search + parcel data. Less rich than Realie (no LTV, no AVM, no
foreclosure surface).

**Where it's called:** `src/lib/adapters/regrid.ts`. 20s timeout. Uses
`/parcels/owner` endpoint; min 4-char prefix; scoped to `path=/us/{state}`.

**Pricing:** Per-call.

**Renewal/rotation:** Annual contract (TBD).

**Fallback:** Stub adapter (demo data) — only fires when neither
`REALIE_API_KEY` nor `REGRID_API_TOKEN` is set. In production, Regrid
failure with Realie set means Realie's result is what the user sees.

**Incident playbook:**
1. Treat as advisory — Regrid is a backup. If down, log Sentry warning;
   no user-visible breakage in CA where Realie covers.
2. For non-CA states with Realie miss: surface "no property records found"
   to user; suggest manual verification.

---

## §4 — RentCast (replaced ATTOM 2026-06-24)

**Purpose:** Sale-history enrichment for Regrid results (Realie already
includes transfer data inline). Only called when `usedRealie === false`
and we have ≥1 Regrid result.

**Where it's called:** `src/lib/adapters/rentcast.ts` via
`enrichPropertiesWithRentcast(toEnrich.slice(0,5), rentcastKey)`. Slice cap of 5
limits cost.

**Pricing:** Per-call.

**Renewal/rotation:** Annual contract (TBD).

**Fallback:** Skip on failure — Regrid result returned as-is. Code path:
"RentCast enrichment failed, returning data without enrichment".

**Incident playbook:** Low priority. Outage manifests as missing
`acquisition_date` / `acquisition_price` enrichment on Regrid-sourced
properties. Not user-visible breakage.

---

## §5 — CourtListener

**Purpose:** Federal litigation search (bankruptcy via PACER bridge,
lawsuits via RECAP archive).

**Where it's called:** `src/lib/adapters/courtlistener.ts`.

**Pricing:** Free, 5K req/day.

**Renewal/rotation:** None — free token, signed up via account.

**Fallback:** Stub adapter (demo data). Triggered when
`courtListenerToken` is unset or fetch throws.

**Coverage gap:** Federal only. State-court coverage is C6 in the
roadmap. Foreclosure + lis pendens are county-level and have no API yet
— we deliberately do NOT insert fake "clear" records for those, only
returning what we actually searched (`cobalt.ts` line ~438 comment).

**Incident playbook:**
1. If 5K/day cap hit: defer. Cap reset is daily; spread demos across
   accounts if needed.
2. If outage: surface "litigation search unavailable" in litigation card;
   risk factor falls back to its base value.

---

## §6 — OpenSanctions

**Purpose:** Sanctions and PEP screening. Covers OFAC SDN + EU + UN + UK
+ global PEPs. Better hit rate than OFAC alone.

**Where it's called:** `src/lib/adapters/opensanctions.ts`.

**Pricing:** Currently on **trial — expires 2026-05-28**. ~26 days from
`pickup.md` last edit. Decided 2026-05-02 to rotate trial keys for
extended coverage (`pickup.md` Open decisions #3).

**Fallback:** OFAC SDN direct (§7). Auto-fires on key-failure /
non-2xx / throw. The fallback is observable (not silent) via
`monitor_runs.adapter_results`.

**Incident playbook:**
1. **Pre-2026-05-28:** rotate trial key in Vercel + `.env.local`. Verify
   with one validation post-rotation.
2. **Post-2026-05-28:** if trial-rotation strategy fails, the system
   degrades to OFAC SDN. Re-evaluate paid tier post-NPLA if Insignia
   demos start showing sanctions coverage gaps (`pickup.md` Open
   decisions #3).
3. **If a sanctions match is missed in a real flow:** check
   `monitor_runs.adapter_results` for the fallback flag; OpenSanctions
   would have caught more PEP cases than OFAC.

---

## §7 — OFAC SDN direct

**Purpose:** Final-floor sanctions screening. Always available, no key.
Covers OFAC SDN list only (less coverage than OpenSanctions — no PEPs,
no EU/UN/UK lists).

**Where it's called:** `src/lib/adapters/ofac.ts`.

**Pricing:** Free (Treasury government endpoint).

**Renewal/rotation:** None.

**Fallback:** None — this IS the fallback floor.

**Incident playbook:** If the Treasury endpoint goes down, sanctions
screening returns its no-records shape. Document in
`pickup.md` "Known regressions" if it persists.

---

## §8 — CSLB (California Contractor State License Board)

**Purpose:** California GC license verification.

**Where it's called:** `src/lib/adapters/cslb.ts`. HTML scrape — no API
key. Only fires when `state === "CA"` and `req.license_number` is
provided.

**Pricing:** Free (state government site).

**Renewal/rotation:** None.

**Fallback:** For non-CA states or missing license number, returns a
`_not_automated: true` raw_response shape; the UI shows "license
validation not yet automated for [STATE]" instead of fake stub data.

**Incident playbook:** If CSLB scrape breaks (page restructure, IP
block), GC card shows "not_automated" — equivalent to a non-CA state.
Manual verification is the documented analyst step.

---

## §9 — Anthropic Claude

**Purpose:** LLM. Four consumers post-Batch-2 — see
`docs/PRIVACY-POSTURE.md` §4 for what each sends and how it's redacted:

1. `/api/ingest/borrower-doc` — borrower track-record xlsx/csv/txt/pdf →
   structured rows.
2. `/api/share/[token]/extract-addresses` — share-link uploads → property
   addresses.
3. `src/lib/ai/analysis.ts` — Story Mode v2 risk memo (token-redacted).
4. `/api/investors/[id]/extract-criteria` — A1 investor PDF parser.

**Where called from:** Each consumer wraps `requireAiEnabled(orgId)`
(`src/lib/ai/check-enabled.ts`) BEFORE the SDK call. Fail-CLOSED: lookup
errors return `false`.

**Pricing:** Pay-as-you-go (Claude Opus 4.8 / Sonnet 4.6). `max_tokens: 4096` minimum
on all four consumers (ROADMAP cross-cutting principle 11 — truncation
defense).

**Renewal/rotation:** Rotate `ANTHROPIC_API_KEY` quarterly. ZDR (zero
data retention) is on by default — Anthropic does not train on customer
data through the standard API. PII redaction bundle shipped 2026-05-03
(`a277c23`) is the engineering-side defense regardless of contract.

**Fallback:**
- **Per-org strict mode:** Org admin sets `ai_extraction_enabled=false`
  (Settings → AI & Privacy). All four consumers return 503 with code
  `AI_DISABLED`; UI shows "AI is disabled for your org — fill the form
  manually".
- **Vendor outage:** Errors bubble up to the route. Consumer-side
  retries minimal; user re-attempts.

**Possible upgrade paths post-NPLA** (see PRIVACY-POSTURE.md §8):
1. Anthropic enterprise contract with explicit ZDR / DPA — moderate $.
2. AWS Bedrock with Anthropic in customer tenancy — bigger lift, full
   data residency control.

**Incident playbook:**
1. If token-leak signal (a `[[TOKEN]]` lands in a stored memo):
   `findLeftoverTokens()` in `redact.ts` already surfaces this. Log to
   Sentry, decide whether to ship the memo or regenerate.
2. If hallucinated content: regenerate via `regenerate.ts`; review
   `ai_analysis.schema_version`.
3. If rate-limited: `max_tokens` is bounded; review per-org call volume
   (Stripe usage rows scoped by `check_type='ai_memo'` etc.).
4. If extended outage: per-org toggle becomes the demo posture —
   communicate to Damon if it falls within an Insignia run.

---

## §10 — Resend

**Purpose:** Transactional email — share-link send, monitor-change
alerts, future notifications via `notification_preferences`.

**Where it's called:** `src/lib/email/resend.ts`. Single-send only;
**bulk burst untested**.

**Pricing:** Free tier (3K/mo). Move to paid when volume exceeds.

**Renewal/rotation:** Rotate key annually or on team change.

**Fallback:** If `RESEND_API_KEY` unset, the wrapper logs a warning and
returns silently. Email skipped; not a hard failure. Future: route
through `notification_preferences` so non-email channels (Slack/Teams/
SMS — schema present, not wired) cover.

**Incident playbook:**
1. If sends 4xx: check domain verification (pulseclose.com SPF/DKIM).
2. If 429: hold sends, queue locally, retry. No queue is built — current
   posture is "skip and log".
3. **Bulk burst risk:** If a batch monitor run dispatches >100 emails
   simultaneously (e.g., a tenant flips org-level monitor on for 200
   borrowers), Resend will rate-limit. Mitigation: stagger via cron
   intervals or queue. Not yet built — flag in `pickup.md` if observed.

---

## §11 — Supabase

**Purpose:** Postgres + Auth + RLS + Storage. Project ref
`oazwscmgyqknwatqgtyc`.

**Where it's called:** Everywhere. `src/lib/supabase/{browser,server,
admin,middleware}.ts`. Storage bucket `documents` (private, 10MB cap,
allowlisted MIME types — see `00017_universal_infra.sql`).

**Pricing:** Pro plan.

**Renewal/rotation:** Annual. Service-role key rotation: quarterly or on
team change. PITR (point-in-time recovery) retention — confirm setting
in dashboard.

**Fallback:** None. Full Supabase outage = full app outage. PITR is the
rollback story for data loss.

**Incident playbook:**
1. **Outage:** Status page check; communicate to active users; no fallback.
2. **Migration failure:** `scripts/verify-rollback.ts` for post-failure
   probe; `supabase db push` is the apply path. Migrations are
   idempotent by convention (`if not exists`, `on conflict do nothing`).
3. **PITR test:** **Untested.** Operational gap. Pre-NPLA item — restore
   to a scratch project from a known-good window; verify schema +
   row counts. See `docs/PRIVACY-POSTURE.md` §7.
4. **Storage RLS leak:** documented bypass — service role does not honor
   RLS; routes that proxy file reads must gate on share_token validity
   in app code (00017 line ~92 comment).

---

## §12 — Vercel

**Purpose:** Hosting, edge, autodeploy.

**Project:** `buildfolios-projects-e8f9d80e/pulseclose`. Production:
https://app.pulseclose.com.

**Pricing:** Pro plan.

**Renewal/rotation:** Annual.

**Fallback:** Manual deploy via `vercel deploy --prod --yes`. **Vercel
auto-deploy hooks have failed silently 2-3 times this session**
(`pickup.md` "Operations notes"); the manual fallback is required when
`vercel ls pulseclose | head -3` doesn't show a recent Building / Ready
row after `git push`.

**Incident playbook:**
1. After every push: `vercel ls pulseclose | head -3` to confirm a build
   started. If not, `vercel deploy --prod --yes`.
2. Build failure: check Suspense wrappers around `useSearchParams()` (the
   PR 7-13 9-hour outage was caused by Compare page missing this).
3. Edge function timeout: 60s default. AI memo poll is 90→180s but
   client-driven; server functions stay <60s.

---

## §13 — GitHub

**Repo:** `zach-wade/PulseClose`. Default branch: `main`. CI: none beyond
Vercel build.

**Renewal/rotation:** n/a (free tier; paid if private-repo limits
change).

**Fallback:** Local repo + push to alt remote (GitLab, Bitbucket) if
GitHub is down. None configured today; flag if needed.

---

## §14 — Stripe

**Purpose:** Billing. 3 plans (Starter $299, Professional $499,
Enterprise $799) + `internal` (unlimited, SQL-only — Test Co).

**Env vars:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`, plus 6 × `STRIPE_PRICE_*`
(starter/professional/enterprise × monthly/annual).

**Renewal/rotation:** Webhook secret rotation on team change. API key
rotation quarterly.

**Fallback:** Manual invoicing if Stripe outage during a sale window.
Subscription state is mirrored on `organizations.plan` so usage
metering works without a live Stripe call.

**Incident playbook:**
1. Webhook signature failures: rotate `STRIPE_WEBHOOK_SECRET`, redeploy.
2. Subscription drift between Stripe and `organizations.plan`: the
   webhook handler is the authoritative sync; replay missed events from
   Stripe dashboard.

---

## §15 — Sentry

**Purpose:** Error tracking. Captures unhandled exceptions in API
routes + client.

**Env vars:** `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
(source-map upload at build).

**Pricing:** Team plan.

**Known issue:** Deprecation warnings on `disableLogger` in
`sentry.*.config.ts` — tolerated; will fix on Sentry SDK upgrade.

**Fallback:** Vercel logs as floor (function logs persist 7d on Pro).

---

## §16 — WordPress / GoDaddy Managed WordPress

**Purpose:** Marketing site at pulseclose.com (separate from
app.pulseclose.com, which is Vercel/Next).

**Env vars:** `WP_URL`, `WP_USER`, `WP_APP_PASSWORD`. Content
version-controlled in `wordpress/` directory of the repo.

**Renewal/rotation:** Annual GoDaddy plan.

**Fallback:** Static fallback page (could be built; not today).

---

## §17 — PostHog

**Purpose:** Product analytics. Client-side event capture.

**Env vars:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.

**Pricing:** Free tier.

**Fallback:** Drop client-side capture on outage (no server-side calls).

---

## 2026 rotation calendar

Chronological. **Bold = NPLA-critical.**

| Date | Event | Owner | Action |
|---|---|---|---|
| **2026-05-28** | OpenSanctions trial expires | User | Rotate trial key (Open decisions #3). Auto-falls-back to OFAC SDN if rotation stops working. |
| ~2026-06-10 | Cobalt key rotation for NPLA capacity | User | Rotate keys across multiple Cobalt accounts (Open decisions #4). Cached `liveData=false` is the per-validation backstop. |
| ~2026-06-15 | Migration idempotency on fresh tenant | User OR Claude | Spin up 2nd test org, run all 25 migrations clean, validate one xlsx through full flow. |
| ~2026-06-15 | Print test (CSS on paper) | User | `/handoff/[id]` + `/validations/[id]/risk-methodology` on real paper. |
| ~2026-06-20 | Demo dry-run with Damon | User | Walk runbook end-to-end, time it, identify rough edges. |
| **2026-06-22 to 23** | **NPLA Atlantic City — Cobalt + Anthropic load test** | User | Confirm capacity holds during live demos. |
| Monthly (~16th) | ZHVI refresh | User OR cron | `set -a; source .env.local; set +a; npx tsx scripts/ingest-zhvi-zips.ts` |
| Quarterly | Anthropic spend vs rate caps review | User | Pull token-count rows from `investor_criteria_extractions` (A1) and equivalent from analysis.ts; compare to Stripe revenue per org. |
| Annually | Stripe webhook secret rotation | User | Rotate `STRIPE_WEBHOOK_SECRET`, redeploy, replay any missed events. |
| Annually | Realie / Regrid / RentCast contract renewal | User | Negotiate; re-evaluate volume tiers. |
| Annually | Supabase service-role key rotation | User | Generate new, deploy to Vercel, retire old. |
| Annually | GoDaddy Managed WP plan | User | Domain + WP renewal. |
| As-needed | Vercel auto-deploy failure | User | `vercel deploy --prod --yes` after every `git push` if `vercel ls pulseclose` doesn't show a new build. |

---

## Cost ledger (estimate)

Best-guess monthly. Mark TODO where uncertain — surface real numbers
from billing dashboards in next pass.

| Vendor | Monthly $ (est.) | Notes |
|---|---|---|
| Cobalt Intelligence | $300-800 | TODO — usage-tier dependent. Rotate-multiple-keys plan inflates this. |
| Realie | $200-500 | TODO — premium-endpoint per-call. |
| Regrid | $50-150 | TODO — fallback usage; lower volume. |
| RentCast | $0 free tier (50/mo) → usage | Replaced ATTOM; /properties sale history. |
| CourtListener | $0 | Free tier. |
| OpenSanctions | $0 (trial) → $TBD post-trial | Enterprise tier ~$500-2000/mo if pursued. |
| Anthropic Claude | $50-300 | Opus 4.7 + 4096 max_tokens × ~50 validations/mo today; will scale ~linearly with validation volume. |
| Resend | $0 (free tier) → ~$20/mo at 50K | 3K/mo free. |
| Supabase Pro | $25 | Base. |
| Vercel Pro | $20 | Per seat. |
| Stripe | (% of revenue) | 2.9% + $0.30/txn. |
| Sentry | $26 | Team plan. |
| GoDaddy Managed WP | $20-30 | Annual / 12. |
| PostHog | $0 | Free tier. |
| **Total (est.)** | **~$700-2000/mo** | TODO — reconcile against actual invoices monthly. |

Post-NPLA escalation paths (any of which could 5-10× the AI line item):
- Anthropic enterprise contract: ~$5-15K/mo if pursued.
- AWS Bedrock-in-tenancy: setup cost + per-token similar to API; full
  tenancy isolation.
- OpenSanctions paid tier: ~$500-2000/mo if Insignia demos surface a
  PEP coverage gap.

---

## Cross-references

- **`pickup.md`** — "Operations notes" (live commands), "Known regressions /
  risks to watch" (vendor-related entries), "Operational risk register"
  (NPLA pre-flight checklist), "Open decisions / questions for the user"
  (#3 OpenSanctions, #4 Cobalt).
- **`docs/PRIVACY-POSTURE.md`** — sub-processor list (which vendors
  receive PII / borrower-attributable data), AI-specific consumers and
  retention.
- **`docs/ROADMAP.md`** — cross-cutting principle 8 (tokenize-and-set
  matching applies to Realie owner-search filter), principle 11 (Claude
  truncation defense applies to all 4 Anthropic consumers).
- **`docs/DATA-MODEL.md`** — `monitor_runs.adapter_results` (vendor-level
  status surfacing), `documents` (storage bucket).
