// GET  /api/validations/[id]/mandate-assessments — read persisted stamps
// POST /api/validations/[id]/mandate-assessments — re-assess on demand
//
// The auto-assessment fires inside the validation pipeline; this is the
// read surface for the detail card + the lender's "re-assess" action.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { assessValidationMandates } from "@/lib/mandates/assess";

async function orgOwnsValidation(
  supabase: ReturnType<typeof createAdminClient>,
  validationId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("borrower_validations")
    .select("id")
    .eq("id", validationId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("mandate_assessments")
    .select("id, mandate_id, investor_id, result, failures, assessed_at, investor_mandates ( name ), investors ( display_name )")
    .eq("validation_id", id)
    .eq("org_id", profile.org_id)
    .order("assessed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const assessments = (data ?? []).map((a) => {
    const mj = a.investor_mandates as { name: string } | { name: string }[] | null;
    const ij = a.investors as { display_name: string } | { display_name: string }[] | null;
    return {
      id: a.id,
      mandate_id: a.mandate_id,
      investor_id: a.investor_id,
      mandate_name: Array.isArray(mj) ? mj[0]?.name ?? null : mj?.name ?? null,
      investor_name: Array.isArray(ij) ? ij[0]?.display_name ?? null : ij?.display_name ?? null,
      result: a.result,
      failures: a.failures,
      assessed_at: a.assessed_at,
    };
  });
  return NextResponse.json({ assessments });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!(await orgOwnsValidation(supabase, id, profile.org_id))) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  const assessments = await assessValidationMandates(supabase, profile.org_id, id);
  return NextResponse.json({ assessments });
}
