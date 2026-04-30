// PUT /api/handoff/[id] — write/update the manual handoff fields
// (overall_narrative, preparer info, per-property rehab spend / GC /
// narrative). Stored on borrower_validations.handoff_data jsonb.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { handoffUpdateBodyV1, parseHandoffDataV1Strict } from "@/lib/schemas";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = handoffUpdateBodyV1.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid handoff body",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

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

  // Stamp schema_version on the persisted shape. Strict parse asserts the
  // final stored shape matches the canonical handoff_data schema.
  const stamped = parseHandoffDataV1Strict({ schema_version: 1, ...parsed.data });

  const { error } = await supabase
    .from("borrower_validations")
    .update({ handoff_data: stamped, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id });
}
