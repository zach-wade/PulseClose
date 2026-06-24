# PulseClose — Depth & Value Direction (2026-06-24)

> Written in response to a sharp internal critique: *"it doesn't jump out as super
> good UX, I don't understand what Damon sees in terms of value, and it seems
> pretty weak vs the complicated Excel models I've seen them use — this is still
> shallow."* That critique is correct. This doc grounds the fix in evidence we
> already had — Damon's own words from the consulting transcripts/interviews and
> the actual Insignia Excel models — rather than in assumption. Public-tools deep
> research (run wf_54354a0e) refines §4 and §6 when it lands.

## 0. Why it looked shallow (the honest diagnosis)

The rebuild so far (Deal stepper, detail tabs, job-shaped IA, webhooks) is
**coherence work** — it cleaned the surface. But the *center of gravity* was a
single-period constraint-min sizer (max loan = MIN across LTV/LTC/LTARV/DSCR/
debt-yield), and that is **shallower than the spreadsheet it sits next to**.
Polishing UX around a shallow engine reads as a toy to people who live in Excel.

The decisive datum, from Insignia's own pricing process
([icc-deal-review-pricing-interview-notes.md]): **"none of the MFR constraints
really bind. They model how many years of permissible rent increase get them to
1.20–1.25x [DSCR]."** Our engine *is* the constraint-binder. On their core deals,
the part we treat as "the story" is the part they say drives nothing — the real
judgment is the **stabilization/exit path**, which we don't model. So we land in
the uncanny valley: looks like an underwriting tool, thinner than their Excel.

**Crucial reframe from the public-tools research (wf_54354a0e, 23 sources, 22/25
claims verified): we are NOT behind the product market — we're at parity.** The
closest productized competitors, **Blooma and RealINSIGHT, use the *same*
single-period constraint-min sizer we do** (Blooma's documented engine is
literally max-loan = MIN across max-LTV / min-DSCR / max-debt-yield). The only
tools doing true multi-period DCF (rent-roll lease-up, levered IRR, sensitivity)
are **ARGUS Enterprise and Backshop/CMBS.com** — decades-mature institutional
Excel-replacements that are off-brand to chase. So the perceived shallowness is
relative to **Excel power-users (which Damon/Noah are)**, not to the competitive
set. Two implications: (1) don't panic-build depth to "catch up" — there's
nothing to catch up to in the product market; (2) the fix is to add the few
surgical depth pieces *where their judgment actually lives* (exit, path, buy-box)
**and** present with the UX patterns that read as "real" (§5) — not to rebuild
their spreadsheet.

## 1. What Damon actually told us to build (his words)

- **Proprietary IP the capital providers fund — not $1k/mo SaaS-to-everyone.**
  *"Why give it to every Tom Dick and Harry for a 1000 bucks a month… why not
  build something so good that you get the big boys saying, hey, we need this…
  we'll give you unlimited amount of money to go find the loans, because whatever
  you've built is better than anybody else."* This is the distribution thesis in
  his voice: capital-provider endorsement, not broad self-serve.
- **The two standalone-saleable subproducts he names himself:** *"the 3rd party
  report tracking, perhaps, or the track record… as separate specific products."*
- **The "overarching wrapper/platform" = "significant technical challenges."** He
  is skeptical of the grand unified platform; believes in sharp subproducts.
- **Noah's #1 ask, unprompted, twice:** a deal dashboard — *"put in the data, it
  slots where they fit in, calculates spread and terms, and then a human reviews
  it."* ("Slot where they fit" = investor best-execution. This is Module 1.)
- **CRE is the bigger, more fragmented opening:** *"there is no commercial LOS…
  a lot of guys still on Excel."* Plus a no-LOS posture (don't bet on one fragile
  vendor — *"Kirk could disappear to Russia tomorrow"*).

## 2. The non-negotiable trust rules (also his words)

These are preconditions for him deploying anything across his company, not
preferences:

- **AI narrates, the deterministic engine decides, a human reviews.** Every
  AI-autonomy moment in the corpus is met with Damon recoiling (*"I would not let
  the sink loose… not a security thing I'd let throughout my company"*; the
  *"plaintiff's exhibit"* litigation fear). Our existing rule (AI never sets the
  loan/tier) is exactly right — keep it load-bearing.
- **Drill-down to source, never a black box.** *"We cannot have black boxes where
  the only person who knows what's in the file is the person who submitted it."*
  Noah killed our auto-risk score: *"I'd rather have data to review without it
  given into characterization… without understanding what's going INTO the score,
  can't trust the OUTPUT."* The standout feature in a sibling tool was an inline
  downloadable **source deed/mortgage PDF on the property view** — *"THIS IS THE
  STANDOUT FEATURE."*
- **A single false positive destroys trust instantly.** Noah's reaction to a
  track-record report listing properties that weren't the borrower's was to demand
  cross-validation against every real ICC loan. Precision > coverage.
- **"Our folks are really visual."** Validate on a real loan against a baseline
  ("we ran a test loan and compared to OMAR"), not "it should work." **Volume
  repels** — *"I didn't even read it, I got nervous"* (45-page spec). One-pagers +
  live walkthroughs win.
- **Path of least resistance.** *"The less you have to ask the borrower for, the
  better."* Ingest the Excel/Word/CSV/PDF they already use; don't make borrowers
  fill forms. Don't replicate the entity-ownership graph (Elementix). Don't be the
  LOS (Nexys already does docs/HMDA/conditions/closing — those are shelfware
  adoption problems, not our features).

## 3. The depth decision — feed their Excel, don't replace it

**Do NOT chase Excel parity.** Their models do a 10-yr monthly pro-forma (rent
roll → lease-up absorption → per-year NOI growth → terminal valuation), a
month-by-month construction draw + capitalized-interest ledger, and levered IRR/
equity-multiple. Rebuilding that is the expensive, undifferentiated, Damon-
skeptical path — and it makes us the borrower's modeling tool, not the lender's
verification + routing gateway. Full pro-forma, lease-up engine, line-item OpEx,
and the draw ledger **stay in Excel.**

**DO add the 3–4 surgical, on-brand depth pieces that change the answer and match
where their real judgment lives:**

1. **Exit / takeout sizing (highest leverage, low effort).** Size the bridge AND
   the permanent-loan takeout at stabilization (terminal NOI ÷ terminal cap → max
   takeout vs. the bridge balance-at-exit; flag "longer term required" if maturity
   < refi date). This is *the* bridge credit question — "can the takeout repay
   us?" — and it reuses the same constraint-min engine on stabilized numbers.
   Their MFR + Rehab Deck models both center on it; ours ignores it.
2. **Stabilization-path coverage ("years to 1.20–1.25x").** Because none of the
   static constraints bind, model the **path**: a 3–5-yr projection showing per-
   year DSCR/debt-yield trend under a rent-growth assumption, and "N years to
   clear coverage." Not a 120-month model — a credible trend line that mirrors how
   Noah actually thinks. Surfaces the binding *temporal* constraint, not a slack
   static one.
3. **Buy-box pricing-grid fidelity.** We already hold the real PDFs (Colchis RTL
   Purchase Guidelines, Oakhurst Loan Eligibility). Encode the **FICO × experience
   × product leverage grid**, the **ZHVI high-value haircut** (>200% ZHVI = −5%,
   >300% = −10%), and the **rate grid + bps add-ons** (+50bps for >85% LTC / cash-
   out / FICO <700). This turns "slot where they fit" from approximate into
   credible best-execution with a real priced rate + spread-to-cost-of-funds.
4. **Interest-reserve sizing** (worthy third/fourth — it *changes the loan
   amount*; investor-dependent cost-basis treatment).

Net: the engine stays deterministic and decision-support, but it now answers the
**exit story**, the **temporal coverage path**, and **investor-accurate pricing**
— the three places Insignia's judgment actually lives.

## 4. The differentiated wedge (what Excel/competitors can't do)

Pour the rest of the effort into the layer no spreadsheet does, validated by both
Damon's words and the competitive research (mandate verdict = empty space):

- **Cross-investor best-execution** ("slot where they fit") across the real buy-
  boxes — Noah's #1 ask.
- **Automated verification pillars** (entity/SOS, deed-chain track record,
  litigation, sanctions, GC) — the manual-today inputs Noah does first on every
  deal; track-record is a Damon-named saleable subproduct.
- **Mandate / rep-and-warranty verdict + portable handoff.** Originators carry
  R&W exposure to Colchis/Oakhurst on *delivered* loans (an incorrect calc is a
  flag/repurchase risk — see [post-funding-audit-decision]). A verified, audit-
  trailed "✓ meets [fund]'s purchase guidelines" packet is what protects the
  originator at delivery — and is the wedge that makes a capital provider endorse
  us to its lender stable. *(Load-bearing open question, still: will a fund grant
  actual R&W relief on our verdict? Damon question.)*
- **3rd-party report tracking** (the non-appraisal reports still email-only) —
  the other Damon-named subproduct.

### 4.1 What the research confirmed about the wedge

All whitespace claims are absence-of-advertising on public/vendor pages (not
proof of non-existence in sales-gated tiers), but across 13+ tools researched:

- **Cross-investor best-execution *pricing* is solved/branded only in residential**
  (Optimal Blue PPE/BESTX vs 150+ investors; MCT bid-tape). In CRE/bridge it
  exists only as **deal-distribution that doesn't price or size** (Janover Pro,
  LendingWise route a deal to many lenders and track responses). Our per-investor
  best-execution overlay is **genuine whitespace.**
- **Exit/permanent-takeout sizing** — *no researched tool* surfaces it. Whitespace.
- **Sponsor track-record verification** — competitors (Blooma) treat track record
  as a *scoring weight off self-reported docs*; **none verify against deeds/sale
  history.** Our deed-chain matcher is a **genuine differentiator, not table-
  stakes** (this is bigger than we framed it).
- **Rep-and-warranty / loan-sale delivery QC** for CRE/bridge — absent; exists
  only in residential secondary-market overlays. Our mandate object is open space.
- **No single competitor bundles** verification + best-execution + mandate verdict
  + portable handoff. The bundle is the moat, not any one feature.

*Open (customer-validation, only Damon can answer):* is constraint-min + exit
verdict + best-execution "enough depth" for him to trust it, or does he expect a
multi-period draw/reserve cash flow first? This is why the test-data + walkthrough
+ showing-Damon step (§6.1) comes before more depth.

## 5. Look & feel (the credibility spine)

Grounded in what they already trust and what flopped:

- **Drill-down to the source document on every claim/number/factor** — the
  property row opens the deed/mortgage PDF; every eligibility cell opens the buy-
  box clause; every sized number opens its basis. This is the "standout feature"
  and the antidote to "black box."
- **Side-by-side scenarios + human chooses the driving assumption** — the research's
  clearest "reads as a real tool" pattern: Blooma ships up to 4 pricing options +
  unlimited underwriting scenarios with line-by-line comparison and lets the user
  *choose which valuation drives LTV/DSCR/debt-yield*; ARGUS compares up to 5
  side-by-side. The tell of a toy is a single black-box number; the tell of a tool
  is comparable scenarios where the human controls the driving input. Our stepper
  should surface scenario comparison (base vs. exit vs. per-investor) and let the
  lender pick the governing valuation/exit.
- **Stage-pipeline views with completion %** (their appraisal dashboard idiom;
  conditions with cleared-by + date + drag-drop evidence).
- **One-pager outputs** as the decision artifact; **Excel as the working/handoff
  medium** they trust; deterministic numbers + a human-review step.
- **Speak their exact language:** "slot where they fit," "the tape," "needs list,"
  "spread / prices off a grid / 100bps over cost of funds," "as-is / ARV,"
  "permissible rent increase to 1.20–1.25x," "does the exit make sense,"
  "high-tech with high-touch," PTD/PTF/trailing.

## 6. Reshaped build plan

**Prove value before more polish:**

1. **Damon-shaped test data + a guided walkthrough** (do first) — seed a realistic
   Insignia-style deal set (real-looking MFR value-add + SFR fix/flip, the
   Colchis/Oakhurst buy-boxes encoded, a sponsor with a verifiable track record)
   and a script that walks the exact Noah flow: phone-call intake → track-record
   "who" → evaluate "slot where they fit" → exit/takeout story → mandate verdict →
   one-pager handoff. So we can *see* whether it lands and demo it.
2. **Depth additions** in priority order: exit/takeout sizing → buy-box grid
   fidelity (FICO×exp + ZHVI haircut + rate bps) → stabilization-path coverage →
   interest-reserve sizing. Each deterministic, drill-down-able, human-reviewed.
3. **Wedge hardening:** best-execution accuracy, the mandate/R&W verdict + portable
   packet, track-record precision (zero false positives), 3rd-party report
   tracking.
4. **Stress-test** every screen against this doc's rules (drill-down present? AI
   narrating not deciding? speaks their language? would Noah trust it on the
   phone? does it beat their Excel on the exit/slot questions or just restate
   what Nexys already shows?).

**Explicitly NOT building:** full pro-forma/lease-up/draw-ledger (Excel's job),
an LOS/doc-gen layer (Nexys), the entity-ownership graph (Elementix), borrower-
fills-a-form intake, autonomous AI decisioning, broad self-serve as the primary
GTM.

## Open questions / flags
- **Will a fund grant real R&W relief on a PulseClose verdict?** Unconfirmed; the
  wedge's load-bearing premise. Damon question — settle before betting Phase 2 on
  it.
- **5-concept framework in the product:** `judgment.ts` imports the consulting
  5-concept lens, but the consulting memory marks that framework "not a PulseClose
  product." Reconcile — keep it as an internal judgment scaffold, not a surfaced
  feature.
- **Mandalay/Ellington** have no captured buy-box; only Colchis + Oakhurst are
  encodable today.
- Public-tools deep research (wf_54354a0e) will refine the depth floor (§3), the
  best-execution/exit-sizing whitespace claim (§4), and concrete UX patterns (§5).
