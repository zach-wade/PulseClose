# Guided walkthrough — the Westbrook deal (Damon/Noah demo)

> The artifact for DEPTH-AND-VALUE-DIRECTION §6.1 ("Damon-shaped test data + a
> guided walkthrough — do first"). Walk this exact flow live to judge whether the
> depth lands, and to put a realistic deal in front of Damon. Every number below
> is **computed by the deterministic engine** against the **real Colchis/Oakhurst
> buy-boxes** (docs/BUYBOX-COLCHIS-OAKHURST.md) — nothing is hand-faked.

## Setup (already seeded to prod)

- **Login:** `uw@test.pulseclose.com` / `Test1234!` (underwriter org `27296b6b…`).
- **Investors:** the real **Colchis** (RTL purchase grid) + **Oakhurst/Mandalay**
  (eligibility v1.2) boxes. Re-seed: `ORG_ID=27296b6b-87f2-4b71-9e84-2c71f652449c
  npx tsx scripts/seed-sample-investors.ts` then `… PERSONA=underwriter npx tsx
  scripts/seed-persona-data.ts`.
- **The hero deal — Westbrook Capital Partners LLC:** an **8-unit Sacramento
  multifamily value-add**. Sponsor has **four deed-verified MF value-add exits**.
  Validation: `/dashboard/validations/44444444-4444-4444-8444-444444444444`.

## The deal in one line (why it's Damon-shaped)

Weak **in-place** NOI (it's a value-add), so the bridge sizes to **as-is LTV** and
carries an **interest reserve** — *none of the static coverage constraints
meaningfully bind on day one* (Damon's exact words about how Insignia underwrites).
The real judgment is **the exit**: does the stabilized property support a permanent
takeout that repays the bridge? That's the question our engine now answers.

## Noah's flow — six steps

### 1. Phone intake → "who is this borrower?"
Open the Westbrook validation. The promoted **mandate stamp** + **summary** sit up
top (✓ meets Insignia's standard). Five diligence pillars ran in parallel: entity
(active CA LLC since 2017), **track record**, litigation (clear), GC (licensed,
insured), sanctions (clear). 30–60s, no forms sent to the borrower.

### 2. Track-record "who" — the verification wedge
Open the **Track record** evidence. **Four** multifamily repositions, 2019–2025,
each **deed-verified** (ATTOM source, `verified: true`), held 18–26 months, all
stabilized/exited. This is the Damon-named saleable subproduct and the thing **no
competitor does** — they score track record off *self-reported* docs; we verify it
against deeds. Drill into any row to the source. **Zero false positives is the bar.**

### 3. Evaluate — "slot where they fit" (best execution)
Open the **Deal** → Sizing step. The engine sizes the **bridge at $1,800,000**,
bound by **LTV** (75% of the $2.4M as-is value). Then **best execution by investor**:

| Investor | Sized | Binding | Rate |
|---|---|---|---|
| **Oakhurst / Mandalay** | **$1,920,000** | LTV (80%) | 9.50% |
| Colchis Capital | $1,680,000 | LTV (70%) | 9.50% |

Same rate, but **Oakhurst lets the borrower size $240k more** (80% vs 70% MF-bridge
LTV) — *that's* "slot where they fit," computed off the real boxes. (Colchis's MF
heavy-rehab grid is blank in their guidelines, so a fix-flip variant of this deal
would show Colchis out-of-box entirely — the buy-box fidelity is real.)

### 4. Exit / takeout story — "does the exit make sense?" (the new depth)
Scroll to **Exit / takeout** in the Sizing step. The engine sizes the **permanent
takeout at stabilization**:

- Stabilized value **$4.15M** ($228k NOI ÷ 5.5% exit cap).
- Max permanent takeout **$2,284,675**, bound by **perm DSCR** (1.25x @ 7% / 30yr).
- **Takeout coverage 1.27x** the $1.8M bridge balance → **"Takeout clears the
  bridge"** with a **$485k cushion**, and the 18-month stabilization fits inside the
  24-month term. Every number drills to its basis.

This is the bridge credit question, answered deterministically — the part the
spreadsheet centers on and the product previously ignored.

### 5. Mandate verdict — rep-and-warranty
The validation is auto-assessed against Insignia's mandate → **pass**. This is the
portable verdict an originator carries to the fund at delivery (the wedge — gated on
the load-bearing Damon question: *will a fund grant real R&W relief on this?*).

### 6. One-pager handoff
**Hand off** tab → the capital-partner-ready artifact (Excel + PDF): sizing ladder +
binding constraint + **exit/takeout** + per-investor best execution + AI judgment +
mandate stamp. The deterministic numbers, a human-review step, an AI memo that
*narrates* the exit — never sets the number.

## What to watch for (stress-test against the trust rules)
- **Drill-down on every number?** (LTV basis, takeout DSCR basis, deed source.)
- **AI narrating, not deciding?** The memo explains; the engine set $1.8M / $2.28M.
- **Speaks their language?** "slot where they fit," "does the exit make sense,"
  "prices off a grid," interest reserve, stabilized takeout.
- **Beats their Excel where judgment lives?** Exit sizing + cross-investor best
  execution + verified track record — not a restatement of what Nexys shows.

## The one question only Damon can answer
Is constraint-min sizing **+ exit/takeout verdict + best-execution** *enough depth*
to trust on a real deal — or does he expect a multi-period draw/reserve cash flow
first? Show him this deal and ask. (DEPTH-AND-VALUE-DIRECTION §4 open question.)
