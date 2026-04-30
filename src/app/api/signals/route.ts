// POST /api/signals — write a user-set signal on a borrower, property,
// borrower×property relationship, or entity. Supersedes any active signal
// with the same (scope, key) tuple by setting superseded_at on the prior
// row. The actual re-derivation of risk_factors and AI-memo regeneration
// is wired in Session 3; for now the endpoint just persists the signal
// so the override-and-rerun substrate is in place.
//
// Request body shape:
//   {
//     scope: "borrower" | "property" | "borrower_property" | "entity",
//     borrower_id?: string,
//     property_id?: string,
//     entity_id?: string,
//     signal_key: string,
//     signal_value: unknown,    // arbitrary JSON
//     reason?: string
//   }

import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  recomputeRiskFactorsForValidation,
  findValidationsAffectedBySignal,
} from "@/lib/risk/persist";
import { regenerateAiMemoForValidation } from "@/lib/ai/regenerate";

type Scope = "borrower" | "property" | "borrower_property" | "entity";

interface SignalBody {
  scope: Scope;
  borrower_id?: string;
  property_id?: string;
  entity_id?: string;
  signal_key: string;
  signal_value: unknown;
  reason?: string;
}

const TABLE_BY_SCOPE: Record<Scope, string> = {
  borrower: "borrower_signals",
  property: "property_signals",
  borrower_property: "borrower_property_signals",
  entity: "entity_signals",
};

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`signals:${profile.org_id}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = (await request.json()) as Partial<SignalBody>;
  const { scope, signal_key, signal_value, reason, borrower_id, property_id, entity_id } = body;

  if (!scope || !signal_key || signal_value === undefined) {
    return NextResponse.json(
      { error: "scope, signal_key, and signal_value are required" },
      { status: 400 },
    );
  }
  if (!TABLE_BY_SCOPE[scope]) {
    return NextResponse.json({ error: `Invalid scope: ${scope}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Validate the referenced entity belongs to the caller's org. RLS would
  // catch a cross-org write here too, but explicit checks return clearer
  // errors than silent RLS rejections.
  if (scope === "borrower" || scope === "borrower_property") {
    if (!borrower_id) {
      return NextResponse.json({ error: "borrower_id is required" }, { status: 400 });
    }
    const { data: borrower } = await supabase
      .from("borrowers")
      .select("id")
      .eq("id", borrower_id)
      .eq("org_id", profile.org_id)
      .maybeSingle();
    if (!borrower) {
      return NextResponse.json({ error: "Borrower not found" }, { status: 404 });
    }
  }
  if (scope === "property" || scope === "borrower_property") {
    if (!property_id) {
      return NextResponse.json({ error: "property_id is required" }, { status: 400 });
    }
    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("id", property_id)
      .eq("org_id", profile.org_id)
      .maybeSingle();
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
  }
  if (scope === "entity") {
    if (!entity_id) {
      return NextResponse.json({ error: "entity_id is required" }, { status: 400 });
    }
    const { data: entity } = await supabase
      .from("entities")
      .select("id")
      .eq("id", entity_id)
      .eq("org_id", profile.org_id)
      .maybeSingle();
    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }
  }

  const table = TABLE_BY_SCOPE[scope];

  // Build the scope-key match for superseding the prior active signal.
  const scopeMatch: Record<string, string> = { signal_key };
  if (borrower_id) scopeMatch.borrower_id = borrower_id;
  if (property_id) scopeMatch.property_id = property_id;
  if (entity_id) scopeMatch.entity_id = entity_id;

  // Supersede any active signal with the same (scope, key).
  await supabase
    .from(table)
    .update({ superseded_at: new Date().toISOString() })
    .match(scopeMatch)
    .is("superseded_at", null);

  const insertRow: Record<string, unknown> = {
    signal_key,
    signal_value,
    source: "user",
    confidence: "high",
    set_by_user_id: profile.id,
    reason: reason ?? null,
    ...scopeMatch,
  };

  const { data: created, error } = await supabase
    .from(table)
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    org_id: profile.org_id,
    user_id: profile.id,
    action: "signal.set",
    entity_type: scope,
    entity_id: borrower_id || property_id || entity_id,
    details: { signal_key, signal_value, reason },
  });

  // Fan out re-derivation. Any validation whose factor compute could be
  // affected by this signal gets risk_factors recomputed; we await the
  // recompute so the next page load reflects the override, but the AI
  // memo regeneration is queued via after() so the response stays fast.
  const affected = await findValidationsAffectedBySignal(supabase, scope, {
    borrower_id,
    property_id,
    entity_id,
  });
  await Promise.all(affected.map((vid) => recomputeRiskFactorsForValidation(supabase, vid)));

  if (affected.length > 0) {
    after(async () => {
      for (const vid of affected) {
        try {
          await regenerateAiMemoForValidation(supabase, vid);
        } catch (err) {
          console.error(`AI memo regeneration failed for validation ${vid}:`, err);
        }
      }
    });
  }

  return NextResponse.json(
    { id: created.id, scope, signal_key, recomputed_validations: affected.length },
    { status: 201 },
  );
}
