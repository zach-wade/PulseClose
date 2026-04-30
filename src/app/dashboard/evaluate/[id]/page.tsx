"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

interface ComputedTerms {
  max_ltv: number | null;
  max_ltc: number | null;
  max_ltarv: number | null;
  estimated_rate_pct: number | null;
  estimated_points: number | null;
  applied_adjusters: { name: string; rate_bps: number; points_bps: number }[];
  matched_tier_index: number | null;
  boundary_warnings: { field: string; message: string }[];
  failure_reasons: { field: string; rule: string; expected: unknown; actual: unknown }[];
}

interface EvaluationResultRow {
  id: string;
  investor_id: string;
  result: "pass" | "conditional" | "fail";
  computed_terms: ComputedTerms;
  reasoning: string;
  investors: { display_name: string; type: string | null } | null;
}

interface EvaluationDetail {
  id: string;
  loan_amount: number;
  loan_type: string;
  property_type: string;
  location: string;
  purchase_price: number | null;
  arv: number | null;
  rehab_budget: number | null;
  fico: number | null;
  sponsor_experience_tier: number | null;
  evaluated_at: string;
  additional_params: Record<string, unknown> | null;
  results: EvaluationResultRow[];
}

function fmtPct(v: number | null) {
  if (v == null) return "—";
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
}
function fmtRate(v: number | null) {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}
function fmtCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function ResultBadge({ result }: { result: "pass" | "conditional" | "fail" }) {
  if (result === "pass") return <Badge className="bg-emerald-500/90 text-white hover:bg-emerald-500">Eligible</Badge>;
  if (result === "conditional") return <Badge className="bg-amber-500/90 text-white hover:bg-amber-500">Conditional</Badge>;
  return <Badge variant="destructive">Ineligible</Badge>;
}

export default function EvaluationDetailPage() {
  const params = useParams();
  const [data, setData] = useState<EvaluationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/evaluate/${params.id}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard/evaluate" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-destructive">Evaluation not found.</p>
      </div>
    );
  }

  const sortedResults = [...data.results].sort((a, b) => {
    const order: Record<string, number> = { pass: 0, conditional: 1, fail: 2 };
    if (order[a.result] !== order[b.result]) return order[a.result] - order[b.result];
    const ra = a.computed_terms?.estimated_rate_pct ?? Infinity;
    const rb = b.computed_terms?.estimated_rate_pct ?? Infinity;
    return ra - rb;
  });

  const borrowerName = (data.additional_params?.borrower_name as string | undefined) ?? null;
  const propertyAddress = (data.additional_params?.property_address as string | undefined) ?? null;
  const occupancy = (data.additional_params?.occupancy as string | undefined) ?? null;
  const isRural = data.additional_params?.is_rural ? "Yes" : "No";
  const loanPurpose = (data.additional_params?.loan_purpose as string | undefined) ?? null;
  const constructionBudget = data.additional_params?.construction_budget as number | null | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard/evaluate" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {borrowerName ?? "Deal evaluation"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {fmtCurrency(data.loan_amount)} {data.loan_type} • {data.property_type} • {data.location}
            {propertyAddress && ` • ${propertyAddress}`}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deal parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Purchase price</p><p className="font-medium">{fmtCurrency(data.purchase_price)}</p></div>
            <div><p className="text-xs text-muted-foreground">Loan amount</p><p className="font-medium">{fmtCurrency(data.loan_amount)}</p></div>
            <div><p className="text-xs text-muted-foreground">ARV</p><p className="font-medium">{fmtCurrency(data.arv)}</p></div>
            <div><p className="text-xs text-muted-foreground">Rehab budget</p><p className="font-medium">{fmtCurrency(data.rehab_budget)}</p></div>
            <div><p className="text-xs text-muted-foreground">Construction budget</p><p className="font-medium">{fmtCurrency(constructionBudget ?? null)}</p></div>
            <div><p className="text-xs text-muted-foreground">FICO</p><p className="font-medium">{data.fico ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Experience tier</p><p className="font-medium">Tier {data.sponsor_experience_tier ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Occupancy</p><p className="font-medium">{occupancy ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Loan purpose</p><p className="font-medium">{loanPurpose ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Rural</p><p className="font-medium">{isRural}</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investor results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedResults.map((r) => (
            <div
              key={r.id}
              className={`rounded-md border p-3 ${
                r.result === "pass"
                  ? "border-emerald-200 bg-emerald-50/30"
                  : r.result === "conditional"
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-medium">{r.investors?.display_name ?? r.investor_id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.reasoning}</p>
                </div>
                <ResultBadge result={r.result} />
              </div>
              {(r.result === "pass" || r.result === "conditional") && r.computed_terms && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm pt-2 border-t border-border/50">
                  <div><p className="text-xs text-muted-foreground">Max LTV</p><p className="font-semibold">{fmtPct(r.computed_terms.max_ltv)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Max LTC</p><p className="font-semibold">{fmtPct(r.computed_terms.max_ltc)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Max LTARV</p><p className="font-semibold">{fmtPct(r.computed_terms.max_ltarv)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Rate</p><p className="font-semibold">{fmtRate(r.computed_terms.estimated_rate_pct)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Points</p><p className="font-semibold">{r.computed_terms.estimated_points != null ? r.computed_terms.estimated_points.toFixed(2) : "—"}</p></div>
                </div>
              )}
              {r.computed_terms?.applied_adjusters && r.computed_terms.applied_adjusters.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Rate adjusters applied</p>
                  <ul className="text-xs space-y-0.5">
                    {r.computed_terms.applied_adjusters.map((a, i) => (
                      <li key={i}>{a.name}: {a.rate_bps > 0 ? `+${a.rate_bps}` : a.rate_bps}bps rate{a.points_bps !== 0 ? `, ${a.points_bps > 0 ? "+" : ""}${a.points_bps}bps points` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
              {r.computed_terms?.boundary_warnings && r.computed_terms.boundary_warnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-xs uppercase tracking-wide text-amber-700 mb-1">Boundary warnings</p>
                  <ul className="text-xs space-y-0.5 text-amber-900">
                    {r.computed_terms.boundary_warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                  </ul>
                </div>
              )}
              {r.computed_terms?.failure_reasons && r.computed_terms.failure_reasons.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-xs uppercase tracking-wide text-destructive mb-1">Why ineligible</p>
                  <ul className="text-xs space-y-0.5">
                    {r.computed_terms.failure_reasons.map((f, i) => (
                      <li key={i}>
                        <span className="font-medium">{f.field}</span>: {f.rule}
                        {f.expected != null && (
                          <span className="text-muted-foreground"> (expected {Array.isArray(f.expected) ? (f.expected as unknown[]).join(", ") : String(f.expected)}, got {String(f.actual)})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
