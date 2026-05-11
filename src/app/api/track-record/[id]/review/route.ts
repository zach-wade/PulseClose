// PATCH /api/track-record/[id]/review — confirm or reject a pending
// track-record row from the verify tray. Confirm moves the row into the
// headline table (auto-promotion path). Reject hides it from the headline
// AND from the tray; it stays in the DB so the score-and-promote pass
// won't resurrect it on a future Flow A re-run.
//
// Both actions log to data_edits as a row-level state change, fire the
// factor recompute + AI memo regen so the tier reflects the new headline.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { logEdit } from "@/lib/admin/data-edits";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import { regenerateAiMemoForValidation } from "@/lib/ai/regenerate";

type Action = "confirm" | "reject";

interface PatchBody {
  action: Action;
  reason?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PatchBody;
  if (body.action !== "confirm" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be 'confirm' or 'reject'" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("track_record_entries")
    .select("id, validation_id, review_status, property_address")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.review_status !== "pending_review") {
    return NextResponse.json(
      { error: `cannot review row in status '${row.review_status}'` },
      { status: 409 },
    );
  }

  const nextStatus = body.action === "confirm" ? "confirmed" : "rejected";
  const { error: updErr } = await supabase
    .from("track_record_entries")
    .update({
      review_status: nextStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: profile.id,
    })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logEdit(supabase, {
    orgId: profile.org_id,
    validationId: row.validation_id,
    tableName: "track_record_entries",
    rowId: id,
    fieldName: "review_status",
    valueBefore: "pending_review",
    valueAfter: nextStatus,
    editKind: "update",
    reason: body.reason ?? `${body.action === "confirm" ? "Confirmed" : "Rejected"} via verify tray`,
    editedByUserId: profile.id,
  });

  // Reconfirming changes the headline set + counts; rerunning factors +
  // memo keeps the tier honest.
  try {
    await recomputeRiskFactorsForValidation(supabase, row.validation_id);
    await regenerateAiMemoForValidation(supabase, row.validation_id);
  } catch (err) {
    console.warn(`[track-record review] recompute/regen failed for ${row.validation_id}:`, err);
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
