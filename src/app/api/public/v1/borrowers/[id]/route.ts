// GET /api/public/v1/borrowers/[id] — borrower record + reputation summary.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApiKey } from "@/lib/api/auth";
import { getBorrowerReputation } from "@/lib/borrowers/reputation";

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

  const reputation = await getBorrowerReputation(supabase, id, auth.org_id);
  if (!reputation) {
    return NextResponse.json({ error: "Borrower not found" }, { status: 404 });
  }
  return NextResponse.json({ borrower: reputation });
}
