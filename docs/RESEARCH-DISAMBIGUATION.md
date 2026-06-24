# Screening disambiguation — research findings + build plan

> Deep-research run 2026-06-24 (101 agents, 19 sources, 82 claims → 24
> adversarially verified, 1 refuted). Synthesis step dropped on a connection
> error; the verified claims below are the substance. Each is a 3-0 or 2-1
> verify vote against a primary/secondary source. This grounds the next builds
> on the disambiguation layer (see [CALIBRATION-FINDINGS.md](CALIBRATION-FINDINGS.md)).

## The headline: OFAC's own FAQ #5 validates our design — and names the next build

OFAC FAQ #5 / topic 1591 (treasury.gov, primary) prescribes a 5-step workflow
for evaluating a possible hit. It maps 1:1 onto what we built and what's next:

1. **Step 1 — is the hit against a *sanctions* list, or "some other reason"
   (PEP, Control List, other)?** Only sanctions-list/targeted-country hits
   proceed. → **This is the official basis for separating our noise.** Our
   calibration run surfaced SAM debarment, NY medical exclusions, FINRA actions,
   and UK disqualified-directors — none are OFAC sanctions. **Build #1: classify
   matches by list type; only true sanctions/PEP hits drive risk.**
2. **Step 3 — if only one of two+ names matches (e.g., just the last name),
   "you do not have a valid match."** → validates capping name-only matches at
   "possible — review."
3. **Compare the complete list entry against ALL identifiers you hold** — full
   name, address, nationality, passport, tax ID/cedula, place of birth, DOB,
   former names, aliases. → validates surfacing the entry's identifiers (shipped)
   and tells us the identifier set to match on.
4. **"Are you missing a lot of this information? If yes, go back and get more
   information and then compare."** → the compliant response to an
   under-identified hit is to **collect a second identifier**, not clear/block on
   name alone. Validates "possible — review" + the 1003/doc-ingest path.
5. **Step 5 — escalate only if "a number of similarities or exact matches."**

**FFIEC BSA/AML manual (primary):** a bank's OFAC program "must define how it
determines whether an initial hit is a valid match or a false hit," and "a high
volume of false hits may indicate a need to review the … program." → an explicit
match-adjudication workflow + audit trail is the regulatory expectation, not
name-only acceptance.

## Verified findings by question

### 1. Sanctions FP reduction + which identifiers to match
- **OFAC SDN entries publish secondary identifiers**: full name, address,
  nationality, passport, tax ID/cedula, place of birth, DOB, former names,
  aliases (ofac.treasury.gov/faqs/5, 3-0). The SDN list "attempts to provide
  name derivations; however … may not include all" (FFIEC, 3-0) — so match on
  aliases, not just primary name.
- **OpenSanctions threshold**: default **0.7**; "for … low tolerance for false
  positives, this could be raised to **0.8 or even 0.85**" (opensanctions.org/
  docs/api/tuning, 3-0).
- **OpenSanctions penalizes divergent secondary identifiers** — "countries, DOB,
  gender, and address … divergent between the query and the matching candidate"
  lower the score; the **name-qualified** variant "penaliz[es] scores where the
  birth date or nationality is different for people, or where different
  registration numbers/tax identifiers are used for companies" (3-0). → **passing
  the borrower's known country/DOB into the query makes the API down-score
  mismatches server-side.**
- Industry fuzzy-match practice: Jaro-Winkler thresholds **0.80–0.90, 0.85
  common** for individual names (flagright, blog).
- LexisNexis Bridger Insight XG claims **60–80% FP reduction** via entity
  resolution + intelligent-match modules vs name-only (lexisnexis, 2-1).

### 2. Court-record disambiguation (CourtListener/PACER)
- **CourtListener REST v4 exposes dedicated `/api/rest/v4/parties/` and
  `/api/rest/v4/attorneys/` endpoints, SEPARATE from docket search**, filterable
  by docket ID (wiki.free.law, 3-0; courtlistener.com/help/api/rest/v4/recap,
  3-0).
- **Party objects carry**: `name`, `party_types` (role — plaintiff / defendant /
  trustee / debtor), nested `attorneys` array, `date_terminated`, `extra_info`
  (supplementary party details) (3-0). → we can **confirm the borrower is an
  actual named party (not just caption text) and get their role**, instead of
  caption-only matching.
- **PACER (direct) supports searching by SSN / EIN** in addition to name
  (pacer.uscourts.gov, 3-0) — a true secondary identifier for debtor
  disambiguation, but PACER-direct (paid), not CourtListener.

### 3. Identity-corroboration data sources (lending)
- **12 CFR 1022.123** defines the canonical "consumer file match" identifier
  set: **full name (first, MI, last, suffix), other/previous names, current/
  recent full address, full 9-digit SSN and/or DOB** (consumerfinance.gov,
  primary). → this is exactly the 1003 set; the cheapest corroboration is the
  borrower's own consented application.
- **LexisNexis Risk Solutions** (CFPB-listed CRA, FCRA-governed): real-estate
  ownership, liens/judgments/bankruptcy, professional licenses, historical
  addresses (consumerfinance.gov, 3-0) — strong corroboration fields, but **FCRA
  permissible purpose required** (consumer consent via the loan app).
- **Socure eCBSV**: verifies a consumer-provided name-DOB-SSN against the SSA
  (socure, primary) — definitive secondary-identifier confirmation.
- **Sayari**: resolves beneficial-ownership chains across 250+ jurisdictions from
  primary registry data, "verifying or contradicting customer-provided ownership"
  (sayari, blog) — fits LLC-titled borrower / UBO graph matching.
- **FCRA**: a CRA "may provide information about you only to people with a valid
  need" (consumerfinance, primary) — permissible-purpose gate. GLBA/Reg P governs
  non-affiliate sharing; FCRA/Reg V governs affiliate sharing (ABA, secondary).

### 4. Compliant workflow for an unconfirmed hit
- Don't clear or block on name alone; **collect more identifiers, then compare**
  (OFAC, 3-0). Escalate only on multiple identifier matches (OFAC Step 5).
- Maintain an **explicit adjudication workflow + audit trail**; high false-hit
  volume signals a screening-config problem (FFIEC, 3-0).
- **Refuted (1-2):** the claim that a partial/last-name-only match should be
  *cleared without escalation* did NOT survive — the correct posture is
  "review," not auto-clear. Matches our "possible — review" (never auto-clear,
  never auto-block).

## Build plan — STATUS (all shipped 2026-06-24)

- ✅ **#1 List-type classification** — `sanction | pep | exclusion | other`; only
  sanction/pep drive risk. Live: every match in the 6-loan set was an exclusion.
- ✅ **#2 OpenSanctions query identifiers** — borrower country (+DOB) passed into
  the `/match` query so the API down-scores divergent-nationality/DOB candidates.
- ✅ **#3 Litigation caption precision** — the `/parties/` endpoint proved empty
  for search-index bankruptcy dockets (0/8) and the fetch storm tripped rate
  limits, so instead fixed the core matcher with first-name-position awareness.
  Live: Mark Morrison litigation 20 possible → **1 possible + 19 unlikely**.
- ✅ **#4 Capture borrower DOB at intake** — optional 1003 DOB field; transient
  (not persisted, never to AI); feeds the OpenSanctions query + the
  disambiguation subject (DOB match → confirmed; divergent → cleared).
- ✅ **#5 Adjudication audit trail** — satisfied by the EXISTING override-and-rerun
  mechanism (`factor_overrides`: actor + timestamp + reason, renders on the
  handoff PDF). The `sanctions_review`/`litigation_review` factors flow through
  it; the override UI now uses OFAC-FAQ-#5 adjudication framing (name the
  identifier that cleared/confirmed the match). No parallel table — leveraging
  the audit trail we already have.

### Original plan detail

1. **List-type classification (OFAC Step 1).** Classify each OpenSanctions
   match into `sanction | pep | exclusion | other` from its `topics` + dataset.
   Only `sanction`/`pep` feed the sanctions risk factor; `exclusion`/`other`
   (SAM, FINRA, medical, disqualified-directors) render in a separate
   "regulatory exclusions — informational" section and never fire a critical
   factor. *Fully specified, unblocked — build now.*
2. **🟠 Pass borrower identifiers into the OpenSanctions query** (country from
   known_states, DOB once captured) and/or switch to the `name-qualified`
   algorithm so the API down-scores divergent-DOB/nationality candidates
   server-side. Raise the *exclusion* display threshold toward 0.85.
3. **🟠 CourtListener `/parties/` enrichment.** After a docket search hit, pull
   `/api/rest/v4/parties/?docket=<id>` to confirm the borrower is a named party
   and capture `party_types` (role). Promotes "name appears in caption" →
   "named <role> party," and lets us drop dockets where the borrower isn't a
   party at all.
4. **🟡 Capture the 1003 identifier set at intake** (full name+suffix, prior
   names, current/recent address, DOB; SSN last-4 if collected) → feed
   `SubjectIdentity` so a DOB/address match can finally promote a hit to
   "confirmed." This is the doc-ingest / intake thread.
5. **🟡 Adjudication audit trail (FFIEC).** Record who cleared/confirmed a
   possible match, when, and why — supports the compliance posture and the
   "high false-hit volume" review signal.

**Deferred data-source pulls (when each becomes the bottleneck):** LexisNexis
Risk (FCRA-gated, consented) for DOB/address/lien corroboration; Socure eCBSV for
name-DOB-SSN; Sayari for UBO graph on LLC borrowers; PACER-direct for SSN/EIN
debtor search.
