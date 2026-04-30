// Zod schemas for API request bodies. Routes that opt in get a typed,
// validated input shape and a 400 with key-by-key errors on bad input.
//
// Adoption strategy: schemas ship dormant in this file; routes adopt them
// over time without forcing a flag-day migration. Existing routes keep
// their current ad-hoc validation until refactored.

import { z } from "zod";

// ── /api/checks/entity ────────────────────────────────────────────────────

export const entityCheckBodyV1 = z.object({
  entity_name: z.string().min(1),
  state: z.string().length(2),
});
export type EntityCheckBodyV1 = z.infer<typeof entityCheckBodyV1>;

// ── /api/checks/gc ────────────────────────────────────────────────────────

export const gcCheckBodyV1 = z.object({
  gc_name: z.string().min(1),
  license_number: z.string().optional().nullable(),
  state: z.string().length(2),
});
export type GcCheckBodyV1 = z.infer<typeof gcCheckBodyV1>;

// ── /api/checks/track-record ──────────────────────────────────────────────

export const trackRecordCheckBodyV1 = z.object({
  borrower_name: z.string().min(1),
  entity_name: z.string().optional().nullable(),
  state: z.string().length(2).optional().nullable(),
});
export type TrackRecordCheckBodyV1 = z.infer<typeof trackRecordCheckBodyV1>;

// ── /api/checks/litigation ────────────────────────────────────────────────

export const litigationCheckBodyV1 = z.object({
  borrower_name: z.string().min(1),
  entity_name: z.string().optional().nullable(),
});
export type LitigationCheckBodyV1 = z.infer<typeof litigationCheckBodyV1>;

// ── /api/signals ──────────────────────────────────────────────────────────
// Signal POST is the override-and-rerun mechanism. Scope discriminator
// determines which IDs are required.

const signalBaseFields = {
  signal_key: z.string().min(1),
  signal_value: z.unknown(),
  reason: z.string().optional(),
};

export const signalBodyV1 = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("borrower"),
    borrower_id: z.string().uuid(),
    ...signalBaseFields,
  }),
  z.object({
    scope: z.literal("property"),
    property_id: z.string().uuid(),
    ...signalBaseFields,
  }),
  z.object({
    scope: z.literal("borrower_property"),
    borrower_id: z.string().uuid(),
    property_id: z.string().uuid(),
    ...signalBaseFields,
  }),
  z.object({
    scope: z.literal("entity"),
    entity_id: z.string().uuid(),
    ...signalBaseFields,
  }),
]);
export type SignalBodyV1 = z.infer<typeof signalBodyV1>;

// ── /api/investors (POST / PUT criteria rows) ─────────────────────────────

export const investorCriteriaRowV1 = z.object({
  criteria_key: z.string().min(1),
  criteria_value: z.unknown(),
});

export const upsertInvestorBodyV1 = z.object({
  display_name: z.string().min(1),
  type: z.enum(["balance_sheet", "table_funded", "securitizer"]).optional(),
  notes: z.string().optional().nullable(),
  criteria: z.array(investorCriteriaRowV1),
});
export type UpsertInvestorBodyV1 = z.infer<typeof upsertInvestorBodyV1>;

// ── /api/handoff/[id] (PUT) ───────────────────────────────────────────────

export const handoffUpdateBodyV1 = z.object({
  overall_narrative: z.string().optional(),
  preparer_name: z.string().optional(),
  // Loose on purpose. Strict email validation rejected a bare name typed
  // by mistake and surfaced as a confusing "Invalid handoff body" toast.
  // The UI hints at email format inline; the server stores whatever is
  // typed so half-typed values don't lose a save.
  preparer_email: z.string().optional(),
  properties: z
    .record(
      z.string(), // property_id
      z.object({
        rehab_spend: z.number().nullable().optional(),
        gc_name: z.string().nullable().optional(),
        gc_license: z.string().nullable().optional(),
        narrative: z.string().nullable().optional(),
      }),
    )
    .optional(),
});
export type HandoffUpdateBodyV1 = z.infer<typeof handoffUpdateBodyV1>;

// ── /api/monitor/subscriptions (POST/PUT) ─────────────────────────────────

export const monitorSubscriptionBodyV1 = z.object({
  validation_id: z.string().uuid(),
  enabled: z.boolean(),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  notify_emails: z.array(z.string().email()),
});
export type MonitorSubscriptionBodyV1 = z.infer<typeof monitorSubscriptionBodyV1>;

// ── helpers ───────────────────────────────────────────────────────────────

export function badRequestFromZod<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; errors: Array<{ path: string; message: string }> } {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}
