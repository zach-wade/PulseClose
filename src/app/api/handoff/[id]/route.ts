// PUT /api/handoff/[id] — write/update the manual handoff fields
// (overall_narrative, preparer info, per-property rehab spend / GC /
// narrative). Stored on borrower_validations.handoff_data jsonb.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";

interface HandoffPropertyManual {
  rehab_spend?: number | null;
  gc_name?: string | null;
  gc_license?: string | null;
  narrative?: string | null;
}

interface HandoffDataBody {
  overall_narrative?: string | null;
  preparer_name?: string | null;
  preparer_email?: string | null;
  properties?: Record<string, HandoffPropertyManual>;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as HandoffDataBody;
  const supabase = createAdminClient();

  // Verify validation belongs to caller's org before writing.
  const { data: existing } = await supabase
    .from("borrower_validations")
    .select("id")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("borrower_validations")
    .update({ handoff_data: body, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id });
}
