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

// Owner/admin-only patch for the org's AI extraction toggle. Kept on the
// existing /api/settings route so the UI's GET + PATCH share a path; if
// more org-level toggles land later, split into a dedicated endpoint.
export async function PATCH(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: { ai_extraction_enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.ai_extraction_enabled !== "boolean") {
    return NextResponse.json(
      { error: "ai_extraction_enabled must be boolean" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      ai_extraction_enabled: body.ai_extraction_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.org_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ai_extraction_enabled: body.ai_extraction_enabled });
}
