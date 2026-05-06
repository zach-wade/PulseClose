// Notification dispatch — single fan-out layer for every outbound alert.
// Reads notification_preferences for the (user_id, event_type) tuple and
// dispatches via the configured channel(s).
//
// Today: only `email` channel is implemented (uses existing Resend wrapper).
// Slack/Teams/SMS/webhook ride along when first feature requests them.
//
// Design note: each event has an "audience" — for monitor_change, that's
// every user subscribed to monitor_change for the validation's org. For
// signal_applied, it's the actor. The caller picks the audience by
// providing user_id (single user) or org_id+event_type (broadcast to all
// users in the org with that pref enabled).

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";

export type NotificationChannel = "email" | "slack" | "teams" | "sms" | "webhook";

export type NotificationEventType =
  | "monitor_change"
  | "tier_changed"
  | "signal_applied"
  | "deal_evaluated"
  | "photo_uploaded"
  | "bank_statement_uploaded"
  | "inbox_submission"
  | "handoff_sent"
  | "expected_close_reminder"
  | "consensus_match";

export interface NotificationPayload {
  subject: string;
  html: string;
  text?: string;
}

export interface DispatchOptions {
  // Audience: either a specific user, or broadcast to every user in the
  // org who has this event_type enabled. Provide one or the other.
  userId?: string;
  orgId?: string;
  eventType: NotificationEventType;
  payload: NotificationPayload;
}

interface PreferenceRow {
  channel: NotificationChannel;
  target_address: string;
  enabled: boolean;
  user_id: string;
}

/**
 * Dispatch a notification. Returns a per-channel summary of what fired vs
 * skipped. Email is the only channel currently implemented; others are
 * `skipped` until the first feature needs them.
 */
export async function dispatchNotification(
  supabase: SupabaseClient,
  opts: DispatchOptions,
): Promise<{
  total: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  if (!opts.userId && !opts.orgId) {
    throw new Error("dispatchNotification: pass userId or orgId");
  }

  let query = supabase
    .from("notification_preferences")
    .select("channel, target_address, enabled, user_id")
    .eq("event_type", opts.eventType)
    .eq("enabled", true);
  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.orgId) query = query.eq("org_id", opts.orgId);

  const { data: prefs, error } = await query;
  if (error) {
    console.warn(`[dispatch] read prefs failed:`, error.message);
    return { total: 0, sent: 0, failed: 1, skipped: 0 };
  }

  const rows = (prefs ?? []) as PreferenceRow[];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const pref of rows) {
    if (pref.channel === "email") {
      const ok = await sendEmail({
        to: pref.target_address,
        subject: opts.payload.subject,
        html: opts.payload.html,
        text: opts.payload.text,
      });
      if (ok) sent++;
      else failed++;
    } else if (pref.channel === "slack") {
      const ok = await postSlack(pref.target_address, opts.payload);
      if (ok) sent++;
      else failed++;
    } else if (pref.channel === "teams") {
      const ok = await postTeams(pref.target_address, opts.payload);
      if (ok) sent++;
      else failed++;
    } else if (pref.channel === "webhook") {
      const ok = await postWebhook(pref.target_address, opts);
      if (ok) sent++;
      else failed++;
    } else {
      // sms — implemented when a feature first needs.
      console.info(`[dispatch] channel ${pref.channel} not yet implemented; skipping`);
      skipped++;
    }
  }

  return { total: rows.length, sent, failed, skipped };
}

// Slack incoming webhook. Payload is a simple text + blocks shape — Slack
// renders HTML poorly, so we send the plain-text version with a bold
// subject as the first block. Webhook URL is the secret; we don't log it.
async function postSlack(
  webhookUrl: string,
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: payload.subject,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: payload.subject.slice(0, 150) },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: (payload.text ?? htmlToPlain(payload.html)).slice(0, 2900),
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[dispatch] slack POST failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[dispatch] slack POST error:`, e);
    return false;
  }
}

// Teams incoming webhook (legacy connectors + workflow webhooks both
// accept this shape). MessageCard format renders title + plain text.
async function postTeams(
  webhookUrl: string,
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        themeColor: "3B82F6",
        summary: payload.subject.slice(0, 200),
        title: payload.subject,
        text: (payload.text ?? htmlToPlain(payload.html)).slice(0, 2900),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[dispatch] teams POST failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[dispatch] teams POST error:`, e);
    return false;
  }
}

// Generic webhook — sends the full structured payload + event_type so
// the receiver can route. Anyone integrating with their own system gets
// the JSON, not Slack/Teams text.
async function postWebhook(
  webhookUrl: string,
  opts: DispatchOptions,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: opts.eventType,
        org_id: opts.orgId,
        user_id: opts.userId,
        subject: opts.payload.subject,
        html: opts.payload.html,
        text: opts.payload.text,
        sent_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[dispatch] webhook POST failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[dispatch] webhook POST error:`, e);
    return false;
  }
}

// Best-effort HTML→text fallback when payload.text is absent. Strips
// tags + collapses whitespace; keeps line breaks for paragraphs/list
// items so the Slack/Teams output isn't a single wall of text.
function htmlToPlain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
