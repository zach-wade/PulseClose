// GET /api/notifications/preferences — list current user's prefs
// POST /api/notifications/preferences — create one
// DELETE /api/notifications/preferences?id=... — delete one
//
// Per-user routing layer for monitor changes, signal applications,
// handoff sends, etc. RLS is per-user (or per-org-read for staff
// visibility) per 00017.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";

const VALID_CHANNELS = ["email", "slack", "teams", "sms", "webhook"] as const;
const VALID_EVENT_TYPES = [
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
] as const;

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("id, channel, event_type, target_address, enabled, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferences: data ?? [] });
}

interface PostBody {
  channel: string;
  event_type: string;
  target_address: string;
  enabled?: boolean;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PostBody;
  const channel = body.channel;
  const eventType = body.event_type;
  const target = body.target_address?.trim();

  if (!VALID_CHANNELS.includes(channel as typeof VALID_CHANNELS[number])) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  if (!VALID_EVENT_TYPES.includes(eventType as typeof VALID_EVENT_TYPES[number])) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }
  if (!target) {
    return NextResponse.json({ error: "target_address required" }, { status: 400 });
  }
  // Light shape validation per channel — the dispatch path tolerates
  // failure but a typo at create-time should surface immediately. The
  // email regex is intentionally permissive (RFC 5322 in full is huge);
  // it just rejects the obvious mistakes "a@" / "@b" / "no-at" that
  // .includes("@") used to let through.
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    return NextResponse.json(
      { error: "Email target must look like name@domain.tld" },
      { status: 400 },
    );
  }
  if ((channel === "slack" || channel === "teams" || channel === "webhook") && !target.startsWith("https://")) {
    return NextResponse.json(
      { error: `${channel} target must be an HTTPS webhook URL` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .insert({
      user_id: profile.id,
      org_id: profile.org_id,
      channel,
      event_type: eventType,
      target_address: target,
      enabled: body.enabled ?? true,
    })
    .select("id, channel, event_type, target_address, enabled, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preference: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("notification_preferences")
    .delete()
    .eq("id", id)
    .eq("user_id", profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}
