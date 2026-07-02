// Per-org underwriting assumptions — resolution + app-level defaults (principle 14).
//
// The house defaults an org sets once (sizing caps/floors, exit/takeout terms,
// DSCR target) become config, not code. This module owns the APP-level defaults
// (the values that were previously hardcoded literals in /api/underwrite) and the
// merge that turns a partial stored object into a complete, always-present set the
// route can rely on. Pure, dependency-free.

import { orgUnderwritingAssumptionsV1 } from "@/lib/schemas/jsonb";

/** Every assumption resolved to a concrete number — no optionals. */
export interface ResolvedUwAssumptions {
  house_max_ltv: number;
  house_max_ltc: number;
  house_max_ltarv: number;
  house_min_dscr: number;
  house_min_debt_yield: number;
  takeout_max_ltv: number;
  takeout_min_dscr: number;
  takeout_amort_months: number;
  takeout_rate_spread_bps: number;
  takeout_rate_floor: number;
  dscr_target: number;
}

/** The app-level defaults — the literals previously hardcoded in the route
 *  (takeout 70% LTV / 1.25x DSCR / 30yr / 250bps inside the bridge, floored 6%;
 *  DSCR-rental 1.25x; bridge house 75/70/65 LTV/LTC/LTARV, 1.20x DSCR, 8% DY). */
export const DEFAULT_UW_ASSUMPTIONS: ResolvedUwAssumptions = {
  house_max_ltv: 0.75,
  house_max_ltc: 0.7,
  house_max_ltarv: 0.65,
  house_min_dscr: 1.2,
  house_min_debt_yield: 0.08,
  takeout_max_ltv: 0.7,
  takeout_min_dscr: 1.25,
  takeout_amort_months: 360,
  takeout_rate_spread_bps: 250,
  takeout_rate_floor: 0.06,
  dscr_target: 1.25,
};

/** Merge a stored (partial, possibly invalid) assumptions object over the app
 *  defaults into a complete set. Invalid/absent → app defaults (fails safe). */
export function resolveUwAssumptions(stored: unknown): ResolvedUwAssumptions {
  const parsed = orgUnderwritingAssumptionsV1.safeParse(stored ?? {});
  if (!parsed.success) return { ...DEFAULT_UW_ASSUMPTIONS };
  const s = parsed.data;
  const merged = { ...DEFAULT_UW_ASSUMPTIONS };
  for (const k of Object.keys(DEFAULT_UW_ASSUMPTIONS) as (keyof ResolvedUwAssumptions)[]) {
    const v = s[k];
    if (typeof v === "number" && Number.isFinite(v)) merged[k] = v;
  }
  return merged;
}
