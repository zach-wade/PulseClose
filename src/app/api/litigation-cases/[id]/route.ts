// PATCH /api/litigation-cases/[id] — edit a litigation case row.
// DELETE /api/litigation-cases/[id] — remove the case (vendor returned
// it but it's a different person, or it was already dismissed).
//
// Editable fields:
//   case_name, case_number, court, filed_at, terminated_at,
//   nature_of_suit, category, status, dollar_amount_estimated,
//   lender_notes
//
// Note: editing a case doesn't directly re-derive the active_fed_litigation
// factor (that reads from litigation_checks, not litigation_cases). To
// exclude the factor, use POST /api/factor-overrides on
// active_fed_litigation. Editing a case here updates the displayed
// data + audit trail.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { logEdit, logEdits } from "@/lib/admin/data-edits";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import { regenerateAiMemoForValidation } from "@/lib/ai/regenerate";

const EDITABLE_FIELDS = [
  "case_name",
  "case_number",
  "court",
  "filed_at",
  "terminated_at",
  "nature_of_suit",
  "category",
  "status",
  "dollar_amount_estimated",
  "lender_notes",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

const VALID_CATEGORIES = ["bankruptcy", "civil", "lien", "tax", "foreclosure", "other"];
const VALID_STATUSES = ["pending", "closed", "discharged", "dismissed", "judgment", "unknown"];

interface PatchBody {
  reason?: string;
  fields: Partial<Record<EditableField, unknown>>;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PatchBody;
  if (!body.fields || typeof body.fields !== "object") {
    return NextResponse.json({ error: "fields object required" }, { status: 400 });
  }

  if (
    "category" in body.fields &&
    typeof body.fields.category === "string" &&
    !VALID_CATEGORIES.includes(body.fields.category)
  ) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (
    "status" in body.fields &&
    typeof body.fields.status === "string" &&
    !VALID_STATUSES.includes(body.fields.status)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("litigation_cases")
    .select(
      "id, validation_id, case_name, case_number, court, filed_at, terminated_at, nature_of_suit, category, status, dollar_amount_estimated, lender_notes",
    )
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body.fields) {
      updates[field] = body.fields[field] ?? null;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no editable fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("litigation_cases")
    .update(updates)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bulk insert audit rows — see track-record route for the rationale.
  await logEdits(
    supabase,
    (Object.keys(updates) as EditableField[]).map((field) => ({
      orgId: profile.org_id,
      validationId: row.validation_id,
      tableName: "litigation_cases",
      rowId: id,
      fieldName: field,
      valueBefore: (row as Record<string, unknown>)[field] ?? null,
      valueAfter: updates[field] ?? null,
      editKind: "update",
      reason: body.reason ?? null,
      editedByUserId: profile.id,
    })),
  );

  // Memo regen so the AI memo narrative reflects the corrected case
  // data even though the factor doesn't directly recompute (engine
  // reads litigation_checks). Recompute is still cheap and rebuilds
  // tier from a fresh read.
  await recomputeRiskFactorsForValidation(supabase, row.validation_id);
  void regenerateAiMemoForValidation(supabase, row.validation_id).catch(() => {});

  return NextResponse.json({ id, updated_fields: Object.keys(updates) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") ?? null;

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("litigation_cases")
    .select("id, validation_id, case_name, case_number, source")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete first, then log — see track-record route for the rationale.
  // Captured `row` above already has the before-content for audit.
  const { error } = await supabase
    .from("litigation_cases")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEdit(supabase, {
    orgId: profile.org_id,
    validationId: row.validation_id,
    tableName: "litigation_cases",
    rowId: id,
    fieldName: "_row",
    valueBefore: row,
    valueAfter: null,
    editKind: "delete",
    reason,
    editedByUserId: profile.id,
  });

  // Recompute + memo regen so the UI / handoff / methodology reflect the
  // lender's deletion. The factors engine reads from litigation_checks,
  // not litigation_cases, so factor severity won't change — but the
  // litigation_cases display + AI memo narrative will.
  await recomputeRiskFactorsForValidation(supabase, row.validation_id);
  void regenerateAiMemoForValidation(supabase, row.validation_id).catch(() => {});

  return NextResponse.json({ id });
}
