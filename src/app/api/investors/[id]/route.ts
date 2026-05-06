// GET /api/investors/[id] — single investor + active criteria
// PUT /api/investors/[id] — update investor + replace its active criteria
// DELETE /api/investors/[id] — delete investor (cascades criteria + results)

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { validateInvestorCriteriaRows } from "@/lib/schemas";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";

interface CriterionInput {
  criteria_key: string;
  criteria_value: unknown;
  source?: "pdf_parse" | "user_input";
  source_doc_url?: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const [invRes, critRes] = await Promise.all([
    supabase
      .from("investors")
      .select("*")
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .maybeSingle(),
    supabase
      .from("investor_criteria")
      .select("criteria_key, criteria_value, effective_from, source, source_doc_url")
      .eq("investor_id", id)
      .is("effective_to", null),
  ]);

  if (!invRes.data) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  return NextResponse.json({
    investor: { ...invRes.data, criteria: critRes.data ?? [] },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { display_name, type, notes, criteria } = body as {
    display_name?: string;
    type?: string;
    notes?: string;
    criteria?: CriterionInput[];
  };

  const supabase = createAdminClient();

  // Confirm the investor belongs to caller's org before touching anything
  const { data: existing } = await supabase
    .from("investors")
    .select("id")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  // Update investor metadata
  const updates: Record<string, string | null> = {};
  if (display_name !== undefined) updates.display_name = display_name;
  if (type !== undefined) updates.type = type;
  if (notes !== undefined) updates.notes = notes;
  if (Object.keys(updates).length > 0) {
    await supabase.from("investors").update(updates).eq("id", id);
  }

  // Replace criteria: supersede existing active rows, insert new active set.
  // We don't hard-delete so the audit trail stays intact.
  if (Array.isArray(criteria)) {
    // Validate each criterion's value against its key's known shape. Unknown
    // keys pass through (forward-compat with adding new dimensions without
    // shipping a build). Returns key-by-key errors so the UI can highlight.
    const validation = validateInvestorCriteriaRows(criteria);
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "Invalid investor_criteria",
          criteria_errors: validation.errors,
        },
        { status: 400 },
      );
    }

    await supabase
      .from("investor_criteria")
      .update({ effective_to: new Date().toISOString().slice(0, 10) })
      .eq("investor_id", id)
      .is("effective_to", null);

    if (criteria.length > 0) {
      await insertOrThrow(
        supabase.from("investor_criteria").insert(
          criteria.map((c) => ({
            investor_id: id,
            criteria_key: c.criteria_key,
            criteria_value: c.criteria_value,
            source: c.source ?? "user_input",
            source_doc_url: c.source_doc_url ?? null,
          })),
        ),
        `investor_criteria insert (investor_id=${id}, count=${criteria.length})`,
      );
    }
  }

  return NextResponse.json({ id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("investors")
    .delete()
    .eq("id", id)
    .eq("org_id", profile.org_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}
