import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { captureServer } from "@/lib/analytics/server";
import {
  getCheckLimit,
  getEffectiveCheckLimit,
  isOnTrial,
  TRIAL_CHECK_CAP,
} from "@/lib/stripe/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { runValidationPipeline } from "@/lib/validations/pipeline";
import { computeVerdictsForValidations } from "@/lib/validation/verdict-batch";

// The invocation budget is SHARED between the synchronous diligence pipeline
// (entity/track/litigation/GC/sanctions vendor calls + retries/backoff, ~40-60s)
// AND the deferred after() enrichment (Realie deed-verify + the Claude memo).
// At 60s the sync phase starved after(), so the AI memo never generated on fresh
// validations (#23). 300s gives after() room to finish the memo after the
// response returns. (The detail page also polls ~3min as a backstop.)
export const maxDuration = 300;

// GET /api/validations — list all validations for the user's org
export async function GET() {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: validations, error } = await supabase
    .from("borrower_validations")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach the per-row verdict (the SAME computeVerdict() the detail page uses,
  // so the list chip and the detail hero never disagree) + prior-run delta.
  const verdicts = await computeVerdictsForValidations(
    supabase,
    (validations ?? []).map((v) => ({
      id: v.id,
      primary_borrower_id: v.primary_borrower_id ?? null,
      created_at: v.created_at,
    })),
  );
  const enriched = (validations ?? []).map((v) => ({ ...v, verdict: verdicts.get(v.id) ?? null }));

  return NextResponse.json(enriched);
}

// POST /api/validations — create a new validation and run all checks.
// Auth + rate limit + plan-limit live here; the orchestration is the shared
// runValidationPipeline() (also used by the public API-key route).
export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 validations per minute per org
  const rl = await checkRateLimit(`validations:${profile.org_id}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before running another validation.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const supabase = createAdminClient();
  const body = await request.json();
  const { borrower_name, borrower_entity_name, entity_state } = body;

  // Check plan limits
  const { data: org } = await supabase
    .from("organizations")
    .select("plan, checks_used_this_period, stripe_subscription_id, trial_ends_at")
    .eq("id", profile.org_id)
    .single();

  const plan = org?.plan ?? "starter";
  const checksUsed = org?.checks_used_this_period ?? 0;
  const checkLimit = getCheckLimit(plan);
  const billing = {
    plan,
    hasSubscription: !!org?.stripe_subscription_id,
    trialEndsAt: org?.trial_ends_at ?? null,
  };

  // `internal` is unlimited; paid orgs get their plan cap; unpaid orgs get the
  // trial cap; expired trials hit the paywall. Source of truth: stripe/server.ts.
  const effectiveLimit = getEffectiveCheckLimit(billing);
  const onTrial = isOnTrial(billing);

  if (checksUsed >= effectiveLimit) {
    let error: string;
    if (billing.hasSubscription) {
      error = `Plan limit reached (${checkLimit} checks/month). Upgrade your plan for more.`;
    } else if (onTrial) {
      error = `Trial check limit reached (${TRIAL_CHECK_CAP}). Subscribe to continue.`;
    } else {
      error = "Your free trial has ended. Subscribe to continue.";
    }
    return NextResponse.json({ error, code: "PLAN_LIMIT_REACHED" }, { status: 403 });
  }

  // Activation event — the core "aha" action.
  void captureServer(profile.id, "validation_run", {
    org_id: profile.org_id,
    plan,
    on_trial: onTrial,
  });

  if (!borrower_name || !borrower_entity_name || !entity_state) {
    return NextResponse.json(
      { error: "borrower_name, borrower_entity_name, and entity_state are required" },
      { status: 400 },
    );
  }

  try {
    const result = await runValidationPipeline({
      supabase,
      orgId: profile.org_id,
      actorUserId: profile.id,
      checksUsed,
      background: false,
      input: {
        borrower_name,
        borrower_entity_name,
        entity_state,
        guarantor_name: body.guarantor_name,
        gc_name: body.gc_name,
        gc_license_number: body.gc_license_number,
        gc_state: body.gc_state,
        property_addresses: body.property_addresses,
        borrower_dob: body.borrower_dob,
      },
    });
    return NextResponse.json({ id: result.validation_id, status: result.overall_status }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Validation checks failed", details: String(err) }, { status: 500 });
  }
}
