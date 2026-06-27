# UX Audit Rubric — desired per-page / per-persona state

Derived from `design-system.md` (brand/color/type/voice) + `UX-REDESIGN-PLAN.md §11.2`
(verdict-first principles) + `CUSTOMER-SCENARIOS.md` + `PERSONA-FLOWS.md` + `UX-PLAN.md`.
This is the **scoring reference** for the visual drive (`scripts/drive-ux-audit.ts` →
`ux-review/audit/`). Score each screen against the global checklist, then the
route-specific criteria. A finding = a violated criterion, tagged **bug** (broken/
wrong) or **debt** (works but off-standard), with severity.

## Personas
- **Underwriter** — full verify → size → judge → hand off. Stops at: full pipeline.
- **Solo / Spreadsheet Refugee** — just vet the borrower; stops at Eligibility, never sees sizing.
- **Fund / Mandator** — sets the standard; lives on the Mandate Console.

## Global checklist (every page)
1. **Type scale** — no `text-lg`/`text-xl`; page title `text-2xl tracking-tight`, card title `text-base`, body `text-sm`.
2. **Color discipline** — blue = action/identity only; green/amber/red = status only; navy = text/structure; white cards on slate bg; **no gradients/glows**.
3. **Status = color + icon + shape**, never color alone.
4. **Verdict-first / BLUF** — decision surfaces lead with the answer + one-line "why".
5. **No data-model leakage** — no snake_case keys, raw JSON, UUIDs, or "stored as JSONB".
6. **Honest labels** — data-source + "Preview/Beta" on anything not live; never present stub as real.
7. **No placeholder leaks** — no dev/CLI hints in empty states, no `[[TOKEN]]`, no forever-spinners.
8. **One obvious next step** — single primary CTA, imperative verb; never a dead-end.
9. **Progressive disclosure** — advanced collapses; verify-only users never see sizing inputs.
10. **No emoji / stock photos / decorative effects**; text-first.
11. **Mono for data values** — case numbers, dates, dollar amounts, addresses.
12. **Drill-to-evidence via drawer**, not a buried below-fold section.
13. **Consistent verdict everywhere** — one `computeVerdict()`; list chip == hero == handoff.
14. **Nav consistency** — stable sidebar; no orphan routes; active state correct.
15. **No empty/“0” without context** — guided empty state instead.

## Per-route desired state + acceptance

### /dashboard — home
Persona: all. Lead with "continue your task," not "pick a feature." Recent borrowers/validations + one next-step CTA; first-run = guided empty state (not a CLI hint). KPI money-tiles if data exists.

### /dashboard/validations/[id] — Summary
Lead with the **verdict hero**: state (color+icon) · delta · one-line reason · 5-pillar quad (Entity/Track/Litigation/GC/Sanctions, each icon+label+sub-label+message+"view evidence →") · mandate line · counterfactual · 1–2 CTAs. AI memo narrates (2–4 sentences), does **not** re-enumerate the factor list. Full report behind one disclosure. Track pillar must agree with the "Properties Found: N" stat (no "No properties found" while 6 show).

### …/[id] Evidence
Per-pillar drill-down; "view evidence →" opens a **side drawer** with the raw record + source attribution + fetch date. Mono for data. No JSON/snake_case. Verify tray shows per-check status + re-run.

### …/[id] Deal
Leads with "Size this deal" CTA; lists existing evaluations (date · investor · verdict · binding constraint). No empty dead-end.

### …/[id] Hand off
PDF + Excel of the same data; human-readable filenames; "what happens next" card; mandate stamp + BLUF verdict lead the artifact; no raw `potential_match`/`not_run`.

### …/[id] Portfolio / Story mode
KPI tiles (abnormal highlighted, in-range muted); refresh date. Story mode = the AI memo, narrated, no factor re-enumeration, no `[[TOKEN]]` leak.

### /dashboard/evaluate — Deals list
Title "Deals". Rows: borrower · state · loan size · verdict chip · investor · date · Open. "Start a new deal" CTA + guided empty state (no CLI hint).

### /dashboard/evaluate/[id] — Deal stepper
5 steps (①Terms ②Eligibility ③Sizing ④Judgment ⑤Hand off). Terms entered once. Sizing shows ~8 core fields, advanced collapsed; result = money-tile header (max loan · binding constraint · tier) + constraint ladder (binding row highlighted + headroom) + counterfactual. Judgment gated behind a button. Verify-only persona never reaches Sizing.

### /dashboard/evaluate/investors + /[id]
Buy-box rendered as a **term sheet** (human labels + formatted values), not snake_case/JSON. Acronyms glossed. Source attribution if PDF-parsed. Verdict list per mandate.

### /dashboard/capital/mandates — Mandate console (Fund)
Fund home (not originator onboarding). Per-mandate throughput tiles (meets/conditional/fails) using shared status tokens. Cross-originator preview honestly labeled "Preview". Verdict-only (no raw diligence) for cross-originator.

### /dashboard/portfolio
KPI header + loan list (status badges performing/watch/default). Abnormal in `--warning`/`--destructive`, in-range muted. Refresh date.

### /dashboard/coverage
State × pillar coverage (✓/⚠/✗) + free-vs-paid; "coming soon" labels honest; usage/capacity.

### /dashboard/activity
Reverse-chron feed: timestamp (mono, local TZ) · active-verb action · actor · borrower link · result. Filterable.

### /dashboard/usage
Plan tier + next billing + usage progress bars (success/warning/destructive by threshold). Invoice history. No raw Stripe JSON.

### /dashboard/new
Simple form (name/entity/state required, address optional); skeleton loading (no full-page spinner); lands on the verdict hero.

### /dashboard/settings
Tabbed (Org · Team · API · Webhooks); labeled inputs, no raw JSON; masked keys.
