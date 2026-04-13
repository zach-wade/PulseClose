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
  const { entity_name, state } = body;

  if (!entity_name || !state) {
    return NextResponse.json(
      { error: "entity_name and state are required" },
      { status: 400 },
    );
  }

  const adapter = getAdapter();

  try {
    const result = await adapter.lookupEntity({ entity_name, state });

    // Create a lightweight validation record for FK
    const { data: validation } = await supabase
      .from("borrower_validations")
      .insert({
        org_id: profile.org_id,
        borrower_name: entity_name,
        borrower_entity_name: entity_name,
        overall_status: "pending",
        confidence_score: 0,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (validation) {
      await supabase.from("entity_checks").insert({
        validation_id: validation.id,
        entity_name: result.entity_name,
        state: result.state,
        entity_type: result.entity_type,
        sos_status: result.sos_status,
        formation_date: result.formation_date,
        last_filing_date: result.last_filing_date,
        registered_agent: result.registered_agent,
        source_url: result.source_url,
        confidence: result.sos_status === "not_found" ? "low" : "medium",
        flags: result.flags,
        raw_response: result.raw_response,
      });

      await supabase.from("usage_records").insert({
        org_id: profile.org_id,
        validation_id: validation.id,
        check_type: "sos_lookup",
        data_source: "stub",
        cost_cents: 500,
        response_status: "success",
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Entity lookup failed", details: String(err) },
      { status: 500 },
    );
  }
}
