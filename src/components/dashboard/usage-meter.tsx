"use client";

// Compact usage / trial meter for the dashboard. Shows checks used vs the
// effective limit, the trial countdown, and an upgrade CTA when nearing or
// past the limit — so a self-serve trial user always knows where they stand
// and how to convert. Renders nothing for unlimited (internal) orgs.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, AlertTriangle } from "lucide-react";

interface UsageData {
  plan: string;
  plan_unlimited: boolean;
  on_trial: boolean;
  trial_ends_at: string | null;
  has_subscription: boolean;
  period_checks_used: number;
  effective_limit: number | null;
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function UsageMeter() {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);

  if (!data || data.plan_unlimited) return null;

  const used = data.period_checks_used;
  const limit = data.effective_limit; // null = unlimited (shouldn't hit here)
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const remaining = limit != null ? Math.max(0, limit - used) : null;
  const trialDays = daysLeft(data.trial_ends_at);

  // Trial ended, no subscription → hard paywall banner.
  const trialEnded = !data.has_subscription && !data.on_trial;
  if (trialEnded) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium">Your free trial has ended.</p>
              <p className="text-xs text-muted-foreground">
                Subscribe to keep running validations and underwriting.
              </p>
            </div>
          </div>
          <Button size="sm" render={<Link href="/dashboard/settings" />}>
            Choose a plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  const nearLimit = limit != null && remaining != null && remaining <= Math.max(2, Math.ceil(limit * 0.15));
  const barColor = nearLimit ? "bg-amber-500" : "bg-info";

  return (
    <Card className={data.on_trial ? "border-info/30 bg-info/5" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {data.on_trial && <Sparkles className="h-4 w-4 text-info shrink-0" />}
            <p className="text-sm font-medium truncate">
              {data.on_trial ? (
                <>Free trial{trialDays != null ? ` — ${trialDays} day${trialDays === 1 ? "" : "s"} left` : ""}</>
              ) : (
                <>Plan usage this period</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-muted-foreground">
              {used} / {limit} checks{remaining != null ? ` · ${remaining} left` : ""}
            </span>
            {(data.on_trial || nearLimit) && (
              <Button size="sm" variant={data.on_trial ? "default" : "outline"} render={<Link href="/dashboard/settings" />}>
                {data.on_trial ? "Subscribe" : "Upgrade"}
              </Button>
            )}
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}
