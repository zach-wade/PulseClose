# Privacy Posture

What data PulseClose holds, how it's protected, and the answers we'd give
a bridge fund's compliance team if they asked. This doc makes the AI
privacy bundle (commit `a277c23`, shipped 2026-05-03) legible to non-
engineers.

Cross-references `docs/VENDOR-LEDGER.md` (sub-processor list — which
vendors actually see what), `docs/DATA-MODEL.md` (full schema), and
`pickup.md` Open decisions #1 (Insignia AI policy pending Damon).

Last reviewed: 2026-05-04. Owner: Zach Wade. Audience: Insignia compliance,
future B2B prospects, internal reference.

---

## §1 — Data inventory by table

PII level: **none** (no person-identifying data) / **low** (entity-only
or denormalized counts) / **medium** (names, addresses, business identi-
fiers) / **high** (SSN, DOB, financial account numbers — note: we do not
ingest these by design; documents may CONTAIN them but they're never
extracted to columns).

Retention: per-table default. Documents have per-row `expires_at`.

Read scope: RLS policy enforced at the DB layer. Most tables scope to
`org_id = (select org_id from public.users where id = auth.uid())`.
Service role bypasses RLS — used only in admin/cron paths.

| Table | PII level | What's stored | Retention | Read scope |
|---|---|---|---|---|
| `organizations` | low | Org name, plan, `ai_extraction_enabled` toggle | Indefinite | Own org |
| `users` | medium | Email, full_name, org_id (Supabase Auth) | Until account deletion | Self + own org |
| `borrowers` | medium | full_name, `normalized_canonical` | Indefinite | Own org |
| `entities` | medium | legal_name, dba, EIN-last-4 (if collected), `normalized_canonical` | Indefinite | Own org |
| `properties` | medium | address_full, address_normalized, parcel_id | Indefinite | Own org |
| `lenders` | low | lender_name, FDIC cert (if global), `normalized_canonical` | Indefinite | Global (FDIC) OR own org |
| `borrower_validations` | medium | borrower_id, entity_id, primary_property_id, status | Indefinite (until manual delete) | Own org |
| `entity_checks` | medium | sos_status, registered_agent, formation_date, `raw_response` JSONB (Cobalt) | Indefinite | Own org |
| `track_record_entries` | medium | property_address, dates, prices, source | Indefinite | Own org |
| `verified_flips` | medium | claimed_address, owner_match_result, `raw_response` (Realie) | Indefinite | Own org |
| `litigation_checks` | medium | borrower_name / entity_name searched, result | Indefinite | Own org |
| `litigation_cases` | medium | Case caption, parties, court, docket — federal only (CourtListener) | Indefinite | Own org |
| `gc_validations` | medium | gc_name, license_number, status | Indefinite | Own org |
| `sanctions_checks` | medium | query_name(s), match results | Indefinite | Own org |
| `risk_factors` | low | factor_key, value, severity, expires_at | `expires_at` per row (recomputed on rerun) | Own org |
| `ai_analysis` (column on `borrower_validations`) | medium | Story Mode JSONB (unredacted post-process — see §2) | Tied to validation row | Own org |
| `documents` | high* | storage_path, mime_type, purpose, `expires_at` | **Per-row default** (see §5) | Own org (RLS) |
| `monitor_subscriptions` | low | borrower_id / validation_id, critical_only, frequency | Indefinite | Own org |
| `monitor_runs` | low | adapter_results, email_status | Indefinite | Own org |
| `notification_preferences` | low | email/slack/etc. target, event_type, enabled | Indefinite | Self + own org |
| `activity_events` | medium | verb, subject_type, subject_id, metadata (no raw PII; references) | Append-only (no UPDATE/DELETE policy) | Own org |
| `audit_log` | medium | Compliance audit trail (auth events, IP, mutations) | Append-only | Own org (UI); admin (DB) |
| `deal_outcomes` | medium | validation_id, status (funded/withdrawn/etc.), outcome_data JSONB | Indefinite | Own org |
| `investor_criteria_extractions` (A1) | low | source PDF id, extracted criteria rows, token counts | Indefinite | Own org |
| `investors`, `investor_criteria` | low | Investor configs (categorical criteria, not borrower data) | Indefinite | Own org |
| `zhvi_zips` | none | Zillow ZHVI medians by zip | Refreshed monthly | Public (no RLS — reference data) |
| `usage_metering` | low | org_id, check_type, cost, timestamp | Indefinite | Own org |

*`documents` is "high*" because the file CONTENTS may include SSN / DOB /
financial account numbers (e.g., bank statements). The column data is
metadata only; the contents are governed by Supabase Storage RLS (00017,
lines 134-163) — bucket reads gated by `documents.org_id` match.

---

## §2 — AI privacy bundle (shipped 2026-05-03, commit `a277c23`)

Three components. Always-on regardless of plan tier; the per-org toggle
is the strict-mode kill switch.

### 2.1 — Per-org `ai_extraction_enabled` toggle (00022)

**Migration:** `00022_ai_privacy.sql` adds
`organizations.ai_extraction_enabled boolean not null default true`.

**Gate:** `src/lib/ai/check-enabled.ts` exposes `requireAiEnabled(orgId)`
which throws `AiDisabledError` (code `AI_DISABLED`) if the toggle is off
or if the lookup itself errors. **Fail-CLOSED on lookup error** is the
audit-pass fix (`a277c23`):

> If we can't confirm the org consented to LLM exposure, we don't expose.
> A transient DB hiccup that blocks AI extraction shows a clear error to
> the user (paste manually); a hiccup that silently sends opted-out PII to
> Claude is a privacy violation we can't undo.

**UI:** Settings → Org tab → "AI & Privacy" card. Disable button flips
the column. Re-enable button flips back. Audit logged.

**Routes that honor it:** all 4 AI consumers below (§4).

### 2.2 — PII regex scrub on text doc inputs (`redact-pii.ts`)

**Scope:** xlsx / csv / txt content **before** the prompt is built.
Replaces:
- SSN (`\d{3}-\d{2}-\d{4}`) → `[SSN_REDACTED]`
- US phone (with optional +1, parens, separators) → `[PHONE_REDACTED]`
- Email (RFC-loose) → `[EMAIL_REDACTED]`

Counts logged. Returned `{ text, counts }`.

**What we deliberately do NOT detect** (documented in `redact-pii.ts`):
- Bank/routing numbers — collide with loan amounts and parcel IDs.
- DOB — generic date detection would maul transaction dates.
- Driver's license — varies state by state; high false-positive risk.
- 9-digit SSN without dashes — collides with zip+4 and parcel IDs.

**PDFs are NOT scrubbed.** Pre-extracting text would lose table
structure, which is the whole point of Claude's native PDF support.
Strict-mode tenants disable AI entirely via the toggle.

### 2.3 — Token-based depersonalization for AI memo (`redact.ts`)

**Scope:** the AI memo path (`src/lib/ai/analysis.ts`). Claude **never
sees real PII** in this path.

**Mechanism:** `buildRedactionMap(input)` produces a map of
real → token. Tokens use `[[UPPER_SNAKE]]` format (collision-safe with
intake content). Categories:

- `[[BORROWER]]`
- `[[ENTITY]]` (with `entityVariants()` — strips legal suffixes
  LLC / Inc / Corp / Co / LP / LLP / Ltd / Trust)
- `[[GUARANTOR]]`
- `[[REG_AGENT]]`
- `[[GC]]` (with `entityVariants()`)
- `[[PROPERTY_N]]` (with `addressVariants()` — full + street-only alias)
- `[[LENDER_N]]` (with `entityVariants()`)
- `[[LIT_PARTY_N]]`
- `[[SANCTIONS_MATCH_N]]`

**`addressVariants()` is the critical leak fix.** Discovered during
`a277c23` audit pass:

> CRITICAL leak: `1310 Rosalia Ave` (street form) wasn't caught by the
> full-form `1310 Rosalia Ave, San Jose, CA 95128` map entry — added
> `addressVariants()` (street alias) + `entityVariants()` (legal-suffix
> stripped alias).

**`byToken` map is first-write-wins** so `[[PROPERTY_1]]` unredacts to
the canonical full address (`1310 Rosalia Ave, San Jose, CA 95128`),
not the street alias. Multiple reals → one token; one token → one real.

**Forward replace** (`redact()`) sorts longest-first so multi-token
names ("Kim An Truong") win over substrings ("Kim An") when both are in
the map. Word-boundary anchors prevent partial-word collisions.

**`findLeftoverTokens()`** scans the unredacted output for stray
`[[FOO]]` patterns. Any hit means the model corrupted a token mid-
stream (truncation, typo, hallucination); caller logs and decides
whether to ship.

---

## §3 — Insignia / Damon Q&A copy

Pre-canned answers for the questions a fund's compliance team would ask.
Each is grounded in a specific code path or table.

**Q1: "Where does borrower data go?"**
Three categories of egress, all listed in `docs/VENDOR-LEDGER.md`:
1. **Required vendors** — Cobalt (entity), Realie/Regrid/ATTOM (property),
   CourtListener (federal litigation), OpenSanctions/OFAC (sanctions),
   CSLB (CA GC). These receive borrower / entity name + state to perform
   the lookup. They do not receive SSN, DOB, or financial account data.
2. **Anthropic Claude** — controlled by per-org toggle (§2.1). When
   enabled, four endpoints (§4) call Claude. The AI memo path applies
   token-based depersonalization (§2.3); doc-ingest applies regex PII
   scrub (§2.2) for text formats.
3. **Resend** (transactional email), **Supabase** (DB + storage),
   **Vercel** (hosting), **Sentry** (error tracking) — infrastructure
   layer; data does not leave our control plane.

**Q2: "Does Anthropic train on our data?"**
No. Anthropic's standard API has zero data retention (ZDR) on by default
for our usage tier. We additionally apply token-based depersonalization
to the AI memo path so even a hypothetical future caching or training
leak couldn't surface borrower / entity / property names. Post-NPLA we
can pursue an Anthropic enterprise contract with explicit ZDR / DPA, or
move to AWS Bedrock with Anthropic in customer tenancy if Insignia
mandates further isolation (§8).

**Q3: "What if we want to disable AI entirely?"**
Settings → Org tab → AI & Privacy → Disable. The toggle is per-org
(`organizations.ai_extraction_enabled`, migration 00022). When off, all
four AI consumers (§4) return 503 with code `AI_DISABLED`; the UI shows
"AI is disabled for your org — fill the form manually". Validation still
runs — only the LLM-assisted extraction and memo are disabled. The
toggle fails CLOSED on lookup error (§2.1).

**Q4: "How do you handle SSNs / DOBs / financial account numbers?"**
By design we do not ingest these into structured columns. There is no
SSN, DOB, or bank-account field on `borrowers`, `entities`, or any
validation snapshot table. Bank statements and tax returns may be
uploaded as documents (see §5); we treat those as opaque files governed
by Supabase Storage RLS, not as extraction targets. Text-format docs
sent to Claude get SSN / phone / email regex-scrubbed before the prompt
(§2.2). PDFs are not pre-scrubbed (would break table structure); strict-
mode tenants use the toggle.

**Q5: "Can borrowers see what's in their file?"**
Borrower-facing surface today is the share link
(`/share/[token]`) — used to upload track-record xlsx/pdf and review
extracted addresses. It does not yet expose the validation result or
risk memo to the borrower. A formal Data Subject Request flow is a
**post-NPLA gap** (§7).

**Q6: "What's your retention policy?"**
Most tables retain indefinitely; deletion is borrower- or org-driven.
Documents have a per-row `expires_at` with category defaults: bank
statements 90d, inbox submissions 30d, others persist (§5). Activity
events are append-only; audit_log is append-only. PITR via Supabase
covers operational rollback; user-driven deletion cascades through FKs.

**Q7: "Who has admin access?"**
- **Org-level:** users in your `organizations` row, scoped by RLS to
  their `org_id`.
- **PulseClose-internal:** founder (Zach Wade) holds the Supabase
  service-role key. No other engineers today. Service-role usage is
  limited to admin scripts in `scripts/` and cron paths
  (`src/lib/supabase/admin.ts`).
- **Vendors:** see `docs/VENDOR-LEDGER.md` — Anthropic, Cobalt, Realie,
  etc., receive only the data scoped to their lookup.

**Q8: "How would you respond to a data subject request?"**
Today: manual SQL export per `org_id`. We can extract every row across
all tables for a given borrower in <1 hour. Deletion: cascade via
`borrower_validations` or `borrowers` row delete; documents purged via
storage admin client. **Formal automated DSR flow is post-NPLA** (§7).

---

## §4 — AI consumer inventory (4 endpoints)

All four wrap `requireAiEnabled(orgId)` BEFORE the SDK call. All four
use `max_tokens >= 4096` (ROADMAP cross-cutting principle 11).

### 4.1 — `/api/ingest/borrower-doc`
**What it sends:** xlsx / csv / txt content (regex-scrubbed for SSN /
phone / email per §2.2) OR pdf base64 (NOT scrubbed — Claude PDF
support).
**Redaction applied:** Per-org toggle + regex PII scrub on text formats.
**Fallback when toggle off:** 503 `AI_DISABLED`. UI shows "fill the form
manually" message.

### 4.2 — `/api/share/[token]/extract-addresses`
**What it sends:** Same shapes as 4.1 (borrower side via share link —
unauthenticated; org_id resolved from share token).
**Redaction applied:** Per-org toggle (resolved via share-token →
validation → org) + regex PII scrub on text formats.
**Fallback when toggle off:** 503 `AI_DISABLED`. Borrower sees "AI
extraction disabled — paste addresses manually".

### 4.3 — `src/lib/ai/analysis.ts` (AI risk memo, Story Mode v2)
**What it sends:** Tokenized prompt — `[[BORROWER]]`, `[[ENTITY]]`,
`[[PROPERTY_N]]`, etc. Real names never appear in the request body.
**Redaction applied:** Per-org toggle + token-based depersonalization
(§2.3) + leftover-token scan post-unredact.
**Fallback when toggle off:** 503 `AI_DISABLED`. Detail page shows
"AI memo disabled" instead of the Story Mode card; the deterministic
risk factors and tier still render.

### 4.4 — `/api/investors/[id]/extract-criteria` (A1, shipped 2026-05-04)
**What it sends:** Investor guidelines PDF (categorical criteria — not
borrower PII).
**Redaction applied:** Per-org toggle + regex PII scrub. **No token-
based depersonalization** — investor criteria are categorical (max_LTV,
min_FICO, geo restrictions) and do not contain borrower-attributable
data. Token counts persisted to `investor_criteria_extractions` for
cost analytics (audit trail).
**Fallback when toggle off:** 503 `AI_DISABLED`. UI surfaces a "manual
entry" path on the investor card.

---

## §5 — Document storage policy

**Table:** `documents` (00017_universal_infra.sql).
**Bucket:** `documents` in Supabase Storage. Private; 10MB cap;
allowlisted MIME types (pdf, xlsx, xls, csv, txt, jpeg, png, heic, webp).

**Retention defaults by `purpose`:**

| Purpose | Default `expires_at` |
|---|---|
| `bank_statement` | +90d |
| `inbox_submission` | +30d |
| `borrower_doc_intake` | persist |
| `borrower_share_upload` | persist |
| `photo_verification` | persist |
| `investor_pdf` | persist |
| `handoff_artifact` | persist |
| `borrower_capital_summary` | persist |
| `risk_methodology` | persist |
| `other` | persist |

**Cleanup cron is NOT yet built** (gap — §7). `idx_documents_expires`
exists; the cron sweep that reads `expires_at < now()` and deletes
storage + row is post-NPLA work.

**Authorization model:**
- **Authenticated reads:** RLS policy `documents_select_own_org` checks
  `org_id` matches the authenticated user's org.
- **Borrower-side reads via share token:** the route checks
  share_token validity in app code, then uses service-role client to
  fetch (RLS-bypassing). The signed-URL pattern is the durable answer
  here — currently routes proxy reads through the app server.
- **Storage RLS:** `documents_storage_select_own_org` joins back to
  `public.documents` to confirm org ownership before returning bucket
  bytes (00017 lines 134-145).

---

## §6 — Audit + activity dual-log model

Two separate tables, by design (00017 lines 213-216 comment):

**`audit_log`** — immutable, security/compliance, includes auth events,
IP addresses, regulatory. **This is the table compliance reporting reads.**

**`activity_events`** — user-facing event log, "what happened" timeline.
Powers the activity feed (B5), validation diff (B6), and "what changed"
deltas. NOT the same as audit_log; do not collapse.

Both are append-only (no UPDATE / DELETE policy). Both scope to
`org_id` via RLS. Sensitive operations (toggle flip, plan change,
service-role action) write to BOTH — `audit_log` for compliance,
`activity_events` for the user-facing feed.

---

## §7 — Compliance gaps / SOC 2 readiness

Honest inventory. Each marked **ACCEPTED RISK**, **GAP TO CLOSE PRE-NPLA**,
or **GAP TO CLOSE POST-NPLA**.

| Gap | Status | Notes |
|---|---|---|
| Encryption at rest | **ACCEPTED RISK** | Supabase encrypts at rest by default but is not SOC 2 Type II certified for our specific config. Acceptable for current stage; revisit pre-Series-A. |
| Access logging beyond `audit_log` | **POST-NPLA** | Service-role usage logged in app paths, but DB-side access logs (Supabase) need explicit retention review. |
| Vendor sub-processor list documentation | **PRE-NPLA** | This doc + `VENDOR-LEDGER.md` together cover this. Format check before Insignia ask. |
| DPA template for B2B sales | **PRE-NPLA** | Insignia may ask for one. Template needed (~half day; legal-template fork). |
| DSR (Data Subject Request) process | **POST-NPLA** | Manual SQL export today (§3 Q8). Borrower-facing self-service UI is post-NPLA. |
| Retention enforcement cron | **POST-NPLA** | `documents.expires_at` not yet swept (§5). Index exists; cron logic doesn't. |
| Backup test (Supabase PITR untested) | **PRE-NPLA** | Restore to a scratch project from a known-good window; verify schema + row counts. ~1h. |
| Penetration test | **POST-NPLA** | None done. Plan: external pen-test post-NPLA if Insignia mandates. |
| Employee BG check / training | **n/a** | Solo founder. Becomes relevant on first hire. |
| Incident response runbook | **POST-NPLA** | Informal — defaults to Sentry alert + manual investigation. Formalize as a runbook page once the first real incident hits. |
| Quarterly access review | **POST-NPLA** | Solo team, no review needed today. Becomes process on hire #2. |

**Pre-NPLA priorities:**
1. DPA template (Insignia-ready).
2. Backup test (PITR restore drill).
3. Sub-processor list confirmed and shareable (this doc + VENDOR-LEDGER).

---

## §8 — Anthropic posture upgrades (post-NPLA, conditional on Insignia)

Three escalation tiers if Damon escalates AI privacy. Today's path is
the strict-mode toggle (§2.1) — pulling enterprise/Bedrock is premature
absent a real ask.

**Tier 0 (today):** Per-org toggle + regex PII scrub + token-based
depersonalization. Anthropic ZDR by default. No additional contract.
$0 incremental.

**Tier 1 (if Damon asks for paper):** Anthropic enterprise contract
with explicit ZDR clause and DPA. Estimated $5-15K/mo enterprise tier.
Adds: signed DPA, explicit no-training language, defined retention
window. Engineering: env var rotation only.

**Tier 2 (if Insignia mandates tenancy isolation):** AWS Bedrock with
Anthropic models hosted in customer (or our) tenancy. Setup cost ~1-2
weeks engineering; per-token cost similar to API. Adds: full data
residency control; Anthropic does not see traffic. Engineering:
SDK-level swap (we'd build a thin abstraction over `@anthropic-ai/sdk`
to switch transports per-org).

Decision rule: stay at Tier 0 until Damon brings a specific objection.
Tier 1 is the natural answer to "we need paper for our compliance
review". Tier 2 is reserved for a tenant-isolation mandate that Tier 1
can't satisfy.

---

## Cross-references

- **`docs/VENDOR-LEDGER.md`** — sub-processor list, contract surface per
  vendor.
- **`docs/DATA-MODEL.md`** — full schema, JSONB schemas, RLS specifics.
- **`docs/ROADMAP.md`** — cross-cutting principle 11 (Claude truncation
  defense), principles 8-10 (canonical-name dedup).
- **`pickup.md`** — Open decisions #1 (Insignia AI policy pending Damon),
  Action items for outside persons #4 (Insignia AI stance ask).
- **`src/lib/ai/check-enabled.ts`**, `src/lib/ai/redact.ts`,
  `src/lib/ai/redact-pii.ts` — implementation.
- **`supabase/migrations/00022_ai_privacy.sql`** — toggle column.
- **`supabase/migrations/00017_universal_infra.sql`** — documents,
  notification_preferences, activity_events, storage RLS.
