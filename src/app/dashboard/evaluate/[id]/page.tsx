"use client";

// Saved deal evaluation — resumes the Deal analyzer stepper hydrated from the
// persisted evaluation + its latest uw_model (sizing incl. exit/takeout,
// per-investor best-execution, AI judgment). One surface, same as a live deal;
// editing a field re-stales the downstream step. Replaces the old
// UnderwritingPanel + bespoke result cards (retired).

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { DealStepper } from "@/components/dashboard/deal/deal-stepper";
import { dealFromEvaluation, type Deal, type EvaluationResumeData, usd } from "@/lib/deal/view-model";

export default function EvaluationDetailPage() {
  const params = useParams();
  const [resume, setResume] = useState<Deal | null>(null);
  const [raw, setRaw] = useState<EvaluationResumeData | null>(null);
  const [investorCount, setInvestorCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [evalRes, invsRes] = await Promise.all([
        fetch(`/api/evaluate/${params.id}`),
        fetch("/api/investors"),
      ]);
      if (evalRes.ok) {
        const data = (await evalRes.json()) as EvaluationResumeData;
        setRaw(data);
        setResume(dealFromEvaluation(data));
      }
      if (invsRes.ok) {
        const invs = await invsRes.json();
        setInvestorCount(Array.isArray(invs) ? invs.length : (invs?.investors?.length ?? null));
      }
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

  if (!resume || !raw) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard/evaluate" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-destructive">Evaluation not found.</p>
      </div>
    );
  }

  const borrowerName = resume.terms.borrower_name || "Deal evaluation";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard/evaluate" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{borrowerName}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {usd(raw.loan_amount)} {raw.loan_type} • {raw.property_type}
            {raw.location ? ` • ${raw.location}` : ""}
            {resume.terms.property_address ? ` • ${resume.terms.property_address}` : ""}
          </p>
        </div>
      </div>

      <DealStepper prefill={{}} investorCount={investorCount} resume={resume} />
    </div>
  );
}
