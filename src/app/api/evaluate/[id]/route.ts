// GET /api/evaluate/[id] — fetch a single deal evaluation with all
// per-investor results (for the result page).

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
  const [evalRes, resultsRes, uwRes] = await Promise.all([
    supabase
      .from("deal_evaluations")
      .select("*")
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .single(),
    supabase
      .from("deal_eligibility_results")
      .select("*, investors ( display_name, type )")
      .eq("deal_evaluation_id", id),
    // Latest underwriting model for this evaluation — lets the result page
    // resume the Deal stepper with the saved sizing (incl. exit/takeout),
    // per-investor best-execution, and AI judgment, instead of re-running.
    supabase
      .from("uw_models")
      .select("id, inputs, sizing, per_investor, judgment")
      .eq("deal_evaluation_id", id)
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (evalRes.error || !evalRes.data) {
    return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...evalRes.data,
    results: resultsRes.data ?? [],
    uw_model: uwRes.data ?? null,
  });
}
