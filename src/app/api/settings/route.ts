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
