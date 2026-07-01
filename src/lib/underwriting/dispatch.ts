// Sizing-mode dispatcher — route a deal to the right engine (UW-1 capstone).
//
// The product carries a Nexys loan_type ("Bridge" / "Ground Up Construction" /
// "Fix & Flip / Fix to Rent" / "DSCR (Rental Loan)"). Each maps to one of the four
// sizing modes:
//   • rtl          → rtl-sizer.ts        (fix&flip purchase-money + rehab holdback)
//   • construction → construction-sizer.ts (ground-up Sources/Uses + capitalized reserve)
//   • dscr         → dscr-sizer.ts       (rental income approach)
//   • bridge       → sizing.ts underwrite() (income/value-add, as-is from cap rate)
//
// CALIBRATION #14: don't trust the stated purpose — infer the governing basis from
// the economics. A "refinance" whose rehab dwarfs the as-is value is really a
// ground-up/heavy-rehab deal; sizing it as a stabilized bridge is meaningless (loan
// 10228 read 450% LTV before this rule). sizingModeForLoanType() takes an optional
// economics hint and overrides the label when the numbers disagree.
//
// Pure, dependency-free. Cross-checked in scripts/verify-dispatch.ts.

import { sizeRtl, type RtlSizingInputs, type RtlSizingResult } from "./rtl-sizer";
import { sizeConstruction, type ConstructionSizingInputs, type ConstructionSizingResult } from "./construction-sizer";
import { dscrForLoan, type ResidentialDscrInputs, type ResidentialDscrResult } from "./dscr-sizer";
import { underwrite, type SizingInputs, type SizingResult } from "./sizing";

export type SizingMode = "rtl" | "construction" | "dscr" | "bridge";

/** Economics used to override a mislabeled loan type (CALIBRATION #14). */
export interface SizingEconomics {
  rehabBudget?: number;
  asIsValue?: number;
  constructionBudget?: number;
}

/** Map the product's loan_type string → a sizing mode, letting the economics
 *  override the label when they clearly disagree. Case-insensitive, tolerant of
 *  the exact Nexys enum spellings and common variants. */
export function sizingModeForLoanType(loanType: string | null | undefined, econ?: SizingEconomics): SizingMode {
  const t = (loanType ?? "").toLowerCase();

  // Label-based first pass.
  let mode: SizingMode;
  if (t.includes("ground up") || t.includes("ground-up") || t.includes("construction")) mode = "construction";
  else if (t.includes("fix") || t.includes("flip") || t.includes("rtl") || t.includes("rehab") || t.includes("bridge to")) mode = "rtl";
  else if (t.includes("dscr") || t.includes("rental")) mode = "dscr";
  else if (t.includes("bridge")) mode = "bridge";
  else mode = "bridge"; // safest default (income model)

  // Economics override (CALIBRATION #14): heavy build cost relative to as-is value
  // means the deal is really a ground-up/construction risk regardless of the label.
  const build = (econ?.constructionBudget ?? 0) || (econ?.rehabBudget ?? 0);
  const asIs = econ?.asIsValue ?? 0;
  if (build > 0 && asIs > 0 && build >= asIs && mode !== "construction") {
    mode = "construction";
  }
  return mode;
}

// Discriminated-union input/result so callers get the right typed result back.
export type SizeDealInput =
  | ({ mode: "rtl" } & RtlSizingInputs)
  | ({ mode: "construction" } & ConstructionSizingInputs)
  | ({ mode: "dscr" } & ResidentialDscrInputs)
  | ({ mode: "bridge" } & SizingInputs);

export type SizeDealResult =
  | { mode: "rtl"; result: RtlSizingResult }
  | { mode: "construction"; result: ConstructionSizingResult }
  | { mode: "dscr"; result: ResidentialDscrResult }
  | { mode: "bridge"; result: SizingResult };

/** Route a deal to its sizing engine and return the mode-tagged result. */
export function sizeDeal(input: SizeDealInput): SizeDealResult {
  switch (input.mode) {
    case "rtl":
      return { mode: "rtl", result: sizeRtl(input) };
    case "construction":
      return { mode: "construction", result: sizeConstruction(input) };
    case "dscr":
      return { mode: "dscr", result: dscrForLoan(input) };
    case "bridge":
      return { mode: "bridge", result: underwrite(input) };
  }
}
