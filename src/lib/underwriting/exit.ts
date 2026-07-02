// Exit / takeout sizing — the bridge credit question (Module 10 depth add).
//
// The bridge sizer (sizing.ts) answers "how big a bridge loan does the deal
// support today". This layer answers the question Damon asks on every deal —
// *"does the exit make sense?"* — by sizing the PERMANENT-loan takeout at
// stabilization and testing whether it repays the bridge balance at exit.
//
//   terminal NOI ÷ terminal cap        => stabilized value (ARV)
//   min(perm LTV, perm DSCR, perm DY)  => max permanent takeout
//   max takeout vs. bridge balance     => refinanceable? cushion / shortfall?
//
// This is the part the spreadsheet centers on and our engine ignored. It reuses
// the same constraint-min logic on STABILIZED numbers with an amortizing perm
// loan, and flags "longer term required" when the plan stabilizes after the
// bridge matures. Pure, dependency-free, drill-down-able (every number names its
// basis). The deterministic engine decides; the AI only narrates. No I/O.
//
// All $ in whole dollars; rates as decimals (0.065 = 6.5%).

import { mortgageConstant } from "./sizing";

export interface TakeoutInputs {
  // stabilized economics (from the bridge plan / sizing result)
  stabilizedValue: number; // ARV at stabilization (stabilizedNOI / exitCap)
  stabilizedNOI: number; // pro-forma NOI the perm loan sizes on

  // what the takeout must repay — the bridge balance at exit. For an
  // interest-only bridge this is the bridge loan amount; pass accrued/capitalized
  // interest or an interest reserve drawdown in if the structure carries it.
  bridgeBalanceAtExit: number;

  // permanent-loan (takeout) terms — the refinancing lender's box
  takeoutMaxLTV?: number; // perm max LTV of stabilized value
  takeoutMinDSCR?: number; // perm DSCR floor (1.20–1.25x is the live constraint)
  takeoutMinDebtYield?: number; // perm debt-yield floor (optional)
  takeoutRate: number; // perm note rate
  takeoutAmortizationMonths?: number; // 360 typical; omit/0 => interest-only

  // timing — drives the "longer term required" flag
  bridgeTermMonths?: number; // bridge maturity
  monthsToStabilize?: number; // when the plan reaches stabilizedNOI / refi-ready
}

export type TakeoutConstraintKey = "PermLTV" | "PermDSCR" | "PermDebtYield";

export interface TakeoutConstraint {
  key: TakeoutConstraintKey;
  label: string;
  maxLoan: number; // takeout this constraint permits
  binding: boolean;
  basis: string; // what it's measured against (drill-down)
}

export interface TakeoutResult {
  stabilizedValue: number;
  bridgeBalanceAtExit: number;

  constraints: TakeoutConstraint[];
  maxTakeout: number; // min across perm constraints
  bindingConstraint: TakeoutConstraintKey;
  permMortgageConstant: number; // perm annual debt service per $1

  // the credit verdict
  takeoutCoverage: number; // maxTakeout / bridgeBalanceAtExit (≥1 => refinanceable)
  refinanceable: boolean; // coverage ≥ 1.0
  cushion: number; // maxTakeout − bridgeBalanceAtExit (negative => shortfall)
  shortfall: number; // max(0, bridgeBalance − maxTakeout) — equity the sponsor must inject

  // perm metrics at the takeout amount (capped at the bridge balance — you
  // wouldn't refi for more than you owe unless cashing out)
  takeoutDSCR: number; // stabilizedNOI / perm debt service at the takeout
  takeoutDebtYield: number; // stabilizedNOI / takeout

  // timing
  termSufficient: boolean | null; // monthsToStabilize ≤ bridgeTermMonths (null if unknown)

  flags: string[]; // human-readable, drill-down — the things a credit officer reads
}

/**
 * Size the permanent takeout at stabilization and test whether it repays the
 * bridge. The takeout is MIN across the perm lender's LTV / DSCR / debt-yield
 * constraints on stabilized numbers — the same constraint-min discipline the
 * bridge sizer uses, applied to the exit.
 */
export function sizeTakeout(d: TakeoutInputs): TakeoutResult {
  const k = mortgageConstant(d.takeoutRate, d.takeoutAmortizationMonths);

  const raw: Omit<TakeoutConstraint, "binding">[] = [];
  if (d.takeoutMaxLTV != null)
    raw.push({
      key: "PermLTV",
      label: "Permanent LTV (stabilized)",
      maxLoan: d.takeoutMaxLTV * d.stabilizedValue,
      basis: `${(d.takeoutMaxLTV * 100).toFixed(0)}% of stabilized value`,
    });
  if (d.takeoutMinDSCR != null)
    raw.push({
      key: "PermDSCR",
      label: "Permanent DSCR",
      maxLoan: d.stabilizedNOI / (d.takeoutMinDSCR * k),
      basis: `${d.takeoutMinDSCR.toFixed(2)}x on stabilized NOI @ ${(d.takeoutRate * 100).toFixed(2)}%${
        d.takeoutAmortizationMonths ? ` / ${d.takeoutAmortizationMonths}mo amort` : " IO"
      }`,
    });
  if (d.takeoutMinDebtYield != null)
    raw.push({
      key: "PermDebtYield",
      label: "Permanent debt yield",
      maxLoan: d.stabilizedNOI / d.takeoutMinDebtYield,
      basis: `${(d.takeoutMinDebtYield * 100).toFixed(1)}% on stabilized NOI`,
    });

  if (raw.length === 0)
    throw new Error("provide at least one takeout constraint (LTV, DSCR, or debt yield)");

  const maxTakeout = Math.min(...raw.map((c) => c.maxLoan));
  const bindingKey = raw.find((c) => c.maxLoan === maxTakeout)!.key;
  const constraints: TakeoutConstraint[] = raw
    .map((c) => ({ ...c, binding: c.key === bindingKey }))
    .sort((a, b) => a.maxLoan - b.maxLoan);

  const cushion = maxTakeout - d.bridgeBalanceAtExit;
  const refinanceable = cushion >= 0;
  const shortfall = Math.max(0, -cushion);
  const takeoutCoverage =
    d.bridgeBalanceAtExit > 0 ? maxTakeout / d.bridgeBalanceAtExit : Infinity;

  // perm metrics evaluated at the actual takeout draw = min(maxTakeout, bridge
  // balance) — you size the refi to retire the bridge, not the full ceiling.
  const drawn = Math.min(maxTakeout, d.bridgeBalanceAtExit);
  const takeoutDSCR = drawn > 0 ? d.stabilizedNOI / (drawn * k) : Infinity;
  const takeoutDebtYield = drawn > 0 ? d.stabilizedNOI / drawn : Infinity;

  const termSufficient =
    d.monthsToStabilize != null && d.bridgeTermMonths != null
      ? d.monthsToStabilize <= d.bridgeTermMonths
      : null;

  const flags: string[] = [];
  if (!refinanceable)
    flags.push(
      `Takeout shorts the bridge by $${Math.round(shortfall).toLocaleString()} — the permanent loan does not fully repay the bridge balance at exit; sponsor must inject equity or extend.`,
    );
  if (refinanceable && takeoutCoverage < 1.1)
    flags.push(
      `Thin takeout cushion (${takeoutCoverage.toFixed(2)}x the bridge balance) — little margin if stabilized NOI or value comes in light.`,
    );
  if (termSufficient === false)
    flags.push(
      `Longer term required — plan stabilizes in ~${d.monthsToStabilize} mo but the bridge matures in ${d.bridgeTermMonths} mo; an extension or longer initial term is needed to reach the takeout.`,
    );

  return {
    stabilizedValue: d.stabilizedValue,
    bridgeBalanceAtExit: d.bridgeBalanceAtExit,
    constraints,
    maxTakeout,
    bindingConstraint: bindingKey,
    permMortgageConstant: k,
    takeoutCoverage,
    refinanceable,
    cushion,
    shortfall,
    takeoutDSCR,
    takeoutDebtYield,
    termSufficient,
    flags,
  };
}

// ── Refi NOI-stress grid (UW-7 / CALIBRATION #26) ────────────────────────────
//
// The base takeout answers "does the exit make sense at the plan NOI?" The real
// bridge risk is whether it STILL exits if stabilized NOI comes in light. ICC's
// construction-MF Loan Analysis sheet runs exactly this: haircut terminal NOI
// −0/5/10/15/20% → recompute the takeout at each level. We reuse sizeTakeout()
// per level — the deterministic engine, no new ratio math.
//
// Every perm constraint (LTV·value, NOI/(DSCR·k), NOI/DY) scales linearly with the
// NOI haircut (value = NOI/exitCap scales 1:1), so the binding constraint is
// stress-invariant and maxTakeout(h) = maxTakeout(0)·(1−h). That gives a closed-form
// break-even haircut, cross-checked against the per-level grid in verify-refi-stress.ts.

export const DEFAULT_STRESS_LEVELS = [0, 0.05, 0.1, 0.15, 0.2] as const;

export interface RefiStressRow {
  haircut: number; // fraction NOI is reduced (0 = base case)
  stabilizedNOI: number; // NOI at this haircut
  stabilizedValue: number; // value at this haircut (scales with NOI)
  maxTakeout: number; // permanent loan supportable here
  bindingConstraint: TakeoutConstraintKey;
  coverage: number; // maxTakeout / bridge balance (≥1 => refinanceable)
  refinanceable: boolean;
  shortfall: number; // equity the sponsor must inject if it shorts
}

export interface RefiStressResult {
  bridgeBalanceAtExit: number;
  baseCoverage: number; // coverage at the plan NOI (haircut 0)
  levels: RefiStressRow[];
  // The NOI haircut (fraction) at which coverage crosses 1.0 — how much stabilized
  // NOI can come in light before the bridge no longer fully refinances. 0 => it
  // already shorts at the plan NOI; null => no bridge balance to repay (trivial).
  breakEvenHaircut: number | null;
}

/** Re-size the takeout across a grid of NOI haircuts — "does the bridge still
 *  exit under stress?" Pure; reuses sizeTakeout() per level. */
export function stressTakeout(
  d: TakeoutInputs,
  levels: readonly number[] = DEFAULT_STRESS_LEVELS,
): RefiStressResult {
  const rows: RefiStressRow[] = levels.map((h) => {
    const stabilizedNOI = d.stabilizedNOI * (1 - h);
    const stabilizedValue = d.stabilizedValue * (1 - h);
    const r = sizeTakeout({ ...d, stabilizedNOI, stabilizedValue });
    return {
      haircut: h,
      stabilizedNOI,
      stabilizedValue,
      maxTakeout: r.maxTakeout,
      bindingConstraint: r.bindingConstraint,
      coverage: r.takeoutCoverage,
      refinanceable: r.refinanceable,
      shortfall: r.shortfall,
    };
  });

  const base = rows.find((r) => r.haircut === 0) ?? rows[0];
  const baseCoverage = base.coverage;
  // coverage(h) = baseCoverage·(1−h) ⇒ break-even at coverage = 1.
  const breakEvenHaircut = !Number.isFinite(baseCoverage)
    ? null
    : baseCoverage <= 1
      ? 0
      : 1 - 1 / baseCoverage;

  return { bridgeBalanceAtExit: d.bridgeBalanceAtExit, baseCoverage, levels: rows, breakEvenHaircut };
}
