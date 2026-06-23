// GET  /api/public/v1/validations — list validations for the API key's org.
// POST /api/public/v1/validations — create one (async; completion via the
//   validation.completed webhook). The "wire it into our LOS" entry point.
//
// GET query params:
//   limit (default 50, max 200)
//   offset (default 0)
//   borrower (optional partial-match)
//
// GET response: { validations: [...], total, has_more }

import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApiKey } from "@/lib/api/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEffectiveCheckLimit, isOnTrial, TRIAL_CHECK_CAP, getCheckLimit } from "@/lib/stripe/server";
import { withErrorLog } from "@/lib/async/with-error-log";
import { runValidationPipeline } from "@/lib/validations/pipeline";

// after() keeps the pipeline alive past the 202 response.
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const auth = await resolveApiKey(supabase, request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const borrower = url.searchParams.get("borrower")?.trim();

  let query = supabase
    .from("borrower_validations")
    .select(
      "id, borrower_name, borrower_entity_name, guarantor_name, overall_status, confidence_score, experience_tier, validation_date, created_at, primary_borrower_id, primary_entity_id",
      { count: "exact" },
    )
    .eq("org_id", auth.org_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (borrower) {
    query = query.ilike("borrower_name", `%${borrower}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    validations: data ?? [],
    total: count ?? 0,
    has_more: count != null ? offset + (data?.length ?? 0) < count : false,
  });
}

// POST — create a validation. Async: we generate the id, return 202
// immediately, and run the full pipeline (vendor checks → tier → AI memo) in
// after(). The caller learns the result via the validation.completed webhook
// or by polling GET /api/public/v1/validations/{id}.
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const auth = await resolveApiKey(supabase, request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const rl = await checkRateLimit(`public_validations:${auth.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const borrower_name = typeof body?.borrower_name === "string" ? body.borrower_name : "";
  const borrower_entity_name = typeof body?.borrower_entity_name === "string" ? body.borrower_entity_name : "";
  const entity_state = typeof body?.entity_state === "string" ? body.entity_state : "";
  if (!borrower_name || !borrower_entity_name || !entity_state) {
    return NextResponse.json(
      { error: "borrower_name, borrower_entity_name, and entity_state are required" },
      { status: 400 },
    );
  }

  // Plan / trial limit — same gate as the dashboard route.
  const { data: org } = await supabase
    .from("organizations")
    .select("plan, checks_used_this_period, stripe_subscription_id, trial_ends_at")
    .eq("id", auth.org_id)
    .single();
  const plan = org?.plan ?? "starter";
  const checksUsed = org?.checks_used_this_period ?? 0;
  const billing = {
    plan,
    hasSubscription: !!org?.stripe_subscription_id,
    trialEndsAt: org?.trial_ends_at ?? null,
  };
  if (checksUsed >= getEffectiveCheckLimit(billing)) {
    const error = billing.hasSubscription
      ? `Plan limit reached (${getCheckLimit(plan)} checks/month).`
      : isOnTrial(billing)
        ? `Trial check limit reached (${TRIAL_CHECK_CAP}).`
        : "Your free trial has ended. Subscribe to continue.";
    return NextResponse.json({ error, code: "PLAN_LIMIT_REACHED" }, { status: 403 });
  }

  const validationId = randomUUID();
  after(() =>
    withErrorLog(`public.validation[${validationId}]`, () =>
      runValidationPipeline({
        supabase,
        orgId: auth.org_id,
        actorUserId: null,
        checksUsed,
        background: true,
        presetValidationId: validationId,
        input: {
          borrower_name,
          borrower_entity_name,
          entity_state,
          guarantor_name: typeof body?.guarantor_name === "string" ? body.guarantor_name : null,
          gc_name: typeof body?.gc_name === "string" ? body.gc_name : null,
          gc_license_number: typeof body?.gc_license_number === "string" ? body.gc_license_number : null,
          gc_state: typeof body?.gc_state === "string" ? body.gc_state : null,
          property_addresses: body?.property_addresses,
        },
      }).then(() => undefined),
    ),
  );

  return NextResponse.json(
    {
      id: validationId,
      status: "pending",
      message:
        "Validation queued. The result is delivered to your configured webhook (validation.completed) and is available at GET /api/public/v1/validations/{id}.",
    },
    { status: 202 },
  );
}
