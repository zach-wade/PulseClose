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
import { GOLDEN, type GoldenCase } from "./golden-loans";

// ── The documented calibration buy-box ──────────────────────────────────────
// A representative bridge/construction lender's leverage caps. These are the
// caps the fidelity score sizes against; where an ACTUAL loan exceeds them, that's
// the calibration signal (ICC's policy is hotter, or the deal had compensating
// factors). Tune these as the implied-leverage table below reveals ICC's true caps.
const BUY_BOX = {
  maxLTV: 0.75, // of as-is value (stabilized / value-add of existing improvements)
  maxLTC: 0.8, // of total project cost (purchase/basis + rehab)
  maxLoanToARV: 0.7, // of after-repair / stabilized value (construction / heavy value-add)
};
const CAP_RATE = 0.06; // synthetic cap to drive exact as-is/ARV through the NOI-based engine
const UNDER_REQUEST = 0.85; // actual below 85% of engine max => borrower under-requested
const OVER_TOL = 1.02; // actual above 102% of engine max => exceeds the buy-box

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

// A ground-up / rehab-dominant deal where as-is is BARE LAND or a teardown (not
// improved value): applying an as-is LTV cap is meaningless, so we skip it and
// size on LTC + LTARV only. This deliberately does NOT trust the stated
// loan_purpose — a loan tagged "refinance" but with rehab >= as-is is really a
// ground-up (calibration finding from loan 10228), so we key off the economics:
//   (a) explicit construction purpose with as-is < half of ARV (land basis), OR
//   (b) rehab budget >= as-is value (the build, not the dirt, is the deal).
function isGroundUp(g: GoldenCase): boolean {
  const t = g.truth;
  if (t.loan_purpose === "construction" && t.as_is_value != null && t.arv != null && t.as_is_value < 0.5 * t.arv)
    return true;
  if (t.rehab_budget != null && t.as_is_value != null && t.rehab_budget >= t.as_is_value) return true;
  return false;
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

  const cost = (t.purchase_price ?? t.as_is_value ?? 0) + (t.rehab_budget ?? 0);
  const ground = isGroundUp(g);

  // implied leverage of the actual loan
  const ltv = t.as_is_value && !ground ? actual / t.as_is_value : null;
  const ltc = cost > 0 ? actual / cost : null;
  const ltarv = t.arv ? actual / t.arv : null;

  // build engine inputs: feed exact as-is/ARV via synthetic NOI @ CAP_RATE
  const inputs: SizingInputs = {
    name: g.loan_id,
    purchasePrice: t.purchase_price ?? t.as_is_value ?? 0,
    rehabBudget: t.rehab_budget ?? 0,
    currentNOI: (t.as_is_value ?? 0) * CAP_RATE,
    goingInCapRate: CAP_RATE,
    stabilizedNOI: t.arv != null ? t.arv * CAP_RATE : undefined,
    exitCapRate: t.arv != null ? CAP_RATE : undefined,
    rate: 0.095,
    // apply only the caps the deal supports; skip as-is LTV for ground-up land
    maxLTV: t.as_is_value && !ground ? BUY_BOX.maxLTV : undefined,
    maxLTC: cost > 0 ? BUY_BOX.maxLTC : undefined,
    maxLoanToARV: t.arv != null ? BUY_BOX.maxLoanToARV : undefined,
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
  console.log(`Buy-box: LTV ${pct(BUY_BOX.maxLTV)} (as-is) · LTC ${pct(BUY_BOX.maxLTC)} · LTARV ${pct(BUY_BOX.maxLoanToARV)}\n`);

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
  console.log("\n→ These implied-leverage maxima ARE ICC's real buy-box. Tune BUY_BOX above to match,");
  console.log("  then any remaining 'exceeds' is a true outlier worth a human note.");
}

main();
