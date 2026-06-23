// Canonical outbound webhook event types + payload envelope (D6 item 1).
//
// The set is closed: an endpoint may only subscribe to these, and the
// dispatcher only ever fires these. Keep in sync with the DB-level intent
// in 00043_webhooks.sql and the docs.

export const WEBHOOK_EVENT_TYPES = [
  "validation.completed",
  "tier.changed",
  "outcome.reported",
  "mandate.assessed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isWebhookEventType(s: string): s is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(s);
}

// Every delivered body is this envelope. `data` is event-specific and built
// by the wiring layer (src/lib/webhooks/payloads.ts). schema_version is
// required by the webhook_deliveries CHECK constraint and lets consumers
// version their parsers.
export interface WebhookEnvelope {
  schema_version: 1;
  event: WebhookEventType;
  event_id: string; // the webhook_deliveries row id — idempotency key for consumers
  occurred_at: string; // ISO 8601
  org_id: string;
  data: Record<string, unknown>;
}
