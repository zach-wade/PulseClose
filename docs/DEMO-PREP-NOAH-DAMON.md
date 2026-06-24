# Demo prep — Noah & Damon (review, test, and drive the demo)

> Built from the consulting corpus (their actual words) + the live seeded
> platform. Goal: a demo that **preempts their questions instead of reacting to
> them.** Their evaluation culture is *"demo-against-the-contract; 'we have an
> API' is marketing; don't trust until shown in a sandbox"* — so this must run
> **live on clean data**, not slides.
>
> **The spine of the whole demo (one sentence):** *the deterministic engine sizes
> and scores with fully transparent, ICP-aware factors you can drill into source
> evidence; the AI only narrates — it never sets the loan amount or the tier; a
> human decides.* That sentence is the direct answer to both decision-makers'
> #1 objection. Say it out loud early.

---

## Part 0 — Dry-run the platform BEFORE the demo (the test checklist)

Their trust broke once already (4/9: entity data correct, but the property/
track-record layer showed *"wrong addresses, wrong numbers"*). **Re-verify every
screen on clean seeded data before you show them.** Run:

```bash
# 1. Re-seed clean (idempotent) — underwriter org
ORG_ID=27296b6b-87f2-4b71-9e84-2c71f652449c npx tsx scripts/seed-sample-investors.ts
ORG_ID=27296b6b-87f2-4b71-9e84-2c71f652449c PERSONA=underwriter npx tsx scripts/seed-persona-data.ts
# 2. Drive every screen + eyeball the screenshots
EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' PERSONA=underwriter npx tsx scripts/drive-persona.ts
npx tsx scripts/verify-underwriting-engine.ts   # math anchor must pass
```

**Pre-flight checklist — confirm each renders correct, not just present:**
- [ ] Westbrook validation — 4 track-record rows are the RIGHT addresses/prices (no Regrid-style garbage). *This is the trust tripwire from 4/9 — if the property layer looks wrong, don't open it.*
- [ ] Exit/takeout panel sizes ($1.8M bridge → $2.28M takeout, 1.27x, clears).
- [ ] Stabilization path + interest reserve render.
- [ ] Best-execution shows Oakhurst $1.92M > Colchis $1.68M (real buy-boxes).
- [ ] Mandate Console roll-up renders.
- [ ] **Pre-load these URLs in tabs** so you never fumble live:
  - Westbrook borrower: `/dashboard/validations/44444444-4444-4444-8444-444444444444`
  - Resume the saved deal (exit panel at a URL): `/dashboard/evaluate/<latest-eval-id>`
  - Mandate Console: `/dashboard/capital/mandates`
  - Privacy posture doc open in a browser tab (Damon WILL ask).
- [ ] Log in as `uw@test.pulseclose.com` / `Test1234!` in advance.

**Lead metric to have ready:** their deck+model today is **30–90 min/deal** (Noah's number). The demo does it in **minutes**. Damon's literal definition of "results" = *hours reduced + productivity per individual*; he's said the prize is *"20–30% capacity overnight."* Frame the whole thing around minutes-saved-per-deal.

---

## Part 1 — The demo flow (mapped to THEIR underwriting process)

Drive it in the exact order Noah described his own process, so it feels like
*their* job, faster — not a software tour. Use the **Westbrook** deal (8-unit
Sacramento MFR value-add, deed-verified sponsor).

### Step 1 — "First I look at the sponsor." → Borrower validation
**Open the Westbrook borrower.** Five diligence pillars ran in parallel in
~30–60s (entity, track record, litigation, GC, sanctions). Point out:
- **Entity/SOS is the layer they already trust** (*"Entity SOS data: CORRECT — Noah and Damon confirmed,"* 4/9). Lead here to re-anchor trust.
- **Sanctions/OFA­C ran automatically** — Noah does this *"100% manual"* today, typing names into the OFAC site. Named a *"High priority quick time-saver."*

> **Q they'll ask:** *"Where did the track record come from — is it real?"*
> **Show:** the Evidence tab → 4 deed-verified exits → **drill any row to the deed/sale source.** This answers Noah's hardest objection (false positives) *and* shows exactly what investors want from a track record: *when they bought, what they paid, what they sold for.* Say: *"we auto-pull everything in public record; we only ask the borrower for rehab spend + GC — the less we ask the borrower, the better"* (his words).

### Step 2 — "Does the price make sense? Does the exit make sense?" → Exit/takeout + path
**Open the Deal → Sizing.** This is the heart of the demo, because *"does the
exit make sense?"* is the literal question Damon asks on every deal, and the
product now answers it deterministically.
- **Bridge sizes to $1.8M (LTV-bound).** In-place coverage is thin — *"none of the static constraints really bind"* (Damon's exact observation about how they underwrite value-add).
- **Stabilization path:** *"years to 1.20–1.25x DSCR"* — **this is Damon's literal mental model, verbatim.** Show the per-year DSCR trend.
- **Exit/takeout:** the permanent loan sizes to **$2.28M (1.27x the bridge balance) → clears with a $485k cushion.** *"The refinance underwrites the repayment."*
- **Interest reserve:** sized to carry debt service to stabilization (*"some investors want an interest reserve + cost basis"* — his words).

> **Q they'll ask:** *"What's going into these numbers?"*
> **Show:** every figure has a drill-down basis ("70% of stabilized value," "1.25x on stabilized NOI @ 7%"). Nothing is a black box.

### Step 3 — "I price off a grid and slot where they fit." → Best execution
Still in Sizing: **Best execution by investor.** Against the **real Colchis +
Oakhurst buy-boxes** (encoded from their actual lender PDFs):
- **Oakhurst $1.92M @ 9.50% (80% LTV) > Colchis $1.68M (70% LTV).**
- This is **Noah's #1 ask, verbatim since 3/20:** *"put in the data, it slots where they fit in, calculates spread and terms, and a human reviews it."* Say that back to him.

> **Q they'll ask:** *"Does it get the 100bps spread over cost of funds?"*
> **Show:** the priced rate + points per investor; note the rate sheet is encoded (Colchis grid; Oakhurst 9.25–9.75). Frame it as *the grid they price off, automated.*

### Step 4 — The risk tier → **the make-or-break trust moment**
This is the objection that **killed the auto-score on 4/28.** Noah: *"Without
understanding what's going INTO the score, can't trust the OUTPUT."* Drive it
head-on:
- Open the risk factors → **every factor drills to its source evidence.** The AI memo *narrates*; the deterministic factors *decide*. Say: **"the AI never set this tier — these 9 factors did, and you can see every one."**
- **Show the ICP-aware rule explicitly** (this is the exact 4/28 example he raised): the **extended-hold flag excludes bank-financed and primary-residence properties** — a long-term bank hold is not a bridge "extended hold." This is the product *implementing his correction.* It will land hard.

> **Q they'll ask (Damon, every time AI appears):** *"What about privacy / CFPB vendor validation / does it purge our searches? All discoverable in litigation."*
> **Surface it UNPROMPTED:** per-org AI toggle that **fails closed**, regex PII scrub before any model call, token-depersonalized memos, retention/purge posture. Have `docs/PRIVACY-POSTURE.md` open. Pair it with: *"and the AI never has autonomy — it can't move a number or take an action; it explains."* (Directly answers his *"I would not let the sink loose"* fear.)

### Step 5 — Mandate verdict → the wedge (capital-provider endorsement)
- On the Westbrook borrower, the **mandate stamp** sits up top: *"✓ Meets Insignia's standard."*
- Open **Capital → Mandate Console:** the fund-side roll-up — across borrowers, who meets the standard, who fails and why, pass rate.
- **Frame with Noah's own strategic insight:** the distribution unlock is *"one capital provider endorsing PulseClose to its lender stable"* — not lender-to-lender referral. This is the verdict a capital provider would endorse to **de-risk the reps-and-warranties exposure** on delivered loans.

> **Q they'll ask:** *"Will a fund actually grant rep-and-warranty relief on this verdict?"*
> **Be honest:** this is the **load-bearing open question** — surface the cross-originator program view (clearly labeled **Preview**) and say *"this is the vision; whether a fund grants real R&W relief is the one thing only a capital provider can confirm — and it's exactly what I want your read on."* Turning their question into a collaboration ask is the move.

### Step 6 — The one-pager handoff → the artifact
- **Hand off** → the investor-ready Excel + PDF (sizing ladder + binding constraint + exit + best-execution + judgment + mandate stamp).
- Noah: *"This is helpful when we're going to an investor where we have to actually show them something."* Damon **won't read a 45-page spec** — *"I didn't even read it."* The one-pager is the deliverable; lead with it as the output, not a doc.

---

## Part 2 — Objections to preempt (say these BEFORE they have to ask)

| Their concern (their words) | Say / show this, unprompted |
|---|---|
| *"Can't trust the output without the inputs"* (Noah, the #1 wall) | Drill every factor to source; "AI narrates, engine decides"; show the ICP-aware extended-hold rule. |
| *"I would not let the sink loose"* / AI autonomy (Damon) | AI has zero autonomy — it can't set a number, the tier, or take an action. Deterministic engine + human review. |
| *"Purges our searches? Discoverable in litigation"* (Damon) | AI privacy bundle: per-org toggle fails closed, PII scrub, depersonalized memos, retention posture. Open the doc. |
| *"The less you ask the borrower, the better"* (Noah) | No borrower forms — we ingest their existing Excel/Word/CSV/PDF; auto-pull public record. |
| Track-record false positives (Noah's trust-killer) | Verified against deeds; zero-false-positive bar; only demo clean data. |
| *"Significant technical challenges with the overarching wrapper"* (Damon) | Lead with discrete, working modules (track record, 3rd-party report tracking, evaluate-deal) — both subproducts he named himself. Don't oversell "one platform wraps your whole stack." |
| *"How does a lender without an LOS generate closing docs?"* | PulseClose owns origination→approval + the verdict; doc gen stays with the LOS / Lightning Docs. Clear lane. |

---

## Part 3 — The close (Damon's stated adoption gate)

Damon's decision criterion is explicit: *"get real people, real users in here to
just get their feedback."* End the demo by converting to exactly that:

1. **The ask:** *"Let's run your next live deal through it — Noah at intake, on the phone."* (He already said he'd use it *"to see if they're lying or forgot to mention the property with a notice of default."*)
2. **The metric:** *"and let's measure the minutes it saves vs. the 30–90 you spend on the deck."* (His "results" = hours reduced.)
3. **The thesis:** *"the endgame isn't $1k/mo SaaS — it's the verdict a capital provider endorses to its whole lender stable."* (His own *"build something so good the big boys say we need this"* framing.)
4. **The partnership opening** is already on the table (Noah, 4/28: *"if we're helping build this, we should talk about some involvement"*) — let them raise it; the demo earns the right.

---

## Part 4 — Known edges (so nothing surprises you mid-demo)

- **Don't free-hand the property/track-record layer on un-seeded data** — the auto-discovery accuracy is the historical tripwire. Demo the seeded Westbrook record only.
- **Resume mode:** the saved deal opens at `/dashboard/evaluate/<eval-id>` with the exit panel intact — use it to jump straight in. (Live re-entry of Terms still works but takes longer.)
- **Cross-originator Fund view + 3rd-party report tracker are labeled Preview** — present them as vision, never as live data. (This is deliberate and honest; it seeds *"what else could this do."*)
- **ZHVI high-value haircut + Oakhurst >$3M cap** are encoded in the buy-box doc but **not yet wired into sizing** — don't claim they fire.
- **Fund persona login (`fund@`)** still shows the originator onboarding home (the Fund tenant is the next build) — demo the Mandate Console from the underwriter login instead.

---

## Appendix — the quotes to have on the tip of your tongue
- Noah: *"Without understanding what's going into the score, can't trust the output."*
- Noah: *"A deal dashboard… it slots where they fit in, calculates spread and terms, and then a human reviews it."*
- Noah: *"The less you have to ask the borrower for, the better."*
- Noah: *"This is both amazing and really scary that you could build this this quickly."*
- Damon: *"Does the exit make sense?"* (his per-deal question — now a feature)
- Damon: *"They model how many years of permissible rent increase get them to 1.20–1.25x."* (now the stabilization path)
- Damon: *"Get real people, real users in here."* / *"20–30% capacity overnight."*
- Damon: *"Why not build something so good that the big boys say… we need this."*
