import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { getAdapter, getPropertyDataSource } from "@/lib/adapters";
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
  const { borrower_name, entity_name, state } = body;

  if (!borrower_name) {
    return NextResponse.json(
      { error: "borrower_name is required" },
      { status: 400 },
    );
  }

  const adapter = getAdapter();

  try {
    const results = await adapter.searchProperties({
      borrower_name,
      entity_name: entity_name || undefined,
      state: state || undefined,
    });

    // Create a lightweight validation record for FK
    const { data: validation } = await supabase
      .from("borrower_validations")
      .insert({
        org_id: profile.org_id,
        borrower_name,
        borrower_entity_name: entity_name || borrower_name,
        overall_status: "pending",
        confidence_score: 0,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (validation && results.length > 0) {
      await supabase.from("track_record_entries").insert(
        results.map((p) => ({
          validation_id: validation.id,
          property_address: p.property_address,
          acquisition_date: p.acquisition_date,
          disposition_date: p.disposition_date,
          acquisition_price: p.acquisition_price,
          disposition_price: p.disposition_price,
          rehab_cost: null,
          project_type: p.project_type,
          outcome: p.outcome,
          hold_months: p.hold_months,
          profit: p.profit,
          source: p.source,
          confidence: "medium",
          verified: false,
          raw_response: p.raw_response,
        })),
      );

      const dataSource = getPropertyDataSource();
      await supabase.from("usage_records").insert({
        org_id: profile.org_id,
        validation_id: validation.id,
        check_type: "property_search",
        data_source: dataSource,
        cost_cents: dataSource === "stub" ? 0 : 1500,
        response_status: "success",
      });
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: "Property search failed", details: String(err) },
      { status: 500 },
    );
  }
}
