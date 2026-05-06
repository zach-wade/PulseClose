"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { InvestorPerformanceCard } from "@/components/dashboard/investor-performance-card";

// A4/A5 — Investor detail page. Pulls the criteria + performance card +
// rate trend together in one place. The admin-list view at
// /dashboard/evaluate/investors stays the place to add/edit; this is the
// place to read deep stats.

interface CriterionRow {
  criteria_key: string;
  criteria_value: unknown;
  source?: "pdf_parse" | "user_input" | null;
  source_doc_url?: string | null;
}

interface Investor {
  id: string;
  display_name: string;
  type: string | null;
  notes: string | null;
  criteria: CriterionRow[];
}

export default function InvestorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [investor, setInvestor] = useState<Investor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/investors/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((j) => !cancelled && setInvestor(j.investor))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !investor) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard/evaluate/investors" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-destructive">{error || "Investor not found"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard/evaluate/investors" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            {investor.display_name}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {investor.type && <Badge variant="outline" className="mr-2">{investor.type}</Badge>}
            {investor.criteria.length} active criteria
          </p>
        </div>
      </div>

      {/* A4 + A5 — performance card with rate trend */}
      <InvestorPerformanceCard investorId={investor.id} />

      {investor.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{investor.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Criteria</span>
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/dashboard/evaluate/investors" />}
            >
              Edit
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {investor.criteria.map((c, i) => (
              <div key={i} className="rounded-md border p-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{c.criteria_key}</p>
                  {c.source === "pdf_parse" && (
                    <Badge variant="outline" className="text-[10px]">
                      PDF
                    </Badge>
                  )}
                </div>
                <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(c.criteria_value, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
