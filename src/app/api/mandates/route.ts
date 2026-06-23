// GET    /api/mandates[?investor_id=] — list the org's mandates
// POST   /api/mandates                — create one (name, investor_id, gates)
// PATCH  /api/mandates?id=...          — update name / gates / enabled
// DELETE /api/mandates?id=...          — remove one
//
// Session-authed; owner/admin for writes (mirrors /api/keys, /api/webhooks).
// A mandate is owned by an investor in the same org.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { parseMandateGatesV1Strict } from "@/lib/schemas/jsonb";

export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const investorId = new URL(request.url).searchParams.get("investor_id");
  const supabase = createAdminClient();
  let query = supabase
    .from("investor_mandates")
    .select("id, investor_id, name, gates, enabled, created_at, investors ( display_name )")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });
  if (investorId) query = query.eq("investor_id", investorId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mandates: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    investor_id?: string;
    name?: string;
    gates?: unknown;
  } | null;
  const name = body?.name?.trim();
  if (!body?.investor_id || !name) {
    return NextResponse.json({ error: "investor_id and name are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Verify the investor belongs to the caller's org.
  const { data: investor } = await supabase
    .from("investors")
    .select("id")
    .eq("id", body.investor_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!investor) return NextResponse.json({ error: "Investor not found" }, { status: 404 });

  let gates;
  try {
    gates = parseMandateGatesV1Strict({ schema_version: 1, ...((body.gates as object) ?? {}) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid gates" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("investor_mandates")
    .insert({
      org_id: profile.org_id,
      investor_id: body.investor_id,
      name,
      gates,
      created_by: profile.id,
    })
    .select("id, investor_id, name, gates, enabled, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mandate: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    gates?: unknown;
    enabled?: boolean;
  } | null;

  const update: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body?.enabled === "boolean") update.enabled = body.enabled;
  if (body?.gates !== undefined) {
    try {
      update.gates = parseMandateGatesV1Strict({ schema_version: 1, ...((body.gates as object) ?? {}) });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid gates" }, { status: 400 });
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("investor_mandates")
    .update(update)
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .select("id, investor_id, name, gates, enabled, created_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ mandate: data });
}

export async function DELETE(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("investor_mandates")
    .delete()
    .eq("id", id)
    .eq("org_id", profile.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}
