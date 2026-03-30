import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, full_name, email, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 400 });
  }

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
      id: user.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
    },
    org: org ?? null,
    team: team ?? [],
  });
}
