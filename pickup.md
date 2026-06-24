# PulseClose — Session Pickup & Execution Plan (2026-06-23)

> **This is a self-contained execution handoff.** A fresh session can work
> straight down §"The plan" and ship it. Detail is inline (file paths,
> acceptance criteria) so you don't have to re-derive — deeper rationale lives
> in the linked docs.
>
> **Read first:** this file → [STRATEGY.md](STRATEGY.md) (repositioned
> 2026-06-23) → [docs/ROADMAP.md](docs/ROADMAP.md) (Post-NPLA sequence) →
> [docs/UX-PLAN.md](docs/UX-PLAN.md) → memory `MEMORY.md`.

---

## Where we are (headline)

The product crossed from "borrower validation" to a **verification +
underwriting gateway** and the docs were reconciled to match. NPLA (June 22–23)
is behind us. Everything below is **live on `main` and deployed**; migrations
00040–00042 are applied to prod; builds + the UW engine regression test pass.

**Shipped 2026-06-22 → 06-23:**
1. **Underwriting Workbench + AI UW Copilot** — `src/lib/underwriting/` (sizing,
   per-investor, judgment, facts); `uw_models` (00040); `/api/underwrite` +
   `/api/underwrite/[id]/judge`; panel on `/dashboard/evaluate`. Engine test:
   `npx tsx scripts/verify-underwriting-engine.ts` (24/24).
2. **Self-serve funnel** — public `/` landing + `/pricing`; 14-day/50-check trial
   (00041/00042); dashboard usage meter; trial drip emails; PostHog events.
3. **Doc reconciliation** — STRATEGY/ROADMAP/UX-PLAN/PRICING/IDEAS/CLAUDE/pickup.

**Last commit:** `f4d8d85` (docs). Code before it: `f50445d`, `e9b2bda`, `9c372c6`.

---

## The plan — do these in order

> **Session progress (2026-06-23 cont.):** Item 1 (UX quick-win pass, all 7
> sub-tasks) and Item 2 (Underwriting → handoff artifact) are **shipped to
> `main` and deployed green**. Commits `dcba0f9` (item 1 structural),
> `3688c0c` (item 1 cosmetic), `ebf56cd` (item 2). Item 0 is still on Zach
> (manual Vercel env keys). Resume at Item 3.

### 0. ⚠️ Vercel env keys — MOSTLY ALREADY SET (verified 2026-06-23 via `vercel env ls`)

The earlier "shipped features are inert until these are set" claim was **wrong**.
A `vercel env ls production` check shows the Production env already has:
PostHog (`NEXT_PUBLIC_POSTHOG_KEY` + `_HOST`), `RESEND_API_KEY`,
`ANTHROPIC_API_KEY`, all vendor keys (Cobalt/Realie/ATTOM/CourtListener/Regrid/
OpenSanctions), all Stripe price IDs, Sentry, Supabase. So funnel analytics,
emails, and AI all have their keys.

**Two genuine gaps remain:**
- `CRON_SECRET` — **NOT set.** The cron routes (`/api/cron/trial-emails`,
  `/api/cron/monitor`, and the new `/api/cron/webhook-retry`) use the pattern
  `if (CRON_SECRET) { require bearer }` — so without it they run **unauthenticated**
  (anyone can trigger them). Add a random string in Vercel → Settings → Env Vars.
- Resend sender name mismatch — env is `RESEND_FROM_ADDRESS`, code read
  `RESEND_FROM_EMAIL`. **Fixed in code** (resend.ts now honors both); no action
  needed. Optionally tidy by renaming the Vercel var to `RESEND_FROM_EMAIL`.

Minor: `STRIPE_SECRET_KEY` / `SENTRY_AUTH_TOKEN` / `SUPABASE_SERVICE_ROLE_KEY`
show "Needs Attention" in the Vercel UI — that's Vercel asking to re-save them as
Sensitive; not blocking.

Also confirm `claude-opus-4-8` resolves on the Anthropic key (first Opus consumer
— the judgment layer; memo path uses Sonnet). If not, change `DEFAULT_MODEL` in
`src/lib/underwriting/judgment.ts` to a Sonnet id.

### 1. ✅ DONE — UX quick-win pass — fixes the first-run story

From [docs/UX-PLAN.md](docs/UX-PLAN.md) §4. Each is small; ship as one or two PRs.

1. **Workbench on the evaluate detail page (parity).** Render `UnderwritingPanel`
   on `src/app/dashboard/evaluate/[id]/page.tsx`, hydrated from the saved
   `uw_model` (query `/api/underwrite?deal_evaluation_id=` or add a GET-by-eval).
   *Accept:* opening a saved eval shows its sizing + ladder, not just investor rows.
2. **"Next step" CTA + progress strip on validation detail.**
   `src/app/dashboard/validations/[id]/page.tsx` — a top strip "Validate ✓ →
   Evaluate → Hand off" with a single next-step CTA. *Accept:* a new lender always
   sees what to do next without scrolling 650 lines.
3. **Evaluate→handoff deep-link.** `src/app/dashboard/evaluate/page.tsx` lines
   ~478–502 — the "Ready for handoff?" CTA must link to the specific
   `/dashboard/validations/{id}#handoff` (needs validation_id in the eval
   response), not `/dashboard`.
4. **Fix the "minor" severity color.** It renders highlighted blue; make it muted
   (gray/slate) in `dashboard/portfolio/page.tsx` + `validations/[id]/page.tsx`.
   Only `critical`/`moderate` get color. (Noah's opaque-label principle.)
5. **First-run "start here" card** on the empty dashboard
   (`src/app/dashboard/page.tsx` empty state) — 3 steps + CTA to `/dashboard/new`.
6. **Borrower's recent evaluations** card on the validation detail.
7. **Rename sidebar "Investors" → "Manage investors"** (`components/dashboard/sidebar.tsx`).

### 2. ✅ DONE — Underwriting → handoff artifact — the wedge-completer
(Sizing ladder + binding constraint + full AI judgment now embed in the
investor handoff Excel + PDF, gated by a lender-chosen `chosen_uw_model_id`
picker on the HandoffCard. Borrower one-sheet intentionally untouched. The
§3.2 tabs refactor was kept separate — see Later.)

_Original spec (now shipped), kept for reference:_

Put the sizing **constraint ladder + binding constraint + AI judgment stance**
into the investor handoff Excel + PDF and the borrower one-sheet. Builders live in
`src/lib/handoff/` (builder + excel). *Accept:* a generated handoff shows "max loan
$X, binding = DSCR, sponsor verified, stance = pursue-with-conditions." **This is
what makes underwriting demo-able to a capital provider.** Bundle the validation-
detail tabs (UX-PLAN §3.2) here since both touch the same page.

### 3. ✅ DONE — D6 item 1: generic write-back API + webhooks

Shipped 2026-06-23 (commits `a0dde25` foundation, `8d6cba3` endpoint+triggers).
- **Dedicated webhook subsystem** (migration 00043): `webhook_endpoints`
  (per-org subscriptions, HMAC secret) + `webhook_deliveries` (audit + retry
  queue). Signed delivery (HMAC-SHA256, SSRF re-check, 4xx=dead / 5xx=retry w/
  exponential backoff to 6 attempts). `/api/webhooks` management CRUD + hourly
  `/api/cron/webhook-retry`.
- **`POST /api/public/v1/validations`** — API-key-authed, async (202 + id;
  completion via `validation.completed` webhook). Reuses existing D5 `api_keys`.
- **Shared `runValidationPipeline()`** extracted from the 824-line creation
  route; both the dashboard and public routes call it.
- **Triggers:** `validation.completed` (pipeline end), `tier.changed`
  (recompute chokepoint, guarded on real transition), `outcome.reported`
  (outcomes route).

**Not yet built:** a Settings → Webhooks UI (endpoints are managed via the
`/api/webhooks` API only). Add when a customer needs self-serve config.

### 4. ✅ DONE — Capital-provider "mandate" object

Shipped 2026-06-23 (commit `00cadab`, migration 00044 applied).
- `investor_mandates` (investor-owned diligence gates) + `mandate_assessments`
  (per-validation stamp). `src/lib/mandates/assess.ts` deterministic gate eval.
- Auto-assessed in the validation pipeline; on-demand re-assess endpoint.
  `mandate.assessed` webhook. `/api/mandates` CRUD.
- Stamps: validation detail card + handoff Excel/PDF block + investor-page
  `MandatesManager` editor.
- v1 = assessment + stamp (no lender-attestation layer yet — that's the next
  step toward the rep-and-warranty mechanic).

### 5. ⏸ PARKED (Damon-gated) — Pricing repackage

Decision 2026-06-23: **positioning = additive premium tier** (sits above
Enterprise: highest volume + underwriting suite as the headline value + priority
support; workbench stays in all tiers, so NO app feature-gating needed — lowest
risk). **Not building yet** — the $1,499 number + the public pricing-page change
are outward-facing and explicitly pending the in-person Damon/NPLA validation.
When validated: add an `underwriting` plan to `src/lib/stripe/server.ts` PLANS
(`STRIPE_PRICE_UNDERWRITING_MONTHLY/_ANNUAL` env vars, created in Stripe first)
+ a 4th card on `src/app/pricing/page.tsx`. Metered Fund tier stays design-only.

### 6. ⏸ GATED (volume) — Borrower-centric IA restructure

UX-PLAN §2 — surface **Borrowers** as the durable object; validations/evaluations
hang off a borrower. Explicitly deferred until real multi-borrower volume confirms
it matters; the interim mitigations (item 1.6 recent-evaluations card, etc.) carry
it. Not a "build now."

---

## Session close (2026-06-23) — backlog state

**Shipped this session:** Items 1, 2, 3, 4 (all live on `main`, deploys green,
migrations 00043–00044 applied). Item 0 closed (env keys were already set; fixed
the RESEND_FROM_ADDRESS mismatch + set CRON_SECRET).

**Remaining are both intentionally gated, not skipped:** Item 5 (pricing) is
Damon/number-gated; Item 6 (IA restructure) is volume-gated. The buildable
backlog from this plan is complete — next real work is either of those when their
gate clears, or the "Later / gated" items below.

### Later / gated
- **AVM adapter** (HouseCanary) — sharpens the judgment's market dimension.
- **CRE bridge *lenders*** adjacency (commercial templates on the existing engine).
- **Continuous title/collateral monitoring** (fits the monitor runner).

---

## Do NOT spend cycles on

BatchData/C2 + any entity-graph data deepening (Elementix owns it — orchestrate,
don't replicate); GEO/AEO/programmatic SEO; reputation/consensus + investor-perf
UI (E2/E3/E4/A4/A5 — outcome-density-gated, schema-only); autonomous underwriting
decisioning (stay advisory); CRE-*broker* GTM (wrong buyer).

---

## Verify after each change
- `npm run build` (TypeScript + compile) — must be clean before push.
- `npx tsx scripts/verify-underwriting-engine.ts` if you touch sizing.
- Push to `main` → **check Vercel deploy went green** (history of silent webhook
  failures): `vercel ls pulseclose | head -5`.

## Test the workbench live (you)
`/dashboard/evaluate` → "Evaluate against investors" → the Underwriting Workbench
card → enter NOI/cap rates → "Size loan" → "Run AI judgment." Your founder org is
`internal` (unlimited), so the trial usage meter + landing/pricing only show for a
fresh org in incognito.

---

## Critical context (carry forward)
- **The build converged on the right product; positioning/pricing/first-run UX
  lagged** — now reconciled. Read STRATEGY's new top section.
- **Underwriting is decision *support*, never the decision.** Deterministic engine
  sizes + tiers; AI narrates. Market + regulatory (ECOA) reasons. Hold the line.
- **Don't replicate the entity-graph data layer** (post-Elementix lock).
- **The wedge:** capital-provider endorsement → rep-and-warranty-relief → downstream
  originators. Self-serve funnel = conversion substrate for that referred demand,
  not a cold-acquisition engine.
- **ROADMAP cross-cutting principles 8–12** govern all new code (canonical token
  matching, dual-coded dedup, max_tokens 4096 + stop_reason, AI privacy bundle,
  JSONB schema_version).
- **CHECK BUILD STATUS** in Vercel after every push.

---

## Reference paths
- **Repo:** `/Users/zachwade/code/active/pulseclose` · **Prod:** https://app.pulseclose.com
- **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose` · **Supabase:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Migrations applied:** 00001–00042 · **UW engine test:** `npx tsx scripts/verify-underwriting-engine.ts`
- **Memory:** `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`
