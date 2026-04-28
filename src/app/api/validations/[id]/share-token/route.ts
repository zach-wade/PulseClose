// POST /api/validations/[id]/share-token
// Generates (or returns existing) a share token for a validation. The
// token gives a borrower a tokenized URL where they can self-submit
// claimed flip addresses without logging in.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { randomBytes } from "crypto";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("borrower_validations")
    .select("id, share_token")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  if (existing.share_token) {
    return NextResponse.json({ token: existing.share_token });
  }

  // 32 hex chars (16 bytes random) is plenty of entropy and short enough
  // for a clean URL.
  const token = randomBytes(16).toString("hex");
  const { error } = await supabase
    .from("borrower_validations")
    .update({ share_token: token })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token });
}

// DELETE /api/validations/[id]/share-token — revoke the share link
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("borrower_validations")
    .update({ share_token: null })
    .eq("id", id)
    .eq("org_id", profile.org_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
