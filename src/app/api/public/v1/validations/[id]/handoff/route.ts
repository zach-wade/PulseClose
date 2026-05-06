// GET /api/public/v1/validations/[id]/handoff — structured handoff doc as JSON.
// GET /api/public/v1/validations/[id]/handoff?format=excel — Excel binary.
//
// Same builder used by the internal /api/handoff/[id]/excel route.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApiKey } from "@/lib/api/auth";
import { buildHandoffDocument } from "@/lib/handoff/builder";
import { generateHandoffWorkbook } from "@/lib/handoff/excel";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const auth = await resolveApiKey(supabase, request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";

  const doc = await buildHandoffDocument(supabase, id, auth.org_id);
  if (!doc) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  if (format === "excel") {
    const buf = await generateHandoffWorkbook(doc);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="handoff-${doc.borrower_name.replace(/\W+/g, "_")}.xlsx"`,
      },
    });
  }

  return NextResponse.json(doc);
}
