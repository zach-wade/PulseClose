"use client";

// B2 — Portfolio health dashboard. The "first thing the lender opens
// in the morning" view. Aggregate stats + a borrowers-needing-attention
// list. Single GET /api/portfolio fetch.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, AlertTriangle, CheckCircle2, Clock, Hourglass } from "lucide-react";

type RiskSeverity = "critical" | "moderate" | "minor" | "informational" | "none";
type ValidationStatus = "pending" | "verified" | "partial" | "flagged";
type OutcomeStatus = "withdrawn" | "funded" | "extended" | "repaid" | "defaulted";

interface PortfolioPayload {
  totals: { validations: number; borrowers: number };
  status_counts: Record<ValidationStatus, number>;
  tier_counts: Record<string, number>;
  severity_counts: Record<RiskSeverity, number>;
  outcomes_90d: Record<OutcomeStatus, number>;
  attention: {
    validation_id: string;
    borrower_id: string | null;
    borrower_name: string | null;
    borrower_entity_name: string | null;
    overall_status: ValidationStatus;
    experience_tier: number | null;
    created_at: string;
    critical_factor_keys: string[];
  }[];
}

function StatPill({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  const toneClasses =
    tone === "ok"
      ? "bg-emerald-50/40 border-emerald-200"
      : tone === "warn"
        ? "bg-amber-50/40 border-amber-200"
        : tone === "danger"
          ? "bg-destructive/5 border-destructive/30"
          : "bg-muted/40 border-border";
  return (
    <div className={`rounded-md border p-3 ${toneClasses}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function severityBadge(severity: RiskSeverity) {
  const map: Record<RiskSeverity, string> = {
    critical: "bg-destructive/15 text-destructive",
    moderate: "bg-amber-500/15 text-amber-700",
    // minor is de-emphasized, not highlighted — only critical/moderate carry
    // color (Noah's opaque-label principle; a blue "minor" reads as a callout).
    minor: "bg-slate-100 text-slate-600",
    informational: "bg-muted text-muted-foreground",
    none: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[severity]}`}>
      {severity}
    </span>
  );
}

function statusBadge(status: ValidationStatus) {
  if (status === "verified") return <Badge className="bg-emerald-500/90 text-white hover:bg-emerald-500">Verified</Badge>;
  if (status === "flagged") return <Badge variant="destructive">Flagged</Badge>;
  if (status === "partial") return <Badge className="bg-amber-500/90 text-white hover:bg-amber-500">Partial</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/portfolio");
        if (res.ok) {
          setData(await res.json());
        } else {
          // Surface the actual server-side error so we can debug rather
          // than just showing "Failed to load."
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.error) msg += ` — ${body.error}`;
          } catch {
            // body wasn't JSON
          }
          setErrorDetail(msg);
        }
      } catch (e) {
        setErrorDetail(e instanceof Error ? e.message : String(e));
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
          <p className="text-muted-foreground text-sm mt-1">Loading…</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <p className="text-destructive">Failed to load portfolio data.</p>
      </div>
    );
  }

  const totalOutcomes90d = Object.values(data.outcomes_90d).reduce((a, b) => a + b, 0);
  const fundedRate = totalOutcomes90d > 0 ? Math.round((data.outcomes_90d.funded / totalOutcomes90d) * 100) : null;
  const defaultedCount = data.outcomes_90d.defaulted;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {data.totals.borrowers} borrower{data.totals.borrowers === 1 ? "" : "s"} • {data.totals.validations} validation{data.totals.validations === 1 ? "" : "s"} on record
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill
          label="Verified borrowers"
          value={data.status_counts.verified}
          sub={`${data.status_counts.partial} partial • ${data.status_counts.pending} pending`}
          tone="ok"
        />
        <StatPill
          label="Critical flags"
          value={data.severity_counts.critical}
          sub={`${data.severity_counts.moderate} moderate • ${data.severity_counts.minor} minor`}
          tone={data.severity_counts.critical > 0 ? "danger" : "muted"}
        />
        <StatPill
          label="Funded (90d)"
          value={data.outcomes_90d.funded}
          sub={fundedRate != null ? `${fundedRate}% of outcomes` : "no outcomes recorded"}
          tone="ok"
        />
        <StatPill
          label="Defaulted (90d)"
          value={defaultedCount}
          sub={defaultedCount === 0 ? "no defaults" : "review needed"}
          tone={defaultedCount > 0 ? "danger" : "muted"}
        />
      </div>

      {/* Tier + status grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Experience tier mix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2 text-sm">
              {(["1", "2", "3", "4", "unknown"] as const).map((t) => (
                <div key={t} className="text-center rounded-md border p-2">
                  <p className="text-xs text-muted-foreground uppercase">{t === "unknown" ? "?" : `Tier ${t}`}</p>
                  <p className="text-lg font-semibold">{data.tier_counts[t] ?? 0}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Tier 1 = 10+ deals • Tier 2 = 5–9 • Tier 3 = 1–4 • Tier 4 = first-time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outcome mix (90 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {totalOutcomes90d === 0 ? (
              <p className="text-sm text-muted-foreground">No outcomes recorded in the last 90 days. Use the deal-outcome card on a validation to capture funded / extended / repaid / withdrawn / defaulted.</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(data.outcomes_90d)
                  .filter(([, n]) => n > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{k}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded bg-primary" style={{ width: `${(n / totalOutcomes90d) * 200}px`, minWidth: "8px" }} />
                        <span className="font-medium tabular-nums">{n}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Borrowers needing attention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Borrowers with active critical flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.attention.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              No borrowers with active critical flags. Nice.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.attention.map((row) => (
                <li key={row.validation_id} className="py-2">
                  <Link
                    href={`/dashboard/validations/${row.validation_id}`}
                    className="flex items-center justify-between gap-3 hover:bg-muted/50 -mx-2 px-2 py-1 rounded transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {row.borrower_name}
                        {row.borrower_entity_name && (
                          <span className="text-muted-foreground font-normal"> — {row.borrower_entity_name}</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {statusBadge(row.overall_status)}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtDate(row.created_at)}
                        </span>
                        {row.experience_tier != null && (
                          <span className="inline-flex items-center gap-1">
                            <Hourglass className="h-3 w-3" />
                            Tier {row.experience_tier}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {row.critical_factor_keys.slice(0, 4).map((k) => (
                          <span key={k}>{severityBadge("critical" as RiskSeverity)}<span className="ml-1 text-xs text-muted-foreground">{k}</span></span>
                        ))}
                        {row.critical_factor_keys.length > 4 && (
                          <span className="text-xs text-muted-foreground">+{row.critical_factor_keys.length - 4}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
