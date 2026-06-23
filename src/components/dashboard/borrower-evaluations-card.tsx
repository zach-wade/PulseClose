"use client";

// Borrower's recent evaluations, surfaced on the validation detail page so a
// lender can jump from a borrower to the deals they've already run against
// their investors (UX-PLAN §1.6). Matches by this validation OR the borrower
// record; renders nothing when there are none (the next-step strip already
// nudges toward the first evaluation).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, ChevronRight } from "lucide-react";

interface EvalRow {
  id: string;
  validation_id: string | null;
  borrower_id: string | null;
  loan_amount: number;
  loan_type: string;
  property_type: string;
  location: string;
  evaluated_at: string;
}

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function BorrowerEvaluationsCard({
  validationId,
  borrowerId,
}: {
  validationId: string;
  borrowerId: string | null;
}) {
  const [rows, setRows] = useState<EvalRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/evaluate");
      if (!res.ok) {
        setRows([]);
        return;
      }
      const all: EvalRow[] = await res.json();
      setRows(
        all.filter(
          (e) =>
            e.validation_id === validationId ||
            (borrowerId != null && e.borrower_id === borrowerId),
        ),
      );
    })();
  }, [validationId, borrowerId]);

  if (!rows || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4 text-info" /> Recent evaluations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.slice(0, 5).map((e) => (
          <Link
            key={e.id}
            href={`/dashboard/evaluate/${e.id}`}
            className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-accent text-sm transition-colors"
          >
            <span className="min-w-0 truncate">
              {usd(e.loan_amount)} {e.loan_type} • {e.property_type} • {e.location}
            </span>
            <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
              {new Date(e.evaluated_at).toLocaleDateString()}
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
