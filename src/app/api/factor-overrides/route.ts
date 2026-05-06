// POST /api/factor-overrides — set/update an override for a factor
// DELETE /api/factor-overrides — remove an override (factor goes back
// to engine-derived state)
//
// Both call recomputeRiskFactorsForValidation so the tier + AI memo
// rebuild on the same request.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import { regenerateAiMemoForValidation } from "@/lib/ai/regenerate";
import { emitActivity } from "@/lib/events/emit";

interface PostBody {
  validation_id: string;
  factor_key: string;
  exclusion_reason: string;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PostBody;
  if (!body.validation_id || !body.factor_key || !body.exclusion_reason?.trim()) {
    return NextResponse.json(
      { error: "validation_id, factor_key, exclusion_reason required" },
      { status: 400 },
    );
  }
  if (body.exclusion_reason.length > 1000) {
    return NextResponse.json(
      { error: "exclusion_reason too long (max 1000 chars)" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  // Verify the validation belongs to the caller's org.
  const { data: v } = await supabase
    .from("borrower_validations")
    .select("id")
    .eq("id", body.validation_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!v) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  // UPSERT — same (validation_id, factor_key) replaces the prior reason.
  const { data, error } = await supabase
    .from("factor_overrides")
    .upsert(
      {
        validation_id: body.validation_id,
        org_id: profile.org_id,
        factor_key: body.factor_key,
        excluded: true,
        exclusion_reason: body.exclusion_reason.trim(),
        set_by_user_id: profile.id,
      },
      { onConflict: "validation_id,factor_key" },
    )
    .select("id, factor_key, excluded, exclusion_reason, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recomputed = await recomputeRiskFactorsForValidation(supabase, body.validation_id);
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "overrode_factor",
    subjectType: "validation",
    subjectId: body.validation_id,
    metadata: { factor_key: body.factor_key, reason: body.exclusion_reason.trim() },
  });
  // Memo regeneration is fire-and-forget so the override returns fast;
  // the validation page polls for the new memo.
  void regenerateAiMemoForValidation(supabase, body.validation_id, {
    factors: recomputed?.factors,
    tier: recomputed?.tier,
  }).catch((err: unknown) => {
    console.warn("[factor-overrides] memo regen failed:", err);
  });

  return NextResponse.json({ override: data });
}

export async function DELETE(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const validationId = url.searchParams.get("validation_id");
  const factorKey = url.searchParams.get("factor_key");
  if (!validationId || !factorKey) {
    return NextResponse.json(
      { error: "validation_id and factor_key required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("factor_overrides")
    .delete()
    .eq("validation_id", validationId)
    .eq("factor_key", factorKey)
    .eq("org_id", profile.org_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recomputed = await recomputeRiskFactorsForValidation(supabase, validationId);
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "removed_factor_override",
    subjectType: "validation",
    subjectId: validationId,
    metadata: { factor_key: factorKey },
  });
  void regenerateAiMemoForValidation(supabase, validationId, {
    factors: recomputed?.factors,
    tier: recomputed?.tier,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
