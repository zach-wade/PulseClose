// POST /api/underwrite/[id]/judge — run the AI UW Copilot judgment on a
// persisted uw_model.
//
// Explicit, gated step (separate from sizing) so token spend is deliberate and
// the per-org AI privacy toggle is honored. Loads the model's deterministic
// inputs + sizing, runs the judgment through the privacy harness
// (judgeUnderwriting), and persists the validated, unredacted result. The
// qualitative context (sponsor / market / business plan / notes) and the names
// to redact arrive in the request body — context is NOT persisted as raw PII
// beyond what the lender chooses to keep.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiDisabledError } from "@/lib/ai/check-enabled";
import { judgeUnderwriting } from "@/lib/underwriting/judgment";
import {
  parseUwSizingInputsV1Strict,
  parseUwSizingResultV1Strict,
} from "@/lib/schemas/jsonb";
import { updateOrThrow } from "@/lib/supabase/insert-or-throw";
import { emitActivity } from "@/lib/events/emit";
import type { DealContext } from "@/lib/underwriting/types";

interface JudgeBody {
  context?: DealContext;
  redactNames?: {
    borrower_name?: string | null;
    entity_name?: string | null;
    property_address?: string | null;
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`underwrite-judge:${profile.org_id}`, 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  const supabase = createAdminClient();
  const { data: model, error: loadErr } = await supabase
    .from("uw_models")
    .select("id, org_id, inputs, sizing, judgment_version")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!model) return NextResponse.json({ error: "Underwriting model not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as JudgeBody;

  // The AI judgment currently reads the bridge income model. Structured-only
  // models (RTL / construction / DSCR) have null inputs+sizing — judging those
  // through the deal-type engine is a follow-on (Phase 4); surface a clear 422
  // rather than a validation crash.
  if (model.inputs == null || model.sizing == null) {
    return NextResponse.json(
      { error: "AI judgment for structured (fix&flip / ground-up / DSCR) models is not available yet.", code: "STRUCTURED_JUDGE_UNSUPPORTED" },
      { status: 422 },
    );
  }

  // Strict-parse the stored deterministic inputs + sizing (these came from the
  // engine; validation guards against a hand-edited row).
  let inputs, sizing;
  try {
    inputs = parseUwSizingInputsV1Strict(model.inputs);
    sizing = parseUwSizingResultV1Strict(model.sizing);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stored model failed validation" },
      { status: 500 },
    );
  }

  let judgment;
  try {
    judgment = await judgeUnderwriting({
      orgId: profile.org_id,
      inputs,
      sizing,
      context: body.context,
      redactNames: body.redactNames,
    });
  } catch (err) {
    if (err instanceof AiDisabledError) {
      return NextResponse.json(
        {
          error:
            "AI is disabled for your organization. Enable it in Settings to run the underwriting judgment.",
          code: "AI_DISABLED",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Judgment failed" },
      { status: 500 },
    );
  }

  if (!judgment) {
    return NextResponse.json(
      { error: "The AI judgment could not be generated — please try again." },
      { status: 502 },
    );
  }

  await updateOrThrow(
    supabase
      .from("uw_models")
      .update({
        judgment,
        judgment_version: model.judgment_version + 1,
        judgment_model: judgment.model,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", profile.org_id),
    `uw_models judgment update (id=${id})`,
  );

  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "sized_deal",
    subjectType: "uw_model",
    subjectId: id,
    metadata: { uw_model_id: id, judged: true, stance: judgment.recommendation.stance },
  });

  return NextResponse.json({ judgment });
}
