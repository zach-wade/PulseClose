// POST /api/investor-queue — route a validation to an investor's queue
// (lender side, idempotent on (investor_id, validation_id)).
// GET /api/investor-queue?investor_id=... — list queued deals (lender view).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { emitActivity } from "@/lib/events/emit";

interface PostBody {
  investor_id: string;
  validation_id: string;
  deal_evaluation_id?: string | null;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PostBody;
  if (!body.investor_id || !body.validation_id) {
    return NextResponse.json(
      { error: "investor_id and validation_id required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  // Ownership checks — investor + validation both belong to caller's org.
  const { data: invRow } = await supabase
    .from("investors")
    .select("id")
    .eq("id", body.investor_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  const { data: valRow } = await supabase
    .from("borrower_validations")
    .select("id")
    .eq("id", body.validation_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!invRow || !valRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // True UPSERT — re-routing the same (investor_id, validation_id) pair
  // returns the existing row instead of 409. Caller treats the response
  // as "this validation is in this investor's queue" regardless of
  // whether they were the one who put it there.
  const { data, error } = await supabase
    .from("investor_deal_queue")
    .upsert(
      {
        investor_id: body.investor_id,
        validation_id: body.validation_id,
        deal_evaluation_id: body.deal_evaluation_id ?? null,
        org_id: profile.org_id,
        routed_by_user_id: profile.id,
      },
      { onConflict: "investor_id,validation_id", ignoreDuplicates: false },
    )
    .select("id, status, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "routed_to_investor",
    subjectType: "validation",
    subjectId: body.validation_id,
    metadata: { investor_id: body.investor_id, queue_id: data.id },
  });

  return NextResponse.json({ queued: data }, { status: 201 });
}

export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const investorId = url.searchParams.get("investor_id");

  const supabase = createAdminClient();
  let query = supabase
    .from("investor_deal_queue")
    .select(
      "id, investor_id, validation_id, status, investor_comment, acted_at, created_at, updated_at",
    )
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });
  if (investorId) query = query.eq("investor_id", investorId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ queue: data ?? [] });
}
