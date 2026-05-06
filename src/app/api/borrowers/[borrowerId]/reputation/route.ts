// GET /api/borrowers/[borrowerId]/reputation — E2 borrower reputation summary.
// Org-scoped. Computed on demand from existing tables; no caching layer
// because the cardinality is small (most borrowers have <10 validations).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { getBorrowerReputation } from "@/lib/borrowers/reputation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ borrowerId: string }> },
) {
  const { borrowerId } = await params;
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const reputation = await getBorrowerReputation(
    supabase,
    borrowerId,
    profile.org_id,
  );
  if (!reputation) {
    return NextResponse.json({ error: "Borrower not found" }, { status: 404 });
  }

  return NextResponse.json({ reputation });
}
