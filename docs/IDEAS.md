# Future feature ideas (unscoped)

Things we've talked about but haven't committed to. Not the prioritized
roadmap — that's `ROADMAP.md`. This is the "come back to this when..."
list. Each item should answer the question: *what user feedback or
business condition would unblock this?*

When something here gets prioritized, move it to `ROADMAP.md` with a
specific journey/stage assignment.

---

## Demo / NPLA pitch strengtheners

These specifically improve the story for capital-provider endorsement
and the conference demo. Pick from this list if NPLA is approaching
and there's slack capacity.

- **Pricing output, not just pass/fail.** Investor evaluator returns
  "passes Bridgeline at 11.25% / 2 pts / 75% LTV / $487k max" instead
  of just a green checkmark. Schema already has `rate_adjusters` and
  `leverage_matrix`; this is surfacing them at the deal level.
  *Unblocks when:* a lender asks "what rate would my investor quote?"
- **Mobile-optimized share link.** Native camera capture
  (`<input capture="environment">`), larger touch targets, iOS file
  picker tested. Lenders demo the share-link to borrowers on phones.
  *Unblocks when:* a borrower complains about the upload UX OR a
  lender asks "can I send this to a borrower's phone."
- **Counterfactual slider.** "What if FICO were 720?" — drag slider,
  watch tier rebuild live. Recompute machinery already exists; this
  is a UI layer. Demo gold; secondary underwriting use.
  *Unblocks when:* prepping a live demo where audience interaction
  matters.
- **Wade Intel branding on outputs.** Handoff PDF + share page surface
  "Validated using the Wade Intel 5-Concept Loan Framework" with a
  link to wadeintel.com / the open framework repo. The methodology
  IS the moat per STRATEGY.md; product currently hides it.
  *Unblocks when:* Wade Intel marketing site has the framework page
  in a stable URL we can deep-link to.
- **Slack `/pulseclose` slash command.** Beyond outbound webhooks —
  a true slash command. `/pulseclose check Truong` returns a card
  inline. Teams that live in Slack adopt 10× faster.
  *Unblocks when:* a target lender is a heavy Slack shop AND we have
  real production traffic to justify the OAuth setup.

---

## Multi-user / team workflow

Things the single-underwriter ICP doesn't need yet. First multi-user
lender that adopts will surface most of these.

- **Multi-underwriter workflow.** Underwriter A does the validation,
  Underwriter B signs off. "Approved by..." trail. Assignment.
  *Unblocks when:* first lender with >1 active user joins.
- **Comments / annotations on validations.** Per-validation comment
  thread alongside the existing `data_edits` audit log. Different
  semantics: edits change data, comments are just discussion.
  *Unblocks when:* multi-underwriter is in scope.
- **Underwriter QA / second-set-of-eyes flow.** Required-reviewer
  workflow on HIGH-risk validations.
  *Unblocks when:* a lender's compliance team asks for it.
- **Token-claim concurrency control on AI memo regen.** Today's
  `regenerateAiMemoForValidation` is last-write-wins. With Claude
  ~30s latency, that effectively means "last-started wins" for a
  single user. With multiple concurrent users editing the same
  validation, two simultaneous regens could race and the wrong one's
  output could win. Fix when it bites: stamp a unique token at start,
  write only if token still matches at end (replaces the inverted
  optimistic-lock removed in `c9d1836`-ish).
  *Unblocks when:* multi-underwriter editing surfaces a wrong-memo
  bug in the wild.
- **Cross-underwriter notes on borrowers.** Lender's running notes
  accumulate across validations of the same borrower. ("This guy is
  always late on payoff but always pays.") `borrower_signals` could
  carry these but UI surface needs designing.
  *Unblocks when:* a lender works the same borrower across many
  deals and asks "where do I keep notes."

---

## Property model consolidation

- **Phase 2: collapse `verified_flips` table into `track_record_entries`.**
  Phase 1 (shipped in `<commit>`) merged the two tables into one
  `UnifiedPropertyTable` UI component, but `verified_flips` and
  `track_record_entries` still exist as separate DB tables. Each
  unified row dispatches to whichever underlying table backs it.
  Phase 2 unifies the data layer:
  1. Add new source values to `track_record_entries.source`:
     `borrower_claimed_verified` (deed-matched) and
     `borrower_claimed_unmatched` (no deed match — yellow-flag rows).
  2. Migration: insert one `track_record_entries` row per existing
     `verified_flips` row (de-duping by `property_id` against
     existing entries — for matches, merge fields and drop the flip
     row; for non-matches, create a new track-record row with the
     `_unmatched` source).
  3. Refactor share-link verify endpoint
     ([src/app/api/share/[token]/verify/route.ts](../src/app/api/share/[token]/verify/route.ts))
     to write into `track_record_entries` instead of `verified_flips`.
  4. Drop `verified_flips` table.
  5. Remove the `mergeRows` function from
     [src/components/dashboard/unified-property-table.tsx](../src/components/dashboard/unified-property-table.tsx)
     and just read from one source.
  6. Once collapsed, `claimed_only` rows become editable through the
     existing `/api/track-record/[id]` PATCH path (Phase 1 disables
     edit on those because they have no underlying track-record id).
  *Unblocks when:* the unified Phase 1 UI proves the model works in
  practice (~1-2 weeks of usage). If users push back on the
  consolidation, Phase 2 stays deferred and Phase 1 can be reverted
  by swapping the page back to TrackRecordTable + VerifiedTrackRecord.
  *Migration risk:* moderate. The borrower-side share-link write path
  flows into `verified_flips` today; switching it to
  `track_record_entries` requires careful field mapping (especially
  match_status → source). The factor engine ([src/lib/risk/factors.ts](../src/lib/risk/factors.ts))
  reads from track_record_entries, so post-migration the engine sees
  borrower-claimed properties too — desired side-effect but should
  be validated against expected tier outcomes for known borrowers.

## Lender customization

Tunables that today are hard-coded.

- **Risk-factor weight customization per org.** "Treat
  `dismissed_litigation` as moderate not informational because we're
  conservative." Today the catalog + weights live in
  `src/lib/risk/factors.ts`.
  *Unblocks when:* second lender pushes back on a default tier.
- **Lender-customizable share-link branding.** White-label share
  page: logo + brand colors + "Validation requested by [Lender
  Name]." Today the share page is PulseClose-branded.
  *Unblocks when:* a lender asks (most do, eventually).
- **Time-series tier tracking visualization.** Show how the tier has
  changed over time as monitor cron updates the underlying data.
  *Unblocks when:* a borrower has accumulated >5 monitor runs and
  the data is interesting.

---

## Workflow / scale

Things that matter when usage grows beyond one-deal-at-a-time.

- **Batch import / bulk validation.** "Validate these 50 borrowers
  from a CSV overnight." Real workflow for portfolio reviews and
  lender takeovers.
  *Unblocks when:* a lender asks to validate a portfolio they're
  acquiring OR signs up with a backlog.
- **Saved searches / smart filters.** "Show me deals where tier
  changed in last 30 days AND outcome is unset." Today the
  validations list is a flat sort.
  *Unblocks when:* a user has >50 validations and complains about
  finding things.
- **Search across validations.** Unified search bar. Cross-validation
  + cross-borrower + cross-property name match.
  *Unblocks when:* same trigger as saved searches.
- **Batch handoff.** "Generate one packet for all 5 deals routed to
  Investor X this week."
  *Unblocks when:* a lender routes >3 deals to the same investor in
  a week.
- **Outbound webhooks for LOS integration.** True public webhook
  subscription system (vs. the per-user notification webhooks today).
  Lender's LOS subscribes to `validation.completed`, pulls into their
  pipeline.
  *Unblocks when:* a lender names their LOS and asks to integrate.

---

## Borrower-facing improvements

The share-link is the borrower's only touchpoint today.

- **Borrower-side document checklist.** When a lender requests a
  validation, the borrower lands on the share page and sees "you
  need to upload: bank statement, photos of properties X/Y/Z, etc."
  Guided onboarding instead of free-form.
  *Unblocks when:* a borrower abandons the share-link mid-flow OR a
  lender asks for it.
- **Borrower-facing dashboard.** Borrower logs in (vs. just share
  link) and sees their full history with multiple lenders, their
  public profile, can publish/unpublish. Schema (`investor_users`)
  already has the auth pattern that could be adapted for borrowers.
  *Unblocks when:* the public profile (E4 full) gets renderer UI AND
  enough borrowers are repeat-using share links to want a home base.
- **Public-profile QR code.** Borrower hands out a QR at networking
  events that links to their `borrower_public_profile`.
  *Unblocks when:* a borrower asks for it (low likelihood but cheap).

---

## Distribution / growth

Outside the product surface but adjacent.

- **Pricing calculator embed.** Embeddable widget brokers can put on
  their marketing site for pre-qualification.
  *Unblocks when:* Wade Intel or PulseClose has a content/SEO play
  that needs interactive surfaces.
- **AI-generated investor outreach email.** "Email Bridgeline with
  this deal summary." Pre-fills using the validation memo.
  *Unblocks when:* a lender asks "can you draft this for me."
- **Audit / compliance export.** "Export every action taken on
  validations in Q2 for our regulator." Beyond the per-validation
  audit log.
  *Unblocks when:* a regulated lender asks (most do, eventually).

---

## Process notes

- This file grows. Keep entries terse — one paragraph max.
- "Unblocks when" is the most important field. If you can't write
  one, the idea isn't ready to be captured here either; have the
  conversation first, then write down the *condition*.
- Promote items to `ROADMAP.md` when the unblock condition fires
  AND there's actual buildable scope.
- Delete items that turn out to be wrong assumptions.
