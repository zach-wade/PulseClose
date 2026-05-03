import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { deriveTier, type RiskFactor } from "@/lib/risk/factors";

// GET /api/validations/[id] — full validation with all check results
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

  // Fetch validation + all related checks in parallel
  const [
    validationRes,
    entityRes,
    trackRecordRes,
    litigationRes,
    litigationCasesRes,
    gcRes,
    sanctionsRes,
    verifiedFlipsRes,
    riskFactorsRes,
    dealOutcomeRes,
  ] = await Promise.all([
    supabase
      .from("borrower_validations")
      .select("*")
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .single(),
    supabase
      .from("entity_checks")
      .select("*")
      .eq("validation_id", id)
      .order("check_date", { ascending: false }),
    supabase
      .from("track_record_entries")
      .select("*, lenders ( id, display_name, classification )")
      .eq("validation_id", id)
      .order("acquisition_date", { ascending: false }),
    supabase
      .from("litigation_checks")
      .select("*")
      .eq("validation_id", id)
      .order("check_date", { ascending: false }),
    supabase
      .from("litigation_cases")
      .select("*")
      .eq("validation_id", id)
      .order("filed_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("gc_validations")
      .select("*")
      .eq("validation_id", id),
    supabase
      .from("sanctions_checks")
      .select("*")
      .eq("validation_id", id)
      .order("check_date", { ascending: false }),
    supabase
      .from("verified_flips")
      .select("*")
      .eq("validation_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("risk_factors")
      .select("*")
      .eq("validation_id", id)
      .order("computed_at", { ascending: false }),
    supabase
      .from("deal_outcomes")
      .select("id, status, outcome_data, lender_user_id, created_at, updated_at")
      .eq("validation_id", id)
      .maybeSingle(),
  ]);

  if (validationRes.error || !validationRes.data) {
    return NextResponse.json(
      { error: "Validation not found" },
      { status: 404 },
    );
  }

  const riskFactors = (riskFactorsRes.data ?? []) as RiskFactor[];
  const tier = deriveTier(riskFactors);

  return NextResponse.json({
    ...validationRes.data,
    entity_checks: entityRes.data ?? [],
    track_record: trackRecordRes.data ?? [],
    litigation_checks: litigationRes.data ?? [],
    litigation_cases: litigationCasesRes.data ?? [],
    gc_validations: gcRes.data ?? [],
    sanctions_checks: sanctionsRes.data ?? [],
    verified_flips: verifiedFlipsRes.data ?? [],
    risk_factors: riskFactors,
    tier,
    deal_outcome: dealOutcomeRes.data ?? null,
  });
}
