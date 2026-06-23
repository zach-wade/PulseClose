// Outbound webhook delivery (D6 item 1).
//
// dispatchWebhookEvent() is the entry point the app calls when a domain
// event happens: it finds the org's enabled endpoints subscribed to that
// event, creates a webhook_deliveries row per endpoint, and attempts each
// delivery best-effort (failures are logged + queued for the retry cron, not
// thrown — a webhook outage must never break the originating request).
//
// Signing: HMAC-SHA256 over the exact JSON body using the endpoint's secret,
// sent as `X-PulseClose-Signature: sha256=<hex>` plus `X-PulseClose-Event`
// and `X-PulseClose-Delivery`. Consumers recompute and compare.
//
// SSRF: every attempt re-validates the URL (DNS-rebinding defense), same as
// the notification webhook channel.

import { createHmac, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSafePublicUrl } from "@/lib/notifications/ssrf";
import type { WebhookEventType, WebhookEnvelope } from "./events";

const MAX_ATTEMPTS = 6;
const TIMEOUT_MS = 10_000;

// Exponential-ish backoff per attempt number (1-indexed). After MAX_ATTEMPTS
// the delivery is marked exhausted.
function backoffMs(attempt: number): number {
  const schedule = [
    60_000, // 1 min
    300_000, // 5 min
    1_800_000, // 30 min
    7_200_000, // 2 hr
    21_600_000, // 6 hr
    86_400_000, // 24 hr
  ];
  return schedule[Math.min(attempt, schedule.length - 1)];
}

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function generateWebhookSecret(): string {
  // 32 url-safe chars; "whsec_" prefix mirrors the api-key prefix convention.
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

interface EndpointRow {
  id: string;
  org_id: string;
  url: string;
  secret: string;
}

interface DeliveryRow {
  id: string;
  org_id: string;
  webhook_endpoint_id: string;
  event_type: string;
  payload: WebhookEnvelope;
  attempts: number;
}

/**
 * Attempt a single delivery (used both for the first send and by the retry
 * cron). Mutates the webhook_deliveries row with the outcome. Never throws.
 */
export async function attemptDelivery(
  supabase: SupabaseClient,
  endpoint: { url: string; secret: string },
  delivery: DeliveryRow,
): Promise<void> {
  const body = JSON.stringify(delivery.payload);
  const attemptNo = delivery.attempts + 1;

  let httpStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    // DNS-rebinding defense — re-resolve + re-check on every attempt.
    await assertSafePublicUrl(endpoint.url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "PulseClose-Webhooks/1",
          "X-PulseClose-Event": delivery.event_type,
          "X-PulseClose-Delivery": delivery.id,
          "X-PulseClose-Signature": `sha256=${signPayload(endpoint.secret, body)}`,
        },
        body,
        signal: controller.signal,
      });
      httpStatus = res.status;
      if (!res.ok) errorMessage = `HTTP ${res.status}`;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const ok = httpStatus != null && httpStatus >= 200 && httpStatus < 300;
  // 4xx (except 408 Request Timeout / 429 Too Many Requests) is a permanent
  // consumer-side error — don't waste retries on a deterministic reject.
  const permanent =
    httpStatus != null && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429;

  let status: "succeeded" | "pending" | "exhausted" | "dead";
  let nextRetryAt: string | null = null;
  if (ok) {
    status = "succeeded";
  } else if (permanent) {
    status = "dead";
  } else if (attemptNo >= MAX_ATTEMPTS) {
    status = "exhausted";
  } else {
    status = "pending";
    nextRetryAt = new Date(Date.now() + backoffMs(attemptNo)).toISOString();
  }

  await supabase
    .from("webhook_deliveries")
    .update({
      status,
      attempts: attemptNo,
      http_status: httpStatus,
      error_message: errorMessage,
      next_retry_at: nextRetryAt,
      delivered_at: ok ? new Date().toISOString() : null,
    })
    .eq("id", delivery.id);
}

/**
 * Fire a domain event to all of an org's subscribed, enabled endpoints.
 * Best-effort: creates a delivery row per endpoint, attempts each in
 * parallel, swallows all errors. Returns the number of endpoints notified.
 */
export async function dispatchWebhookEvent(
  supabase: SupabaseClient,
  orgId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
): Promise<number> {
  const { data: endpoints } = await supabase
    .from("webhook_endpoints")
    .select("id, org_id, url, secret")
    .eq("org_id", orgId)
    .eq("enabled", true)
    .contains("event_types", [eventType]);

  const list = (endpoints ?? []) as EndpointRow[];
  if (list.length === 0) return 0;

  const occurredAt = new Date().toISOString();

  await Promise.allSettled(
    list.map(async (ep) => {
      // Build the envelope without event_id, insert to get the delivery id,
      // then patch event_id into the stored payload so the consumer's
      // idempotency key matches the X-PulseClose-Delivery header.
      const baseEnvelope: Omit<WebhookEnvelope, "event_id"> = {
        schema_version: 1,
        event: eventType,
        occurred_at: occurredAt,
        org_id: orgId,
        data,
      };
      const { data: row, error } = await supabase
        .from("webhook_deliveries")
        .insert({
          org_id: orgId,
          webhook_endpoint_id: ep.id,
          event_type: eventType,
          payload: { ...baseEnvelope, event_id: "pending" },
          status: "pending",
          attempts: 0,
        })
        .select("id")
        .single();
      if (error || !row) return;

      const payload: WebhookEnvelope = { ...baseEnvelope, event_id: row.id };
      await supabase.from("webhook_deliveries").update({ payload }).eq("id", row.id);

      await attemptDelivery(supabase, ep, {
        id: row.id,
        org_id: orgId,
        webhook_endpoint_id: ep.id,
        event_type: eventType,
        payload,
        attempts: 0,
      });
    }),
  );

  return list.length;
}

/**
 * Retry pending deliveries whose backoff window has elapsed. Called by the
 * cron. Re-resolves the endpoint (it may have been disabled/deleted since).
 */
export async function retryPendingDeliveries(
  supabase: SupabaseClient,
  limit = 100,
): Promise<{ attempted: number }> {
  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("webhook_deliveries")
    .select("id, org_id, webhook_endpoint_id, event_type, payload, attempts")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  const rows = (due ?? []) as DeliveryRow[];
  let attempted = 0;

  await Promise.allSettled(
    rows.map(async (d) => {
      const { data: ep } = await supabase
        .from("webhook_endpoints")
        .select("url, secret, enabled")
        .eq("id", d.webhook_endpoint_id)
        .maybeSingle();
      // Endpoint gone or disabled → stop retrying.
      if (!ep || ep.enabled === false) {
        await supabase
          .from("webhook_deliveries")
          .update({ status: "dead", error_message: "endpoint disabled or deleted" })
          .eq("id", d.id);
        return;
      }
      attempted++;
      await attemptDelivery(supabase, { url: ep.url, secret: ep.secret }, d);
    }),
  );

  return { attempted };
}
