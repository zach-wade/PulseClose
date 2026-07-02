// PATCH /api/underwrite/[id]/adjust — persist the human override layer (UW-7
// Tier-2): named ± dollar adjustments to the engine's sized loan → a final
// approved loan.
//
// The deterministic engine sizes the loan; this endpoint lets the underwriter
// (never AI) apply explicit, labeled, audited adjustments the model has no field
// for. The BASE loan is derived SERVER-SIDE from the stored model (bridge
// sizing.maxLoan / structured summarize) so the client can't spoof it; the final
// loan is recomputed + stored. Sending an empty item list clears the override.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateOrThrow } from "@/lib/supabase/insert-or-throw";
import { emitActivity } from "@/lib/events/emit";
import { applyAdjustments } from "@/lib/underwriting/adjustments";
import { summarizeStructured } from "@/lib/underwriting/structured-request";
import type { SizeDealResult } from "@/lib/underwriting/dispatch";
import {
  uwAdjustmentItemV1,
  parseUwSizingResultV1Strict,
  parseUwStructuredResultV1Strict,
} from "@/lib/schemas/jsonb";
import { z } from "zod";

const AdjustBody = z.object({ items: z.array(uwAdjustmentItemV1).max(50) });

/** The engine-sized loan the adjustments start from — derived from the stored
 *  model, never trusted from the client. */
function deriveBaseLoan(model: { sizing: unknown; structured: unknown }): number | null {
  if (model.structured != null) {
    const env = parseUwStructuredResultV1Strict(model.structured);
    const result = { mode: env.mode, result: env.result } as unknown as SizeDealResult;
    return summarizeStructured(result).maxLoan;
  }
  if (model.sizing != null) {
    return parseUwSizingResultV1Strict(model.sizing).maxLoan;
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`underwrite-adjust:${profile.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  const parsed = AdjustBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Invalid adjustments: ${parsed.error.message}` }, { status: 400 });
  }
  const { items } = parsed.data;

  const supabase = createAdminClient();
  const { data: model, error: loadErr } = await supabase
    .from("uw_models")
    .select("id, org_id, sizing, structured")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!model) return NextResponse.json({ error: "Underwriting model not found" }, { status: 404 });

  let baseLoan: number | null;
  try {
    baseLoan = deriveBaseLoan(model);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stored model failed validation" },
      { status: 500 },
    );
  }
  if (baseLoan == null) {
    return NextResponse.json({ error: "This model has no sized loan to adjust." }, { status: 422 });
  }

  // Empty list clears the override.
  const adjustments =
    items.length === 0
      ? null
      : (() => {
          const applied = applyAdjustments(baseLoan, items);
          return { schema_version: 1 as const, base_loan: baseLoan, items, final_loan: applied.finalLoan };
        })();

  await updateOrThrow(
    supabase
      .from("uw_models")
      .update({ adjustments, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", profile.org_id),
    `uw_models adjustments update (id=${id})`,
  );

  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "updated",
    subjectType: "uw_model",
    subjectId: id,
    metadata: adjustments
      ? { action: "adjusted_loan", base_loan: baseLoan, final_loan: adjustments.final_loan, count: items.length }
      : { action: "cleared_loan_adjustments" },
  });

  return NextResponse.json({ adjustments });
}
