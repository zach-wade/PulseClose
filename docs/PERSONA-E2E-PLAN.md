# Persona End-to-End Test Plan (real loans)

**Goal:** push a **real ICC loan per persona** through the *live* product and verify each
persona's flow against the redesigned UI — fixing rough edges as they surface. This is the
"test a new set of loans end to end as the different personas" pass.

> Distinguished from the seeded persona walk (`UX-REDESIGN-PLAN.md §9`, synthetic data) and
> the FL demo (synthetic borrower). Here we use **real Insignia loans** with **real data
> flowing through all five pillars**.

---

## The three personas + test orgs (prod)

| Persona | Login (pw `Test1234!`) | Org | The job | Stops at |
|---|---|---|---|---|
| **Underwriter** | `uw@test.pulseclose.com` | Test Bridge Capital (`27296b6b-87f2-4b71-9e84-2c71f652449c`) | verify → size → judge → hand off | full pipeline |
| **Spreadsheet Refugee / Solo** | `solo@test.pulseclose.com` | (1 validation, no investors) | just vet the borrower | ② Eligibility — never sees sizing |
| **Mandator / Fund** | `fund@test.pulseclose.com` | Keystone Capital Partners (`0aada23e-…`, org_type=fund) | set the standard, watch the roster | Mandate console |

Harness: `scripts/drive-persona.ts` (screens → `ux-review/<persona>/`), `create-test-user.ts`,
`seed-persona-data.ts`. New real-loan harnesses: `scripts/e2e-fl-loan.ts` (pipeline-direct
pattern), `scripts/analyze-icc-coverage.ts` (the Nexys export histogram).

---

## Getting real loans in

**Source:** the Nexys "Loan Report" CSV export (see the field list in conversation / the
analyze script). Header row 5; key columns: `Loan #`, `Borrower`, `Loan Overview - Entity Name`,
`State`, `Status`, `Contractor-Company`, `Contractor-License No`, and the (mostly blank)
`B1 - Layer 1 - State of Entity`.

**The coverage reality (drives which loans run free):**
- **Formation state is ~97% blank in Nexys** — capture it via **doc-ingest** (the Articles /
  Good Standing; the extractor now pulls formation state + exact name, `api/ingest/borrower-doc`),
  or fall back to property state + probe.
- **NY loans run free today** — live NY DOS adapter (`sos-free.ts lookupNyDosLive`) catches even
  Socrata leaks. Proven on Sharon Nachman / "L Y I LLC" (entity active, $0, no Cobalt).
- **CA loans (≈69% of the book)** need the **CALICO key** (pending) — then CA SOS + GC both free.
- **CO/FL** free (Socrata live / Sunbiz bulk). **Other states:** probe the state's live-search
  XHR for an open API (the NY pattern — `RESEARCH-SOS-50-STATE.md`), or rotate **Cobalt** as the
  universal stopgap.
- **Track record:** Realie is nationwide but returns 404 for non-property-owning entities; Regrid
  trial is geo-limited (403). Real property investors light it up better than the FL demo did.

**Run path:** either the live new-validation form (doc-ingest pre-fills) as the persona, or the
pipeline-direct script (`e2e-fl-loan.ts` pattern: `runValidationPipeline` with the org id).

---

## What to verify per persona

### Underwriter (full)
- New validation → **verdict hero** leads (verdict + 5-pillar quad + counterfactual + actions);
  entity/litigation/sanctions/GC resolve on real data; a 429/incomplete reads "Needs review".
- **Deal stepper:** money-tile header (max loan + binding constraint), constraint ladder with
  binding row highlighted + headroom, counterfactual; per-investor best-execution; AI judgment.
- **Handoff:** BLUF verdict block leads PDF + Excel; no raw `potential_match` (see UX-POLISH #1).
- **List + Portfolio:** verdict chip matches the hero; portfolio verdict-mix counts it.

### Spreadsheet Refugee / Solo
- Stops cleanly at **verify** — never forced through sizing inputs.
- **No-investor empty state** is a guided CTA, not the analyzer wall + a dev-script hint (§9 bug).
- The single next action is obvious; mobile header doesn't overflow.

### Mandator / Fund
- Lands on the **Mandate console** (not the originator onboarding flow).
- Per-mandate throughput (meets/conditional/fails) + the cross-originator **preview** (honestly
  labeled, gated on rep-and-warranty per memory).
- Mandate verdict chips align to the shared status tokens (UX-POLISH #5).

---

## Acceptance
- One real loan per persona run **end to end on live prod** with real pillar data.
- Each persona's flow matches the redesign; rough edges filed + fixed (feed into UX-POLISH-BACKLOG).
- The verdict on every surface (hero/list/portfolio/handoff) agrees — one `computeVerdict()`.
- Document each run's screenshots under `ux-review/<persona>/` + note any data gaps (which
  pillars resolved free vs needed Cobalt/CALICO).

## Open dependencies
- **CALICO key** (CA majority) — pending. **Cobalt rotation** — universal stopgap for non-free
  states. Per-state API probing (NY pattern) reduces Cobalt reliance over time.
