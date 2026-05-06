// GET /api/keys — list this org's API keys (sans the secret half)
// POST /api/keys — create one; returns the plaintext token ONCE
// DELETE /api/keys?id=... — revoke one

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { generateApiKey } from "@/lib/api/auth";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, revoked_at, created_at")
    .eq("org_id", profile.org_id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { name } = (await request.json()) as { name?: string };
  const trimmed = name?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const { full, prefix, hash } = generateApiKey();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: profile.org_id,
      created_by: profile.id,
      name: trimmed,
      key_prefix: prefix,
      key_hash: hash,
    })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Plaintext token is returned ONCE here — never persisted.
  return NextResponse.json({ key: data, token: full }, { status: 201 });
}

export async function DELETE(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", profile.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}
