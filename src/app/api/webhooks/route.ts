// GET    /api/webhooks          — list this org's webhook endpoints (secret masked)
// POST   /api/webhooks          — register one; returns the signing secret ONCE
// PATCH  /api/webhooks?id=...    — toggle enabled / rotate secret / edit events
// DELETE /api/webhooks?id=...    — remove one
//
// Session-authed (dashboard UI). Owner/admin required for writes, mirroring
// /api/keys. URLs are SSRF-checked at registration; re-checked at delivery.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { assertSafePublicUrl, UnsafeWebhookUrlError } from "@/lib/notifications/ssrf";
import { generateWebhookSecret } from "@/lib/webhooks/deliver";
import { WEBHOOK_EVENT_TYPES, isWebhookEventType } from "@/lib/webhooks/events";

// Mask the secret for listing — show the prefix so the user can tell which
// is which without re-exposing the signing key.
function maskSecret(secret: string): string {
  return secret.length <= 12 ? "whsec_…" : `${secret.slice(0, 12)}…`;
}

function validateEventTypes(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "event_types must be a non-empty array" };
  }
  const bad = raw.filter((e) => typeof e !== "string" || !isWebhookEventType(e));
  if (bad.length > 0) {
    return { ok: false, error: `Unknown event types: ${bad.join(", ")}. Allowed: ${WEBHOOK_EVENT_TYPES.join(", ")}` };
  }
  return { ok: true, value: Array.from(new Set(raw as string[])) };
}

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("id, url, event_types, secret, description, enabled, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const endpoints = (data ?? []).map((e) => ({
    id: e.id,
    url: e.url,
    event_types: e.event_types,
    secret_masked: maskSecret(e.secret),
    description: e.description,
    enabled: e.enabled,
    created_at: e.created_at,
  }));
  return NextResponse.json({ endpoints, available_events: WEBHOOK_EVENT_TYPES });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    url?: string;
    event_types?: unknown;
    description?: string;
  } | null;
  if (!body?.url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const events = validateEventTypes(body.event_types);
  if (!events.ok) return NextResponse.json({ error: events.error }, { status: 400 });

  try {
    await assertSafePublicUrl(body.url);
  } catch (err) {
    if (err instanceof UnsafeWebhookUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const secret = generateWebhookSecret();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .insert({
      org_id: profile.org_id,
      created_by: profile.id,
      url: body.url,
      event_types: events.value,
      description: body.description?.trim() || null,
      secret,
    })
    .select("id, url, event_types, description, enabled, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Signing secret returned ONCE — store it to verify signatures.
  return NextResponse.json({ endpoint: data, secret }, { status: 201 });
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
    enabled?: boolean;
    event_types?: unknown;
    rotate_secret?: boolean;
  } | null;

  const update: Record<string, unknown> = {};
  if (typeof body?.enabled === "boolean") update.enabled = body.enabled;
  if (body?.event_types !== undefined) {
    const events = validateEventTypes(body.event_types);
    if (!events.ok) return NextResponse.json({ error: events.error }, { status: 400 });
    update.event_types = events.value;
  }
  let rotatedSecret: string | null = null;
  if (body?.rotate_secret) {
    rotatedSecret = generateWebhookSecret();
    update.secret = rotatedSecret;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .update(update)
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .select("id, url, event_types, description, enabled, created_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ endpoint: data, ...(rotatedSecret ? { secret: rotatedSecret } : {}) });
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
    .from("webhook_endpoints")
    .delete()
    .eq("id", id)
    .eq("org_id", profile.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}
