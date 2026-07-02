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
import { sizeDeal, type SizeDealInput, type SizeDealResult, type SizingMode } from "./dispatch";

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

// ─────────────── dispatch-aware live solve (UW-5 SolveControl) ───────────────
//
// The stepper works over a mode-tagged SizeDealInput (dispatch.ts). To drive the
// UI's "solve for a number" control from one code path, invert the WHOLE deal:
// vary one input lever, re-run sizeDeal(), and read one output metric. Every
// evaluation is a full deterministic size — this is Solver, live, per keystroke.

/** The input the underwriter varies. Both structured levers are per-mode. */
export type SolveLeverKey = "purchaseAdvancePct" | "targetDSCR";
/** The output the underwriter targets. Per-mode (see SOLVE_OPTIONS). */
export type SolveMetricKey = "cashToClose" | "proposedLoan" | "ltarv" | "totalLoan" | "maxLoan";

/** A user-selectable "solve for X" affordance, one per (mode, metric). */
export interface SolveOption {
  lever: SolveLeverKey;
  leverLabel: string;
  /** pct → the lever is a ratio shown ×100 (advance %); ratio → shown as-is (DSCR). */
  leverKind: "pct" | "ratio";
  metric: SolveMetricKey;
  metricLabel: string;
  /** How the target value is entered/shown. */
  metricKind: "usd" | "pct";
  /** Bracket for the bisection search over the lever. */
  bracket: { lo: number; hi: number };
}

/** The solve levers offered per structured mode (bridge sizes via sizing.ts). */
export const SOLVE_OPTIONS: Record<Exclude<SizingMode, "bridge">, SolveOption[]> = {
  rtl: [
    { lever: "purchaseAdvancePct", leverLabel: "purchase advance", leverKind: "pct",
      metric: "cashToClose", metricLabel: "cash to close", metricKind: "usd", bracket: { lo: 0, hi: 1 } },
    { lever: "purchaseAdvancePct", leverLabel: "purchase advance", leverKind: "pct",
      metric: "proposedLoan", metricLabel: "loan amount", metricKind: "usd", bracket: { lo: 0, hi: 1.5 } },
  ],
  construction: [
    { lever: "purchaseAdvancePct", leverLabel: "initial advance", leverKind: "pct",
      metric: "ltarv", metricLabel: "LTARV", metricKind: "pct", bracket: { lo: 0, hi: 2 } },
    { lever: "purchaseAdvancePct", leverLabel: "initial advance", leverKind: "pct",
      metric: "totalLoan", metricLabel: "total loan", metricKind: "usd", bracket: { lo: 0, hi: 2 } },
  ],
  dscr: [
    // max loan falls as the DSCR floor rises → monotone, bisectable.
    { lever: "targetDSCR", leverLabel: "target DSCR", leverKind: "ratio",
      metric: "maxLoan", metricLabel: "max loan", metricKind: "usd", bracket: { lo: 0.5, hi: 3 } },
  ],
};

export interface DealSolveResult {
  lever: SolveLeverKey;
  /** The solved lever value (ratio for pct levers, e.g. 0.83; DSCR as-is). */
  leverValue: number;
  metric: SolveMetricKey;
  target: number;
  achieved: number; // metric value at the solved lever
  converged: boolean;
  result: SizeDealResult; // the full deal sized at the solved lever
}

function withLever(input: SizeDealInput, lever: SolveLeverKey, x: number): SizeDealInput {
  // Both levers exist on exactly one mode each; spreading is type-safe because the
  // discriminant `mode` is preserved and we only ever set the lever that mode owns.
  return { ...input, [lever]: x } as SizeDealInput;
}

/** Read a solve metric off a mode-tagged result (public: the UI shows the baseline
 *  value before the user picks a target). Throws if metric ∉ mode. */
export function readDealMetric(r: SizeDealResult, metric: SolveMetricKey): number {
  return readMetric(r, metric);
}

function readMetric(r: SizeDealResult, metric: SolveMetricKey): number {
  switch (r.mode) {
    case "rtl":
      if (metric === "cashToClose") return r.result.cashToClose;
      if (metric === "proposedLoan") return r.result.proposedLoan;
      break;
    case "construction":
      if (metric === "ltarv") return r.result.ltarv;
      if (metric === "totalLoan") return r.result.totalLoan;
      break;
    case "dscr":
      if (metric === "maxLoan") return r.result.maxLoan;
      break;
    case "bridge":
      break;
  }
  throw new Error(`solveDeal: metric "${metric}" is not valid for mode "${r.mode}"`);
}

/** Invert a whole deal: solve `lever` so that `metric` hits `target`. Throws if the
 *  target isn't reachable within the bracket (goalSeek's bracketing error). */
export function solveDeal(
  input: SizeDealInput,
  lever: SolveLeverKey,
  metric: SolveMetricKey,
  target: number,
  bracket: { lo: number; hi: number },
): DealSolveResult {
  const f = (x: number) => readMetric(sizeDeal(withLever(input, lever, x)), metric);
  const gs = goalSeek(f, target, { lo: bracket.lo, hi: bracket.hi });
  const result = sizeDeal(withLever(input, lever, gs.x));
  return { lever, leverValue: gs.x, metric, target, achieved: gs.fx, converged: gs.converged, result };
}

/** Non-throwing wrapper for the live UI: returns null when the target is out of
 *  reach in range (so a keystroke never throws mid-render). */
export function trySolveDeal(
  input: SizeDealInput,
  lever: SolveLeverKey,
  metric: SolveMetricKey,
  target: number,
  bracket: { lo: number; hi: number },
): DealSolveResult | null {
  try {
    return solveDeal(input, lever, metric, target, bracket);
  } catch {
    return null;
  }
}
