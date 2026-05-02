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
});
export type HandoffDataV1 = z.infer<typeof handoffDataV1>;
export const parseHandoffDataV1 = safe(handoffDataV1);
export const parseHandoffDataV1Strict = strict(handoffDataV1, "handoff_data");

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
