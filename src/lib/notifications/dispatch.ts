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
    } else {
      // slack/teams/sms/webhook — implemented when a feature first needs.
      console.info(`[dispatch] channel ${pref.channel} not yet implemented; skipping`);
      skipped++;
    }
  }

  return { total: rows.length, sent, failed, skipped };
}
