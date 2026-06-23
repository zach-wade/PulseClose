import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import {
  getCheckLimit,
  isUnlimitedPlan,
  getEffectiveCheckLimit,
  isOnTrial,
} from "@/lib/stripe/server";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();

  // Get org info for plan + billing/trial state
  const { data: org } = await supabase
    .from("organizations")
    .select("name, plan, checks_used_this_period, stripe_subscription_id, trial_ends_at")
    .eq("id", profile.org_id)
    .single();

  // Get all usage records for this org
  const { data: records } = await supabase
    .from("usage_records")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  const allRecords = records ?? [];

  // Aggregate stats
  const totalChecks = allRecords.length;
  const totalCostCents = allRecords.reduce((sum, r) => sum + (r.cost_cents ?? 0), 0);

  // By check type
  const byType: Record<string, { count: number; cost_cents: number }> = {};
  for (const r of allRecords) {
    if (!byType[r.check_type]) {
      byType[r.check_type] = { count: 0, cost_cents: 0 };
    }
    byType[r.check_type].count++;
    byType[r.check_type].cost_cents += r.cost_cents ?? 0;
  }

  // Daily counts for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dailyCounts: Record<string, number> = {};
  for (const r of allRecords) {
    const date = new Date(r.created_at).toISOString().split("T")[0];
    if (new Date(r.created_at) >= thirtyDaysAgo) {
      dailyCounts[date] = (dailyCounts[date] ?? 0) + 1;
    }
  }

  // Build daily chart data (fill gaps with 0)
  const chartData: { date: string; checks: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    chartData.push({ date: key, checks: dailyCounts[key] ?? 0 });
  }

  // Plan limit comes from PLANS config in stripe/server.ts (single source of
  // truth). The previous duplicated map here drifted (`pro` vs `professional`,
  // `enterprise: 999` vs `999999`). Internal plan reports plan_limit = null
  // so the UI can render "Unlimited" instead of a percent that's always 0.
  const plan = org?.plan ?? "starter";
  const planLimit = isUnlimitedPlan(plan) ? null : getCheckLimit(plan);

  // Billing/trial state for the dashboard usage meter. period_checks_used is
  // the org-level counter the gate enforces against (resets each billing
  // period); effective_limit is what the gate actually allows right now.
  const billing = {
    plan,
    hasSubscription: !!org?.stripe_subscription_id,
    trialEndsAt: org?.trial_ends_at ?? null,
  };
  const effectiveLimit = getEffectiveCheckLimit(billing);
  const onTrial = isOnTrial(billing);

  return NextResponse.json({
    org_name: org?.name ?? "Unknown",
    plan,
    plan_limit: planLimit,
    plan_unlimited: isUnlimitedPlan(plan),
    on_trial: onTrial,
    trial_ends_at: org?.trial_ends_at ?? null,
    has_subscription: billing.hasSubscription,
    period_checks_used: org?.checks_used_this_period ?? 0,
    effective_limit: Number.isFinite(effectiveLimit) ? effectiveLimit : null,
    total_checks: totalChecks,
    total_cost_cents: totalCostCents,
    by_type: byType,
    chart_data: chartData,
    recent_records: allRecords.slice(0, 50),
  });
}
