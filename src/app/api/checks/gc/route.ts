import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/adapters";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 400 });
  }

  const body = await request.json();
  const { gc_name, license_number, state } = body;

  if (!gc_name || !state) {
    return NextResponse.json(
      { error: "gc_name and state are required" },
      { status: 400 },
    );
  }

  const adapter = getAdapter();

  try {
    const result = await adapter.lookupGC({
      gc_name,
      license_number: license_number || undefined,
      state,
    });

    // Create a lightweight validation record for FK
    const { data: validation } = await supabase
      .from("borrower_validations")
      .insert({
        org_id: profile.org_id,
        borrower_name: gc_name,
        borrower_entity_name: gc_name,
        overall_status: "pending",
        confidence_score: 0,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (validation) {
      await supabase.from("gc_validations").insert({
        validation_id: validation.id,
        gc_name: result.gc_name,
        license_number: result.license_number,
        license_state: result.license_state,
        license_status: result.license_status,
        license_classification: result.license_classification,
        expiration_date: result.expiration_date,
        disciplinary_actions: result.disciplinary_actions,
        related_party_flag: false,
        insurance_verified: result.insurance_verified,
        source_url: result.source_url,
        confidence: "medium",
        raw_response: result.raw_response,
      });

      await supabase.from("usage_records").insert({
        org_id: profile.org_id,
        validation_id: validation.id,
        check_type: "gc_lookup",
        data_source: "stub",
        cost_cents: 500,
        response_status: "success",
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "GC lookup failed", details: String(err) },
      { status: 500 },
    );
  }
}
