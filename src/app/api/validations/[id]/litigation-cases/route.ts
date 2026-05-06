// POST /api/validations/[id]/litigation-cases — manually add a case.
// Use when the lender knows about a case the vendors didn't surface
// (state court, county-level, settled-out-of-court). source='manual'
// distinguishes from CourtListener results.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { logEdit } from "@/lib/admin/data-edits";

const VALID_CATEGORIES = ["bankruptcy", "civil", "lien", "tax", "foreclosure", "other"];
const VALID_STATUSES = ["pending", "closed", "discharged", "dismissed", "judgment", "unknown"];

interface PostBody {
  case_name: string;
  case_number?: string | null;
  court?: string | null;
  filed_at?: string | null;
  terminated_at?: string | null;
  nature_of_suit?: string | null;
  category: string;
  status: string;
  dollar_amount_estimated?: number | null;
  lender_notes?: string | null;
  reason?: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: validationId } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PostBody;
  if (!body.case_name?.trim()) {
    return NextResponse.json({ error: "case_name required" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, org_id")
    .eq("id", validationId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!validation) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from("litigation_cases")
    .insert({
      validation_id: validationId,
      org_id: profile.org_id,
      case_name: body.case_name.trim(),
      case_number: body.case_number ?? null,
      court: body.court ?? null,
      filed_at: body.filed_at ?? null,
      terminated_at: body.terminated_at ?? null,
      nature_of_suit: body.nature_of_suit ?? null,
      category: body.category,
      status: body.status,
      dollar_amount_estimated: body.dollar_amount_estimated ?? null,
      lender_notes: body.lender_notes ?? null,
      source: "manual",
      raw: { _manual: true, added_by_user_id: profile.id },
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void logEdit(supabase, {
    orgId: profile.org_id,
    validationId,
    tableName: "litigation_cases",
    rowId: row.id,
    fieldName: "_row",
    valueBefore: null,
    valueAfter: { case_name: body.case_name, category: body.category, source: "manual" },
    editKind: "add",
    reason: body.reason ?? null,
    editedByUserId: profile.id,
  });

  return NextResponse.json({ id: row.id }, { status: 201 });
}
