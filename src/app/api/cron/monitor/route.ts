// Vercel Cron entry — picks up due monitor_subscriptions, runs each,
// persists results, and notifies on changes_found. Auth via the
// CRON_SECRET bearer token Vercel injects on cron requests.
//
// Schedule: configured in vercel.json. Daily at 9 UTC; per-subscription
// cadence (daily/weekly/monthly) is enforced via next_run_at.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runSubscription,
  notifyChanges,
  nextRunAt,
  rateLimitedRunAt,
  anyRateLimited,
} from "@/lib/monitor/runner";
import { emitActivity } from "@/lib/events/emit";

export const maxDuration = 300;

const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pulseclose.com";

// Gate writes to monitor_runs.adapter_results / email_status until the
// 00016 migration adds those columns. Flip the env var post-deploy.
const RUN_RESULTS_ENABLED = process.env.MONITOR_RUN_RESULTS_ENABLED === "true";

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
  //
  // B1 — borrower-level subs (validation_id IS NULL) are templates only;
  // they're materialized into per-validation subs by the validations
  // POST handler. The cron skips them so runSubscription never sees a
  // null validation_id. (Belt + suspenders: the runner also requires a
  // non-null validation_id to fetch the validation context.)
  const { data: dueSubs } = await supabase
    .from("monitor_subscriptions")
    .select("*")
    .eq("enabled", true)
    .not("validation_id", "is", null)
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

      // Persist run record. adapter_results / email_status columns ship in
      // 00016; gate behind env flag so this PR can deploy ahead of the
      // migration without erroring.
      const runInsertPayload: Record<string, unknown> = {
        subscription_id: sub.id,
        validation_id: sub.validation_id,
        org_id: sub.org_id,
        status: result.status,
        changes: result.changes,
        error_message: result.error ?? null,
        cost_cents: result.cost_cents,
      };
      if (RUN_RESULTS_ENABLED) {
        runInsertPayload.adapter_results = result.adapter_results;
      }
      const { data: runRow } = await supabase
        .from("monitor_runs")
        .insert(runInsertPayload)
        .select("id")
        .single();

      if (runRow) {
        // System-emitted (no actor) — surfaces in the activity feed for the
        // org so users see "Monitor ran on X — found 2 changes".
        void emitActivity(supabase, {
          orgId: sub.org_id,
          actorUserId: null,
          verb: "ran_monitor",
          subjectType: "validation",
          subjectId: sub.validation_id,
          metadata: {
            subscription_id: sub.id,
            changes_count: result.changes.length,
            status: result.status,
          },
        });
      }

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
      let emailStatus: "sent" | "failed" | "skipped" = "skipped";
      if (result.status === "changes_found" && result.changes.length > 0) {
        const { data: validation } = await supabase
          .from("borrower_validations")
          .select("borrower_name, borrower_entity_name")
          .eq("id", sub.validation_id)
          .single();
        if (validation) {
          const sent = await notifyChanges(sub, validation, result.changes, PUBLIC_BASE_URL);
          emailStatus = sent ? "sent" : "failed";
          if (runRow) {
            const runUpdate: Record<string, unknown> = {};
            if (sent) runUpdate.notified_at = new Date().toISOString();
            if (RUN_RESULTS_ENABLED) runUpdate.email_status = emailStatus;
            if (Object.keys(runUpdate).length > 0) {
              await supabase.from("monitor_runs").update(runUpdate).eq("id", runRow.id);
            }
          }
        }
        changesFound++;
      } else if (RUN_RESULTS_ENABLED && runRow) {
        await supabase
          .from("monitor_runs")
          .update({ email_status: emailStatus })
          .eq("id", runRow.id);
      }

      // Choose next_run_at — back off 1h on rate limits instead of skipping
      // a full cadence window.
      const wasRateLimited = anyRateLimited(result.adapter_results);
      const next = wasRateLimited ? rateLimitedRunAt() : nextRunAt(sub.cadence);
      await supabase
        .from("monitor_subscriptions")
        .update({
          next_run_at: next.toISOString(),
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
