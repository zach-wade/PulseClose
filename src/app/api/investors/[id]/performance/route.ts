// GET /api/investors/[id]/performance — A4 investor performance + A5 rate history.
// Org-scoped via investors.org_id.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { getInvestorPerformance } from "@/lib/investors/performance";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const performance = await getInvestorPerformance(supabase, id, profile.org_id);
  if (!performance) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }
  return NextResponse.json({ performance });
}
