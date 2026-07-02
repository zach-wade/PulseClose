# PulseClose — Data Governance (ICC / third-party confidential data)

**Persistent policy — do not let this live only in `pickup.md` (which is refreshed each session).**
Created 2026-07-01 after mining ICC's operational data. Governs how we handle ICC/Insignia
confidential material and any third-party lender data received under NDA.

## Why this exists
As the ICC design-partner engagement deepened, we received large volumes of ICC-confidential
data — underwriting models, but also borrower PII, company financials, employee data, and a
security-incident evidence folder. The product-relevant models are enormously useful; most of
the rest is off-limits. This doc is the standing rule so the boundary is never re-litigated
ad hoc.

## The ICC data sources (as of 2026-07-01)
- **`~/Downloads/Private Folder.zip`** — the full ICC operational Box, **72GB / 94,751 files**.
  Mined 2026-07-01 (c) for underwriting models + process/pricing docs only.
- **`~/Downloads/Insignia Capital Corp.zip`** — ~1.48GB / 1,410 files. Contains the **Lender
  Grid** (~35 lender rate sheets/guidelines — product-relevant, non-PII), **`ICC Funding I, LLC`**
  (ICC's own capital-stack financials — confidential), **Deal Spotlight** (4 packaged deals —
  property side usable, borrower side PII), and **Consumer Bridge** draft artifacts.
- **`~/Downloads/Lenders.zip`** — 10 investor seller guides (the "A1 set" — product-relevant).
- **`_ICC Workflow Management.zip`** — conditions library + HMDA field universes (process docs).
- The decoded, product-relevant models live in the **consulting repo** at
  `clients/insignia-capital/data/loan-sizer-trove-2026-07/` — never in the PulseClose app repo.

## ✅ IN — what we may use
Underwriting **models** (structure/formulas), **blank forms/templates**, **process/workflow
docs**, **lender rate sheets + program guidelines** (the Lender Grid), **marketing/pricing
artifacts**, and **de-identified deal economics** (property proforma, construction budget,
cap rates). These inform the engine, the fixtures, Module 1 / A1 best-execution, and COND-1.

## ⛔ OUT — off-limits, never ingest / extract / quote / reproduce
- **Borrower PII** — 1003 loan applications, credit reports, personal financial statements,
  K-1s, tax returns, SSN/DOB. (Inventory by category only; never open contents.)
- **Employee data** — withholding certs, payroll.
- **Company financials** — ICC/Insignia P&L, balance sheet, `ICC Funding I, LLC` warehouse-line
  reporting (Borrowing Base / Covenant Compliance certificates). *Structure may inform CAP-1
  facility-aware sizing; the actual figures stay out.*
- **Accounting files** — QuickBooks (`.qbb`), `.dbf/.fpt/.cdx`.
- **Security-incident evidence** — the "Cyber Attack File / Captured Server Data" folder
  (IR collections, `.evtx` event logs, firewall configs, `clients.xls`). **Absolutely off-limits.**

## The rules
1. **Synthesize, don't persist.** Findings are captured as *synthesis* in our docs
   ([CALIBRATION-FINDINGS.md](CALIBRATION-FINDINGS.md), ROADMAP, STRATEGY) — **raw ICC files are
   never committed to the PulseClose app repo.** Decoded models live in the consulting repo only.
2. **Never ingest the Box wholesale** into any repo, product path, or AI pipeline. Extract only
   the specific non-PII model/process files needed, then delete temp copies from scratchpad.
3. **PII never reaches an AI prompt** except through the AI privacy bundle (ROADMAP cross-cutting
   principle 12 — gate + scrub + depersonalize). This is the product-side enforcement of the
   same principle.
4. **Parameterize, don't hardcode** a customer's model or numbers into product code (principle
   14) — a second reason ICC's specifics stay as per-org config/fixtures, not app constants.
5. **Be deliberate about retention** — 72GB+ of NDA'd third-party data should not linger
   indefinitely on local disk once mined. Keep only what an active build needs.

## Cross-references
- Session state + latest mine status: [pickup.md](../pickup.md) §Trove decoded / §Data-governance.
- AI-side PII handling: [PRIVACY-POSTURE.md](PRIVACY-POSTURE.md) + ROADMAP principle 12.
- Model findings: [CALIBRATION-FINDINGS.md](CALIBRATION-FINDINGS.md) #24–#33.
