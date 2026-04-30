"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, DollarSign, Activity, TrendingUp } from "lucide-react";

interface UsageData {
  org_name: string;
  plan: string;
  // null when the org is on the `internal` plan (unlimited).
  plan_limit: number | null;
  plan_unlimited: boolean;
  total_checks: number;
  total_cost_cents: number;
  by_type: Record<string, { count: number; cost_cents: number }>;
  chart_data: { date: string; checks: number }[];
  recent_records: {
    id: string;
    check_type: string;
    data_source: string;
    cost_cents: number;
    response_status: string;
    created_at: string;
    validation_id: string | null;
  }[];
}

const checkTypeLabels: Record<string, string> = {
  sos_lookup: "Entity (SOS)",
  property_search: "Track Record",
  litigation_search: "Litigation",
  gc_lookup: "GC Validation",
  pacer_search: "PACER",
};

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/usage");
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage & Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            API usage, validation credits, and cost tracking
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // Internal plan = no cap; render "Unlimited" + suppress the
  // approaching-limit warning. Avoids div-by-zero from the previous
  // (total_checks / plan_limit) calc when plan_limit is null.
  const usagePercent =
    data.plan_unlimited || data.plan_limit == null || data.plan_limit === 0
      ? 0
      : Math.min(
          100,
          Math.round((data.total_checks / data.plan_limit) * 100),
        );
  const maxChecks = Math.max(...data.chart_data.map((d) => d.checks), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usage & Billing</h1>
        <p className="text-muted-foreground text-sm mt-1">
          API usage, validation credits, and cost tracking
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total Checks</p>
            </div>
            <p className="text-2xl font-bold mt-1">{data.total_checks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Estimated Cost</p>
            </div>
            <p className="text-2xl font-bold mt-1">
              ${(data.total_cost_cents / 100).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Check Types Used</p>
            </div>
            <p className="text-2xl font-bold mt-1">
              {Object.keys(data.by_type).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Plan</p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="capitalize">
                {data.plan}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {data.plan_unlimited
                  ? `${data.total_checks} checks · unlimited`
                  : `${data.total_checks}/${data.plan_limit} checks`}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.plan_unlimited ? (
            <p className="text-sm text-muted-foreground">
              {data.total_checks} checks this period · <strong>Unlimited</strong>{" "}
              (internal account, no monthly cap).
            </p>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span>
                  {data.total_checks} of {data.plan_limit} checks used
                </span>
                <span className="text-muted-foreground">{usagePercent}%</span>
              </div>
              <Progress
                value={usagePercent}
                className={
                  usagePercent > 80
                    ? "[&>[data-slot=indicator]]:bg-destructive"
                    : usagePercent > 60
                      ? "[&>[data-slot=indicator]]:bg-warning"
                      : ""
                }
              />
              {usagePercent > 80 && (
                <p className="text-xs text-amber-600">
                  Approaching plan limit. Consider upgrading to Professional for 50 checks/month.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Daily activity chart (CSS bars) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Activity (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-[3px] h-32">
            {data.chart_data.map((d) => (
              <div
                key={d.date}
                className="flex-1 bg-primary/80 rounded-t-sm hover:bg-primary transition-colors"
                style={{
                  height: `${(d.checks / maxChecks) * 100}%`,
                  minHeight: d.checks > 0 ? "4px" : "0",
                }}
                title={`${d.date}: ${d.checks} checks`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{data.chart_data[0]?.date}</span>
            <span>{data.chart_data[data.chart_data.length - 1]?.date}</span>
          </div>
        </CardContent>
      </Card>

      {/* Cost breakdown by type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost by Check Type</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check Type</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.by_type).map(([type, stats]) => (
                <TableRow key={type}>
                  <TableCell className="font-medium">
                    {checkTypeLabels[type] ?? type}
                  </TableCell>
                  <TableCell className="text-right">{stats.count}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${stats.count > 0 ? ((stats.cost_cents / stats.count) / 100).toFixed(2) : "0.00"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${(stats.cost_cents / 100).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent activity log */}
      {data.recent_records.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Check Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">
                      {new Date(r.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {checkTypeLabels[r.check_type] ?? r.check_type}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.data_source}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${(r.cost_cents / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.response_status === "success"
                            ? "default"
                            : "destructive"
                        }
                      >
                        {r.response_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
