// Zod schemas for every JSONB column in the database. Each shape carries
// a `schema_version` field so we can evolve shapes without silent drift.
//
// The migration in 00016_p0_corrections.sql backfills schema_version=1 on
// every existing row and adds a CHECK constraint requiring its presence.
// New writes use the strict parsers below, which guarantee schema_version
// is set even if the caller omits it.
//
// Conventions per export:
//   - `<name>V1`               — the Zod schema (output type carries v1 stamp)
//   - `<Name>V1` (TS type)     — `z.infer<typeof <name>V1>`
//   - `parse<Name>V1`          — safe parser, returns `{ data, error }`
//   - `parse<Name>V1Strict`    — throws on invalid input

import { z } from "zod";

// ── shared primitives ──────────────────────────────────────────────────────

const schemaVersion = z.literal(1).default(1);

function safe<T extends z.ZodTypeAny>(schema: T) {
  return (input: unknown): { data: z.infer<T> | null; error: z.ZodError | null } => {
    const result = schema.safeParse(input);
    if (result.success) return { data: result.data, error: null };
    return { data: null, error: result.error };
  };
}

function strict<T extends z.ZodTypeAny>(schema: T, label: string) {
  return (input: unknown): z.infer<T> => {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    throw new Error(`${label} schema validation failed: ${result.error.message}`);
  };
}

// ── borrower_validations.ai_analysis ──────────────────────────────────────
// v1 (legacy) and v2 (Story Mode) coexist. New writes are always v2; old
// rows stay v1 forever. Reads route through parseAiAnalysisAny which
// accepts either shape and returns a discriminated result.

export const aiAnalysisV1 = z.object({
  schema_version: z.literal(1).default(1),
  summary: z.string(),
  // risk_rating is hard-overwritten server-side from the deterministic tier;
  // we still validate its enum here so a malformed AI response doesn't
  // poison the column.
  risk_rating: z.enum(["low", "medium", "high"]),
  pillar_assessments: z.object({
    entity: z.string(),
    track_record: z.string(),
    litigation: z.string(),
    gc: z.string().nullable(),
    sanctions: z.string().nullable(),
  }),
  flags: z.array(z.string()),
  recommendations: z.array(z.string()),
});
export type AiAnalysisV1 = z.infer<typeof aiAnalysisV1>;
export const parseAiAnalysisV1 = safe(aiAnalysisV1);
export const parseAiAnalysisV1Strict = strict(aiAnalysisV1, "ai_analysis_v1");

export const aiAnalysisV2 = z.object({
  schema_version: z.literal(2),
  summary: z.string(),
  risk_rating: z.enum(["low", "medium", "high"]),
  pillar_assessments: z.object({
    entity: z.string(),
    track_record: z.string(),
    litigation: z.string(),
    gc: z.string().nullable(),
    sanctions: z.string().nullable(),
  }),
  strengths: z.array(z.object({
    title: z.string(),
    narrative: z.string(),
  })),
  risks: z.array(z.object({
    factor_key: z.string(),
    // Mirrors FactorSeverity in src/lib/risk/factors.ts minus "none" (excluded
    // factors are skipped by the prompt). The AI is told to copy the
    // severity from the deterministic factor block verbatim.
    severity: z.enum(["critical", "moderate", "minor", "informational"]),
    narrative: z.string(),
  })),
  recommendations: z.array(z.object({
    priority: z.enum(["must", "should", "consider"]),
    narrative: z.string(),
  })),
});
export type AiAnalysisV2 = z.infer<typeof aiAnalysisV2>;
export const parseAiAnalysisV2 = safe(aiAnalysisV2);
export const parseAiAnalysisV2Strict = strict(aiAnalysisV2, "ai_analysis_v2");

// Discriminated read helper. Branches on schema_version (defaulting to 1 for
// rows written before the field existed). UI components consume the result
// via a type-narrowing switch on the returned `version`.
export function parseAiAnalysisAny(input: unknown):
  | { version: 1; data: AiAnalysisV1 }
  | { version: 2; data: AiAnalysisV2 }
  | { version: null; error: string } {
  if (input == null || typeof input !== "object") {
    return { version: null, error: "ai_analysis is null or non-object" };
  }
  const obj = input as { schema_version?: unknown };
  const version = typeof obj.schema_version === "number" ? obj.schema_version : 1;
  if (version === 2) {
    const r = aiAnalysisV2.safeParse(input);
    if (r.success) return { version: 2, data: r.data };
    return { version: null, error: `v2 parse failed: ${r.error.message}` };
  }
  // Legacy v1 — accept and parse, default schema_version to 1
  const r = aiAnalysisV1.safeParse({ schema_version: 1, ...obj });
  if (r.success) return { version: 1, data: r.data };
  return { version: null, error: `v1 parse failed: ${r.error.message}` };
}

// ── borrower_validations.input_warnings ───────────────────────────────────
// Currently a string[] — keep the loose shape but stamp it.

export const inputWarningsV1 = z.object({
  schema_version: schemaVersion,
  warnings: z.array(z.string()),
});
export type InputWarningsV1 = z.infer<typeof inputWarningsV1>;
export const parseInputWarningsV1 = safe(inputWarningsV1);
export const parseInputWarningsV1Strict = strict(inputWarningsV1, "input_warnings");

// Compatibility helper — until the column is reshaped from string[] → object,
// this lets call sites keep passing a string[] and get a stamped object.
export function wrapInputWarningsV1(warnings: string[]): InputWarningsV1 {
  return { schema_version: 1, warnings };
}

// ── borrower_validations.handoff_data ─────────────────────────────────────

export const handoffPropertyManualV1 = z.object({
  rehab_spend: z.number().nullable().optional(),
  gc_name: z.string().nullable().optional(),
  gc_license: z.string().nullable().optional(),
  narrative: z.string().nullable().optional(),
});

export const handoffDataV1 = z.object({
  schema_version: schemaVersion,
  overall_narrative: z.string().optional(),
  preparer_name: z.string().optional(),
  preparer_email: z.string().optional(),
  properties: z.record(z.string(), handoffPropertyManualV1).optional(),
  // G6.1 — optional pointer to an investor in the same org. When set,
  // the Excel + PDF render an "Intended investor" block with terms +
  // rationale pulled from deal_eligibility_results.
  chosen_investor_id: z.string().uuid().nullable().optional(),
  // Item 2 — optional pointer to a uw_model. When set, the Excel + PDF
  // render a "Loan sizing & AI judgment" block (constraint ladder, binding
  // constraint, stance, deal-killers, framework, memo).
  chosen_uw_model_id: z.string().uuid().nullable().optional(),
});
export type HandoffDataV1 = z.infer<typeof handoffDataV1>;
export const parseHandoffDataV1 = safe(handoffDataV1);
export const parseHandoffDataV1Strict = strict(handoffDataV1, "handoff_data");

// ── deal_outcomes.outcome_data ────────────────────────────────────────────
// Per-status optional fields. The `status` column on deal_outcomes is the
// source of truth for which fields are meaningful; everything in here is
// optional so a Withdrawn outcome doesn't have to fake a close_date.
//
// close_date is ISO date (YYYY-MM-DD), not timestamp — outcome dates are
// reported by the lender and rarely include time-of-day precision.

export const dealOutcomeDataV1 = z.object({
  schema_version: schemaVersion,
  close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  funded_amount: z.number().positive().nullable().optional(),
  extension_reason: z.string().nullable().optional(),
  default_cause: z.string().nullable().optional(),
});
export type DealOutcomeDataV1 = z.infer<typeof dealOutcomeDataV1>;
export const parseDealOutcomeDataV1 = safe(dealOutcomeDataV1);
export const parseDealOutcomeDataV1Strict = strict(dealOutcomeDataV1, "deal_outcome_data");

// ── investor_criteria.criteria_value ──────────────────────────────────────
// Discriminated union keyed by criteria_key. Caller passes the key alongside
// the value; we look up the right shape and validate.

const stringArray = z.array(z.string());
const numberPositive = z.number().nonnegative();
const ratio = z.number().min(0).max(1);
const ficoBand = z.number().int().min(300).max(850);

const leverageTierV1 = z.object({
  loan_type: z.string().nullable(),
  property_type: z.string().nullable(),
  min_fico: ficoBand.nullable(),
  max_fico: ficoBand.nullable(),
  min_experience: z.number().int().nonnegative(),
  max_experience: z.number().int().nonnegative().nullable(),
  max_ltv: ratio.nullable(),
  max_ltc: ratio.nullable(),
  max_ltarv: ratio.nullable(),
  base_rate_bps: z.number().int().nonnegative(),
  base_points_bps: z.number().int().nonnegative(),
  sort_order: z.number().int(),
});

const rateAdjusterV1 = z.object({
  name: z.string(),
  condition: z.object({
    field: z.string(),
    op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "between", "in", "not_in", "is_true", "is_false"]),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
    value_max: z.number().optional(),
  }),
  rate_bps: z.number().int(),
  points_bps: z.number().int(),
  ltv_adjustment_pct: z.number(),
  ltc_adjustment_pct: z.number(),
  group: z.string().nullable().optional(),
  stackable: z.boolean().optional(),
});

const criteriaShapeByKey = {
  loan_types: stringArray,
  property_types: stringArray,
  excluded_property_types: stringArray,
  allowed_states: stringArray,
  excluded_states: stringArray,
  allowed_occupancy: stringArray,
  min_loan_amount: numberPositive,
  max_loan_amount: numberPositive,
  min_fico: ficoBand,
  min_experience: z.number().int().nonnegative(),
  max_ltv: ratio,
  max_ltc: ratio,
  max_ltarv: ratio,
  rural_allowed: z.boolean(),
  leverage_matrix: z.array(leverageTierV1),
  rate_adjusters: z.array(rateAdjusterV1),
} as const;

export type CriteriaKey = keyof typeof criteriaShapeByKey;

export function parseCriteriaValueV1(
  key: string,
  value: unknown,
): { data: unknown; error: z.ZodError | null; known: boolean } {
  const shape = criteriaShapeByKey[key as CriteriaKey];
  if (!shape) return { data: value, error: null, known: false };
  const result = shape.safeParse(value);
  if (result.success) return { data: result.data, error: null, known: true };
  return { data: null, error: result.error, known: true };
}

export function parseCriteriaValueV1Strict(key: string, value: unknown): unknown {
  const shape = criteriaShapeByKey[key as CriteriaKey];
  if (!shape) return value; // Unknown keys pass through (engine ignores them)
  const result = shape.safeParse(value);
  if (result.success) return result.data;
  throw new Error(`investor_criteria[${key}] failed validation: ${result.error.message}`);
}

// Bulk validator for the investor JSON editor — returns key-by-key errors.
export function validateInvestorCriteriaRows(
  rows: Array<{ criteria_key: string; criteria_value: unknown }>,
): { ok: boolean; errors: Array<{ index: number; criteria_key: string; message: string }> } {
  const errors: Array<{ index: number; criteria_key: string; message: string }> = [];
  rows.forEach((row, index) => {
    const result = parseCriteriaValueV1(row.criteria_key, row.criteria_value);
    if (result.error) {
      errors.push({
        index,
        criteria_key: row.criteria_key,
        message: result.error.message,
      });
    }
  });
  return { ok: errors.length === 0, errors };
}

// ── *_signals.signal_value ────────────────────────────────────────────────
// Signal values are open-ended by signal_key. We define a few well-known
// shapes for built-in keys and fall through to z.unknown() for forward-compat.

const knownSignalShapes: Record<string, z.ZodTypeAny> = {
  is_primary_residence: z.boolean(),
  occupancy_role: z.enum(["owner_occupied", "absentee", "rented", "unknown"]),
  lender_classification_override: z.enum(["bank", "bridge", "private_credit"]),
  bitcoin_source: z.boolean(),
  actually_active: z.boolean(),
};

export function parseSignalValueV1(
  signalKey: string,
  value: unknown,
): { data: unknown; error: z.ZodError | null; known: boolean } {
  const shape = knownSignalShapes[signalKey];
  if (!shape) return { data: value, error: null, known: false };
  const result = shape.safeParse(value);
  if (result.success) return { data: result.data, error: null, known: true };
  return { data: null, error: result.error, known: true };
}

export function parseSignalValueV1Strict(signalKey: string, value: unknown): unknown {
  const shape = knownSignalShapes[signalKey];
  if (!shape) return value;
  const result = shape.safeParse(value);
  if (result.success) return result.data;
  throw new Error(`signal[${signalKey}] failed validation: ${result.error.message}`);
}

// ── risk_factors.contributing_data ────────────────────────────────────────
// Free-form by factor_key. Loose shape with optional well-known keys —
// validates that we're not stuffing crazy values in.

export const contributingDataV1 = z
  .object({
    schema_version: schemaVersion.optional(), // optional in this column — not always set
  })
  .catchall(z.unknown());
export type ContributingDataV1 = z.infer<typeof contributingDataV1>;
export const parseContributingDataV1 = safe(contributingDataV1);
export const parseContributingDataV1Strict = strict(contributingDataV1, "contributing_data");

// ── monitor_runs.changes ──────────────────────────────────────────────────

export const monitorChangeV1 = z.object({
  field: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  source: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
});
export type MonitorChangeV1 = z.infer<typeof monitorChangeV1>;

export const monitorChangesV1 = z.object({
  schema_version: schemaVersion,
  changes: z.array(monitorChangeV1),
});
export type MonitorChangesV1 = z.infer<typeof monitorChangesV1>;
export const parseMonitorChangesV1 = safe(monitorChangesV1);

// ── monitor_runs.adapter_results (column ships in PR 4) ───────────────────

export const adapterResultV1 = z.object({
  status: z.enum(["ok", "rate_limited", "failed", "skipped"]),
  error: z.string().optional(),
});

export const adapterResultsV1 = z.object({
  schema_version: schemaVersion,
  entity: adapterResultV1,
  litigation: adapterResultV1,
  sanctions: adapterResultV1,
});
export type AdapterResultsV1 = z.infer<typeof adapterResultsV1>;
export const parseAdapterResultsV1 = safe(adapterResultsV1);

// ── activity_events.metadata (X3) ─────────────────────────────────────────
// Free-form jsonb keyed by verb. Caller stamps a small subset of well-known
// shapes; everything else passes through. Validate the shapes that callers
// actually rely on so the activity feed UI can render predictably.

const tierEnum = z.enum(["low", "medium", "high"]);

export const activityMetadataByVerb = {
  changed_tier: z.object({
    from_tier: tierEnum.nullable(),
    to_tier: tierEnum,
    triggering_signal_id: z.string().uuid().optional(),
  }),
  applied_signal: z.object({
    signal_key: z.string(),
    scope: z.enum(["borrower", "property", "borrower_property", "entity"]),
    affected_validations: z.number().int().nonnegative().optional(),
  }),
  ran_monitor: z.object({
    subscription_id: z.string().uuid(),
    changes_count: z.number().int().nonnegative(),
    status: z.enum(["clean", "changes_found", "error"]),
  }),
  uploaded_document: z.object({
    purpose: z.string(),
    related_entity_type: z.string().optional(),
    related_entity_id: z.string().uuid().optional(),
  }),
  compared: z.object({
    against_validation_id: z.string().uuid(),
  }),
  evaluated_deal: z.object({
    deal_evaluation_id: z.string().uuid(),
    investors_evaluated: z.number().int().nonnegative(),
    pass_count: z.number().int().nonnegative().optional(),
  }),
  sent_handoff: z.object({
    artifact: z.enum(["excel", "pdf", "html"]),
  }),
} as const;

export function parseActivityMetadata(
  verb: string,
  metadata: unknown,
): { data: unknown; error: z.ZodError | null; known: boolean } {
  const shape = activityMetadataByVerb[verb as keyof typeof activityMetadataByVerb];
  if (!shape) return { data: metadata, error: null, known: false };
  const result = shape.safeParse(metadata);
  if (result.success) return { data: result.data, error: null, known: true };
  return { data: null, error: result.error, known: true };
}

// ── notification_preferences (X2) ─────────────────────────────────────────
// The columns themselves enforce shape via CHECK; we still expose Zod
// schemas for API request/response handlers.

export const notificationChannelV1 = z.enum(["email", "slack", "teams", "sms", "webhook"]);
export const notificationEventTypeV1 = z.enum([
  "monitor_change",
  "tier_changed",
  "signal_applied",
  "deal_evaluated",
  "photo_uploaded",
  "bank_statement_uploaded",
  "inbox_submission",
  "handoff_sent",
  "expected_close_reminder",
  "consensus_match",
]);

export const upsertNotificationPreferenceBodyV1 = z.object({
  channel: notificationChannelV1,
  event_type: notificationEventTypeV1,
  enabled: z.boolean(),
  target_address: z.string().min(1),
});
export type UpsertNotificationPreferenceBodyV1 = z.infer<typeof upsertNotificationPreferenceBodyV1>;

// ── documents.ai_extraction (X1) ──────────────────────────────────────────
// Discriminated by purpose. Each consumer writes its own extraction shape.
// We keep the top-level catch-all loose because new purposes ride along
// without redeploys.

export const documentAiExtractionV1 = z
  .object({
    schema_version: schemaVersion.optional(),
  })
  .catchall(z.unknown());
export type DocumentAiExtractionV1 = z.infer<typeof documentAiExtractionV1>;

// ── uw_models.inputs / .sizing / .judgment (Module 10 + 6) ─────────────────
// Underwriting Workbench: deal-level loan-sizing inputs, the engine's sized
// result, and the AI judgment. Shapes mirror src/lib/underwriting/{sizing,types}.ts
// 1:1 (the engine is the source of truth — these validate what we persist).

export const uwSizingInputsV1 = z.object({
  schema_version: schemaVersion,
  name: z.string().optional(),
  purchasePrice: z.number(),
  rehabBudget: z.number().optional(),
  closingCosts: z.number().optional(),
  costSpentToDate: z.number().optional(), // finding #16 — basis for in-progress refis
  currentNOI: z.number(),
  stabilizedNOI: z.number().optional(),
  goingInCapRate: z.number(),
  exitCapRate: z.number().optional(),
  rate: z.number(),
  termMonths: z.number().optional(),
  amortizationMonths: z.number().optional(),
  maxLTV: z.number().optional(),
  maxLTC: z.number().optional(),
  maxLoanToARV: z.number().optional(),
  minDSCR: z.number().optional(),
  minDebtYield: z.number().optional(),
  coverageBasis: z.enum(["current", "stabilized"]).optional(),
  sellingCostPct: z.number().optional(),
});
export type UwSizingInputsV1 = z.infer<typeof uwSizingInputsV1>;
export const parseUwSizingInputsV1Strict = strict(uwSizingInputsV1, "uw_models.inputs");

const uwConstraintV1 = z.object({
  key: z.enum(["LTV", "LTC", "LoanToARV", "DSCR", "DebtYield"]),
  label: z.string(),
  maxLoan: z.number(),
  binding: z.boolean(),
  basis: z.string(),
});

// Exit / takeout sizing (src/lib/underwriting/exit.ts) — the permanent-loan
// takeout at stabilization tested against the bridge balance. Optional: only
// present when the deal carries stabilized economics (stabilizedNOI + exit cap).
const uwTakeoutConstraintV1 = z.object({
  key: z.enum(["PermLTV", "PermDSCR", "PermDebtYield"]),
  label: z.string(),
  maxLoan: z.number(),
  binding: z.boolean(),
  basis: z.string(),
});
// Refi NOI-stress grid (src/lib/underwriting/exit.ts stressTakeout) — the takeout
// re-sized across NOI haircuts (−0/5/10/15/20%). Optional: present only when the
// deal carries an exit/takeout.
const uwRefiStressRowV1 = z.object({
  haircut: z.number(),
  stabilizedNOI: z.number(),
  stabilizedValue: z.number(),
  maxTakeout: z.number(),
  bindingConstraint: z.enum(["PermLTV", "PermDSCR", "PermDebtYield"]),
  coverage: z.number(),
  refinanceable: z.boolean(),
  shortfall: z.number(),
});
export const uwRefiStressResultV1 = z.object({
  bridgeBalanceAtExit: z.number(),
  baseCoverage: z.number(),
  breakEvenHaircut: z.number().nullable(),
  levels: z.array(uwRefiStressRowV1),
});
export const uwTakeoutResultV1 = z.object({
  stabilizedValue: z.number(),
  bridgeBalanceAtExit: z.number(),
  constraints: z.array(uwTakeoutConstraintV1),
  maxTakeout: z.number(),
  bindingConstraint: z.enum(["PermLTV", "PermDSCR", "PermDebtYield"]),
  permMortgageConstant: z.number(),
  takeoutCoverage: z.number(),
  refinanceable: z.boolean(),
  cushion: z.number(),
  shortfall: z.number(),
  takeoutDSCR: z.number(),
  takeoutDebtYield: z.number(),
  termSufficient: z.boolean().nullable(),
  flags: z.array(z.string()),
  stressGrid: uwRefiStressResultV1.optional(),
});

// Stabilization-path coverage (src/lib/underwriting/stabilization.ts) — the
// temporal "years to 1.20–1.25x DSCR" trend. Optional (needs stabilized NOI).
export const uwStabilizationResultV1 = z.object({
  annualDebtService: z.number(),
  targetDSCR: z.number(),
  years: z.array(
    z.object({
      year: z.number(),
      noi: z.number(),
      dscr: z.number(),
      debtYield: z.number(),
      clearsTarget: z.boolean(),
    }),
  ),
  monthsToClear: z.number().nullable(),
  yearsToClear: z.number().nullable(),
  clearsWithinHorizon: z.boolean(),
  summary: z.string(),
});

// Interest-reserve sizing (src/lib/underwriting/reserve.ts). Optional.
export const uwInterestReserveResultV1 = z.object({
  monthlyDebtService: z.number(),
  reserveMonths: z.number(),
  grossReserve: z.number(),
  noiOffset: z.number(),
  netReserve: z.number(),
  reserveAsPctOfLoan: z.number(),
  summary: z.string(),
});

export const uwSizingResultV1 = z.object({
  schema_version: schemaVersion,
  asIsValue: z.number(),
  stabilizedValue: z.number().nullable(),
  totalProjectCost: z.number(),
  constraints: z.array(uwConstraintV1),
  maxLoan: z.number(),
  bindingConstraint: z.enum(["LTV", "LTC", "LoanToARV", "DSCR", "DebtYield"]),
  equityRequired: z.number(),
  annualDebtService: z.number(),
  mortgageConstant: z.number(),
  ltv: z.number(),
  ltc: z.number(),
  dscrCurrent: z.number(),
  dscrStabilized: z.number().nullable(),
  debtYieldCurrent: z.number(),
  debtYieldStabilized: z.number().nullable(),
  projectProfit: z.number().nullable(),
  equityMultiple: z.number().nullable(),
  returnOnCost: z.number().nullable(),
  developmentSpread: z.number().nullable(),
  takeout: uwTakeoutResultV1.optional(),
  stabilization: uwStabilizationResultV1.optional(),
  interestReserve: uwInterestReserveResultV1.optional(),
});
export type UwSizingResultV1 = z.infer<typeof uwSizingResultV1>;
export const parseUwSizingResultV1Strict = strict(uwSizingResultV1, "uw_models.sizing");

// ── uw_models.structured (UX-2 / UW-7) ─────────────────────────────────────
// The deal-type-aware STRUCTURED result: the dispatcher routes a deal's loan_type
// to one of {rtl, construction, dscr} and returns a mode-specific structured deal
// (proceeds waterfall / Sources+Uses / DSCR sizing) that does NOT fit the bridge-
// shaped `sizing` column above. Persisted in the nullable `structured` column
// (migration 00052), null for bridge-only models.
//
// DESIGN: we store a strictly-typed ENVELOPE (schema_version + mode + a raw echo
// of the sized inputs) wrapping the engine's `result` as a versioned payload.
// The engine modules (src/lib/underwriting/{rtl-sizer,construction-sizer,dscr-sizer}.ts)
// are the single source of truth for the result shape and are covered to the penny
// by scripts/verify-*.ts — hand-mirroring their 40+ fields here would only create a
// second definition that can silently drift (the very failure principle 9 warns
// about). The envelope is validated strictly; the payload is engine-owned + tested.
export const uwStructuredModeV1 = z.enum(["rtl", "construction", "dscr"]);
export const uwStructuredResultV1 = z.object({
  schema_version: schemaVersion,
  mode: uwStructuredModeV1,
  loanType: z.string().nullable().optional(), // the raw Nexys loan_type that routed here
  inputs: z.record(z.string(), z.unknown()), // audit echo of the sized inputs (validated at the API boundary)
  result: z.record(z.string(), z.unknown()), // the mode's structured result — engine-owned, penny-tested
});
export type UwStructuredResultV1 = z.infer<typeof uwStructuredResultV1>;
export const parseUwStructuredResultV1Strict = strict(uwStructuredResultV1, "uw_models.structured");

// The human override layer (UW-7 Tier-2, migration 00053) — named ± dollar
// adjustments to the engine's sized loan → a final approved loan. The engine
// sizes; the underwriter (never AI) applies explicit, labeled, audited overrides.
export const uwAdjustmentItemV1 = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().finite(), // signed dollars: +increase / −reduce the loan
  reason: z.string().max(500).optional(),
});
export const uwAdjustmentsV1 = z.object({
  schema_version: schemaVersion,
  base_loan: z.number(), // the engine-sized loan the adjustments start from
  items: z.array(uwAdjustmentItemV1).max(50),
  final_loan: z.number(), // base_loan + Σ items (recomputed + stored server-side)
});
export type UwAdjustmentItemV1 = z.infer<typeof uwAdjustmentItemV1>;
export type UwAdjustmentsV1 = z.infer<typeof uwAdjustmentsV1>;
export const parseUwAdjustmentsV1Strict = strict(uwAdjustmentsV1, "uw_models.adjustments");

const uwDimensionReadV1 = z.object({
  dimension: z.enum(["sponsor", "economics", "market", "structure", "exit"]),
  severity: z.enum(["strength", "neutral", "concern", "dealkiller"]),
  read: z.string(),
  flags: z.array(z.string()),
});

// Deterministic macro overlay (FRED) stamped onto the judgment server-side — the
// drill-down evidence behind the memo's regime read (src/lib/macro/fred.ts).
const uwMacroIndicatorV1 = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  asOf: z.string().nullable(),
  read: z.string(),
  signal: z.enum(["supportive", "neutral", "caution", "warning"]),
});
export const uwMacroContextV1 = z.object({
  asOf: z.string(),
  regime: z.string(),
  regimeBasis: z.string(),
  indicators: z.array(uwMacroIndicatorV1),
  source: z.string(),
});

// The shape Claude must return for the AI judgment. Validated post-parse so a
// malformed model response can't poison the column (mirrors the ai_analysis
// parser discipline). `model` + schema_version + macro are stamped server-side.
export const uwJudgmentV1 = z.object({
  schema_version: z.literal(1).default(1),
  headline: z.string(),
  framework: z.array(uwDimensionReadV1),
  dealKillers: z.array(z.string()),
  fiveConcept: z.string(),
  recommendation: z.object({
    stance: z.enum(["pursue", "pursue-with-conditions", "pass"]),
    rationale: z.string(),
  }),
  memo: z.string(),
  model: z.string(),
  macro: uwMacroContextV1.nullish(),
});
export type UwJudgmentV1 = z.infer<typeof uwJudgmentV1>;
export const parseUwJudgmentV1 = safe(uwJudgmentV1);
export const parseUwJudgmentV1Strict = strict(uwJudgmentV1, "uw_models.judgment");

// ── investor_mandates.gates ────────────────────────────────────────────────
// A fund's diligence standard. Every gate is optional — an empty mandate
// passes everything; the lender opts into the constraints that matter to the
// fund. risk-tier order is LOW < MEDIUM < HIGH; experience_tier is 1 (most
// experienced) … 4 (none), so max_experience_tier is the WORST acceptable.
export const mandateGatesV1 = z.object({
  schema_version: schemaVersion,
  max_risk_tier: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  require_sos_active: z.boolean().optional(),
  disallow_active_litigation: z.boolean().optional(),
  disallow_sanctions_hit: z.boolean().optional(),
  max_experience_tier: z.number().int().min(1).max(4).nullable().optional(),
  min_confidence_score: z.number().min(0).max(100).nullable().optional(),
  require_gc_active: z.boolean().optional(),
  // When true, the investor's most recent deal eligibility for this validation
  // must be pass/conditional (reuses the evaluate engine — no duplication).
  require_eligibility_pass: z.boolean().optional(),
});
export type MandateGatesV1 = z.infer<typeof mandateGatesV1>;
export const parseMandateGatesV1 = safe(mandateGatesV1);
export const parseMandateGatesV1Strict = strict(mandateGatesV1, "investor_mandates.gates");

// ── mandate_assessments.failures ───────────────────────────────────────────
// One entry per breached gate; [] on a clean pass.
export const mandateFailureV1 = z.object({
  gate: z.string(),
  message: z.string(),
});
export const mandateAssessmentFailuresV1 = z.array(mandateFailureV1);
export type MandateFailureV1 = z.infer<typeof mandateFailureV1>;
