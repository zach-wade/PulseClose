"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GitCompare } from "lucide-react";

// B6 — "Compare to prior validation" CTA on the detail page header.
// Only renders when the same borrower has at least one earlier
// validation in the org. Auto-picks the next-most-recent prior
// (chronological neighbor) and links to /dashboard/compare with both ids
// in oldest-then-newest order so the diff reads "since last time".

interface Props {
  borrowerId: string;
  currentValidationId: string;
  currentCreatedAt: string;
}

export function CompareToPriorButton({
  borrowerId,
  currentValidationId,
  currentCreatedAt,
}: Props) {
  const [priorId, setPriorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/borrowers/${borrowerId}/validations`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j: { validations: Array<{ id: string; created_at: string }> }) => {
        if (cancelled) return;
        // Find the most recent validation that's strictly older than this one.
        const priors = j.validations
          .filter(
            (v) => v.id !== currentValidationId && v.created_at < currentCreatedAt,
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        setPriorId(priors[0]?.id ?? null);
      })
      .catch(() => !cancelled && setPriorId(null));
    return () => {
      cancelled = true;
    };
  }, [borrowerId, currentValidationId, currentCreatedAt]);

  if (!priorId) return null;

  return (
    <Button
      variant="outline"
      render={
        <Link
          href={`/dashboard/compare?a=${priorId}&b=${currentValidationId}`}
          title="Side-by-side with the previous validation for this borrower. Highlights tier moves, factor changes, new flags."
        />
      }
    >
      <GitCompare className="mr-2 h-4 w-4" />
      Compare to prior
    </Button>
  );
}
