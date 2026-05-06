"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, Loader2 } from "lucide-react";

// B4 — debounced lookup. Surfaces a one-line hint inline below the
// borrower name input on /dashboard/new. Click-through to the borrower
// detail page so the lender can review prior validations + outcomes
// before burning vendor calls on a re-validation.

interface Match {
  id: string;
  display_name: string;
  validation_count: number;
  latest_validation_at: string | null;
  match_quality: "exact" | "subset" | "prefix";
}

interface Props {
  borrowerName: string;
}

export function BorrowerMatchHint({ borrowerName }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = borrowerName.trim();
    if (trimmed.length < 3) {
      setMatches([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/borrowers/search?q=${encodeURIComponent(trimmed)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
        .then((j) => !cancelled && setMatches(j.matches))
        .catch(() => !cancelled && setMatches([]))
        .finally(() => !cancelled && setLoading(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [borrowerName]);

  // While the debounced search is in flight, show a small inline spinner
  // so the user knows something is happening — without it the hint blinks
  // in suddenly after 350ms+RTT and reads as a layout shift.
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking borrower history…
      </div>
    );
  }
  if (matches.length === 0) return null;

  const top = matches[0];
  const more = matches.length > 1 ? matches.length - 1 : 0;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs flex items-start gap-2">
      <History className="h-3.5 w-3.5 mt-0.5 text-amber-700 shrink-0" />
      <div className="space-y-1 flex-1">
        <p className="text-amber-900">
          You&apos;ve seen this borrower before.{" "}
          <Link
            href={`/dashboard/borrowers/${top.id}`}
            className="font-medium underline underline-offset-2"
          >
            {top.display_name}
          </Link>{" "}
          has {top.validation_count} validation
          {top.validation_count === 1 ? "" : "s"} in your org
          {top.latest_validation_at && (
            <>
              ; last seen{" "}
              {new Date(top.latest_validation_at).toLocaleDateString()}
            </>
          )}
          .
          {more > 0 && ` (${more} other ${more === 1 ? "match" : "matches"})`}
        </p>
        <p className="text-amber-800">
          Open the prior record before re-running — saves a vendor call if
          the data is recent.
        </p>
      </div>
    </div>
  );
}
