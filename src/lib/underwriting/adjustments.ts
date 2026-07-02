// Human override layer (UW-7 Tier-2) — apply named ± dollar adjustments to the
// engine's sized loan to produce a final approved loan.
//
// The deterministic engine sizes; the underwriter applies explicit, labeled,
// auditable adjustments (a seller credit, a cross-collateral bump, an
// environmental holdback) that the model has no field for — the escape hatch that
// keeps a bespoke deal in-product instead of Excel. Pure, dependency-free. The
// final loan is floored at 0 (an adjustment can't drive the loan negative).

export interface AdjustmentItem {
  label: string;
  amount: number; // signed dollars: + increases / − reduces the loan
  reason?: string;
}

export interface AppliedAdjustments {
  baseLoan: number;
  totalDelta: number; // Σ amounts (may be negative)
  finalLoan: number; // max(0, baseLoan + totalDelta)
}

/** Sum the adjustments onto the base loan (floored at 0). */
export function applyAdjustments(baseLoan: number, items: readonly AdjustmentItem[]): AppliedAdjustments {
  const totalDelta = items.reduce((sum, i) => sum + (Number.isFinite(i.amount) ? i.amount : 0), 0);
  const finalLoan = Math.max(0, baseLoan + totalDelta);
  return { baseLoan, totalDelta, finalLoan };
}
