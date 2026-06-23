// AI judgment layer — types (Module 6 — AI UW Copilot risk read).
//
// The sizing engine (sizing.ts) produces the numbers; this layer reads those
// numbers through Damon's deal-eval framework (sponsor / economics / market /
// structure / exit / deal-killers) plus the Wade Intel 5-concept lens, and
// returns a structured risk read + explicit deal-killer flags + a sizing
// recommendation. Structured so the UI can badge severities and surface
// kill-flags without parsing prose (Noah's drill-down principle).

// Damon's five positive framework dimensions (deal-killers are their own list).
export type Dimension = "sponsor" | "economics" | "market" | "structure" | "exit";

// How a dimension reads — drives UI color and whether it escalates to a kill flag.
export type Severity = "strength" | "neutral" | "concern" | "dealkiller";

export interface DimensionRead {
  dimension: Dimension;
  severity: Severity;
  read: string; // 1-2 sentence judgment on this dimension
  flags: string[]; // specific concerns (empty if none)
}

export type Stance = "pursue" | "pursue-with-conditions" | "pass";

export interface Judgment {
  headline: string; // one-line verdict
  framework: DimensionRead[]; // the five dimensions, each assessed
  dealKillers: string[]; // explicit kill flags (Damon's sixth category)
  fiveConcept: string; // Wade Intel 5-concept lens read (Subject/Conditions/Tasks/Events/Decisions)
  recommendation: { stance: Stance; rationale: string };
  memo: string; // prose memo for the PDF / UI
}

// What the engine can't compute — qualitative inputs the judgment reasons over.
// The engine stays pure; this rides alongside it into the AI call only. Omit any
// field and the judgment honestly flags it "NOT PROVIDED" rather than inventing it.
export interface DealContext {
  sponsor?: string; // track record · experience · net worth / liquidity · credit
  market?: string; // submarket · supply/demand · comps · location quality
  businessPlan?: string; // the value-add thesis (what the rehab / lease-up does)
  notes?: string; // anything else material (structure quirks, exit channel, timing)
}

export interface JudgmentResult extends Judgment {
  schema_version: 1;
  model: string; // the model that produced the judgment
}
