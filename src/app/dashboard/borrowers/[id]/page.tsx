"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  History,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  AlertOctagon,
} from "lucide-react";
import { VerdictChip, type VerdictChipData } from "@/components/validation/verdict-chip";

// E2 + B4 (roll-up half) — borrower record page. Aggregates the
// borrower's lender-relationship history with this org plus a list of
// every validation. The intake-time "have we seen this borrower" guard
// (other half of B4) lives in /dashboard/new and reuses this same data.

interface Reputation {
  borrower_id: string;
  display_name: string;
  validation_count: number;
  first_seen_at: string | null;
  latest_seen_at: string | null;
  tier_mix: { HIGH: number; MEDIUM: number; LOW: number };
  outcome_mix: {
    funded: number;
    repaid: number;
    extended: number;
    defaulted: number;
    withdrawn: number;
    no_outcome: number;
  };
  funded_total_cents: number | null;
  signal_corrections: number;
  risk_factor_total: number;
  default_rate: number | null;
  extension_rate: number | null;
  signal_correction_rate: number | null;
}

interface ValidationRow {
  id: string;
  borrower_name: string;
  borrower_entity_name: string;
  overall_status: string;
  confidence_score: number;
  experience_tier: number | null;
  validation_date: string | null;
  created_at: string;
  tier: "HIGH" | "MEDIUM" | "LOW" | null;
  outcome: { status: string; updated_at: string } | null;
  verdict: VerdictChipData | null;
}

const outcomeConfig: Record<
  string,
  { label: string; icon: typeof CheckCircle2 }
> = {
  withdrawn: { label: "Withdrawn", icon: XCircle },
  funded: { label: "Funded", icon: CheckCircle2 },
  extended: { label: "Extended", icon: Clock },
  repaid: { label: "Repaid", icon: RefreshCw },
  defaulted: { label: "Defaulted", icon: AlertOctagon },
};

const tierClass: Record<string, string> = {
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH: "bg-red-50 text-red-700 border-red-200",
};

export default function BorrowerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [rep, setRep] = useState<Reputation | null>(null);
  const [validations, setValidations] = useState<ValidationRow[]>([]);
  const [borrowerName, setBorrowerName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/borrowers/${id}/reputation`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("reputation load failed")),
      ),
      fetch(`/api/borrowers/${id}/validations`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("validations load failed")),
      ),
    ])
      .then(([repJ, valJ]) => {
        if (cancelled) return;
        setRep(repJ.reputation);
        setValidations(valJ.validations);
        setBorrowerName(valJ.borrower.display_name);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !rep) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-destructive">{error || "Borrower not found"}</p>
      </div>
    );
  }

  const fundedFmt =
    rep.funded_total_cents != null
      ? `$${Math.round(rep.funded_total_cents / 100).toLocaleString()}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            {borrowerName}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Borrower record · {rep.validation_count} validation{rep.validation_count === 1 ? "" : "s"} with your org
          </p>
        </div>
      </div>

      {/* Reputation summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">History with this org</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Funded" value={rep.outcome_mix.funded} positive />
            <Stat label="Repaid" value={rep.outcome_mix.repaid} positive />
            <Stat label="Extended" value={rep.outcome_mix.extended} caution />
            <Stat label="Defaulted" value={rep.outcome_mix.defaulted} negative />
            <Stat label="Withdrawn" value={rep.outcome_mix.withdrawn} />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Tier mix: </span>
              <span className="font-medium">
                {[
                  rep.tier_mix.LOW && `${rep.tier_mix.LOW} LOW`,
                  rep.tier_mix.MEDIUM && `${rep.tier_mix.MEDIUM} MEDIUM`,
                  rep.tier_mix.HIGH && `${rep.tier_mix.HIGH} HIGH`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "n/a"}
              </span>
            </div>
            {fundedFmt && (
              <div>
                <span className="text-muted-foreground">Total funded: </span>
                <span className="font-medium">{fundedFmt}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Overrides applied: </span>
              <span className="font-medium">{rep.signal_corrections}</span>
              {rep.risk_factor_total > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({Math.round((rep.signal_correction_rate ?? 0) * 100)}% of factors)
                </span>
              )}
            </div>
            {rep.default_rate != null && rep.default_rate > 0 && (
              <div>
                <span className="text-muted-foreground">Default rate: </span>
                <span className="text-red-700 font-medium">
                  {Math.round(rep.default_rate * 100)}%
                </span>
              </div>
            )}
            {rep.extension_rate != null && rep.extension_rate > 0 && (
              <div>
                <span className="text-muted-foreground">Extension rate: </span>
                <span className="text-amber-700 font-medium">
                  {Math.round(rep.extension_rate * 100)}%
                </span>
              </div>
            )}
            {rep.first_seen_at && (
              <div>
                <span className="text-muted-foreground">First seen: </span>
                <span className="font-medium">
                  {new Date(rep.first_seen_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* All validations for this borrower */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All validations</CardTitle>
        </CardHeader>
        <CardContent>
          {validations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No validations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Completeness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validations.map((v) => {
                  const outcome = v.outcome ? outcomeConfig[v.outcome.status] : null;
                  return (
                    <TableRow
                      key={v.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => {
                        window.location.href = `/dashboard/validations/${v.id}`;
                      }}
                    >
                      <TableCell className="font-medium">
                        {new Date(v.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <VerdictChip verdict={v.verdict} showDelta />
                      </TableCell>
                      <TableCell>
                        {v.tier ? (
                          <Badge variant="outline" className={tierClass[v.tier]}>
                            {v.tier}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">n/a</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {outcome ? (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <outcome.icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {outcome.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {v.confidence_score}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
  negative,
  caution,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
  caution?: boolean;
}) {
  const accentClass =
    value === 0
      ? "text-muted-foreground"
      : negative
        ? "text-red-700"
        : caution
          ? "text-amber-700"
          : positive
            ? "text-emerald-700"
            : "text-foreground";
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}
