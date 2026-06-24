# PulseClose — Session Pickup & Execution Plan (2026-06-23, rev. UX-redesign phase)

> **Self-contained handoff.** A fresh session can work straight down §"The
> next-session plan." Deeper rationale lives in the linked docs.
>
> **Read first (in order):** this file → [docs/CUSTOMER-SCENARIOS.md](docs/CUSTOMER-SCENARIOS.md)
> (personas — the new lens) → [docs/UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md)
> (the end-to-end plan) → [STRATEGY.md](STRATEGY.md) (the gateway reposition) →
> [docs/PRICING-STRATEGY.md](docs/PRICING-STRATEGY.md) §0 → memory `MEMORY.md`.

---

## Where we are (headline)

The core product is **functionally complete** as a verification + underwriting
gateway — all three module clusters are built and live: **① Verify** (5 pillars +
risk/tier + monitoring), **② Underwrite** (workbench + AI copilot + sizing),
**③ Distribute** (evaluate/route + mandates + handoff + write-back API/webhooks).

**The gap is no longer function — it's coherence.** The IA is data-shaped, the
analyzer is a ~30-input two-engine wall, pricing is on a check-volume axis that
matches no persona, and the **Fund (the wedge persona) has no product home.** We
have reframed the work around **personas** and written the redesign plan. Next
phase is **persona-driven UX redesign**, validated against live screens +
competitor research + deep thinking.

Everything below is **live on `main`, deployed green**; migrations **00001–00044**
applied to prod; `npm run build` clean; UW engine test 24/24.

---

## Shipped this session (2026-06-23)

1. **Item 1 — UX quick-win pass** (workbench on eval detail, next-step strip,
   evaluate→handoff deep-link, muted "minor", 3-step empty state, recent-evals
   card, sidebar rename). Commits `dcba0f9`, `3688c0c`.
2. **Item 2 — Underwriting → handoff artifact** (sizing ladder + full AI judgment
   in handoff Excel/PDF, lender-picked `chosen_uw_model_id`). Commit `ebf56cd`.
3. **Item 3 — Write-back API + webhooks** (extracted `runValidationPipeline()`;
   public `POST /api/public/v1/validations`; dedicated webhook subsystem —
   `webhook_endpoints`/`webhook_deliveries`, HMAC, retry cron; triggers
   validation.completed / tier.changed / outcome.reported). Migration 00043.
   Commits `a0dde25`, `8d6cba3`.
4. **Item 4 — Capital-provider mandates** (`investor_mandates` + `mandate_assessments`;
   deterministic gate assessment; auto-assess in pipeline + on-demand; stamps on
   validation detail + handoff Excel/PDF; `mandate.assessed` webhook; `MandatesManager`
   editor). Migration 00044. Commit `00cadab`.
5. **Item 0 closed** — env keys were already set in Vercel; fixed the
   `RESEND_FROM_ADDRESS`→`RESEND_FROM_EMAIL` mismatch (resend.ts honors both);
   set `CRON_SECRET`. (Only real gap was CRON_SECRET — now set.)
6. **Strategy docs** — [CUSTOMER-SCENARIOS.md](docs/CUSTOMER-SCENARIOS.md) +
   [UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md).

**Parked/gated (intentional):** Item 5 pricing (Damon-gated; positioning decided
= additive premium tier) · Item 6 borrower-IA (now folded into the UX redesign §1).

---

## The next-session plan — do in order

> The goal: make this **as good as it can be** — live-validated, stress-tested
> against public alternatives, deeply reasoned. Don't jump to building; the first
> three steps are research/design.

### 1. 🎥 Live pixel-drive as a test user — one per persona ✅ DONE (2026-06-23)

Completed. Drove the **live prod app** as 3 seeded personas, screenshotted every
key screen, and wrote findings into [UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md)
**§9 "Live-review findings."** Repeatable harness:
`scripts/create-test-user.ts` → `scripts/seed-persona-data.ts` (stable IDs
`1111…`/`2222…`/`3333…`) → `scripts/drive-persona.ts`. Screens in `ux-review/`
(gitignored). Test logins: `uw@`/`solo@`/`fund@test.pulseclose.com`, pw
`Test1234!` (orgs live in prod Supabase).

**What it confirmed:** the §2 two-engine wall is real; the mandate stamp is the
11th of 13 detail-page sections (promote it); the Fund tenant serves the
*originator* onboarding flow (no home). **Bugs found** (§9, fix independently):
gc-result-card white-screens on object-shaped `disciplinary_actions` (only
unguarded spot in the render path); null `ai_analysis` → "Generating…" forever;
mobile header-button overflow; `handle_new_user` slug strips capitals.

**→ Next session starts at Step 2 (research).**

<details><summary>Original Step 1 instructions (for reference)</summary>

See the real rendered screens before redesigning. Personas are in
[CUSTOMER-SCENARIOS.md](docs/CUSTOMER-SCENARIOS.md).

**Enablers (verified this session):**
- `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Login is **password-based** (`supabase.auth.signInWithPassword`, see
  `src/app/(auth)/login/page.tsx`).
- `chromium-cli` is NOT installed; `Google Chrome.app` IS present. Use the
  `/run` skill's playwright pattern (install a driver, or `npx playwright`).
- `scripts/seed-sample-investors.ts` exists (seeds 3 investors + criteria).

**Steps:**
1. Write `scripts/create-test-user.ts` — `admin.createUser({email_confirm:true})`
   + create an `organizations` row + a `users` row linking them. **Mirror the
   signup-side org creation** (check `src/app/(auth)/signup` + the auth callback
   so trial/org fields are set correctly).
2. Seed per-persona data:
   - **Underwriter** — investors + criteria (`seed-sample-investors`), 1–2
     validations, a `deal_evaluation` + `uw_model`, a mandate. Drive: dashboard →
     validation detail → evaluate/underwrite → handoff.
   - **Spreadsheet Refugee** — minimal org + 1 validation. Drive: does the
     analyzer wall intimidate? Can they ignore underwriting?
   - **Downstream Adopter / Mandator** — ⚠️ the **Fund tenant doesn't exist yet**,
     so their full flow CANNOT be driven. Drive what exists (mandate nested in an
     investor) and treat the gaps as confirmed findings.
3. `npm run dev`, drive Chrome through each persona's flow, **screenshot every
   key screen and LOOK at it.** Capture: input density, section order,
   duplication, stale-state, where the mandate stamp sits, mobile reflow.
4. Write findings back into [UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md) (a
   "live-review findings" section) — confirm/adjust the §2 analyzer redesign and
   §3 detail-page plan against real pixels.

</details>

### 2. 🔍 Research + stress-test against public alternatives ✅ DONE (2026-06-24)

Ran the `deep-research` workflow (5 angles, 22 sources, 25 claims adversarially
verified). Full cited record: **[COMPETITIVE-RESEARCH-2026-06.md](docs/COMPETITIVE-RESEARCH-2026-06.md)**.
**Verdict:** the **mandate verdict is empty competitive space** (no comp does
cross-originator pass/conditional/fail vs. a fund's published mandate); diligence
+ sizing are table-stakes; pricing axes are per-check KYB *floor* / per-loan LOS
*ceiling* (capability-modular tiers are unusual but defensible). **Load-bearing
risk:** unconfirmed whether funds grant rep-and-warranty relief on a third-party
verdict → now the top Damon question.

### 3. 🧠 Synthesize the overarching plan — ◐ PARTIAL

**Done:** research folded into [PRICING-STRATEGY §0+§5](docs/PRICING-STRATEGY.md)
(sourced pricing axes + the rep-and-warranty Damon question), [STRATEGY](STRATEGY.md)
positioning (mandate-verdict = empty space; mandate object now ships), and
[UX-REDESIGN-PLAN §8](docs/UX-REDESIGN-PLAN.md) (rep-and-warranty as the gating Q).

**Remaining (next session, before/with build):**
- Overarching **per-persona flow** — the coherent end-to-end journey doc.
- **Web pages** — landing must add the Mandator strip; pricing page must add
  Underwriting + Fund tiers (numbers Damon-gated).
- Resolve the §8 open questions with Damon (rep-and-warranty relief FIRST, then
  Fund tenant model, program consent, cross-tenant privacy line).

### 4. 🛠 Build — Phase 1 first

Per [UX-REDESIGN-PLAN.md](docs/UX-REDESIGN-PLAN.md) §7. **Recommended first build:
the Deal analyzer stepper** (§2) — one `Deal` object, 5-step progressive
disclosure, kills the ~30-input two-engine wall + stale state. Self-contained;
establishes the "one Deal" model the rest builds on. No new tables (consolidates
`deal_evaluations` + `uw_models` UI state).

---

## The redesign backlog (from UX-REDESIGN-PLAN §7)

**Phase 1 — lender-flow coherence (no multi-tenancy):**
1. ✅ **SHIPPED (2026-06-24)** Deal analyzer stepper over one Deal object —
   `src/lib/deal/view-model.ts` + `src/components/dashboard/deal/deal-stepper.tsx`;
   `evaluate/page.tsx` is now a thin shell. 5 steps (Terms → Eligibility →
   Sizing[opt-in] → Judgment[opt-in] → Hand off), stale-state flagging, sizing
   caps default from matched investors. Reuses all APIs/tables. Smoke-tested
   green on prod. **Follow-up:** retire `underwriting-panel.tsx` once
   `evaluate/[id]/page.tsx` is migrated to mount the stepper in resume mode.
2. ✅ **SHIPPED (2026-06-24)** Validation detail tabs + promoted mandate stamp —
   `validations/[id]/page.tsx` now tabs into Summary/Evidence/Deal/Hand off/Book
   with the mandate card lifted to directly under the summary cards. `#handoff`
   deep-link opens the Hand off tab (verified). Smoke-tested green on prod.
3. ✅ **SHIPPED (2026-06-24)** Borrower-spine IA — sidebar restructured to the
   job-shaped spine (Borrowers/Deals/Capital/Book + Activity/Usage secondary);
   `/dashboard`→"Borrowers", `/dashboard/portfolio`→"Book". Borrower detail
   (`borrowers/[id]`) already existed; nav now wires the spine around it.
   Remaining polish: borrower-organized/deduped list + row→borrower-detail links.
4. Settings→Webhooks UI + empty/error states + handoff "what's next" — *~1–1.5d* (in progress)

**Bugs fixed (2026-06-24, from §9 live-review):** gc-result-card white-screen
guard · dashboard "No memo" terminal state · mobile header stacking · migration
00045 slug-casing (⚠️ **NOT applied to prod — run `supabase db push`**).

**Phase 2 — arm the wedge (Fund as first-class citizen):**
5. Fund tenant + mandate console — *~3–4d*
6. Program consent link + cross-originator mandate view (verdict-only sharing,
   privacy boundary enforced) — *~4–5d*

**Phase 3 — packaging (Damon-gated):**
7. Underwriting + Fund pricing tiers + landing/pricing repositioning — *~1–2d code*

---

## Gated / NOT building speculatively (strategy is explicit)

- Reputation/consensus + investor-perf (E2/E3/E4/A4/A5) — outcome-density-gated.
- LOS connectors (Salesforce/Nexys/Encompass/Zapier/CSV) — named-customer-gated.
- Multi-underwriter/team workflow, multi-borrower modeling — first multi-user customer.
- Data coverage: multi-state GC, state-court litigation, historical deeds (C2
  de-scoped) — vendor/customer-gated.
- BatchData/entity-graph deepening (Elementix owns it) · autonomous decisioning
  (stay advisory) · CRE-broker GTM (wrong buyer).

---

## Critical context (carry forward)

- **The spine, non-negotiable:** deterministic engine sizes + tiers; **AI
  narrates, never sets the number or the tier**; human decides. Keeps us out of
  ECOA/fair-lending territory.
- **The wedge:** capital-provider endorsement → mandate → rep-and-warranty relief
  → downstream originators. **The Fund must become a first-class product
  citizen** (chosen direction) — it's the weakest link despite mandates shipping.
- **Don't replicate the entity-graph data layer** (post-Elementix). The
  cross-originator Fund view shares *verdicts*, not diligence data.
- **Personas drive the UX**, not the data model. Job-shaped IA, one Deal object,
  progressive disclosure.
- **ROADMAP cross-cutting principles 8–12** govern all new code (token matching,
  dual-coded dedup, max_tokens 4096 + stop_reason, AI privacy bundle, JSONB
  schema_version).
- **CHECK BUILD STATUS** in Vercel after every push (`vercel ls pulseclose | head`).

---

## Reference paths
- **Repo:** `/Users/zachwade/code/active/pulseclose` · **Prod:** https://app.pulseclose.com
- **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose` · **Supabase:** `oazwscmgyqknwatqgtyc`
- **GitHub:** https://github.com/zach-wade/PulseClose
- **Migrations applied:** 00001–00044 · **UW engine test:** `npx tsx scripts/verify-underwriting-engine.ts`
- **Key docs:** CUSTOMER-SCENARIOS.md · UX-REDESIGN-PLAN.md · UX-PLAN.md (tactical, §4 shipped) ·
  STRATEGY.md · PRICING-STRATEGY.md · ROADMAP.md · DATA-MODEL.md
- **Memory:** `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`
