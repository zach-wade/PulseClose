// Deterministic facts block — serializes the sizing engine's numbers (and the
// qualitative context) into the exact text the AI is told to reason from. The
// model is instructed to use ONLY these figures, so this is the single source
// of truth for the judgment: no figure reaches Claude that the engine didn't
// compute. Pure + dependency-free.
//
// The figures here are deal economics, not PII. The qualitative context
// (sponsor / market / business plan / notes) is freeform lender text — the
// route scrubs it for SSN/phone/email (redact-pii) and token-redacts known
// borrower / property strings (redact) before this block reaches Claude.

import type { SizingInputs, SizingResult } from "./sizing";
import type { DealContext } from "./types";

const usd = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "n/a";
  const r = Math.round(n);
  return r < 0
    ? `-$${Math.abs(r).toLocaleString("en-US")}`
    : `$${r.toLocaleString("en-US")}`;
};
const pct = (n: number | null | undefined, digits = 1): string =>
  n == null || Number.isNaN(n) ? "n/a" : `${(n * 100).toFixed(digits)}%`;
const mult = (n: number | null | undefined, digits = 2): string =>
  n == null || Number.isNaN(n) ? "n/a" : `${n.toFixed(digits)}x`;

export function buildFactsBlock(
  inputs: SizingInputs,
  result: SizingResult,
  context?: DealContext,
): string {
  const basis = inputs.coverageBasis ?? "current";
  const lines: string[] = [];

  lines.push(`DEAL: ${inputs.name ?? "(unnamed bridge deal)"}`);
  lines.push("");
  lines.push("ACQUISITION & COST:");
  lines.push(`  Purchase price: ${usd(inputs.purchasePrice)}`);
  lines.push(`  Rehab / capex: ${usd(inputs.rehabBudget ?? 0)}`);
  lines.push(`  Closing & financing costs: ${usd(inputs.closingCosts ?? 0)}`);
  lines.push(`  Total project cost: ${usd(result.totalProjectCost)}`);
  lines.push("");
  lines.push("INCOME & VALUE:");
  lines.push(
    `  In-place NOI: ${usd(inputs.currentNOI)}  (going-in cap ${pct(inputs.goingInCapRate)} => as-is value ${usd(result.asIsValue)})`,
  );
  lines.push(
    `  Stabilized NOI: ${usd(inputs.stabilizedNOI)}  (exit cap ${pct(inputs.exitCapRate)} => stabilized value / ARV ${usd(result.stabilizedValue)})`,
  );
  lines.push("");
  lines.push("LOAN TERMS:");
  lines.push(
    `  Rate: ${pct(inputs.rate)}  (${inputs.amortizationMonths && inputs.amortizationMonths > 0 ? `amortizing over ${inputs.amortizationMonths} mo` : "interest-only"}; mortgage constant ${pct(result.mortgageConstant, 2)})`,
  );
  if (inputs.termMonths) lines.push(`  Term: ${inputs.termMonths} months`);
  lines.push(`  Coverage tests sized on ${basis.toUpperCase()} NOI`);
  lines.push("");

  lines.push("CONSTRAINT LADDER (lowest permitted loan binds the deal):");
  for (const c of result.constraints) {
    lines.push(
      `  ${c.binding ? ">>" : "  "} ${c.label}: ${usd(c.maxLoan)}  (${c.basis})${c.binding ? "  <-- BINDING" : ""}`,
    );
  }
  lines.push("");
  lines.push(`SIZED LOAN: ${usd(result.maxLoan)}  (binding constraint: ${result.bindingConstraint})`);
  lines.push(`  Equity required: ${usd(result.equityRequired)}`);
  lines.push(`  Annual debt service: ${usd(result.annualDebtService)}`);
  lines.push("");
  lines.push("RESULTING METRICS AT THE SIZED LOAN:");
  lines.push(`  LTV (as-is): ${pct(result.ltv)}   LTC: ${pct(result.ltc)}`);
  lines.push(
    `  DSCR — in-place: ${mult(result.dscrCurrent)}   stabilized: ${mult(result.dscrStabilized)}`,
  );
  lines.push(
    `  Debt yield — in-place: ${pct(result.debtYieldCurrent)}   stabilized: ${pct(result.debtYieldStabilized)}`,
  );
  lines.push("");
  lines.push("VALUE-ADD RETURNS SKETCH (sell at stabilized value):");
  lines.push(`  Yield-on-cost: ${pct(result.returnOnCost)}   Development spread vs exit cap: ${pct(result.developmentSpread)}`);
  lines.push(`  Project profit: ${usd(result.projectProfit)}   Equity multiple: ${mult(result.equityMultiple)}`);
  lines.push("");

  lines.push("QUALITATIVE CONTEXT (assess only from what's here; flag anything not provided):");
  lines.push(`  Sponsor: ${context?.sponsor?.trim() || "NOT PROVIDED"}`);
  lines.push(`  Market: ${context?.market?.trim() || "NOT PROVIDED"}`);
  lines.push(`  Business plan: ${context?.businessPlan?.trim() || "NOT PROVIDED"}`);
  if (context?.notes?.trim()) lines.push(`  Notes: ${context.notes.trim()}`);

  return lines.join("\n");
}
