// POST /api/investors/[id]/criteria/from-extraction — A1 accept stage.
// Body: { extraction_id, rows: [{criteria_key, criteria_value}, ...] }
//
// Flow:
//   1. Verify extraction belongs to investor + org.
//   2. Validate accepted rows via the existing validateInvestorCriteriaRows
//      (jsonb.ts) so unknown shapes get caught before write.
//   3. Supersede existing active rows for any (investor, criteria_key)
//      pair the user is replacing — same dance as the existing PUT
//      /api/investors/[id] handler, just scoped to keys we're about to
//      insert.
//   4. Insert accepted rows with source='pdf_parse' and source_doc_url
//      pointing at the documents row.
//   5. Patch the extraction row with accepted_rows + accepted_by + accepted_at
//      so the audit trail closes.
//   6. Emit activity (extracted_investor_criteria, stage="accepted").

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { validateInvestorCriteriaRows } from "@/lib/schemas";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";
import { emitActivity } from "@/lib/events/emit";

interface AcceptBody {
  extraction_id?: string;
  rows?: Array<{ criteria_key: string; criteria_value: unknown }>;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AcceptBody;
  try {
    body = (await request.json()) as AcceptBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { extraction_id, rows } = body;
  if (!extraction_id || !Array.isArray(rows)) {
    return NextResponse.json(
      { error: "extraction_id and rows are required" },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "At least one row must be accepted" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Verify investor + extraction both belong to caller's org.
  const { data: extraction } = await supabase
    .from("investor_criteria_extractions")
    .select("id, investor_id, document_id, accepted_at")
    .eq("id", extraction_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!extraction || extraction.investor_id !== id) {
    return NextResponse.json(
      { error: "Extraction not found for this investor" },
      { status: 404 },
    );
  }
  if (extraction.accepted_at) {
    return NextResponse.json(
      { error: "Extraction already accepted; create a new extraction to revise." },
      { status: 409 },
    );
  }

  const { data: investor } = await supabase
    .from("investors")
    .select("id")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!investor) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  // Validate row shapes against the engine's known criteria_keys. Unknown
  // keys pass through (forward-compat) — same lenient policy as the
  // existing PUT handler.
  const validation = validateInvestorCriteriaRows(rows);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Invalid investor_criteria",
        criteria_errors: validation.errors,
      },
      { status: 400 },
    );
  }

  // Supersede prior active rows ONLY for keys the user is replacing — leaves
  // unrelated criteria intact. Different from PUT /api/investors/[id] which
  // wipes everything because it's a wholesale replace.
  const keysToReplace = Array.from(new Set(rows.map((r) => r.criteria_key)));
  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from("investor_criteria")
    .update({ effective_to: today })
    .eq("investor_id", id)
    .is("effective_to", null)
    .in("criteria_key", keysToReplace);

  // The source_doc_url stores the documents.id (string), not a URL. The
  // column is text so this is fine — frontends resolve to a signed URL
  // via the documents table when displaying.
  const docRef = extraction.document_id ?? null;
  await insertOrThrow(
    supabase.from("investor_criteria").insert(
      rows.map((r) => ({
        investor_id: id,
        criteria_key: r.criteria_key,
        criteria_value: r.criteria_value,
        source: "pdf_parse",
        source_doc_url: docRef,
      })),
    ),
    `investor_criteria insert from extraction (investor=${id}, count=${rows.length})`,
  );

  await supabase
    .from("investor_criteria_extractions")
    .update({
      accepted_rows: rows,
      accepted_by_user_id: profile.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", extraction_id);

  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "extracted_investor_criteria",
    subjectType: "investor",
    subjectId: id,
    metadata: {
      extraction_id,
      accepted_count: rows.length,
      stage: "accepted",
    },
  });

  return NextResponse.json({ ok: true, accepted_count: rows.length });
}
