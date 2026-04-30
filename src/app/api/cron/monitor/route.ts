// Vercel Cron entry — picks up due monitor_subscriptions, runs each,
// persists results, and notifies on changes_found. Auth via the
// CRON_SECRET bearer token Vercel injects on cron requests.
//
// Schedule: configured in vercel.json. Daily at 9 UTC; per-subscription
// cadence (daily/weekly/monthly) is enforced via next_run_at.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSubscription, notifyChanges, nextRunAt } from "@/lib/monitor/runner";

export const maxDuration = 300;

const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pulseclose.com";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const supabase = createAdminClient();

  // Pick up due subscriptions. Cap at 25/run to stay under maxDuration
  // even if a vendor call hangs; remaining due subs roll into the next
  // tick.
  const { data: dueSubs } = await supabase
    .from("monitor_subscriptions")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(25);

  const subs = dueSubs ?? [];
  let processed = 0;
  let changesFound = 0;
  let errors = 0;

  for (const sub of subs) {
    try {
      const result = await runSubscription(supabase, sub);

      // Persist run record
      const { data: runRow } = await supabase
        .from("monitor_runs")
        .insert({
          subscription_id: sub.id,
          validation_id: sub.validation_id,
          org_id: sub.org_id,
          status: result.status,
          changes: result.changes,
          error_message: result.error ?? null,
          cost_cents: result.cost_cents,
        })
        .select("id")
        .single();

      // Log usage records for the per-validation API calls (matches
      // existing usage-metering convention).
      if (result.cost_cents > 0) {
        await supabase.from("usage_records").insert({
          org_id: sub.org_id,
          validation_id: sub.validation_id,
          check_type: "monitoring_run",
          data_source: "multi",
          cost_cents: result.cost_cents,
          response_status: result.status === "error" ? "error" : "success",
        });
      }

      // Notify on changes_found
      if (result.status === "changes_found" && result.changes.length > 0) {
        const { data: validation } = await supabase
          .from("borrower_validations")
          .select("borrower_name, borrower_entity_name")
          .eq("id", sub.validation_id)
          .single();
        if (validation) {
          const sent = await notifyChanges(sub, validation, result.changes, PUBLIC_BASE_URL);
          if (sent && runRow) {
            await supabase
              .from("monitor_runs")
              .update({ notified_at: new Date().toISOString() })
              .eq("id", runRow.id);
          }
        }
        changesFound++;
      }

      // Bump next_run_at + last_run_at on the subscription
      await supabase
        .from("monitor_subscriptions")
        .update({
          next_run_at: nextRunAt(sub.cadence).toISOString(),
          last_run_at: new Date().toISOString(),
        })
        .eq("id", sub.id);

      processed++;
    } catch (err) {
      console.error(`Monitor run failed for subscription ${sub.id}:`, err);
      errors++;
      // Persist error so it's visible on the dashboard
      await supabase.from("monitor_runs").insert({
        subscription_id: sub.id,
        validation_id: sub.validation_id,
        org_id: sub.org_id,
        status: "error",
        error_message: err instanceof Error ? err.message : String(err),
      });
      // Still bump next_run_at so we don't hammer a broken sub
      await supabase
        .from("monitor_subscriptions")
        .update({
          next_run_at: nextRunAt(sub.cadence).toISOString(),
          last_run_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
    }
  }

  return NextResponse.json({
    processed,
    changes_found: changesFound,
    errors,
    remaining_due: Math.max(0, subs.length - processed - errors),
  });
}
