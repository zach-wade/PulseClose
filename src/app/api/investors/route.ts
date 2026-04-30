// GET /api/investors — list investors + their active criteria
// POST /api/investors — create a new investor (criteria are added via PUT)

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const [invRes, critRes] = await Promise.all([
    supabase
      .from("investors")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("display_name"),
    supabase
      .from("investor_criteria")
      .select("investor_id, criteria_key, criteria_value, effective_from, effective_to, source, source_doc_url")
      .is("effective_to", null),
  ]);

  const byInvestor: Record<string, Array<{ criteria_key: string; criteria_value: unknown }>> = {};
  for (const row of critRes.data ?? []) {
    if (!byInvestor[row.investor_id]) byInvestor[row.investor_id] = [];
    byInvestor[row.investor_id].push({
      criteria_key: row.criteria_key,
      criteria_value: row.criteria_value,
    });
  }

  const investors = (invRes.data ?? []).map((i) => ({
    ...i,
    criteria: byInvestor[i.id] ?? [],
  }));
  return NextResponse.json(investors);
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { display_name, type, notes } = body;
  if (!display_name) {
    return NextResponse.json({ error: "display_name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("investors")
    .insert({
      org_id: profile.org_id,
      display_name,
      type: type ?? null,
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
