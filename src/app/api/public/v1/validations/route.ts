// GET /api/public/v1/validations — list validations for the API key's org.
//
// Query params:
//   limit (default 50, max 200)
//   offset (default 0)
//   borrower (optional partial-match)
//
// Response: { validations: [...], total, has_more }

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApiKey } from "@/lib/api/auth";

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const auth = await resolveApiKey(supabase, request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const borrower = url.searchParams.get("borrower")?.trim();

  let query = supabase
    .from("borrower_validations")
    .select(
      "id, borrower_name, borrower_entity_name, guarantor_name, overall_status, confidence_score, experience_tier, validation_date, created_at, primary_borrower_id, primary_entity_id",
      { count: "exact" },
    )
    .eq("org_id", auth.org_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (borrower) {
    query = query.ilike("borrower_name", `%${borrower}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    validations: data ?? [],
    total: count ?? 0,
    has_more: count != null ? offset + (data?.length ?? 0) < count : false,
  });
}
