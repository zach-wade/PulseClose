"use client";

// /dashboard/compare?a=uuid&b=uuid
//
// Side-by-side comparison of two validations. Reached via the dashboard
// list's checkbox + "Compare selected" button. Reusable UX pattern for
// validation diff over time (B6) — same component, different ID source.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertTriangle } from "lucide-react";

type Tier = "HIGH" | "MEDIUM" | "LOW";
type Severity = "critical" | "moderate" | "minor" | "informational" | "none";

interface ValidationHeader {
  id: string;
  borrower_name: string;
  entity_name: string | null;
  validation_date: string | null;
  created_at: string;
  overall_status: string;
  confidence_score: number | null;
  experience_tier: number | null;
  property_count: number | null;
  flag_count: number | null;
  tier: Tier;
}

interface ComparedFactor {
  factor_key: string;
  label: string;
  severity_a: Severity | null;
  excluded_a: boolean | null;
  exclusion_reason_a: string | null;
  contributing_data_a: Record<string, unknown> | null;
  severity_b: Severity | null;
  excluded_b: boolean | null;
  exclusion_reason_b: string | null;
  contributing_data_b: Record<string, unknown> | null;
}

interface PortfolioMetrics {
  property_count: number;
  completed_sales: number;
  current_holdings: number;
  total_acquisition_volume: number | null;
  total_realized_profit: number | null;
  longest_hold_months: number | null;
  avg_ltv_pct: number | null;
}

interface CompareResponse {
  validations: ValidationHeader[];
  factors: ComparedFactor[];
  portfolio: PortfolioMetrics[];
}

function tierColor(tier: Tier) {
  if (tier === "HIGH") return "bg-red-500/90 text-white";
  if (tier === "MEDIUM") return "bg-amber-500/90 text-white";
  return "bg-emerald-500/90 text-white";
}

function severityDot(s: Severity | null) {
  if (s === "critical") return "bg-red-500";
  if (s === "moderate") return "bg-amber-500";
  if (s === "minor") return "bg-yellow-400";
  if (s === "informational") return "bg-slate-400";
  if (s === "none") return "bg-emerald-500";
  return "bg-slate-200";
}

function fmtCurrency(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Next 16 requires `useSearchParams()` consumers to be wrapped in a
// Suspense boundary so the prerender pass doesn't bail out on the
// CSR-only hook. This was causing every Vercel build to fail since PR 7
// shipped (production was stuck on a 9h-old deploy until this fix).
export default function ComparePage() {
  return (
    <Suspense fallback={<ComparePageSkeleton />}>
      <ComparePageInner />
    </Suspense>
  );
}

function ComparePageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function ComparePageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const a = params.get("a");
  const b = params.get("b");

  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!a || !b) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/validations/compare?ids=${a},${b}`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Compare failed (${res.status})`);
        }
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [a, b]);

  if (!a || !b) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
        </Button>
        <Card>
          <CardContent className="py-16 text-center">
            <h3 className="text-lg font-semibold">Pick two validations to compare</h3>
            <p className="text-sm text-muted-foreground mt-1">
              From the dashboard, select two rows with the checkboxes and click <strong>Compare selected</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
        </Button>
        <Card className="border-destructive/40">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive/70 mb-3" />
            <h3 className="text-lg font-semibold">Couldn&apos;t load comparison</h3>
            <p className="text-sm text-muted-foreground mt-1">{error ?? "Unknown error"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [v0, v1] = data.validations;
  const [p0, p1] = data.portfolio;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Compare validations</h1>
      </div>

      {/* Sticky headers */}
      <div className="grid grid-cols-2 gap-4">
        {[v0, v1].map((v) => (
          <Card key={v.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link href={`/dashboard/validations/${v.id}`} className="hover:underline">
                  {v.borrower_name}
                </Link>
              </CardTitle>
              {v.entity_name && (
                <p className="text-xs text-muted-foreground">{v.entity_name}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={tierColor(v.tier)}>{v.tier}</Badge>
                <span className="text-muted-foreground">
                  {v.flag_count ?? 0} flag{v.flag_count === 1 ? "" : "s"}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {v.confidence_score != null ? `${v.confidence_score}% completeness` : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Validated {v.validation_date ? new Date(v.validation_date).toLocaleDateString() : "—"}
                {v.experience_tier ? ` · Tier ${v.experience_tier} sponsor` : ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Aligned factor rows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk factors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="grid grid-cols-[1fr_2fr_2fr] px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
              <div>Factor</div>
              <div className="truncate">{v0.borrower_name}</div>
              <div className="truncate">{v1.borrower_name}</div>
            </div>
            {data.factors.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Both validations have no risk factors recorded.
              </div>
            ) : (
              data.factors.map((f) => (
                <FactorRow key={f.factor_key} factor={f} />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Portfolio metrics */}
      <div className="grid grid-cols-2 gap-4">
        {[p0, p1].map((p, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-sm">Portfolio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <PortfolioRow label="Properties" value={p.property_count} />
              <PortfolioRow label="Completed sales" value={p.completed_sales} />
              <PortfolioRow label="Current holdings" value={p.current_holdings} />
              <PortfolioRow label="Acquisition volume" value={fmtCurrency(p.total_acquisition_volume)} />
              <PortfolioRow label="Realized profit" value={fmtCurrency(p.total_realized_profit)} />
              <PortfolioRow
                label="Longest hold (months)"
                value={p.longest_hold_months != null ? `${p.longest_hold_months}` : "—"}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FactorRow({ factor }: { factor: ComparedFactor }) {
  return (
    <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 px-4 py-3 text-sm items-start">
      <div>
        <div className="font-medium">{factor.label}</div>
        <code className="text-xs text-muted-foreground">{factor.factor_key}</code>
      </div>
      <SideCell
        severity={factor.severity_a}
        excluded={factor.excluded_a}
        exclusionReason={factor.exclusion_reason_a}
      />
      <SideCell
        severity={factor.severity_b}
        excluded={factor.excluded_b}
        exclusionReason={factor.exclusion_reason_b}
      />
    </div>
  );
}

function SideCell({
  severity,
  excluded,
  exclusionReason,
}: {
  severity: Severity | null;
  excluded: boolean | null;
  exclusionReason: string | null;
}) {
  if (severity === null) {
    return <div className="text-xs text-muted-foreground italic">—</div>;
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${severityDot(severity)}`} />
        <span className="text-xs font-medium uppercase tracking-wide">
          {severity}
        </span>
        {excluded && (
          <Badge variant="outline" className="text-[10px]">excluded</Badge>
        )}
      </div>
      {excluded && exclusionReason && (
        <p className="text-xs text-muted-foreground">{exclusionReason}</p>
      )}
    </div>
  );
}

function PortfolioRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
