// Live-solve / goal-seek over the sizing engines (UW-5).
//
// Every ICC model is forward-calc: you input a structure, it reports the result.
// To answer "what advance % keeps cash-to-close under $X?" or "what loan hits a
// 1.25x DSCR?", Michael reaches for Excel Solver. This makes that inversion
// native and deterministic — the "10× over the spreadsheet" from ROADMAP UW-5.
//
// goalSeek() is a robust bisection root-finder for a monotonic scalar function on
// [lo, hi] (auto-detects increasing vs decreasing from the bracket). The typed
// wrappers invert the RTL / construction / DSCR sizers for the levers an
// underwriter actually drags. Pure, dependency-free.

import { sizeRtl, type RtlSizingInputs } from "./rtl-sizer";
import { sizeConstruction, type ConstructionSizingInputs } from "./construction-sizer";
import { maxLoanByDscr } from "./dscr-sizer";

export interface GoalSeekOptions {
  lo: number;
  hi: number;
  tolerance?: number; // interval half-width to stop at (default 1e-9)
  maxIterations?: number; // default 200
}

export interface GoalSeekResult {
  x: number; // the solved input
  fx: number; // f(x) achieved
  target: number;
  converged: boolean; // |fx − target| within a loose value tolerance
  iterations: number;
}

/** Solve f(x) = target for x on [lo, hi], assuming f is monotonic on the bracket.
 *  Bisection: no derivative needed, cannot diverge, works through the max(0,…) and
 *  piecewise pieces the sizers contain. Throws if the target isn't bracketed. */
export function goalSeek(f: (x: number) => number, target: number, opts: GoalSeekOptions): GoalSeekResult {
  const tol = opts.tolerance ?? 1e-9;
  const maxIter = opts.maxIterations ?? 200;
  let lo = opts.lo;
  let hi = opts.hi;
  let flo = f(lo) - target;
  let fhi = f(hi) - target;
  if (flo === 0) return { x: lo, fx: f(lo), target, converged: true, iterations: 0 };
  if (fhi === 0) return { x: hi, fx: f(hi), target, converged: true, iterations: 0 };
  if (flo * fhi > 0) {
    throw new Error(
      `goalSeek: target ${target} not bracketed by [${lo}, ${hi}] (f(lo)=${flo + target}, f(hi)=${fhi + target})`,
    );
  }
  let mid = (lo + hi) / 2;
  let i = 0;
  for (; i < maxIter; i++) {
    mid = (lo + hi) / 2;
    const fmid = f(mid) - target;
    if (fmid === 0 || (hi - lo) / 2 <= tol) break;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  const fx = f(mid);
  return { x: mid, fx, target, converged: Math.abs(fx - target) <= Math.max(1e-6, Math.abs(target) * 1e-6), iterations: i };
}

// ─────────────── typed wrappers (the levers underwriters drag) ───────────────

/** RTL: what purchase-advance % yields a target borrower cash-to-close?
 *  (cash-to-close decreases as advance rises — more loan, less borrower cash). */
export function solveRtlAdvanceForCashToClose(
  base: Omit<RtlSizingInputs, "purchaseAdvancePct">,
  targetCashToClose: number,
  bracket: { lo?: number; hi?: number } = {},
): GoalSeekResult {
  const f = (adv: number) => sizeRtl({ ...base, purchaseAdvancePct: adv }).cashToClose;
  return goalSeek(f, targetCashToClose, { lo: bracket.lo ?? 0, hi: bracket.hi ?? 1 });
}

/** RTL: what purchase-advance % sizes the proposed loan exactly to a target loan? */
export function solveRtlAdvanceForLoan(
  base: Omit<RtlSizingInputs, "purchaseAdvancePct">,
  targetLoan: number,
  bracket: { lo?: number; hi?: number } = {},
): GoalSeekResult {
  const f = (adv: number) => sizeRtl({ ...base, purchaseAdvancePct: adv }).proposedLoan;
  return goalSeek(f, targetLoan, { lo: bracket.lo ?? 0, hi: bracket.hi ?? 1.5 });
}

/** Construction: what purchase-advance % hits a target loan-to-ARV?
 *  (LTARV rises with the advance — bigger initial disbursement, bigger loan.) */
export function solveConstructionAdvanceForLtarv(
  base: Omit<ConstructionSizingInputs, "purchaseAdvancePct">,
  targetLtarv: number,
  bracket: { lo?: number; hi?: number } = {},
): GoalSeekResult {
  const f = (adv: number) => sizeConstruction({ ...base, purchaseAdvancePct: adv }).ltarv;
  return goalSeek(f, targetLtarv, { lo: bracket.lo ?? 0, hi: bracket.hi ?? 2 });
}

/** DSCR: the max loan at a target DSCR is a direct inversion (no search needed) —
 *  re-exported here so all "solve for the number" levers live in one place. */
export function solveMaxLoanForDscr(
  annualNOI: number,
  targetDSCR: number,
  rate: number,
  amortizationMonths?: number,
): number {
  return maxLoanByDscr({ annualNOI, targetDSCR, rate, amortizationMonths }).maxLoan;
}
