# PulseClose — Session Pickup (2026-06-23)

> **For session-resumption.** Orients quickly, points to the docs.
>
> **Read on session start, in order:**
> - This file
> - [STRATEGY.md](STRATEGY.md) — **repositioned 2026-06-23** to a verification + underwriting gateway
> - [docs/ROADMAP.md](docs/ROADMAP.md) — see the **Post-NPLA sequence (2026-06-23)** section
> - [docs/UX-PLAN.md](docs/UX-PLAN.md) — coherent-product UX/IA plan (new)
> - [docs/PRICING-STRATEGY.md](docs/PRICING-STRATEGY.md) — §0 repackaging direction (new)
> - [docs/DATA-MODEL.md](docs/DATA-MODEL.md), [docs/IDEAS.md](docs/IDEAS.md)
> - Memory: `~/.claude/projects/-Users-zachwade-code-active-pulseclose/memory/MEMORY.md`

---

## Where we are (the headline)

**The product crossed from "borrower validation" to a verification +
underwriting gateway, and the docs were reconciled to match.** NPLA Atlantic
City (June 22–23) just happened — the pre-NPLA forcing function is behind us;
execution is now the post-NPLA sequence in ROADMAP.

**Shipped this session (2026-06-22 → 06-23), all live on `main`:**

1. **Underwriting Workbench (Module 10) + AI UW Copilot (Module 6)** — ported
   from the validated standalone bridge-deal-evaluator. Deterministic sizing
   (`src/lib/underwriting/sizing.ts`, 24/24 regression checks —
   `npx tsx scripts/verify-underwriting-engine.ts`), per-investor best-execution
   overlay, AI judgment (Opus 4.8, privacy-harnessed). `uw_models` (00040),
   `/api/underwrite` + `/api/underwrite/[id]/judge`, panel on `/dashboard/evaluate`.
   Commits `9c372c6`, `e9b2bda`.
2. **Self-serve funnel** — public landing (`/`) + `/pricing`, 14-day/50-check
   trial (00041/00042) replacing the 3-check gate, dashboard usage meter, trial
   drip emails (Resend), PostHog funnel events. Commits `6a093b0`, `f50445d`.
   **Reframed as warm-intro landing infrastructure, not cold acquisition.**
3. **Doc reconciliation (this session)** — STRATEGY repositioned; ROADMAP status
   + North Star + post-NPLA sequence + decision log; new UX-PLAN; PRICING §0;
   IDEAS (CRE bridge lenders, standalone UW wedge, title monitoring, AVM, mandate
   object); CLAUDE (42 migrations, underwriting module).

**Production health:** ✅ All commits live, Vercel auto-deploy clean. Migrations
00040–00042 applied to prod. Builds + the engine regression test green.

---

## Resume here — the post-NPLA sequence (full version in ROADMAP)

1. **Doc reconciliation** — ✅ done this session.
2. **🔴 Turn on env keys in Vercel** (manual, gates shipped features):
   `NEXT_PUBLIC_POSTHOG_KEY` (+ `NEXT_PUBLIC_POSTHOG_HOST`) — funnel analytics
   are inert without it; `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — onboarding/trial
   emails; `CRON_SECRET` — the new `/api/cron/trial-emails` daily cron.
3. **UX quick-win pass (2–3 days)** — UX-PLAN §4: workbench on the evaluate
   *detail* page (parity), "next step" CTA + progress strip on validation detail,
   evaluate→handoff deep-link, fix the "minor" severity color, first-run card.
4. **Underwriting → handoff artifact (2–3 days)** — sizing ladder + binding
   constraint + judgment stance into the Excel/PDF. *Makes underwriting
   demo-able to a capital provider — the wedge-completer.*
5. **D6 item 1 — generic write-back API + webhook payloads (3–4 days).**
6. **Capital-provider "mandate" object (3–5 days).**
7. **Pricing repackage** — add the $1,499 Underwriting tier; design the metered
   Fund tier. Validate numbers with Damon.

**De-prioritized (don't spend cycles):** BatchData/C2 + data-layer deepening
(Elementix owns it), GEO/AEO/SEO, reputation+investor-perf UI, autonomous
decisioning, CRE-*broker* GTM. (CRE bridge *lenders* are a real adjacency — IDEAS.)

---

## Manual items (you)

1. **Set the Vercel env keys** (#2 above) — shipped features are inert without them.
2. **Test the workbench live** — `/dashboard/evaluate` → "Evaluate against
   investors" → the Underwriting Workbench card renders below; enter NOI/cap rates
   → "Size loan" → optionally "Run AI judgment." (Your `internal` org = unlimited,
   so the trial usage meter is hidden for you — sign up a fresh org in incognito to
   see the funnel/landing/trial.)
3. **Confirm `claude-opus-4-8`** resolves on the Anthropic key (first Opus consumer;
   the memo path uses Sonnet). Falls back to Sonnet easily if not.
4. **Pricing validation with Damon** — does a $1,499 underwriting tier land?
   Platform fee vs per-deal bundle for funds?

---

## Critical context

- **The build converged on the right product; positioning/pricing/first-run UX
  were what lagged** — now reconciled in the docs. Read STRATEGY's new top section.
- **Underwriting is decision *support*, never the decision.** Deterministic engine
  sizes + tiers; AI narrates. Hold this line (market + regulatory reasons).
- **Don't replicate the entity-graph data layer** (post-Elementix lock) — orchestrate.
- **The wedge:** capital-provider endorsement → rep-and-warranty-relief mechanic →
  downstream originators. The self-serve funnel is the *conversion substrate* for
  that referred demand, not a cold-acquisition engine.
- **CHECK BUILD STATUS** in Vercel after every push (history of silent webhook fails).
- ROADMAP cross-cutting principles 8–12 govern all new code.

---

## Reference paths

- **Active repo:** `/Users/zachwade/code/active/pulseclose`
- **Production:** https://app.pulseclose.com · **Vercel:** `buildfolios-projects-e8f9d80e/pulseclose`
- **Supabase ref:** `oazwscmgyqknwatqgtyc` · **GitHub:** https://github.com/zach-wade/PulseClose
- **Last shipped commit:** `f50445d` (trial emails + funnel events + D6) — docs pass commits after this.
- **UW engine test:** `npx tsx scripts/verify-underwriting-engine.ts`
- **Migrations:** 00001–00042 applied.
