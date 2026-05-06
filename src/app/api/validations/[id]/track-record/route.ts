// POST /api/validations/[id]/track-record — manually add a property
// to the track record. Vendors missed it; lender knows the borrower
// owns it. source='manual' so the handoff distinguishes manual rows
// from vendor-returned ones.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { logEdit } from "@/lib/admin/data-edits";
import { upsertProperty } from "@/lib/domain/upsert";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import { regenerateAiMemoForValidation } from "@/lib/ai/regenerate";

// Audit L2 — explicit shape validation. Previously the route trusted the
// client to send numeric prices / valid date strings; bad inputs flowed
// straight to Postgres which rejected with confusing "invalid input
// syntax" errors.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .nullish();
// Hold months realistically capped at 50 years; prices at $50M (above
// which a manual entry is almost certainly a typo).
const PostBodySchema = z.object({
  property_address: z.string().trim().min(1).max(500),
  city: z.string().max(120).nullish(),
  state: z.string().max(40).nullish(),
  zip: z.string().max(20).nullish(),
  acquisition_date: isoDate,
  disposition_date: isoDate,
  acquisition_price: z.number().min(0).max(50_000_000).nullish(),
  disposition_price: z.number().min(0).max(50_000_000).nullish(),
  hold_months: z.number().int().min(0).max(600).nullish(),
  profit: z.number().min(-50_000_000).max(50_000_000).nullish(),
  lender_notes: z.string().max(2000).nullish(),
  reason: z.string().max(2000).nullish(),
});
type PostBody = z.infer<typeof PostBodySchema>;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: validationId } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: PostBody;
  try {
    body = PostBodySchema.parse(await request.json());
  } catch (e) {
    const issues = e instanceof z.ZodError ? e.issues : [];
    return NextResponse.json(
      { error: "Invalid body", issues },
      { status: 400 },
    );
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
    addressDisplay: body.property_address,
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
      property_address: body.property_address,
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

  const recomputed = await recomputeRiskFactorsForValidation(supabase, validationId);
  void regenerateAiMemoForValidation(supabase, validationId, {
    factors: recomputed?.factors,
    tier: recomputed?.tier,
  }).catch(() => {});

  return NextResponse.json({ id: row.id, property_id: propertyId }, { status: 201 });
}
