# PulseClose — NPLA Atlantic City Runbook

> **⏳ HISTORICAL (as of 2026-07-01):** NPLA (June 22-23, 2026) has **concluded**. Preserved as
> the reusable template for the next event — the current GTM-debut target is the **AAPL
> conference, Nov 9-11 2026 (Las Vegas)**. Live sequencing is the ROADMAP
> [Post-Damon-reset sequence](ROADMAP.md#post-damon-reset-sequence-2026-07-01--construction-sizing-coherence-craft).

**Conference:** NPLA Atlantic City — June 22-23, 2026
**Posture:** Attendee mode (no booth, no sponsorship). Walk in with Damon (Insignia) as plus-one.
**Goal:** 8-12 lender intros, 3-5 design-partner-quality conversations.
**Success criterion:** 5 follow-up calls + 2 design-partner conversations booked within 14 days of close.
**Last updated:** 2026-05-05.

> **Why no booth:** SEO/distribution research landed at the wrong-ROI verdict. At the design-partner stage with one customer, sponsorship money is better spent on (a) printed leave-behinds, (b) a pre-event content drop, and (c) a Scottsdale (Oct) speaking submission. **Speaking > sponsoring** for a tool you want lenders to vouch for, not just see.

---

## 1. Pre-event sprint

Seven weeks out from 2026-05-05 → June 22. Each milestone has a single owner and a single artifact. Slips on Week 4 are recoverable; slips on Week 1 are not.

### Week 7 (now → 2026-05-12) — Foundations

- [ ] **Submit NPLA Scottsdale speaking abstract.** See Section 7. Submit to NPLA program committee. Five months out is the right window for a methodology talk.
- [ ] **Confirm Damon attendance + plus-one badge.** Email confirmation, expected booth presence (if Insignia has one), his planned schedule (panels he's on, dinners he's hosting).
- [ ] **Block calendar for the 4 weeks of pre-sprint.** No new feature scope past Week 3 unless it's directly demoable.

### Week 6 (2026-05-13 → 2026-05-19) — Content backbone

- [ ] **Draft state-of-validation post.** Title: *"State of Borrower Validation in Private Lending — May 2026."* ~1,500 words. Three sections: (1) the validation gap as it stands today (federal-only litigation, GC coverage gaps, deed-history blind spots), (2) the 5-Concept Framework summary (entity, track, GC, litigation, sanctions/PEP), (3) what we're seeing in early test data (pull anonymized stats from Test Co — flag rate per pillar, % of validations that surface a deed-chain anomaly, etc.).
- [ ] **Order printed leave-behind one-pager** — see Section 4 for outline. Quantity: 50. Print vendor: Moo or VistaPrint Premium, premium cardstock, double-sided.
- [ ] **Update Wade Intel landing page.** Make sure the URL on the leave-behind resolves to a page that talks about PulseClose specifically, not generic consulting.

### Week 5 (2026-05-20 → 2026-05-26) — Pre-event publication

- [ ] **Publish state-of-validation post on Build Buy Borrow.** Push to LinkedIn same day. Link from Wade Intel.
- [ ] **OpenSanctions key rotation.** Trial expires 2026-05-28. New key in `OPENSANCTIONS_API_KEY` (Vercel + `.env.local`). Verify with one Truong validation post-rotation.
- [ ] **Begin Damon pre-coordination conversations.** Soft-pitch: *"Damon, I'd love your hit list of who's worth meeting and what they care about, so we don't waste your social capital."*

### Week 4 (2026-05-27 → 2026-06-02) — Damon coordination call

- [ ] **Damon pre-coordination call (~45 min, structured).** See Section 5 for protocol. Output: written list of 8-12 priority intros, his planned talking points for each, the dinner / breakfast slots he's offering us into.
- [ ] **Outside-person bundle to Damon.** Walk through pickup.md "Action items for outside persons" (#1-5): Truong xlsx interpretation, co-borrower modeling, address shapes, Insignia AI policy, testimonial ask.
- [ ] **Receive printed one-pagers.** Check quality, reorder if defects.

### Week 3 (2026-06-03 → 2026-06-09) — Demo polish

- [ ] **Print test on real paper.** Cmd+P on `/handoff/[id]` and `/validations/[id]/risk-methodology`. Fix any margins / page-breaks. (Open decision #2 in pickup.md.)
- [ ] **Migration idempotency on a fresh tenant.** Spin up a 2nd test org; run all 25 migrations clean; validate one Truong xlsx through the full flow. Confirms NPLA-day demo on a clean account would survive.
- [ ] **Cobalt rate-limit rotation strategy in place.** Either round-robin in `src/lib/adapters/cobalt.ts` or env-swap pre-demo. Document the rotation procedure in `pickup.md`.

### Week 2 (2026-06-10 → 2026-06-16) — Dry runs

- [ ] **Demo dry-run with Damon (~60 min).** Walk Section 2 demo runbook end-to-end on the actual conference wifi if possible (Damon's hotel room or coworking). Time the 3 / 8 / 15-minute versions. Damon plays the lender persona; he flags wording that lands or misses with the NPLA crowd.
- [ ] **Build the follow-up email templates.** Section 6. Three versions per persona (lender / fund / consulting). Pre-fill the variable slots.
- [ ] **Confirm Vercel prod is healthy.** `vercel ls pulseclose | head -5`. No partial deploys. Manually run `vercel deploy --prod --yes` if last commit didn't auto-deploy.

### Week 1 (2026-06-17 → 2026-06-21) — Final pre-flight

- [ ] **Re-test Truong validation end-to-end.** Drop the xlsx → confirm AI memo references full names (round-trip privacy proof) → confirm activity strip populates → confirm handoff downloads. ~15 min.
- [ ] **Verify all keys live.** OpenSanctions, Cobalt, Realie, ATTOM, Resend, Stripe, Anthropic. `curl` smoke-test each from terminal. Cobalt: `curl -s -m 60 -H "x-api-key: $COBALT_INTELLIGENCE_API_KEY" "https://apigateway.cobaltintelligence.com/v1/search?searchQuery=tt%20investment%20properties&state=CA&liveData=true"`.
- [ ] **Charge laptops + tether device.** Conference wifi is unreliable. Have a tether (phone hotspot or Brigham + LTE iPad) as fallback for the live-demo segment.
- [ ] **Pack the leave-behinds + business cards.** ~50 each. Don't forget the Wade Intel cards specifically (PulseClose URL + Zach's cell).

### Day-of-arrival

- [ ] **Coffee with Damon morning of Day 1** before sessions start. Last-minute: who's confirmed for the day, what's changed, who *not* to push hard.
- [ ] **Pull up app.pulseclose.com on the laptop** and confirm it loads on the conference wifi before you need it.
- [ ] **Take a photo of the Truong xlsx** and have it on your phone in case you need to demo from a phone.

---

## 2. Demo runbook

Three versions, depending on the conversation depth. Reference the [E2E-TEST-PLAN.md](./E2E-TEST-PLAN.md) phases for the full surface; these are the demo-facing subsets.

> **Demo target:** Test Co tenant on `internal` plan, with the 6 retained Truong validations from 2026-05-02 testing as background activity. **Do NOT delete those before the conference** — they backfill the activity feed visual.

### 3-minute version ("walking conversation")

For booth-walk conversations where you have ~3 minutes before the next session.

| Sec | What | Source |
|---|---|---|
| 0:00 | "Drop the borrower's intake xlsx in." Drop the Truong xlsx onto `/dashboard/new`. Form pre-fills in ~5s. | [E2E-TEST-PLAN Phase 2](./E2E-TEST-PLAN.md) |
| 0:30 | "Click run. Four pillars in parallel — entity, track record, litigation, sanctions." | E2E Phase 3 |
| 1:00 | While pillars resolve: "While that runs — here's what came back on a previous validation." Open one of the retained Truong runs. | E2E Phase 3 |
| 1:30 | Scroll to AI memo. "Story Mode v2. Full-name references prove the privacy round-trip works." | E2E Phase 3.8 |
| 2:00 | Scroll to VerifiedTrackRecord. "3 of these 24 properties are deed-verified as Kim's. The other 21 — that's the data-quality conversation we're having with Damon." | E2E Phase 3.4 |
| 2:30 | Click "Evaluate against my investors →". "Same data, now routed against the lender's investor matrix." | E2E Phase 5 |

**Closing line:** *"That's the loop. Borrower in, validated, routed. Want me to send you a deeper walkthrough?"*

### 8-minute version ("sit-down booth conversation")

For when you've joined Damon at his booth and someone has 5-10 minutes between sessions.

Open `/dashboard` of Test Co. Walk:

1. **Intake** (1 min) — drop Truong xlsx, point out doc-ingest extracts borrower / entity / guarantor / state / **and** addresses (G1.1). [Phase 2.](./E2E-TEST-PLAN.md)
2. **Run** (1.5 min) — pillars resolve in parallel. Point at a retained Truong run while the new one runs. [Phase 3.](./E2E-TEST-PLAN.md)
3. **AI memo + WhyThisRating** (1.5 min) — Story Mode v2 sections, severity badges, factor anchors, override-and-rerun loop. [Phase 3.8 + Phase 4.](./E2E-TEST-PLAN.md)
4. **VerifiedTrackRecord** (1 min) — deed-chain matching using tokenize-and-set (the data-quality story). 3 owned, 20 never-owned, 1 not-found on Truong. [Phase 3.4.](./E2E-TEST-PLAN.md)
5. **Evaluate against investors** (1 min) — pre-filled deal form, per-investor pass/fail with breakdown. [Phase 5.](./E2E-TEST-PLAN.md)
6. **Investor PDF parser (A1)** (1 min) — "if you have a fund's guidelines PDF, I can show you this live." [Phase 7.](./E2E-TEST-PLAN.md) **This is the NPLA hero feature.**
7. **Handoff Excel + PDF** (0.5 min) — "the deliverable to credit committee." [Phase 6.](./E2E-TEST-PLAN.md)
8. **Monitoring + watchlist** (0.5 min) — "and we keep watching after the close." [Phase 9.](./E2E-TEST-PLAN.md)

**Closing line:** *"This is what Insignia uses. Want to set up 30 minutes next week to walk through your specific use case?"*

### 15-minute version ("scheduled meeting back at the hotel")

For lender or fund principal who wants the full tour. Includes the demo dry-run rough edges so you can speak to them.

Add to the 8-minute flow:
- **Phase 1 — Settings & AI privacy** (1 min) — per-org `ai_extraction_enabled` toggle + token-based depersonalization explanation. Material if the lender's compliance team will block AI tools without this.
- **Phase 4 — Override-and-rerun** (1.5 min) — flip an `is_primary_residence` signal; show the AI memo regenerate; "the lender disagrees, the system recomputes."
- **Phase 10 — Deal outcome capture** (1 min) — "this is how reputation accrues over time across our customer base."
- **Phase 7 — A1 PDF parser** (2 min) — full upload flow with confidence chips + accept-N-rows + investor card refresh.
- **Phase 12 — Compare** (1 min) — side-by-side two borrowers (bring two retained Truong runs).

**Closing line:** *"Want to spin up a sandbox tenant and run one of your real borrowers through it next week?"*

---

## 3. Three talk tracks

Tailor the demo and pitch to who you're talking to. Per pickup.md memory, three audience personas show up at NPLA: **lenders** (your customer), **fund principals** (your customer's customer; LP-side), **consulting prospects** (Wade Intel cross-sell).

### Track A — Lender (private bridge lender, $50M-$500M AUM)

- **Opening question:** *"What's your borrower validation flow look like today? Manual SOS lookups? VAs?"*
- **Key claim:** *"You can validate a borrower in 90 seconds instead of 4 hours, with deed verification, and the output is a packet your investors will actually fund off."*
- **Demo moment:** 8-minute version with emphasis on **Phase 6 handoff Excel** ("this is what your investor sees") and **Phase 5 evaluate** ("which of YOUR investors will buy this").
- **Ask:** *"Want a 30-min sandbox call next week? I'll set you up with a tenant and you bring one real deal."*
- **Watch out for:** Lender comparing against an LOS. Counter: "We're the validation layer, not the LOS — we make any LOS smarter at the front end."

### Track B — Fund principal (LP-side, deploys $25M-$200M into bridge funds)

- **Opening question:** *"How do you assess the borrowers in the funds you're allocating to? Do you ever spot-check?"*
- **Key claim:** *"We give your portfolio companies a way to surface deal-by-deal validation that you can audit — and we're building investor-side tools (PDF parser, performance dashboard) so you can compare apples to apples across funds."*
- **Demo moment:** 15-minute version with emphasis on **Phase 7 A1 PDF parser** ("upload your guidelines, see how each fund's deals score") and **Phase 10 deal outcomes** (the consensus moat).
- **Ask:** *"If we built an LP-side tier — investor PDF parser, counter-offer calculator, watchlist across funds — would your team use it? At what price?"*
- **Watch out for:** Fund principal mentally categorizes you as a fund-data vendor (Preqin, Pitchbook). Counter: *"We're upstream of that — the actual borrower-level data, not aggregated fund returns."*

### Track C — Consulting prospect (Wade Intel cross-sell)

- **Opening question:** *"What's the data-quality problem in your underwriting that nobody's solved yet?"*
- **Key claim:** *"We solve borrower validation at the product layer; Wade Intel solves the framework layer — what to validate, what severity, what triggers a kickback. Most lenders need both."*
- **Demo moment:** 3-minute version with emphasis on **the methodology** (5-Concept Framework on the leave-behind, then point at the methodology PDF in PulseClose).
- **Ask:** *"Want to run a 2-hour discovery call where I map your current flow against the framework and identify the 3 gaps?"*
- **Watch out for:** Consulting prospect treats this as a sales pitch for software they don't want. Counter: *"This isn't a software pitch — Wade Intel is the engagement; PulseClose is the example output."*

---

## 4. Leave-behind one-pager

**Format:** US Letter, double-sided, premium cardstock. Print 50.

### Front side — 5-Concept Framework Executive Summary

Headline: **"The 5-Concept Framework for Borrower Validation in Private Lending."**
Sub-headline: *"What every bridge lender should be checking. What most are missing."*

Four-column grid (one row per concept):

| Concept | What it answers | Standard validation gap |
|---|---|---|
| **Entity** | Is the borrowing LLC real, in good standing, owned by the people who say they own it? | SOS data is 50 different state systems. Most lenders pull one and call it done. |
| **Track Record** | Has this borrower actually closed the deals they say they have? | Current holdings are easy. Historical sold deeds are gated behind expensive vendor APIs most lenders don't subscribe to. |
| **GC** | Is the contractor licensed, bonded, and clean? | CSLB covers California. The other 49 states require manual scraping or per-state APIs nobody automates. |
| **Litigation** | Is the borrower or entity actively in court? | Most lenders search federal-only via PACER. State-court mechanic's liens, lis pendens, and breach-of-contract suits are invisible. |
| **Sanctions / PEP** | Is the borrower or any officer on a sanctions list? | OFAC SDN is the bare minimum. PEP screening, beneficial-ownership matching, and adverse-media tend to get skipped. |

Footer: ***"Insignia Capital Corp uses PulseClose to validate every borrower entering their pipeline."***

### Back side — Single proof point + Wade Intel framing

Headline: **"What this looks like in production."**

Single proof point (Truong-style — final wording confirms with Damon at Week 4):

> *"We ran 50 borrower validations across Insignia's pipeline in [month range]. 3 of those surfaced track-record discrepancies that would have funded the loan with hidden risk. Average time per validation: 90 seconds. Average lender-side time saved per deal: ~3.5 hours."*

Mid-block: Wade Intel framing (one paragraph):

> *"Wade Intel builds the methodology layer — the framework, severity rubric, and override rules that turn validation data into credit decisions. PulseClose is the example product built on that framework. We work with bridge lenders, fund-of-funds, and credit committees who want disciplined, repeatable underwriting."*

Bottom: Three lines of contact info:

```
Zach Wade — Founder, Wade Intel
zach.wade@me.com | (cell number)
wadeintel.com — pulseclose.com
```

---

## 5. Damon-coordination protocol

Damon's social capital is the single most valuable resource we're spending at NPLA. Don't waste it; structure it.

### Pre-event (Week 4 call, ~45 min)

**Agenda the call. Send it the day before:**

1. **Intro list (15 min).** Who's worth meeting. Damon prioritizes 8-12 names. For each: name, firm, role, what they care about, why they'd be receptive to PulseClose.
2. **Damon's talking points (10 min).** What's HE saying about us when he's making the intro? He should not have to think about it cold. We give him 2-3 sentences he can paraphrase. *"This is Zach — he built the validation tool we use. Our credit committee asks for the PulseClose packet on every deal now."*
3. **Schedule mapping (10 min).** Which dinners is Damon hosting? Which sessions is he panelist on? Which breakfasts has he committed to? We slot in around his calendar; we don't compete with it.
4. **Outside-person bundle (10 min).** Walk through Action items #1-5 from pickup.md. **This is OUR ask of HIM, not the other way around.** Truong xlsx interpretation, co-borrower modeling, address shapes, Insignia AI policy, testimonial ask.

### At the event

**Handoff at the booth:**
- Damon does the intro: *"Zach, meet [name] — [name], Zach is the founder of PulseClose."*
- Damon stays for the first 90 seconds, drops the substantive cred line (*"our credit committee uses this on every deal now"*), then peels off to the next conversation.
- We carry the demo solo from there.
- We do not let Damon be on the hook to close. He's the door-opener; we're the closer.

**At dinners / hosted sessions:**
- We don't pitch unprompted. We let Damon control the room; we wait for the *"Damon, who's the guy you brought?"* moment.
- Be the second-most-interesting person in any conversation Damon's leading. Curiosity > pitch.

**End-of-day check-in (15-20 min, both nights):**
- *"Who do I prioritize tomorrow?"* — Damon recalibrates based on the day.
- *"Any signals I missed?"* — he saw faces we didn't.
- *"What should I send to whom by EOD?"* — pre-bake follow-ups while names are warm.

### Post-event debrief (within 5 days)

Structured 60-min call. Damon's calendar, our agenda:

1. **Conversion call (15 min).** Each of the 8-12 priority intros: did it land? Yes / no / partial. What signal told us so?
2. **Surprise call (10 min).** Who showed up that we weren't expecting? Who did NOT show up that we should follow up with separately?
3. **Damon-takeaway call (15 min).** What did HE hear about us during the event from people we didn't meet? Backchannel signal is more valuable than direct signal.
4. **Capacity call (15 min).** What's Damon's next-30-day capacity for follow-up co-meetings? This drives our pipe planning.
5. **Scottsdale call (5 min).** Did NPLA program committee respond on our talk submission? If yes — Damon's view on whether to accept (panel vs solo, time slot).

---

## 6. Follow-up flow (within 48h of NPLA close)

Every conversation gets a follow-up email within 48 hours of conference close. **Sequenced, not blasted.** Each email references the specific conversation by detail nobody else could fake.

### Standard template (per persona variant)

**Subject lines:**
- Lender: *"Quick follow-up from NPLA — that validation question you raised"*
- Fund: *"NPLA follow-up — investor-side roadmap I mentioned"*
- Consulting: *"NPLA follow-up — methodology mapping for [Firm]"*

**Body skeleton:**

```
[Name],

Great connecting at NPLA. I owe you a follow-up on [specific thing they said].

[2-3 sentence specific recall: "You mentioned your team was running borrower
SOS lookups manually across 4 states for every deal — I thought I'd send
you a 6-minute Loom of how PulseClose handles that flow specifically. Link
below."]

[Loom or scheduling link.]

Want to put 30 minutes on the calendar next [week]? I have [Tue/Wed/Thu]
afternoons open. I'll set up a sandbox tenant with one of your real deals
in it before the call so we have something concrete to walk through.

Best,
Zach
```

**CTA discipline:**
- Lenders → "30-min sandbox demo with your data."
- Funds → "30-min walk-through of investor-side roadmap, pricing, A1 demo."
- Consulting → "60-min discovery call mapping framework against your flow."

**Cadence:**
- Day 1 (NPLA close + 24h): personalized email, all priority contacts.
- Day 7: bump-up to non-responders ("did you see my note from last week?").
- Day 14: third touch only if there was concrete interest in the original conversation. After that, ship to a long-tail nurture sequence (state-of-validation post drops + Wade Intel framework content).

### Scoring after 14 days

Score each contact 1-5:
- **5** — booked a call, shows up, agrees to sandbox or paid pilot.
- **4** — booked a call, valuable conversation, no commit yet.
- **3** — replied positively but didn't book.
- **2** — opened, no reply.
- **1** — never opened (verify with Resend / Mailtrack).

**Success criterion:** 5+ contacts at score 4 or 5 within 14 days. If we hit that, the conference earned its travel cost. If not, post-mortem: did we pick the wrong 12 priority intros, or was the demo wrong, or was the timing wrong?

---

## 7. NPLA Scottsdale (Oct 25-27) speaking pitch

Submit NOW (5 months out). Speaking > sponsoring; methodology talk > product pitch.

### Title

**"The 5-Concept Framework for Borrower Validation: A Methodology for Disciplined Underwriting in Private Lending."**

### Abstract (~200 words)

> Bridge lenders share a common pain: borrower validation is unstructured, inconsistent across credit committees, and dependent on whichever underwriter happens to be doing the deal. Some lenders pull SOS records; some don't. Some search PACER; most search nothing. GC validation outside California is a manual phone call. Litigation screening rarely includes state courts. Sanctions screening is checkbox compliance, not substantive review.
>
> This talk presents the 5-Concept Framework for Borrower Validation — Entity, Track Record, GC, Litigation, Sanctions/PEP — as a structured rubric every credit committee can apply. We walk through what each concept actually measures, the standard validation gaps lenders run into, the severity rubric for kicking back a deal, and the override-and-rerun pattern that lets credit committees apply judgment without abandoning the process.
>
> Drawing on production data from a year of validations run for a working bridge lender, we'll cover: which validation gaps surface most often, what those gaps cost when they go undetected, and a practical reference architecture for lenders who want to systematize their own validation flow without buying into a vendor lock-in.
>
> Audience: bridge lenders, credit committee chairs, fund LPs assessing borrower-level risk in their portfolios.

### Speaker bio (~75 words)

> Zach Wade is the founder of Wade Intel, a methodology firm focused on disciplined underwriting in private lending, and the creator of PulseClose, a borrower validation product used by Insignia Capital Corp to validate every deal entering their pipeline. He works with bridge lenders, fund-of-funds, and credit committees on framework design, validation tooling, and cross-pillar risk methodology.

### Three takeaways the audience leaves with

1. **A structured 5-concept rubric** they can hand to their underwriting team Monday morning.
2. **Concrete examples** of what each validation gap looks like — what it costs when missed, with anonymized real-world cases.
3. **A reference architecture** for systematizing validation in-house if they don't want to use a vendor.

### Submission strategy

- Submit through NPLA program committee web form. Get a confirmation receipt.
- CC Damon for any follow-up the committee wants. They may want a co-presenter from Insignia for the practitioner-credibility angle. **If they offer panel slot vs solo — take panel with Damon.** Higher conversion, lower risk.
- Backup pitch if first abstract is rejected: same content, retitled *"Borrower Validation Pitfalls: Five Stories From the Frontlines"* — narrative-first instead of framework-first.

---

## 8. Booth-staffing decision matrix (post-NPLA)

When do we book a booth at the next event? Hard rules. No "it'd be cool to be there" decisions.

| Event | Date | Book booth? Conditions |
|---|---|---|
| **NPLA Scottsdale** | Oct 25-27, 2026 | **Only if:** speaking slot accepted (Section 7) **AND** ≥10 paying customers **AND** Insignia explicitly co-sponsors. Otherwise attendee-mode again with Damon. |
| **AAPL Annual** | Nov 2026 | **Only if:** ≥15 paying customers **AND** AAPL audience overlap >50% with our ICP (verify with Damon). Default: skip. |
| **NPLA AC 2027** | June 2027 | **Default yes** — assuming we're at ≥20 paying customers and 1+ design-partner case study. Booth as the "we're an established player" signal. |
| **Other (IMN, Captivate, lender-specific)** | as scheduled | **Only if** a current paying customer is presenting a case study with us. Booth-by-invitation only. |

**The general rule:** booth conversion at this stage of company is ~1 paying customer per ~$15K-25K of booth spend. We should not book until our marginal paying customer is worth more than $25K LTV (i.e., post-Pro-tier or fund-tier rollout). Until then: walk-in, leave-behind, and follow-up flow beats sponsorship every time.

---

## 9. Operational risk register

What goes wrong on demo day. Mitigations referenced from pickup.md.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Cobalt rate-limited (429) during a live demo on conference wifi** | Medium | Demo stalls on entity card | Cobalt key rotation in place by ~6/10 (Week 3 task). Backstop: cached `liveData=false` pre-loaded for the validation in question. Adapter status surfaces "rate-limited" gracefully — narrate it: *"This is the rate-limit backoff path I built — entity data is still served from cache, deal continues."* |
| **AI memo timeout (>180s)** | Low | Memo blank or partial | Factor compute is independent of memo (deterministic). Show factors first, point out memo will regenerate via the toggle on the WhyThisRating panel. Per pickup.md cross-cutting principle 11: max_tokens 4096, stop_reason inspection. |
| **Vercel deploy failure during demo** | Low (but happened 2x in last session) | Last commit not live | Manual fallback: `vercel deploy --prod --yes`. Verify with `vercel ls pulseclose | head -3` shows recent Building / Ready row. **Run this Week 1 day-of.** |
| **Realie no-match on a borrower-supplied address** | Medium | "Address not found" mid-demo | Paste known-good Truong addresses (1310 Rosalia Ave, San Jose, CA 95128) as backup. Narrate the parser fix story (8a5a043) — the edge case is a known item (G2.4). |
| **OpenSanctions trial expired during demo** | Low (rotation is Week 5 task) | Sanctions card empty | Auto-falls-back to OFAC SDN direct (free). Adapter status surfaces fallback in `monitor_runs.adapter_results`. Sanctions card still renders. |
| **Conference wifi drops mid-demo** | Medium-high | Can't reach app.pulseclose.com | Tether (phone hotspot) ready in Week 1 pre-flight. Worst case: pull up a recorded Loom on iPad as the backup-of-the-backup. |
| **Borrower share-link Resend send failure** | Low | "Send to borrower" CTA toast errors | Resend may be paused — toast shows. Demo continuation: copy link manually, say *"in a real lender flow you'd hit send; for the demo I'll just paste the URL."* |
| **Claude returns truncated JSON** | Low (defended in code) | Doc-ingest extraction blank | Per principle 11: error message is *"Document too large — Claude truncated"* not generic parse error. Fall back to manual form fill. Tell the audience: *"The intake doc-ingest is convenience; the form takes 30 seconds either way."* |
| **Stripe webhook backfill fails post-demo** | Very low | New customer billing not synced | Internal plan (Test Co) bypasses Stripe entirely. Demo never touches a real card. Post-event Stripe issues are a follow-up engineering item, not a demo blocker. |
| **Damon unavailable mid-conference** | Low | Lose our intro engine | **Decision rule:** if Damon is out for >4 hours, we revert to attendee-mode passive networking. Do not over-extend in Damon's absence and burn our own credibility cold-pitching. |

---

## 10. Success metrics

Track from NPLA Day 1 morning to 14 days post-close. Weekly review at week 1 and week 2.

### Per-day targets (during the conference)

| Metric | Day 1 target | Day 2 target |
|---|---|---|
| Substantive conversations (>5 min) | 5-7 | 5-7 |
| Demos delivered (any version) | 3-4 | 3-4 |
| Business cards / contact info collected | 8-12 | 8-12 |
| Leave-behinds distributed | 15-20 | 15-20 |
| Specific commitments to follow-up call | 2-3 | 3-4 |

End-of-conference total: **8-12 lender intros, 3-5 design-partner-quality conversations.** That's the headline goal.

### Post-event scoring (14 days post-close)

| Metric | Target | What "win" looks like |
|---|---|---|
| Follow-up emails sent within 48h | 100% of priority contacts | All 8-12 names get a personalized email |
| Reply rate to follow-ups | ≥40% | 4-5 of the 12 reply substantively |
| Calls booked | ≥5 | 5 discovery calls on the calendar within 14 days |
| Sandbox tenants spun up | ≥2 | 2 prospects loading their own data |
| Design-partner-quality conversations | ≥2 | 2 conversations advance toward paid pilot or partnership |

### NPS-style score for the experience (debrief with Damon)

After the post-event debrief (Section 5), score:
- *"How likely are we to invest the same energy in NPLA Scottsdale (Oct)?"* — 1-10.
- *"How likely is Damon to recommend us to other GPs in his network unprompted post-event?"* — 1-10 (asked directly, candidly).

Score <7 on either: serious post-mortem on conference-as-channel. Score 8+ on both: this is a viable distribution lever; double down for Scottsdale.

### Quarterly tracking

Roll NPLA AC results into the quarterly review:
- **Customers acquired** within 90 days attributable to NPLA AC.
- **Damon-network referrals** received in the 90 days following.
- **Wade Intel consulting leads** generated from the conversations.

This is the input for the Section 8 booth-staffing decision matrix when Scottsdale and AC 2027 come up.

---

## Appendix: Reference paths

- **Demo runbook (full):** `/Users/zachwade/.claude/plans/ok-so-now-what-delightful-lark.md`
- **E2E test plan:** [docs/E2E-TEST-PLAN.md](./E2E-TEST-PLAN.md)
- **Pickup state:** `pickup.md`
- **Roadmap:** [docs/ROADMAP.md](./ROADMAP.md)
- **Truong intake xlsx:** `/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx`
- **Pre-event content destination:** Build Buy Borrow blog + LinkedIn + Wade Intel landing
- **Production URL:** https://app.pulseclose.com
- **Test Co org id:** `9e580f59-b01d-4cbd-a950-76dd4f32ee6c`
