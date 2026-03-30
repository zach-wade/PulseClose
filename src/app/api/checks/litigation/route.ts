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
  const { entity_name, borrower_name } = body;

  if (!entity_name) {
    return NextResponse.json(
      { error: "entity_name is required" },
      { status: 400 },
    );
  }

  const adapter = getAdapter();

  try {
    const results = await adapter.searchLitigation({
      entity_name,
      borrower_name: borrower_name || entity_name,
    });

    // Create a lightweight validation record for FK
    const { data: validation } = await supabase
      .from("borrower_validations")
      .insert({
        org_id: profile.org_id,
        borrower_name: borrower_name || entity_name,
        borrower_entity_name: entity_name,
        overall_status: "pending",
        confidence_score: 0,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (validation) {
      await supabase.from("litigation_checks").insert(
        results.map((l) => ({
          validation_id: validation.id,
          search_type: l.search_type,
          entity_name: l.entity_name,
          result: l.result,
          details: l.details,
          case_number: l.case_number,
          source: l.source,
          confidence: "medium",
          raw_response: l.raw_response,
        })),
      );

      await supabase.from("usage_records").insert({
        org_id: profile.org_id,
        validation_id: validation.id,
        check_type: "litigation_search",
        data_source: "stub",
        cost_cents: 1000,
        response_status: "success",
      });
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: "Litigation search failed", details: String(err) },
      { status: 500 },
    );
  }
}
