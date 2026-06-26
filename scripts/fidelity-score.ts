// Field-by-field fidelity score — does the DETERMINISTIC sizing engine reproduce
// the human underwriter's actual decision on real ICC loans?
//
// This is the other half of the calibration loop. calibrate-loan.ts tests the
// DILIGENCE adapters (entity/track-record/litigation/GC/sanctions) against the
// live vendors. This tests the UNDERWRITING ENGINE (src/lib/underwriting/sizing.ts)
// against the loan-file ground truth: for each loan we know the ACTUAL approved
// amount; we compute what the engine would size at a documented bridge buy-box
// and diff them.
//
// KEY FRAME: the engine sizes the MAX SUPPORTABLE loan; the file gives the ACTUAL
// approved loan. So "fidelity" is NOT "did we guess the number" — it's:
//   (1) the IMPLIED LEVERAGE (LTV/LTC/LTARV) of each actual loan — this reveals
//       ICC's real leverage policy, which we can then encode as a buy-box; and
//   (2) whether the actual loan sits WITHIN a standard buy-box (actual <= engine
//       max). Actual > engine max => ICC ran hotter than standard caps (a finding).
//       Actual << engine max => borrower under-requested (engine isn't "wrong").
//
// Pure / no I/O — runs the engine, no vendors, no DB. Run:
//   npx tsx scripts/fidelity-score.ts

import { underwrite, type SizingInputs } from "../src/lib/underwriting/sizing";
import { sizeInterestReserve } from "../src/lib/underwriting/reserve";
import { GOLDEN, type GoldenCase } from "./golden-loans";

// ── The documented calibration buy-box (tuned to ICC's implied policy) ───────
// The implied-leverage table from the first run revealed ICC's real caps, so the
// buy-box is now DEAL-TYPE-AWARE (finding #15 — construction is LTARV-governed,
// with LTC a loose secondary, NOT LTC-first). Where an actual loan still exceeds
// these, it's a genuine outlier worth a human note (e.g. 10228 at 87% LTARV).
type BuyBox = { maxLTV?: number; maxLTC?: number; maxLoanToARV?: number };
function buyBoxFor(g: GoldenCase): BuyBox {
  if (skipAsIsLTV(g)) {
    // Ground-up / heavy-rehab / in-progress refi: as-is LTV is meaningless;
    // LTARV governs (~70%), LTC is a loose ceiling (~90%).
    return { maxLoanToARV: 0.7, maxLTC: 0.9 };
  }
  if (g.truth.arv != null) {
    // Value-add of an existing, improved property: as-is LTV applies, LTARV
    // governs the upside, LTC a moderate ceiling.
    return { maxLTV: 0.75, maxLoanToARV: 0.7, maxLTC: 0.85 };
  }
  // Stabilized / purchase bridge (no rehab/ARV): a single as-is LTV cap.
  return { maxLTV: 0.7 };
}
const CAP_RATE = 0.06; // synthetic cap to drive exact as-is/ARV through the NOI-based engine
const UNDER_REQUEST = 0.85; // actual below 85% of engine max => borrower under-requested
const OVER_TOL = 1.02; // actual above 102% of engine max => exceeds the buy-box

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

// Should we skip the as-is LTV cap? It's meaningless when as-is is bare land /
// a teardown, OR when "as-is" is a STALE pre-improvement value (a refi of an
// in-progress build, where lots of capital is already sunk). In all three the
// stabilized value (LTARV) governs. Deliberately does NOT trust the stated
// loan_purpose — keys off the economics (findings #14 + #16):
//   (a) construction purpose with as-is < half of ARV (land basis), OR
//   (b) rehab budget >= as-is value (the build, not the dirt, is the deal), OR
//   (c) significant capital already spent vs. as-is (stale as-is value).
function skipAsIsLTV(g: GoldenCase): boolean {
  const t = g.truth;
  if (t.loan_purpose === "construction" && t.as_is_value != null && t.arv != null && t.as_is_value < 0.5 * t.arv)
    return true;
  if (t.rehab_budget != null && t.as_is_value != null && t.rehab_budget >= t.as_is_value) return true;
  if (t.cost_spent_to_date != null && t.as_is_value != null && t.cost_spent_to_date >= 0.25 * t.as_is_value)
    return true;
  return false;
}

// Calibrated default interest-reserve policy (months), derived from the implied
// reserve periods in the Nexys audit logs (10228 ≈ 14 mo heavy-rehab construction;
// 10294 ≈ 3 mo purchase bridge; 10287 / 10295 = 0, current-pay). This is the
// engine's forward default — the human can always override per deal.
function suggestReserveMonths(g: GoldenCase): number {
  if (skipAsIsLTV(g)) return 14; // ground-up / heavy-rehab / in-progress build
  if (g.truth.loan_purpose === "purchase") return 3; // purchase bridge
  return 0; // stabilized / refi / cash-out — borrower pays current
}

interface Row {
  loan_id: string;
  label: string;
  actual: number;
  // implied leverage of the ACTUAL loan
  ltv: number | null;
  ltc: number | null;
  ltarv: number | null;
  // engine
  engineMax: number | null;
  binding: string | null;
  // verdict
  verdict: string;
  deltaPct: number | null; // (actual - engineMax) / engineMax
  missing: string[]; // sizing-truth fields absent in the file
}

function score(g: GoldenCase): Row {
  const t = g.truth;
  const label = `${g.borrower_name} · ${g.property_state} · ${t.loan_purpose ?? "?"}/${t.property_type ?? "?"}`;
  const actual = t.loan_amount ?? NaN;

  // what's missing for a full sizing
  const missing: string[] = [];
  if (t.as_is_value == null) missing.push("as_is");
  if (t.arv == null && (t.rehab_budget != null || t.loan_purpose === "construction")) missing.push("arv");
  if (t.rehab_budget == null && (t.arv != null || t.loan_purpose === "construction")) missing.push("rehab");

  const spentToDate = t.cost_spent_to_date ?? 0;
  const cost = (t.purchase_price ?? t.as_is_value ?? 0) + spentToDate + (t.rehab_budget ?? 0);
  const skipLTV = skipAsIsLTV(g);
  const bb = buyBoxFor(g);

  // implied leverage of the actual loan
  const ltv = t.as_is_value && !skipLTV ? actual / t.as_is_value : null;
  const ltc = cost > 0 ? actual / cost : null;
  const ltarv = t.arv ? actual / t.arv : null;

  // build engine inputs: feed exact as-is/ARV via synthetic NOI @ CAP_RATE
  const inputs: SizingInputs = {
    name: g.loan_id,
    purchasePrice: t.purchase_price ?? t.as_is_value ?? 0,
    rehabBudget: t.rehab_budget ?? 0,
    costSpentToDate: spentToDate, // finding #16 — honest LTC basis for in-progress refis
    currentNOI: (t.as_is_value ?? 0) * CAP_RATE,
    goingInCapRate: CAP_RATE,
    stabilizedNOI: t.arv != null ? t.arv * CAP_RATE : undefined,
    exitCapRate: t.arv != null ? CAP_RATE : undefined,
    rate: 0.095,
    // apply only the caps this deal type supports (buyBoxFor); skip as-is LTV
    // for ground-up land / stale-as-is in-progress refis.
    maxLTV: t.as_is_value && !skipLTV ? bb.maxLTV : undefined,
    maxLTC: cost > 0 ? bb.maxLTC : undefined,
    maxLoanToARV: t.arv != null ? bb.maxLoanToARV : undefined,
  };

  let engineMax: number | null = null;
  let binding: string | null = null;
  const hasConstraint = inputs.maxLTV != null || inputs.maxLTC != null || inputs.maxLoanToARV != null;
  if (hasConstraint && (t.as_is_value != null || t.arv != null || cost > 0)) {
    try {
      const r = underwrite(inputs);
      engineMax = r.maxLoan;
      binding = r.bindingConstraint;
    } catch {
      /* leave null */
    }
  }

  let verdict: string;
  let deltaPct: number | null = null;
  if (Number.isNaN(actual)) {
    verdict = "no actual loan amount";
  } else if (engineMax == null) {
    verdict = "insufficient truth to size";
  } else {
    deltaPct = (actual - engineMax) / engineMax;
    if (actual > engineMax * OVER_TOL) verdict = `⚠️ EXCEEDS buy-box +${(deltaPct * 100).toFixed(0)}%`;
    else if (actual < engineMax * UNDER_REQUEST) verdict = `under-requested (${(deltaPct * 100).toFixed(0)}%)`;
    else verdict = `✓ within buy-box (${deltaPct >= 0 ? "+" : ""}${(deltaPct * 100).toFixed(0)}%)`;
  }

  return { loan_id: g.loan_id, label, actual, ltv, ltc, ltarv, engineMax, binding, verdict, deltaPct, missing };
}

function main() {
  console.log("PulseClose fidelity score — deterministic sizing engine vs. real ICC loan outcomes");
  console.log("Buy-box (deal-type-aware): stabilized → LTV 70% · value-add → LTV 75%/LTARV 70%/LTC 85% · ground-up/in-progress → LTARV 70%/LTC 90% (no as-is LTV)\n");

  const rows = GOLDEN.map(score);

  // ── Implied-leverage table: what ICC ACTUALLY did (the calibration gold) ──
  console.log("IMPLIED LEVERAGE OF EACH ACTUAL LOAN  (what ICC's policy really is)");
  console.log("─".repeat(100));
  console.log(
    "loan".padEnd(14) + "actual".padEnd(13) + "LTV".padEnd(9) + "LTC".padEnd(9) + "LTARV".padEnd(9) + "engine max".padEnd(13) + "bind".padEnd(11) + "verdict",
  );
  console.log("─".repeat(100));
  for (const r of rows) {
    console.log(
      r.loan_id.padEnd(14) +
        usd(r.actual).padEnd(13) +
        pct(r.ltv).padEnd(9) +
        pct(r.ltc).padEnd(9) +
        pct(r.ltarv).padEnd(9) +
        usd(r.engineMax).padEnd(13) +
        (r.binding ?? "—").padEnd(11) +
        r.verdict,
    );
  }

  // ── Field-by-field sizing-truth completeness ──
  console.log("\nSIZING-TRUTH COMPLETENESS (which fields the file actually carried)");
  console.log("─".repeat(100));
  for (const r of rows) {
    const tag = r.missing.length === 0 ? "complete" : `MISSING: ${r.missing.join(", ")}`;
    console.log(`${r.loan_id.padEnd(14)} ${tag}`);
  }

  // ── Summary stats ──
  const sizable = rows.filter((r) => r.engineMax != null && !Number.isNaN(r.actual));
  const within = sizable.filter((r) => r.verdict.startsWith("✓"));
  const exceeds = sizable.filter((r) => r.verdict.startsWith("⚠️"));
  const under = sizable.filter((r) => r.verdict.startsWith("under"));
  const errPool = sizable.filter((r) => !r.verdict.startsWith("under")); // exclude under-requested from error
  const meanAbsDelta =
    errPool.length > 0 ? errPool.reduce((s, r) => s + Math.abs(r.deltaPct ?? 0), 0) / errPool.length : null;

  const ltvVals = rows.map((r) => r.ltv).filter((x): x is number => x != null);
  const ltcVals = rows.map((r) => r.ltc).filter((x): x is number => x != null);
  const ltarvVals = rows.map((r) => r.ltarv).filter((x): x is number => x != null);
  const max = (a: number[]) => (a.length ? Math.max(...a) : null);
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

  console.log("\nFIDELITY SUMMARY");
  console.log("─".repeat(100));
  console.log(`Loans:                ${rows.length} total · ${sizable.length} sizable · ${rows.length - sizable.length} insufficient truth`);
  console.log(`Within standard buy-box: ${within.length}/${sizable.length}   (engine reproduces / bounds the decision)`);
  console.log(`Exceeds buy-box:         ${exceeds.length}/${sizable.length}   ${exceeds.length ? "→ " + exceeds.map((r) => r.loan_id).join(", ") + " (ICC ran hotter — tune the buy-box?)" : ""}`);
  console.log(`Under-requested:         ${under.length}/${sizable.length}   ${under.length ? "→ " + under.map((r) => r.loan_id).join(", ") + " (borrower asked < max; not an engine error)" : ""}`);
  console.log(`Mean |Δ| vs engine:      ${meanAbsDelta == null ? "—" : pct(meanAbsDelta)}   (excludes under-requested)`);
  console.log("");
  console.log(`Implied LTV   (as-is):  avg ${pct(avg(ltvVals))} · max ${pct(max(ltvVals))}`);
  console.log(`Implied LTC   (cost):   avg ${pct(avg(ltcVals))} · max ${pct(max(ltcVals))}`);
  console.log(`Implied LTARV (stab.):  avg ${pct(avg(ltarvVals))} · max ${pct(max(ltarvVals))}`);
  console.log("\n→ The deal-type buy-box (buyBoxFor) is tuned to these implied maxima.");
  console.log("  Any remaining 'exceeds' is a true outlier worth a human note (e.g. 10228 at 87% LTARV).");

  reserveAndPricingSection();
}

// ── #3 — PRICING + INTEREST-RESERVE FIDELITY (vs Nexys audit-log actuals) ─────
// The Nexys logs carry no risk tier (tierLevel: null) and no competitive investor
// placement (ICC funds its own Insignia RTL program) — so the diffable execution
// ground truth is the priced RATE and the funded INTEREST RESERVE. This validates
// (a) the engine's reserve FORMULA + its calibrated default reserve policy against
// what ICC actually funded, and (b) the engine's rate assumption against ICC's
// real pricing band.
function reserveAndPricingSection() {
  const priced = GOLDEN.filter((g) => g.truth.actual_rate != null);
  if (priced.length === 0) return;

  console.log("\n\nPRICING + INTEREST-RESERVE FIDELITY  (engine vs Nexys actuals — #3)");
  console.log("─".repeat(100));
  console.log(
    "loan".padEnd(9) + "actual rate".padEnd(13) + "actual reserve".padEnd(16) + "implied mo".padEnd(12) +
      "engine mo".padEnd(11) + "engine reserve".padEnd(16) + "Δ reserve",
  );
  console.log("─".repeat(100));

  const reserveDeltas: number[] = [];
  for (const g of priced) {
    const loan = g.truth.loan_amount ?? 0;
    const rate = g.truth.actual_rate!;
    const actualReserve = g.truth.interest_reserve ?? 0;
    const monthlyInt = (loan * rate) / 12;
    // ICC's actual reserve period, backed out of the funded reserve.
    const impliedMo = actualReserve > 0 && monthlyInt > 0 ? actualReserve / monthlyInt : 0;
    // Engine's forward default reserve policy → gross reserve (full debt service
    // over the period) at the actual loan + rate, via the production reserve
    // module. The funded actual is a gross interest holdback, so grossReserve is
    // the apples-to-apples figure (these deals throw off ~no in-place NOI in rehab).
    const engineMo = suggestReserveMonths(g);
    const engineReserve = sizeInterestReserve({ loanAmount: loan, rate, reserveMonths: engineMo }).grossReserve;
    // Δ relative to ICC's actual funded reserve (skip the 0/0 current-pay cases).
    const delta = actualReserve > 0 ? (engineReserve - actualReserve) / actualReserve : null;
    if (delta != null) reserveDeltas.push(Math.abs(delta));
    console.log(
      g.loan_id.padEnd(9) +
        pct(rate).padEnd(13) +
        usd(actualReserve).padEnd(16) +
        (impliedMo > 0 ? `${impliedMo.toFixed(1)} mo` : "current-pay").padEnd(12) +
        (engineMo > 0 ? `${engineMo} mo` : "0").padEnd(11) +
        usd(engineReserve).padEnd(16) +
        (delta == null ? "— (no reserve)" : `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`),
    );
  }

  // Pricing band — ICC's real implied policy vs the harness's engine rate input.
  const rates = priced.map((g) => g.truth.actual_rate!).sort((a, b) => a - b);
  const avgRate = rates.reduce((s, r) => s + r, 0) / rates.length;
  const meanReserveDelta = reserveDeltas.length ? reserveDeltas.reduce((s, d) => s + d, 0) / reserveDeltas.length : null;
  const ENGINE_RATE_ASSUMPTION = 0.095; // the rate fidelity-score feeds the sizing engine elsewhere

  console.log("\nPRICING + RESERVE SUMMARY");
  console.log("─".repeat(100));
  console.log(`Priced loans:            ${priced.length}  (with rate + reserve actuals from the Nexys logs)`);
  console.log(`Funded-reserve mean |Δ|: ${meanReserveDelta == null ? "—" : pct(meanReserveDelta)}  (engine default reserve policy vs ICC actuals; current-pay deals excluded)`);
  console.log(`ICC pricing band:        avg ${pct(avgRate)} · range ${pct(rates[0])}–${pct(rates[rates.length - 1])}`);
  console.log(`Engine rate assumption:  ${pct(ENGINE_RATE_ASSUMPTION)}  → ${ENGINE_RATE_ASSUMPTION >= avgRate ? "at/above" : "below"} ICC's average (${ENGINE_RATE_ASSUMPTION >= rates[rates.length - 1] ? "≥ top of band, conservative" : "within band"})`);
  console.log("\n→ Reserve policy (calibrated default): heavy-rehab/construction ~14 mo · purchase ~3 mo · stabilized/cash-out 0 (current-pay).");
  console.log("  ICC assigns no risk tier and funds its own RTL program, so tier + competitive placement aren't in the logs to diff — pricing + reserve are.");
}

main();
