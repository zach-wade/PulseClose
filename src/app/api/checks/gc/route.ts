import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { getAdapter } from "@/lib/adapters";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`checks:${profile.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const supabase = createAdminClient();

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
        created_by: profile.id,
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

      const isStub = !!(result.raw_response as Record<string, unknown>)?._demo;
      await supabase.from("usage_records").insert({
        org_id: profile.org_id,
        validation_id: validation.id,
        check_type: "gc_lookup",
        data_source: isStub ? "stub" : "vendor",
        cost_cents: isStub ? 0 : 500,
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
