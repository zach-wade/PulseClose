// G3.4 — Add a GC to an existing validation after-the-fact.
// POST /api/validations/[id]/gc — body: { gc_name, license_number?, gc_state? }
// Runs the GC adapter lookup, inserts a gc_validations row, refreshes the
// cached gc_summary on borrower_validations, and recomputes risk factors
// so the gc_license_issue factor reflects the new contractor. Idempotent
// only at the application level — calling again will create a second
// gc_validations row, which the detail page renders as a list.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { getAdapter, getGCDataSource } from "@/lib/adapters";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildGCSummary } from "@/lib/gc/summary";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import { emitActivity } from "@/lib/events/emit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: validationId } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`gc-add:${profile.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  let body: { gc_name?: string; license_number?: string; gc_state?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const gc_name = body.gc_name?.trim();
  const license_number = body.license_number?.trim() || undefined;
  const gc_state = body.gc_state?.trim().toUpperCase();

  if (!gc_name) {
    return NextResponse.json({ error: "gc_name is required" }, { status: 400 });
  }
  if (!gc_state || gc_state.length !== 2) {
    return NextResponse.json({ error: "gc_state (2-letter code) is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the validation belongs to this org before doing any work.
  const { data: validation, error: vErr } = await supabase
    .from("borrower_validations")
    .select("id, org_id")
    .eq("id", validationId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (vErr || !validation) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  const adapter = getAdapter();
  let gcResult;
  try {
    gcResult = await adapter.lookupGC({
      gc_name,
      license_number,
      state: gc_state,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "GC lookup failed", details: String(err) },
      { status: 502 },
    );
  }

  await insertOrThrow(
    supabase.from("gc_validations").insert({
      validation_id: validationId,
      org_id: profile.org_id,
      gc_name: gcResult.gc_name,
      license_number: gcResult.license_number,
      license_state: gcResult.license_state,
      license_status: gcResult.license_status,
      license_classification: gcResult.license_classification,
      expiration_date: gcResult.expiration_date,
      disciplinary_actions: gcResult.disciplinary_actions,
      related_party_flag: false,
      insurance_verified: gcResult.insurance_verified,
      source_url: gcResult.source_url,
      confidence: "medium",
      raw_response: gcResult.raw_response,
    }),
    `gc_validations insert (validation_id=${validationId}, after-the-fact)`,
  );

  // Refresh the cached gc_summary chip + recompute risk factors so the
  // gc_license_issue factor reflects the new GC.
  const gcSummary = buildGCSummary(gcResult);
  await supabase
    .from("borrower_validations")
    .update({ gc_summary: gcSummary, updated_at: new Date().toISOString() })
    .eq("id", validationId);

  await recomputeRiskFactorsForValidation(supabase, validationId);

  // Usage record (mirrors the validation-creation path).
  const isStub = !!(gcResult.raw_response as Record<string, unknown>)?._demo;
  const dataSource = getGCDataSource(gc_state, license_number);
  await supabase.from("usage_records").insert({
    org_id: profile.org_id,
    validation_id: validationId,
    check_type: "gc_lookup",
    data_source: dataSource,
    cost_cents: isStub || dataSource === "stub" ? 0 : 500,
    response_status: "success",
  });

  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "added_gc",
    subjectType: "validation",
    subjectId: validationId,
    metadata: {
      gc_name: gcResult.gc_name,
      license_number: gcResult.license_number,
      license_state: gcResult.license_state,
      license_status: gcResult.license_status,
    },
  });

  return NextResponse.json({ result: gcResult });
}
