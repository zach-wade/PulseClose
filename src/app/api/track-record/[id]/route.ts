// PATCH /api/track-record/[id] — edit a single track-record row.
// DELETE /api/track-record/[id] — remove a row entirely (use for
// vendor-returned rows the lender knows are wrong).
//
// Editable fields:
//   acquisition_date, disposition_date,
//   acquisition_price, disposition_price, hold_months, profit,
//   lender_id, lender_notes
//
// Each field change writes a data_edits row. Recompute fires on
// successful edit so factors + tier rebuild from the corrected data.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { logEdit, logEdits } from "@/lib/admin/data-edits";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import { regenerateAiMemoForValidation } from "@/lib/ai/regenerate";

const EDITABLE_FIELDS = [
  "acquisition_date",
  "disposition_date",
  "acquisition_price",
  "disposition_price",
  "hold_months",
  "profit",
  "lender_id",
  "lender_notes",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

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

  const supabase = createAdminClient();
  // Load + verify org ownership.
  const { data: row } = await supabase
    .from("track_record_entries")
    .select(
      "id, validation_id, acquisition_date, disposition_date, acquisition_price, disposition_price, hold_months, profit, lender_id, lender_notes",
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
    return NextResponse.json({ error: "no editable fields in body" }, { status: 400 });
  }

  const { error } = await supabase
    .from("track_record_entries")
    .update(updates)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log — one row per field changed, written as a single bulk
  // INSERT so a partial mid-loop failure can't leave the audit half-
  // written (the row update was already committed; we want audit to be
  // all-or-none for this edit).
  await logEdits(
    supabase,
    (Object.keys(updates) as EditableField[]).map((field) => ({
      orgId: profile.org_id,
      validationId: row.validation_id,
      tableName: "track_record_entries",
      rowId: id,
      fieldName: field,
      valueBefore: (row as Record<string, unknown>)[field] ?? null,
      valueAfter: updates[field] ?? null,
      editKind: "update",
      reason: body.reason ?? null,
      editedByUserId: profile.id,
    })),
  );

  // Recompute + regenerate. Pass the recompute result into regen so it
  // doesn't re-fetch + re-derive the factor list immediately after we
  // just wrote it. Memo regen stays fire-and-forget.
  const recomputed = await recomputeRiskFactorsForValidation(supabase, row.validation_id);
  void regenerateAiMemoForValidation(supabase, row.validation_id, {
    factors: recomputed?.factors,
    tier: recomputed?.tier,
  }).catch((err: unknown) => {
    console.warn("[track-record edit] memo regen failed:", err);
  });

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
    .from("track_record_entries")
    .select("id, validation_id, property_address, source")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete first, then log. If the audit insert fails the row is already
  // gone — better than the inverse (phantom audit pointing at a still-
  // present row). The selected `row` snapshot is captured above so we
  // still have the before-content for the audit even after the delete.
  const { error } = await supabase
    .from("track_record_entries")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEdit(supabase, {
    orgId: profile.org_id,
    validationId: row.validation_id,
    tableName: "track_record_entries",
    rowId: id,
    fieldName: "_row",
    valueBefore: row,
    valueAfter: null,
    editKind: "delete",
    reason,
    editedByUserId: profile.id,
  });

  const recomputed = await recomputeRiskFactorsForValidation(supabase, row.validation_id);
  void regenerateAiMemoForValidation(supabase, row.validation_id, {
    factors: recomputed?.factors,
    tier: recomputed?.tier,
  }).catch(() => {});

  return NextResponse.json({ id });
}
