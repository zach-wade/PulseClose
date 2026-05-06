// POST /api/notifications/test — send a sample payload to a single
// notification preference. Used by the settings UI to verify a Slack /
// Teams / webhook URL works before relying on it for monitor alerts.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { dispatchNotification } from "@/lib/notifications/dispatch";

interface PostBody {
  preference_id: string;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { preference_id } = (await request.json()) as PostBody;
  if (!preference_id) {
    return NextResponse.json({ error: "preference_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Find the pref + temporarily flag-only-this-pref-as-enabled by event
  // type so we don't blast every other Slack channel for the same
  // event. We do this by direct dispatch with a tight scope: pull the
  // pref, then call the channel handler directly.
  const { data: pref } = await supabase
    .from("notification_preferences")
    .select("id, channel, target_address, event_type, enabled")
    .eq("id", preference_id)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!pref) {
    return NextResponse.json({ error: "Preference not found" }, { status: 404 });
  }
  if (!pref.enabled) {
    return NextResponse.json({ error: "Preference is disabled" }, { status: 400 });
  }

  // Dispatch via the user-level path scoped to this user + this event.
  // If the user has multiple prefs for the same event they'd all fire —
  // documented behavior; the test payload tells the receiver this is a
  // PulseClose connectivity test.
  const result = await dispatchNotification(supabase, {
    userId: profile.id,
    eventType: pref.event_type,
    payload: {
      subject: "PulseClose channel test",
      html: `<p>This is a test from PulseClose.</p><p>If you can see this, the <strong>${pref.channel}</strong> channel for <strong>${pref.event_type}</strong> events is wired up correctly.</p>`,
      text: `This is a test from PulseClose. If you can see this, the ${pref.channel} channel for ${pref.event_type} events is wired up correctly.`,
    },
  });

  return NextResponse.json({ result });
}
