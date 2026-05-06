// GET /api/validations/[id]/borrower-uploads — lender-side view of
// the borrower's photo + bank-statement uploads via share link.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // Verify validation belongs to caller's org first.
  const { data: v } = await supabase
    .from("borrower_validations")
    .select("id")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [photosRes, statementsRes] = await Promise.all([
    supabase
      .from("property_photo_verifications")
      .select(
        "id, property_id, exif_lat, exif_lng, exif_timestamp, vision_verdict, vision_notes, distance_from_property_m, verified_at",
      )
      .eq("validation_id", id)
      .order("verified_at", { ascending: false }),
    supabase
      .from("bank_statement_summaries")
      .select(
        "id, ending_balance_cents, avg_daily_balance_cents, monthly_inflow_cents, monthly_outflow_cents, nsf_count, statement_period_start, statement_period_end, created_at",
      )
      .eq("validation_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    photos: photosRes.data ?? [],
    statements: statementsRes.data ?? [],
  });
}
