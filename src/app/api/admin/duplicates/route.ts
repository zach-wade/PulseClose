// GET /api/admin/duplicates — list canonical-key duplicate groups for
// the caller's org, grouped by entity type.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { findDuplicates } from "@/lib/admin/merge";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const groups = await findDuplicates(supabase, profile.org_id);
  return NextResponse.json({ groups });
}
