// GET /api/handoff/[id]/excel — download the investor handoff workbook
// for a validation. Generates the document on demand from current data
// (validation + property_ownership + verified_flips + risk_factors +
// handoff_data manual fields).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { buildHandoffDocument } from "@/lib/handoff/builder";
import { generateHandoffWorkbook } from "@/lib/handoff/excel";
import { emitActivity } from "@/lib/events/emit";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const doc = await buildHandoffDocument(supabase, id, profile.org_id);
  if (!doc) return NextResponse.json({ error: "Validation not found" }, { status: 404 });

  const buffer = await generateHandoffWorkbook(doc);
  const filename = `${doc.borrower_name.replace(/[^a-zA-Z0-9_-]+/g, "-")}-handoff-${doc.generated_at.slice(0, 10)}.xlsx`;

  // Activity event so the (forthcoming) feed (B5) can show "Damon downloaded
  // the handoff for Kim Truong". Schema-defined verb in jsonb.ts.
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "sent_handoff",
    subjectType: "validation",
    subjectId: id,
    metadata: { artifact: "excel" },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
