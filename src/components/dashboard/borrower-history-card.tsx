"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, ChevronRight } from "lucide-react";

// E2 — surfaces the borrower's full lender-relationship history with
// THIS org. "Truong has funded 3, repaid 2, defaulted 0 with this org."
// On the validation detail page it's an at-a-glance stat strip; the
// full per-validation list lives on the borrower roll-up page (B4).

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

interface Props {
  borrowerId: string;
  // The current validation isn't excluded from counts — the lender wants
  // "borrower X has Y validations total, this is one of them."
  currentValidationId?: string;
}

export function BorrowerHistoryCard({ borrowerId, currentValidationId }: Props) {
  const [rep, setRep] = useState<Reputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    fetch(`/api/borrowers/${borrowerId}/reputation`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((j) => {
        if (!cancelled) setRep(j.reputation);
      })
      .catch(() => {
        if (!cancelled) {
          setRep(null);
          setErrored(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [borrowerId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-full mt-3" />
        </CardContent>
      </Card>
    );
  }

  // Distinguish "no history yet" (silent) from "couldn't load" (visible).
  // Without this the UI silently swallowed transient API failures.
  if (errored) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground flex items-center justify-between">
          <span>Borrower history unavailable.</span>
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setErrored(false);
              setLoading(true);
              fetch(`/api/borrowers/${borrowerId}/reputation`)
                .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
                .then((j) => {
                  setRep(j.reputation);
                })
                .catch(() => setErrored(true))
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!rep) return null;

  // First-time borrower (only this validation, no outcomes recorded yet) —
  // suppress the card so it doesn't read as "0 history with this org" noise.
  // The card only shows when there's at least one prior validation OR an
  // outcome has been recorded on the current one.
  const hasOutcomes =
    rep.outcome_mix.funded +
      rep.outcome_mix.repaid +
      rep.outcome_mix.extended +
      rep.outcome_mix.defaulted +
      rep.outcome_mix.withdrawn >
    0;
  const hasHistory = rep.validation_count > 1 || hasOutcomes;
  if (!hasHistory) return null;

  const fundedFmt =
    rep.funded_total_cents != null
      ? `$${Math.round(rep.funded_total_cents / 100).toLocaleString()}`
      : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History with {rep.display_name}
            <Badge variant="outline" className="text-xs font-normal">
              {rep.validation_count} validation{rep.validation_count === 1 ? "" : "s"}
            </Badge>
          </span>
          <Link
            href={`/dashboard/borrowers/${rep.borrower_id}`}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          >
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Funded" value={rep.outcome_mix.funded} accent="positive" />
          <Stat label="Repaid" value={rep.outcome_mix.repaid} accent="positive" />
          <Stat label="Extended" value={rep.outcome_mix.extended} accent="caution" />
          <Stat label="Defaulted" value={rep.outcome_mix.defaulted} accent={rep.outcome_mix.defaulted > 0 ? "negative" : "neutral"} />
          <Stat label="Withdrawn" value={rep.outcome_mix.withdrawn} accent="neutral" />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
          <TierMix tier={rep.tier_mix} />
          {fundedFmt && (
            <div>
              <span className="text-foreground font-medium">{fundedFmt}</span>{" "}
              funded
            </div>
          )}
          {rep.default_rate != null && rep.default_rate > 0 && (
            <div>
              <span className="text-red-700 font-medium">
                {Math.round(rep.default_rate * 100)}%
              </span>{" "}
              default rate
            </div>
          )}
          {rep.extension_rate != null && rep.extension_rate > 0 && (
            <div>
              <span className="text-amber-700 font-medium">
                {Math.round(rep.extension_rate * 100)}%
              </span>{" "}
              extension rate
            </div>
          )}
          {rep.signal_corrections > 0 && (
            <div>
              <span className="text-foreground font-medium">
                {rep.signal_corrections}
              </span>{" "}
              override{rep.signal_corrections === 1 ? "" : "s"} applied
            </div>
          )}
          {rep.first_seen_at && rep.latest_seen_at && rep.first_seen_at !== rep.latest_seen_at && (
            <div>
              First seen{" "}
              <span className="text-foreground">
                {new Date(rep.first_seen_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {currentValidationId && rep.validation_count > 1 && (
          <p className="text-xs text-muted-foreground">
            This is one of {rep.validation_count} validations for {rep.display_name} in your org.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
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
      <p className={`text-lg font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}

function TierMix({ tier }: { tier: { HIGH: number; MEDIUM: number; LOW: number } }) {
  const total = tier.HIGH + tier.MEDIUM + tier.LOW;
  if (total === 0) return null;
  const parts: string[] = [];
  if (tier.LOW) parts.push(`${tier.LOW} LOW`);
  if (tier.MEDIUM) parts.push(`${tier.MEDIUM} MEDIUM`);
  if (tier.HIGH) parts.push(`${tier.HIGH} HIGH`);
  return (
    <div>
      Tier mix: <span className="text-foreground font-medium">{parts.join(" · ")}</span>
    </div>
  );
}
