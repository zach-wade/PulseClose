// GET /api/underwrite/assumptions — the org's RESOLVED underwriting assumptions
// (stored-over-app-defaults), so the deal stepper can seed a fresh deal on this
// org's house box instead of code literals (principle 14). Read-only; edits go
// through PATCH /api/settings.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { resolveUwAssumptions } from "@/lib/underwriting/org-assumptions";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("underwriting_assumptions")
    .eq("id", profile.org_id)
    .maybeSingle();

  return NextResponse.json({ assumptions: resolveUwAssumptions(org?.underwriting_assumptions) });
}
