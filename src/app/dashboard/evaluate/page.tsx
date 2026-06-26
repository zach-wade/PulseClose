"use client";

// Evaluate Deal — the shell around the Deal analyzer stepper (UX-REDESIGN-PLAN
// §2). All the deal/eligibility/sizing/judgment work lives in <DealStepper>;
// this page only owns the header, the investor count + empty/error state, and
// the recent-evaluations list. The two-engine form-wall it replaced is gone.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, ChevronRight, Settings } from "lucide-react";
import { DealStepper } from "@/components/dashboard/deal/deal-stepper";

interface RecentEvaluation {
  id: string;
  loan_amount: number;
  loan_type: string;
  property_type: string;
  location: string;
  evaluated_at: string;
  additional_params: { borrower_name?: string | null; property_address?: string | null } | null;
}

function fmtCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function EvaluatePageInner() {
  // Prefill from URL params when navigated from a validation detail page
  // ("Evaluate against my investors"). Only borrower-side signals come
  // through; loan-specific Terms stay defaults so the lender thinks about them.
  const searchParams = useSearchParams();
  const prefill = {
    validation_id: searchParams.get("validation_id"),
    borrower_name: searchParams.get("borrower") ?? "",
    property_state: searchParams.get("state") ?? "",
    experience_tier: searchParams.get("experience"),
  };

  const [recent, setRecent] = useState<RecentEvaluation[]>([]);
  const [investorCount, setInvestorCount] = useState<number | null>(null);
  const [investorLoadError, setInvestorLoadError] = useState<string | null>(null);

  const refreshRecent = useCallback(async () => {
    const res = await fetch("/api/evaluate");
    if (res.ok) setRecent(await res.json());
  }, []);

  useEffect(() => {
    (async () => {
      // Track investor-fetch failure separately so the empty state can tell
      // "you have 0 investors" apart from "the API failed" — otherwise a real
      // outage looks like a fresh tenant during a live demo.
      const [evalsRes, invsRes] = await Promise.all([fetch("/api/evaluate"), fetch("/api/investors")]);
      if (evalsRes.ok) setRecent(await evalsRes.json());
      if (invsRes.ok) {
        const invs = await invsRes.json();
        setInvestorCount(invs.length);
      } else {
        setInvestorLoadError(`Couldn't load investors (${invsRes.status})`);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-info/10 p-2">
            <Calculator className="h-5 w-5 text-info" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Deals</h1>
            <p className="text-muted-foreground text-sm mt-1">
              One deal, five steps — eligibility across your investors, then optional sizing + AI judgment.
            </p>
          </div>
        </div>
        <Button variant="outline" render={<Link href="/dashboard/evaluate/investors" />}>
          <Settings className="mr-2 h-4 w-4" />
          Manage investors {investorCount != null ? `(${investorCount})` : ""}
        </Button>
      </div>

      {investorLoadError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <strong>{investorLoadError}.</strong> Refresh the page to retry. This is an API problem, not an empty configuration.
          </CardContent>
        </Card>
      ) : investorCount === 0 ? (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4 text-sm">
            No investors configured yet. Eligibility needs at least one capital partner to evaluate against — add one in{" "}
            <Link href="/dashboard/evaluate/investors" className="underline font-medium">
              Manage investors
            </Link>
            . A starter criteria template is created for you to edit.
          </CardContent>
        </Card>
      ) : null}

      <DealStepper prefill={prefill} investorCount={investorCount} onEvaluated={refreshRecent} />

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent evaluations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.slice(0, 10).map((e) => (
              <Link
                key={e.id}
                href={`/dashboard/evaluate/${e.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-accent text-sm transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {e.additional_params?.borrower_name ?? "(no borrower)"}
                    <span className="font-normal text-muted-foreground ml-2">
                      {fmtCurrency(e.loan_amount)} {e.loan_type} • {e.property_type} • {e.location}
                    </span>
                  </p>
                  {e.additional_params?.property_address && (
                    <p className="text-xs text-muted-foreground truncate">{e.additional_params.property_address}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(e.evaluated_at).toLocaleDateString()}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// useSearchParams() requires a Suspense boundary on Next 16 — without it the
// prerender of /dashboard/evaluate fails the build and Vercel keeps serving the
// prior deploy.
export default function EvaluatePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <EvaluatePageInner />
    </Suspense>
  );
}
