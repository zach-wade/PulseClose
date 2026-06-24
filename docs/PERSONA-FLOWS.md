# PulseClose — Per-Persona End-to-End Flows

**The coherent journey, one persona at a time.** This is the "Step 3 remainder —
per-persona flow" deliverable for the UX redesign. Written 2026-06-24.

> **Read with:** [CUSTOMER-SCENARIOS.md](./CUSTOMER-SCENARIOS.md) (who the personas
> are — source of truth), [UX-REDESIGN-PLAN.md](./UX-REDESIGN-PLAN.md) (the
> structural plan: §2 Deal stepper, §3 detail redesign, §4 Fund, §9 live-review
> findings), [COMPETITIVE-RESEARCH-2026-06.md](./COMPETITIVE-RESEARCH-2026-06.md)
> (table-stakes vs. the mandate wedge), [STRATEGY.md](../STRATEGY.md) (the gateway
> reposition + distribution thesis).

The product splits into three module clusters — **① Verify** (5 diligence pillars
+ risk/tier + monitoring), **② Underwrite** (sizing workbench + AI copilot), **③
Distribute** (evaluate/route + mandates + handoff). Each persona *centers* on a
different cluster. The redesigned IA exposes **jobs, not the data model**:
**Borrowers · Deals · Capital · Book** (UX-REDESIGN-PLAN §1). The Deal analyzer
becomes a 5-step stepper over one Deal object — **Terms → Eligibility → Sizing →
Judgment → Hand off**, where **Sizing and Judgment are opt-in** (§2).

These four flows are not variations of one user; they are **different links in the
fund → originator → borrower capital chain.** The product means something
different at each link.

---

## 1. The Underwriter — bridge shop with in-house underwriting

*The power user. Lives in everything, centers on ② Underwrite. The acute UX
persona — the $1,499 Underwriting tier is justified by them.*

1. **Entry / trigger.** Already a customer (or a referred shop sizing real deals).
   The job is recurring: a deal package lands, they need a verified borrower, a
   sized loan, and a routed best-execution — replacing both the Excel UW model and
   the diligence stack.
2. **First session / activation.** Land on **Deals** (or a borrower's history),
   start a Deal, get to a sized loan + binding constraint in one pass. First value
   = "I sized this in minutes, not an afternoon in Excel, and the diligence ran in
   parallel." They want the *full* depth immediately — don't make them hunt for it.
3. **Core loop.** Validate borrower (① pillars + tier + AI memo) → open the Deal →
   walk the stepper: **① Terms** (entered once) → **② Eligibility** (per-investor
   pass/conditional/fail + best-execution) → **③ Sizing** (constraint ladder: MIN
   across LTV/LTC/LTARV/DSCR/debt-yield, named binding constraint, per-investor
   sizing at each investor's caps + priced rate) → **④ Judgment** (AI copilot reads
   the engine's numbers through the 5-dimension + 5-concept lens → deal-killers +
   pursue / pursue-with-conditions / pass) → **⑤ Hand off**. Override-and-rerun
   when they disagree with a factor; tier + memo recompute atomically.
4. **The handoff / output.** The capital-partner-ready artifact (Excel + PDF):
   sizing ladder + binding constraint + per-investor best-execution + the full AI
   judgment + any mandate stamp. The lender picks the `uw_model` that goes in it.
5. **Where the redesign changes their experience.** This persona owns the §9
   findings:
   - **Two-engine wall (§9, confirmed):** today `/dashboard/evaluate` stacks the
     ~13-input eligibility form *and* the workbench's own NOI/caps/rate/amort/
     coverage-basis inputs on one page — ≈30 inputs across two engines that don't
     share state. The stepper collapses them to **one Deal object**: Terms entered
     once, ② and ③ read the same state.
   - **Silent stale state (§2):** editing the loan amount up top silently staled
     the workbench. The stepper marks downstream steps **"stale — re-run,"** never
     silently wrong.
   - **Sizing-input bloat (§2):** going-in cap / rate / closing costs / coverage
     basis / house constraints **default from property-type norms and the matched
     investor tiers** in ②. They confirm ~3–4 numbers (NOI, ARV/stabilized, rate),
     not ~12.
   - **Memo↔factor duplication (§9):** the "AI Risk Assessment → Risks" list and
     "Why this rating?" factor list enumerate the same items. The tabbed detail
     lets the memo *narrate* and the factor list *drill down* — not both enumerate
     (drill-down-over-characterization principle).
6. **What's still gated / missing.** Multi-underwriter / team workflow is
   first-multi-user-customer-gated. Multi-state GC + state-court litigation +
   historical-deed coverage are vendor/customer-gated (a sized deal in those
   states carries the known coverage caveat). Co-borrower / multi-guarantor schema
   is Damon-gated.

---

## 2. The Spreadsheet Refugee — small / solo bridge lender

*Escaping Excel + manual SOS/PACER. Centers on ① Verify, barely touches ②. **Must
not be intimidated by underwriting.***

1. **Entry / trigger.** Usually **referred in by their capital provider**, lands
   via the warm-intro funnel (landing → pricing → 14-day / 50-check trial). The
   pain is speed (30–60s vs. hours) and not missing a sanctions / litigation hit.
2. **First session / activation.** New validation → 5 pillars run in parallel →
   tier + AI memo in ~30–60s. **First value is the verified borrower + the handoff
   artifact** — full stop. The activation path must **never force them through a
   sizing input.** A verify-only lender can stop at **② Eligibility** and never
   meet the Sizing step's NOI / cap / DSCR inputs.
3. **Core loop.** Validate borrower → review tier + memo → (optionally check
   eligibility against any investors they've added) → **hand off**. They live in
   **Borrowers** and **Book**; **Deals** is optional and shallow for them.
   Underwriting (③ Sizing / ④ Judgment) is opt-in and stays collapsed.
4. **The handoff / output.** The professional handoff PDF/Excel — the "I look like
   a real shop now" artifact — plus continuous monitoring on the borrower.
5. **Where the redesign changes their experience.** The §9 findings that hurt
   *them*:
   - **The full sizing wall on first contact (§9, confirmed):** today a
     verify-only lender meets the entire two-engine wall whether they want it or
     not. Progressive disclosure means **they never see a DSCR input** —
     ③ Sizing / ④ Judgment are opt-in (UX-REDESIGN-PLAN §6 before→after).
   - **Dev-script empty state (§9):** with zero investors the evaluate page
     renders the wall *plus* a hint to run `npx tsx scripts/seed-sample-investors.ts`
     — a developer instruction leaked into the product. Their first screen becomes
     a **guided empty state**, not the wall + a CLI command.
   - **"Generating…" forever (§9 bug #2):** a validation with null `ai_analysis`
     shows a perpetual "Generating…" chip even when nothing is running. Needs a
     terminal **"Not run" / "—"** state distinct from in-flight — this persona is
     exactly who hits it (sparse data, no team to notice).
   - **JSONB / snake_case leakage (§9):** "Manage investors" exposes
     `investor_criteria` storage detail and raw `snake_case` cards. The job-shaped
     IA hides storage and shows a readable buy-box — important for a non-technical
     solo operator.
6. **What's still gated / missing.** Nothing major is gated *for their core job* —
   ① Verify is complete. The risk is purely that the UX over-serves them; the
   redesign's whole point for this persona is **subtraction**, not features.

---

## 3. The Downstream Adopter — referred originator / broker

*Runs PulseClose because a fund asked them to. Centers on ① Verify + the **mandate
stamp** (③). The stamp is THE feature for them — and today it's buried.*

1. **Entry / trigger.** A capital provider tells them: "run deals through
   PulseClose to meet our standard / get rep relief." Capital access is
   semi-required. They arrive through the warm-intro funnel → trial — **the funnel
   is conversion substrate for referred demand, not cold acquisition.**
2. **First session / activation.** They need one thing fast: run a borrower and
   see **"✓ meets [Fund]'s standard."** First value = the stamp, not a tier essay.
   Activation should surface the fund's program immediately — "Your deals are
   assessed against [Fund]'s mandate."
3. **Core loop.** Validate borrower → validation is **auto-assessed against the
   fund's mandate** (the engine already does this — gates → pass / conditional /
   fail) → read the stamp → **hand off back to the fund.** They live in
   **Borrowers** + **Capital** (the **Programs** surface), light on **Deals**.
4. **The handoff / output.** The handoff carrying the **mandate stamp** back to the
   fund (the stamp is already in the handoff Excel/PDF). The verdict — not the raw
   diligence record — is what crosses to the fund (privacy boundary, §4.2).
5. **Where the redesign changes their experience.**
   - **Buried stamp (§9, confirmed — the headline finding for them):** the
     "Capital-provider mandates" section renders as the **11th of 13 stacked
     sections** on validation detail (below entity, track record, sanctions, GC…).
     For the wedge feature, the headline output sits near the bottom. The redesign
     **promotes the mandate stamp to the top of borrower/validation detail**
     (UX-REDESIGN-PLAN §3) — their flow becomes: run validation → *immediately* see
     "✓ meets Insignia's standard" → send it back.
   - **No Programs surface yet (§4.3):** the redesign adds a **Programs** area under
     Capital — "You're in Insignia's program. 7 of your last 10 deals met it." —
     so being in a program is legible, and joining one is the moment the wedge
     converts them.
   - **Header overflow on mobile (§9 bug #3):** the §3 tabbed detail redesign fixes
     the off-screen action buttons for free — relevant since an originator may
     review a stamp on a phone.
6. **What's still gated / missing.** The **other half of their loop doesn't exist
   yet:** the fund can't *receive* the verdict in its own surface because the **Fund
   tenant is Phase 2.** And the load-bearing promise — **does running PulseClose
   actually earn rep-and-warranty relief / lighter re-diligence?** — is the
   **unverified Damon question** (UX-REDESIGN-PLAN §8, COMPETITIVE-RESEARCH open Q1).
   If the answer is no, the stamp degrades from "capital access" to "nice routing."

---

## 4. The Mandator / Fund — capital provider who publishes the mandate

*The strategic wedge. Centers on ③ Distribute. **Currently has no product home** —
the single biggest coherence gap.*

1. **Entry / trigger.** A private-credit fund that deploys through a roster of
   originators and wants to standardize diligence + cut rep-and-warranty / buyback
   risk across everyone it funds. They buy **distribution + risk control +
   standardization** — never check volume. Entry is **top-down: they adopt, then
   push downstream. This is the wedge.**
2. **First session / activation.** Land in a **Mandate console** (not the lender
   dashboard). First value = **define the standard once** — author a mandate
   (reuse `investor_mandates`, owned by the fund tenant), optionally feed the gates
   from the **A1 investor-PDF parser** (their guidelines → extracted criteria).
3. **Core loop.** Author / maintain mandates → invite or accept originators into
   the **program** (consent link) → watch the **cross-originator mandate view**:
   across all originators in the program, *which deals meet the standard, which
   fail and why, throughput, exception rate* → pull verdicts into fund reporting
   via **webhooks / API** (`mandate.assessed`). They live entirely in **Capital**
   — a fund-shaped Capital, not a lender's.
4. **The handoff / output.** They are the **consumer** of the verdict, not the
   producer: a roster-wide compliance view + a verdict feed. The artifact they
   *publish* is the mandate itself (the standard); the artifact they *receive* is
   the per-originator pass/conditional/fail stamp.
5. **Where the redesign changes their experience.**
   - **The Fund gets the originator onboarding flow (§9, confirmed — worse than "an
     investor row"):** today the Fund tenant's dashboard serves the **originator
     onboarding verbatim** — "① Validate the borrower ② Evaluate against your
     investors ③ Hand off to capital" — the *opposite* of a fund's job. The
     redesign gives them a **Fund tenant + Mandate console** (UX-REDESIGN-PLAN §4.1)
     as their actual home.
   - **No cross-originator surface (§4.2):** the wedge mechanic — a fund seeing
     verdicts across the originators it funds — does not exist. The redesign builds
     it as **verdict-only sharing** (assessment + minimal deal facts, **not** the
     borrower's full diligence record), honoring the "share a stamp, don't
     replicate the entity graph" post-Elementix constraint.
   - **No pricing home:** the Fund tier (metered, flat base + per-loan, Module ③)
     becomes a real surface + a landing-page Mandator strip (§5).
6. **What's still gated / missing.** **The entire Fund tenant is Phase 2** —
   doesn't exist today (UX-REDESIGN-PLAN §7). Blocking design questions to settle
   **with Damon before building** (§8): separate org `type` vs. a role (auth/RLS
   impact); program consent model (per-originator opt-in vs. fund-initiated
   invite); the exact deal metadata that crosses the tenant boundary (the privacy
   line — also a trust-selling point); and **whether a fund will actually grant
   rep-and-warranty relief on a third-party verdict** — the load-bearing
   assumption competitive research could not confirm. If no, the whole Phase-2
   build is low-value.

---

## 5. Cross-persona — the single coherent spine

All four flows ride **one spine**:

> **The deterministic engine sizes and tiers. The AI narrates and flags — it never
> sets the loan amount or the tier. The human decides.** This is non-negotiable:
> it's what keeps PulseClose advisory (decision *support*, not the decision) and
> out of ECOA / fair-lending territory.

The **mandate verdict is the connective tissue** that turns four separate users
into one chain: the Mandator publishes the standard, the Downstream Adopter runs
against it, the verdict crosses back to the fund. Competitive research confirms
**no competitor produces a cross-originator pass/conditional/fail verdict against a
fund's published mandate** — diligence and loan sizing are table-stakes; the
mandate layer is the genuinely differentiated wedge. The flows above are the same
two questions about the **Sponsor** (the borrower — subject, not buyer), asked from
four seats: *can I trust them with this loan, and how big can it safely be?*

The redesign serves them with **one job-shaped IA + one Deal object + progressive
disclosure**: the same surfaces, revealed to different depths. The Spreadsheet
Refugee stops at ② Eligibility; the Underwriter walks all five steps; the
Downstream Adopter reads the promoted stamp; the Mandator publishes the standard
the stamp is measured against.

### Persona → module / tier map

| Persona | Centers on | Lives in (modules) | IA home | Tier |
|---|---|---|---|---|
| **Underwriter** | ② Underwrite | ① + ② + ③ (everything) | Deals (full stepper) | Underwriting ~$1,499 (additive) |
| **Spreadsheet Refugee** | ① Verify | ① + light ③ (handoff) | Borrowers · Book | Starter $299 / Pro $499 |
| **Downstream Adopter** | ① Verify + mandate stamp | ① + ③ (stamp) | Borrowers · Capital (Programs) | Starter / Pro (or fund's program bundle) |
| **Mandator / Fund** | ③ Distribute | ③ (mandate console) | Capital (fund-shaped) | Fund (metered) — *does not exist yet* |

No persona is differentiated by **check volume** — they're differentiated by
**which module cluster they center on.** That is the through-line from personas →
coherent flow → packaging, and the reason the redesign re-shapes IA and tiers
around the three modules rather than the data model or a single volume axis.
