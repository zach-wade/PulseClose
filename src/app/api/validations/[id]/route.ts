import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/validations/[id] — full validation with all check results
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch validation + all related checks in parallel
  const [validationRes, entityRes, trackRecordRes, litigationRes, gcRes] =
    await Promise.all([
      supabase.from("borrower_validations").select("*").eq("id", id).single(),
      supabase
        .from("entity_checks")
        .select("*")
        .eq("validation_id", id)
        .order("check_date", { ascending: false }),
      supabase
        .from("track_record_entries")
        .select("*")
        .eq("validation_id", id)
        .order("acquisition_date", { ascending: false }),
      supabase
        .from("litigation_checks")
        .select("*")
        .eq("validation_id", id)
        .order("check_date", { ascending: false }),
      supabase
        .from("gc_validations")
        .select("*")
        .eq("validation_id", id),
    ]);

  if (validationRes.error || !validationRes.data) {
    return NextResponse.json(
      { error: "Validation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ...validationRes.data,
    entity_checks: entityRes.data ?? [],
    track_record: trackRecordRes.data ?? [],
    litigation_checks: litigationRes.data ?? [],
    gc_validations: gcRes.data ?? [],
  });
}
