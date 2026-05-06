"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";

// A4 — investor performance card. A5 — rate history sparkline (inline).
// Surfaces both at once because the data load is the same query.

interface RateSample {
  evaluated_at: string;
  rate: number | null;
  points: number | null;
  loan_amount_cents: number | null;
  result: "pass" | "conditional" | "fail";
}

interface Performance {
  investor_id: string;
  display_name: string;
  evaluations: number;
  pass: number;
  conditional: number;
  fail: number;
  pass_rate: number | null;
  conditional_rate: number | null;
  fail_rate: number | null;
  funded: number;
  repaid: number;
  extended: number;
  defaulted: number;
  withdrawn: number;
  funded_total_cents: number | null;
  avg_loan_amount_cents: number | null;
  default_rate: number | null;
  rate_history: RateSample[];
  latest_evaluated_at: string | null;
}

interface Props {
  investorId: string;
  // When `compact`, skips the rate sparkline + outcome row — used inline
  // on the investor admin list. Full layout is on the detail page.
  compact?: boolean;
}

export function InvestorPerformanceCard({ investorId, compact }: Props) {
  const [perf, setPerf] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/investors/${investorId}/performance`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((j) => !cancelled && setPerf(j.performance))
      .catch(() => !cancelled && setPerf(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [investorId]);

  if (loading) {
    return compact ? (
      <Skeleton className="h-12 w-full" />
    ) : (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!perf || perf.evaluations === 0) {
    if (compact) return null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No deals have been evaluated against this investor yet. Performance
            metrics surface once you run evaluations on{" "}
            <a href="/dashboard/evaluate" className="underline">
              /dashboard/evaluate
            </a>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  const fundedFmt = perf.funded_total_cents
    ? `$${Math.round(perf.funded_total_cents / 100).toLocaleString()}`
    : null;
  const avgLoanFmt = perf.avg_loan_amount_cents
    ? `$${Math.round(perf.avg_loan_amount_cents / 100).toLocaleString()}`
    : null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-2 mt-2">
        <span>
          <span className="font-medium text-foreground">{perf.evaluations}</span>{" "}
          evaluation{perf.evaluations === 1 ? "" : "s"}
        </span>
        {perf.pass_rate !== null && (
          <span>
            <span className="font-medium text-emerald-700">
              {Math.round(perf.pass_rate * 100)}%
            </span>{" "}
            pass
          </span>
        )}
        {perf.funded > 0 && (
          <span>
            <span className="font-medium text-foreground">{perf.funded}</span> funded
          </span>
        )}
        {perf.defaulted > 0 && (
          <span>
            <span className="font-medium text-red-700">{perf.defaulted}</span> defaulted
          </span>
        )}
        {fundedFmt && (
          <span>
            <span className="font-medium text-foreground">{fundedFmt}</span> total
          </span>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Performance
          </span>
          <Badge variant="outline" className="text-xs font-normal">
            {perf.evaluations} evaluation{perf.evaluations === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Verdict mix */}
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Verdict mix
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Pass"
              value={perf.pass}
              pct={perf.pass_rate}
              accent="positive"
            />
            <Stat
              label="Conditional"
              value={perf.conditional}
              pct={perf.conditional_rate}
              accent="caution"
            />
            <Stat
              label="Fail"
              value={perf.fail}
              pct={perf.fail_rate}
              accent="neutral"
            />
          </div>
        </div>

        {/* Outcome mix */}
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Closed outcomes
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Funded" value={perf.funded} accent="positive" />
            <Stat label="Repaid" value={perf.repaid} accent="positive" />
            <Stat label="Extended" value={perf.extended} accent="caution" />
            <Stat label="Defaulted" value={perf.defaulted} accent="negative" />
            <Stat label="Withdrawn" value={perf.withdrawn} accent="neutral" />
          </div>
        </div>

        {/* Aggregate */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {fundedFmt && (
            <div>
              <span className="text-muted-foreground">Total funded: </span>
              <span className="font-medium">{fundedFmt}</span>
            </div>
          )}
          {avgLoanFmt && (
            <div>
              <span className="text-muted-foreground">Avg loan size: </span>
              <span className="font-medium">{avgLoanFmt}</span>
            </div>
          )}
          {perf.default_rate !== null && perf.default_rate > 0 && (
            <div>
              <span className="text-muted-foreground">Default rate: </span>
              <span className="text-red-700 font-medium">
                {Math.round(perf.default_rate * 100)}%
              </span>
            </div>
          )}
          {perf.latest_evaluated_at && (
            <div>
              <span className="text-muted-foreground">Last evaluated: </span>
              <span className="font-medium">
                {new Date(perf.latest_evaluated_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* A5 — rate history sparkline */}
        {perf.rate_history.length > 1 && (
          <RateSparkline samples={perf.rate_history} />
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  pct,
  accent,
}: {
  label: string;
  value: number;
  pct?: number | null;
  accent: "positive" | "negative" | "caution" | "neutral";
}) {
  const accentClass = {
    positive: value > 0 ? "text-emerald-700" : "text-muted-foreground",
    negative: value > 0 ? "text-red-700" : "text-muted-foreground",
    caution: value > 0 ? "text-amber-700" : "text-muted-foreground",
    neutral: "text-foreground",
  }[accent];
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1">
        <p className={`text-lg font-semibold ${accentClass}`}>{value}</p>
        {pct != null && pct > 0 && (
          <p className="text-xs text-muted-foreground">
            ({Math.round(pct * 100)}%)
          </p>
        )}
      </div>
    </div>
  );
}

// Tiny inline sparkline for rate movement. SVG path; no charting lib.
// Useful at-a-glance "is this investor's pricing trending up or down?"
function RateSparkline({ samples }: { samples: RateSample[] }) {
  const rateSamples = samples.filter((s) => s.rate !== null);
  if (rateSamples.length < 2) return null;

  const rates = rateSamples.map((s) => s.rate as number);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 1;
  const W = 320;
  const H = 56;
  const xStep = rateSamples.length > 1 ? W / (rateSamples.length - 1) : 0;

  const points = rateSamples
    .map((s, i) => {
      const x = i * xStep;
      const y = H - ((s.rate as number) - min) / range * (H - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  const first = rateSamples[0];
  const last = rateSamples[rateSamples.length - 1];
  const delta =
    first.rate !== null && last.rate !== null ? (last.rate as number) - (first.rate as number) : 0;
  const deltaLabel =
    delta > 0
      ? `+${delta.toFixed(2)}`
      : delta < 0
        ? delta.toFixed(2)
        : "flat";
  const deltaClass =
    delta > 0 ? "text-amber-700" : delta < 0 ? "text-emerald-700" : "text-muted-foreground";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Rate trend ({rateSamples.length} samples)
        </p>
        <p className={`text-xs ${deltaClass} font-medium`}>{deltaLabel}</p>
      </div>
      <div className="flex items-baseline gap-3">
        <svg width={W} height={H} className="overflow-visible">
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-blue-500"
          />
          {rateSamples.map((s, i) => {
            const x = i * xStep;
            const y = H - ((s.rate as number) - min) / range * (H - 8) - 4;
            const fill =
              s.result === "pass"
                ? "#10b981"
                : s.result === "conditional"
                  ? "#f59e0b"
                  : "#ef4444";
            return <circle key={i} cx={x} cy={y} r={2.5} fill={fill} />;
          })}
        </svg>
        <div className="text-xs text-muted-foreground">
          <p>{max.toFixed(2)}% high</p>
          <p>{min.toFixed(2)}% low</p>
        </div>
      </div>
    </div>
  );
}
