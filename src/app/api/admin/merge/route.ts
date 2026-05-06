// POST /api/admin/merge — merge two records of the same entity_type.
// Re-points every FK from source to target, then deletes source.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { mergeRecords, type MergeEntityType } from "@/lib/admin/merge";

interface PostBody {
  entity_type: MergeEntityType;
  source_id: string;
  target_id: string;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = (await request.json()) as PostBody;
  if (!body.entity_type || !body.source_id || !body.target_id) {
    return NextResponse.json(
      { error: "entity_type, source_id, target_id required" },
      { status: 400 },
    );
  }
  if (!["borrower", "entity", "lender"].includes(body.entity_type)) {
    return NextResponse.json({ error: "Invalid entity_type" }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const result = await mergeRecords(
      supabase,
      body.entity_type,
      profile.org_id,
      body.source_id,
      body.target_id,
    );
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
