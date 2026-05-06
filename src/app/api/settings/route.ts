import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();

  // Get org details
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.org_id)
    .single();

  // Get team members
  const { data: team } = await supabase
    .from("users")
    .select("id, email, full_name, role, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
    },
    org: org ?? null,
    team: team ?? [],
  });
}

// Owner/admin-only patch for org-level toggles. Each field is optional so
// the UI can flip one without resending the rest. Currently supports:
//   - ai_extraction_enabled (00022) — gate all Claude API calls
//   - monitor_new_validations_by_default (00026) — auto-monitor new validations
export async function PATCH(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: {
    ai_extraction_enabled?: unknown;
    monitor_new_validations_by_default?: unknown;
    monitor_paused_until?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ("ai_extraction_enabled" in body) {
    if (typeof body.ai_extraction_enabled !== "boolean") {
      return NextResponse.json(
        { error: "ai_extraction_enabled must be boolean" },
        { status: 400 },
      );
    }
    update.ai_extraction_enabled = body.ai_extraction_enabled;
  }
  if ("monitor_new_validations_by_default" in body) {
    if (typeof body.monitor_new_validations_by_default !== "boolean") {
      return NextResponse.json(
        { error: "monitor_new_validations_by_default must be boolean" },
        { status: 400 },
      );
    }
    update.monitor_new_validations_by_default = body.monitor_new_validations_by_default;
  }
  if ("monitor_paused_until" in body) {
    if (
      body.monitor_paused_until !== null &&
      typeof body.monitor_paused_until !== "string"
    ) {
      return NextResponse.json(
        { error: "monitor_paused_until must be ISO string or null" },
        { status: 400 },
      );
    }
    update.monitor_paused_until = body.monitor_paused_until;
  }
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "No supported fields in body" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organizations")
    .update(update)
    .eq("id", profile.org_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...update });
}
