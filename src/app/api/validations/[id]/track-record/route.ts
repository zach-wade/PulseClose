// POST /api/validations/[id]/track-record — manually add a property
// to the track record. Vendors missed it; lender knows the borrower
// owns it. source='manual' so the handoff distinguishes manual rows
// from vendor-returned ones.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { logEdit } from "@/lib/admin/data-edits";
import { upsertProperty } from "@/lib/domain/upsert";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import { regenerateAiMemoForValidation } from "@/lib/ai/regenerate";

interface PostBody {
  property_address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  acquisition_date?: string | null;
  disposition_date?: string | null;
  acquisition_price?: number | null;
  disposition_price?: number | null;
  hold_months?: number | null;
  profit?: number | null;
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
  if (!body.property_address?.trim()) {
    return NextResponse.json({ error: "property_address required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, org_id, primary_borrower_id")
    .eq("id", validationId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!validation) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  // Upsert through the canonical property dedup so the manual-add row
  // shares a property_id with any vendor-returned row at the same
  // address. Future vendor results enrich the same property.
  const propertyId = await upsertProperty(supabase, profile.org_id, {
    addressDisplay: body.property_address.trim(),
    city: body.city ?? null,
    state: body.state ?? null,
    zip: body.zip ?? null,
  });

  const { data: row, error } = await supabase
    .from("track_record_entries")
    .insert({
      validation_id: validationId,
      org_id: profile.org_id,
      property_id: propertyId,
      property_address: body.property_address.trim(),
      acquisition_date: body.acquisition_date ?? null,
      disposition_date: body.disposition_date ?? null,
      acquisition_price: body.acquisition_price ?? null,
      disposition_price: body.disposition_price ?? null,
      hold_months: body.hold_months ?? null,
      profit: body.profit ?? null,
      lender_notes: body.lender_notes ?? null,
      source: "manual",
      raw_response: { _manual: true, added_by_user_id: profile.id },
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEdit(supabase, {
    orgId: profile.org_id,
    validationId,
    tableName: "track_record_entries",
    rowId: row.id,
    fieldName: "_row",
    valueBefore: null,
    valueAfter: { property_address: body.property_address, source: "manual" },
    editKind: "add",
    reason: body.reason ?? null,
    editedByUserId: profile.id,
  });

  await recomputeRiskFactorsForValidation(supabase, validationId);
  void regenerateAiMemoForValidation(supabase, validationId).catch(() => {});

  return NextResponse.json({ id: row.id, property_id: propertyId }, { status: 201 });
}
