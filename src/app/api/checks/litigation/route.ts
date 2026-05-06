import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { getAdapter } from "@/lib/adapters";
import { checkRateLimit } from "@/lib/rate-limit";
import { upsertBorrower, upsertEntity } from "@/lib/domain/upsert";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`checks:${profile.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const supabase = createAdminClient();

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

    const primaryBorrowerId = await upsertBorrower(supabase, profile.org_id, borrower_name || entity_name);
    const primaryEntityId = await upsertEntity(supabase, profile.org_id, {
      displayName: entity_name,
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
        created_by: profile.id,
        primary_borrower_id: primaryBorrowerId,
        primary_entity_id: primaryEntityId,
      })
      .select("id")
      .single();

    if (validation) {
      await insertOrThrow(
        supabase.from("litigation_checks").insert(
          results.map((l) => ({
            validation_id: validation.id,
            org_id: profile.org_id,
            search_type: l.search_type,
            entity_name: l.entity_name,
            result: l.result,
            details: l.details,
            case_number: l.case_number,
            source: l.source,
            confidence: "medium",
            raw_response: l.raw_response,
            target_entity_id: primaryEntityId,
          })),
        ),
        `litigation_checks insert (validation_id=${validation.id}, count=${results.length})`,
      );

      const hasRealData = results.some(
        (r) =>
          r.source?.includes("CourtListener") ||
          !(r.raw_response as Record<string, unknown>)?._demo,
      );
      await supabase.from("usage_records").insert({
        org_id: profile.org_id,
        validation_id: validation.id,
        check_type: "litigation_search",
        data_source: hasRealData ? "courtlistener" : "stub",
        cost_cents: hasRealData ? 1000 : 0,
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
