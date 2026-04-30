// GET — current subscription state + recent run history
// PUT — create/update subscription (enabled, cadence, notify_emails)

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const [subRes, runsRes] = await Promise.all([
    supabase
      .from("monitor_subscriptions")
      .select("*")
      .eq("validation_id", id)
      .eq("org_id", profile.org_id)
      .maybeSingle(),
    supabase
      .from("monitor_runs")
      .select("*")
      .eq("validation_id", id)
      .eq("org_id", profile.org_id)
      .order("ran_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    subscription: subRes.data ?? null,
    runs: runsRes.data ?? [],
  });
}

interface PutBody {
  enabled?: boolean;
  cadence?: "daily" | "weekly" | "monthly";
  notify_emails?: string[];
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PutBody;
  const supabase = createAdminClient();

  // Confirm validation belongs to org
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!validation) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("monitor_subscriptions")
    .select("id")
    .eq("validation_id", id)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.cadence !== undefined) updates.cadence = body.cadence;
    if (body.notify_emails !== undefined) updates.notify_emails = body.notify_emails;
    const { data, error } = await supabase
      .from("monitor_subscriptions")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Create new subscription. Default email recipient is the user's own
  // email — they can adjust on the panel.
  const { data, error } = await supabase
    .from("monitor_subscriptions")
    .insert({
      validation_id: id,
      org_id: profile.org_id,
      enabled: body.enabled ?? true,
      cadence: body.cadence ?? "weekly",
      notify_emails: body.notify_emails ?? [profile.email],
      next_run_at: new Date().toISOString(),  // first run on next cron tick
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
