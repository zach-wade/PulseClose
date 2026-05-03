// POST /api/outcomes — record / update the outcome of a validation's
// underlying deal (E1). One row per validation; UPSERT semantics so the
// lender can revise (deal Withdrawn → re-engaged → Funded → Defaulted).
//
// Status enum mirrors the SQL CHECK in 00023_deal_outcomes.sql:
//   withdrawn | funded | extended | repaid | defaulted
//
// outcome_data carries per-status optional fields (close_date for funded,
// extension_reason for extended, default_cause for defaulted, etc.).
// Validated against dealOutcomeDataV1 (Zod) before write.
//
// Dual-log per the signals/route.ts pattern: audit_log for compliance,
// activity_events for the user-facing feed.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseDealOutcomeDataV1, type DealOutcomeDataV1 } from "@/lib/schemas/jsonb";
import { emitActivity } from "@/lib/events/emit";

type OutcomeStatus = "withdrawn" | "funded" | "extended" | "repaid" | "defaulted";

const VALID_STATUSES: ReadonlySet<OutcomeStatus> = new Set([
  "withdrawn",
  "funded",
  "extended",
  "repaid",
  "defaulted",
]);

interface OutcomeBody {
  validation_id?: string;
  status?: OutcomeStatus;
  outcome_data?: Partial<DealOutcomeDataV1>;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`outcomes:${profile.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  let body: OutcomeBody;
  try {
    body = (await request.json()) as OutcomeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { validation_id, status, outcome_data } = body;

  if (!validation_id || !status) {
    return NextResponse.json(
      { error: "validation_id and status are required" },
      { status: 400 },
    );
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status: ${status}. Must be one of ${[...VALID_STATUSES].join(", ")}.` },
      { status: 400 },
    );
  }

  // Validate per-status optional fields. The Zod schema is lenient (every
  // field optional) so a Withdrawn outcome with no extra data passes too.
  const parsed = parseDealOutcomeDataV1({ schema_version: 1, ...(outcome_data ?? {}) });
  if (parsed.error) {
    return NextResponse.json(
      { error: "Invalid outcome_data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Confirm the validation belongs to the caller's org. RLS on
  // deal_outcomes also enforces this on insert via the policy, but a
  // pre-check gives us a 404 instead of a 500 on cross-org attempts.
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, org_id, borrower_name")
    .eq("id", validation_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!validation) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  // UPSERT on validation_id (UNIQUE in the migration). updated_at is
  // bumped by the trigger; lender_user_id always reflects the latest
  // editor so we know who set the current state.
  const { data: row, error: upsertErr } = await supabase
    .from("deal_outcomes")
    .upsert(
      {
        validation_id,
        org_id: profile.org_id,
        status,
        outcome_data: parsed.data,
        lender_user_id: profile.id,
      },
      { onConflict: "validation_id" },
    )
    .select("id, status, outcome_data, lender_user_id, created_at, updated_at")
    .single();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // Compliance audit (immutable). Captures actor + previous state would
  // be ideal, but for E1's scope we record the new state only — outcome
  // history is a separate v2 feature if we ever need full audit chain.
  await supabase.from("audit_log").insert({
    org_id: profile.org_id,
    user_id: profile.id,
    action: "deal_outcome.set",
    entity_type: "validation",
    entity_id: validation_id,
    details: { status, outcome_data: parsed.data },
  });

  // User-facing activity feed (X3). Verb already in ActivityVerb union.
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "reported_outcome",
    subjectType: "validation",
    subjectId: validation_id,
    metadata: {
      status,
      borrower_name: validation.borrower_name,
      ...(parsed.data?.close_date ? { close_date: parsed.data.close_date } : {}),
      ...(parsed.data?.funded_amount ? { funded_amount: parsed.data.funded_amount } : {}),
    },
  });

  return NextResponse.json({ outcome: row });
}
