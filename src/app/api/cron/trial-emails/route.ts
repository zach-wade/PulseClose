// Vercel Cron — trial lifecycle drip. Daily, sends:
//   * "trial ending" to orgs whose trial ends within 3 days (unpaid, not internal)
//   * "trial ended"  to orgs whose trial has passed (unpaid, not internal)
// Each is sent once (deduped via trial_ending_email_sent_at / trial_ended_email_sent_at
// from migration 00042). Auth via CRON_SECRET bearer, mirroring api/cron/monitor.
//
// Recipient = the org owner (users.role = 'owner'). No-ops cleanly without Resend.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { trialEndingEmail, trialEndedEmail } from "@/lib/email/onboarding";
import { captureServer } from "@/lib/analytics/server";

export const maxDuration = 120;

const ENDING_WINDOW_DAYS = 3;

async function ownerFor(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<{ email: string; name: string | null } | null> {
  const { data } = await supabase
    .from("users")
    .select("email, full_name, role")
    .eq("org_id", orgId)
    .order("role", { ascending: true }) // 'owner' sorts before 'member'
    .limit(1)
    .maybeSingle();
  if (!data?.email) return null;
  return { email: data.email, name: data.full_name ?? null };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const supabase = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const endingCutoff = new Date(now.getTime() + ENDING_WINDOW_DAYS * 86_400_000).toISOString();

  let ending = 0;
  let ended = 0;

  // ── Trial ending soon (unpaid, not internal, not already emailed) ──────────
  const { data: endingOrgs } = await supabase
    .from("organizations")
    .select("id, plan, stripe_subscription_id, trial_ends_at, trial_ending_email_sent_at")
    .neq("plan", "internal")
    .is("stripe_subscription_id", null)
    .is("trial_ending_email_sent_at", null)
    .gt("trial_ends_at", nowIso)
    .lte("trial_ends_at", endingCutoff)
    .limit(200);

  for (const org of endingOrgs ?? []) {
    const owner = await ownerFor(supabase, org.id);
    if (!owner) continue;
    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(org.trial_ends_at).getTime() - now.getTime()) / 86_400_000),
    );
    const { subject, html, text } = trialEndingEmail(owner.name, daysLeft);
    const sent = await sendEmail({ to: owner.email, subject, html, text });
    if (sent) {
      await supabase
        .from("organizations")
        .update({ trial_ending_email_sent_at: nowIso })
        .eq("id", org.id);
      void captureServer(org.id, "trial_ending_email_sent", { days_left: daysLeft });
      ending++;
    }
  }

  // ── Trial ended (unpaid, not internal, not already emailed) ────────────────
  const { data: endedOrgs } = await supabase
    .from("organizations")
    .select("id, plan, stripe_subscription_id, trial_ends_at, trial_ended_email_sent_at")
    .neq("plan", "internal")
    .is("stripe_subscription_id", null)
    .is("trial_ended_email_sent_at", null)
    .lte("trial_ends_at", nowIso)
    .limit(200);

  for (const org of endedOrgs ?? []) {
    const owner = await ownerFor(supabase, org.id);
    if (!owner) continue;
    const { subject, html, text } = trialEndedEmail(owner.name);
    const sent = await sendEmail({ to: owner.email, subject, html, text });
    if (sent) {
      await supabase
        .from("organizations")
        .update({ trial_ended_email_sent_at: nowIso })
        .eq("id", org.id);
      void captureServer(org.id, "trial_ended_email_sent", {});
      ended++;
    }
  }

  return NextResponse.json({ ending_sent: ending, ended_sent: ended });
}
