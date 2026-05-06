// GET /api/public/v1/validations/[id] — full validation detail with
// pillar tables + risk factors + tier + handoff data + outcome.
//
// Mirrors the internal /api/validations/[id] endpoint shape but
// authenticates via API key instead of session.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApiKey } from "@/lib/api/auth";
import { deriveTier, type RiskFactor } from "@/lib/risk/factors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const auth = await resolveApiKey(supabase, request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  // Audit L3 — short-circuit ownership check before kicking off 9 child
  // queries. Previously all 10 ran in parallel; a foreign / missing id
  // still produced 404 to the caller but burnt DB time on the children.
  const validationRes = await supabase
    .from("borrower_validations")
    .select("*")
    .eq("id", id)
    .eq("org_id", auth.org_id)
    .single();
  if (validationRes.error || !validationRes.data) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  const [
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
      .eq("validation_id", id),
    supabase
      .from("litigation_cases")
      .select("*")
      .eq("validation_id", id),
    supabase
      .from("gc_validations")
      .select("*")
      .eq("validation_id", id),
    supabase
      .from("sanctions_checks")
      .select("*")
      .eq("validation_id", id),
    supabase
      .from("verified_flips")
      .select("*")
      .eq("validation_id", id),
    supabase
      .from("risk_factors")
      .select("*")
      .eq("validation_id", id),
    supabase
      .from("deal_outcomes")
      .select("status, outcome_data, created_at, updated_at")
      .eq("validation_id", id)
      .maybeSingle(),
  ]);

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
