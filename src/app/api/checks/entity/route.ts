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
        created_by: user.id,
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
