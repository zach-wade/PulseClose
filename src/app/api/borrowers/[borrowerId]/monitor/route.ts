// GET / PUT /api/borrowers/[borrowerId]/monitor — B1 borrower watchlist.
// Borrower-level subs act as templates: the cron skips them (they have
// validation_id NULL, filtered out in cron/monitor/route.ts), and the
// validations POST handler reads them to materialize per-validation
// subs on each new validation for the borrower.
//
// We do NOT retroactively create subs for existing validations when the
// borrower-level sub is enabled — keeps the model simple (only new
// validations inherit). If the lender wants to also watch existing
// validations they can flip the per-validation toggle separately.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { emitActivity } from "@/lib/events/emit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ borrowerId: string }> },
) {
  const { borrowerId } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // Confirm borrower belongs to org (RLS would block but cleaner 404).
  const { data: borrower } = await supabase
    .from("borrowers")
    .select("id")
    .eq("id", borrowerId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!borrower) {
    return NextResponse.json({ error: "Borrower not found" }, { status: 404 });
  }

  const { data: subscription } = await supabase
    .from("monitor_subscriptions")
    .select("id, enabled, cadence, notify_emails, critical_only, created_at, updated_at")
    .eq("borrower_id", borrowerId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  return NextResponse.json({ subscription: subscription ?? null });
}

interface PutBody {
  enabled?: boolean;
  cadence?: "daily" | "weekly" | "monthly";
  notify_emails?: string[];
  critical_only?: boolean;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ borrowerId: string }> },
) {
  const { borrowerId } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PutBody;
  const supabase = createAdminClient();

  const { data: borrower } = await supabase
    .from("borrowers")
    .select("id, display_name")
    .eq("id", borrowerId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!borrower) {
    return NextResponse.json({ error: "Borrower not found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("monitor_subscriptions")
    .select("id, enabled")
    .eq("borrower_id", borrowerId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.cadence !== undefined) updates.cadence = body.cadence;
    if (body.notify_emails !== undefined) updates.notify_emails = body.notify_emails;
    if (body.critical_only !== undefined) updates.critical_only = body.critical_only;
    const { data, error } = await supabase
      .from("monitor_subscriptions")
      .update(updates)
      .eq("id", existing.id)
      .select("id, enabled, cadence, notify_emails, critical_only, created_at, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (body.enabled !== undefined && body.enabled !== existing.enabled) {
      void emitActivity(supabase, {
        orgId: profile.org_id,
        actorUserId: profile.id,
        verb: body.enabled ? "subscribed_to_monitor" : "unsubscribed_from_monitor",
        subjectType: "borrower",
        subjectId: borrowerId,
        metadata: { subscription_id: existing.id, scope: "borrower" },
      });
    }
    return NextResponse.json({ subscription: data });
  }

  // First-time create. Same defaults as the per-validation route — the
  // user's email goes in notify_emails so a fresh "watch borrower" click
  // doesn't go to /dev/null.
  const { data, error } = await supabase
    .from("monitor_subscriptions")
    .insert({
      borrower_id: borrowerId,
      org_id: profile.org_id,
      enabled: body.enabled ?? true,
      cadence: body.cadence ?? "weekly",
      notify_emails: body.notify_emails ?? [profile.email],
      critical_only: body.critical_only ?? false,
      // Borrower-level subs aren't run directly; next_run_at is unused
      // for them but the column is NOT NULL so we set a far-future date
      // as a clear signal in pg admin tools.
      next_run_at: new Date("2099-12-31").toISOString(),
    })
    .select("id, enabled, cadence, notify_emails, critical_only, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "subscribed_to_monitor",
    subjectType: "borrower",
    subjectId: borrowerId,
    metadata: { subscription_id: data.id, scope: "borrower" },
  });

  return NextResponse.json({ subscription: data }, { status: 201 });
}
