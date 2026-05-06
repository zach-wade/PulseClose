"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GitCompare } from "lucide-react";

// B6 — "Compare to prior validation" CTA on the detail page header.
// Only renders when the same borrower has at least one earlier
// validation in the org. Picks the chronological neighbor and shows
// its timestamp on the button label so the lender knows what they're
// comparing to before clicking.

interface Props {
  borrowerId: string;
  currentValidationId: string;
  currentCreatedAt: string;
}

function fmtPriorLabel(priorCreatedAt: string, currentCreatedAt: string): string {
  const prior = new Date(priorCreatedAt);
  const current = new Date(currentCreatedAt);
  const sameDay =
    prior.getFullYear() === current.getFullYear() &&
    prior.getMonth() === current.getMonth() &&
    prior.getDate() === current.getDate();

  if (sameDay) {
    // Same-day: show time so multiple test runs in one day don't all
    // collapse to "Compare to 5/1".
    return `Compare to ${prior.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return `Compare to ${prior.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" })}`;
}

export function CompareToPriorButton({
  borrowerId,
  currentValidationId,
  currentCreatedAt,
}: Props) {
  const [prior, setPrior] = useState<{ id: string; created_at: string } | null>(null);
  const [totalPriors, setTotalPriors] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/borrowers/${borrowerId}/validations`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j: { validations: Array<{ id: string; created_at: string }> }) => {
        if (cancelled) return;
        const priors = j.validations
          .filter(
            (v) => v.id !== currentValidationId && v.created_at < currentCreatedAt,
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        setPrior(priors[0] ?? null);
        setTotalPriors(priors.length);
      })
      .catch(() => !cancelled && setPrior(null));
    return () => {
      cancelled = true;
    };
  }, [borrowerId, currentValidationId, currentCreatedAt]);

  if (!prior) return null;

  const label = fmtPriorLabel(prior.created_at, currentCreatedAt);
  const tooltip =
    totalPriors > 1
      ? `Compares to the most recent prior validation (${new Date(prior.created_at).toLocaleString()}). ${totalPriors} priors total — pick others manually from the borrower roll-up page.`
      : `Compares to the prior validation at ${new Date(prior.created_at).toLocaleString()}.`;

  return (
    <Button
      variant="outline"
      render={
        <Link
          href={`/dashboard/compare?a=${prior.id}&b=${currentValidationId}`}
          title={tooltip}
        />
      }
    >
      <GitCompare className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
