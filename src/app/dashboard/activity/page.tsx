"use client";

// /dashboard/activity — chronological org-wide feed (B5 main page).
// Per-validation strip on the validation detail page reuses the same
// renderer with subject_id filter.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowLeft, Loader2 } from "lucide-react";
import { ActivityFeed, type ActivityFeedItem } from "@/components/dashboard/activity-feed";

const VERB_FILTERS: Array<{ label: string; verb: string | null }> = [
  { label: "All", verb: null },
  { label: "Validations", verb: "created" },
  { label: "Overrides", verb: "applied_signal" },
  { label: "Monitor", verb: "ran_monitor" },
  { label: "Handoffs", verb: "sent_handoff" },
  { label: "Share links", verb: "sent_share_link" },
  { label: "Evaluations", verb: "evaluated_deal" },
];

function ActivityPageInner() {
  // Optional ?subject_id=<validation-id> deep link from the per-detail
  // strip's "See all" CTA. Wrapped in Suspense per Next 16 prerender rule.
  const searchParams = useSearchParams();
  const subjectId = searchParams.get("subject_id");
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verbFilter, setVerbFilter] = useState<string | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (verbFilter) params.set("verb", verbFilter);
    if (subjectId) {
      params.set("subject_type", "validation");
      params.set("subject_id", subjectId);
    }
    fetch(`/api/activity?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as { items: ActivityFeedItem[]; next_before: string | null };
        if (cancelled) return;
        setItems(json.items);
        setNextBefore(json.next_before);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [verbFilter, subjectId]);

  async function loadMore() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ before: nextBefore });
      if (verbFilter) params.set("verb", verbFilter);
      if (subjectId) {
        params.set("subject_type", "validation");
        params.set("subject_id", subjectId);
      }
      const r = await fetch(`/api/activity?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as { items: ActivityFeedItem[]; next_before: string | null };
      setItems((prev) => [...prev, ...json.items]);
      setNextBefore(json.next_before);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-info/10 p-2">
          <Activity className="h-5 w-5 text-info" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {subjectId
              ? "Events scoped to a single validation."
              : "Everything that's happened in your workspace — validations, overrides, monitor runs, handoffs, share links."}
          </p>
        </div>
        {subjectId && (
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={`/dashboard/validations/${subjectId}`} />}
          >
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            Back to validation
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {VERB_FILTERS.map((f) => {
          const active = verbFilter === f.verb;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setVerbFilter(f.verb)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-info/10 border-info/40 text-info"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-7 w-7 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <ActivityFeed items={items} groupByDay emptyMessage="No activity matches this filter yet." />
            {nextBefore && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// useSearchParams() requires a Suspense boundary on Next 16.
export default function ActivityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ActivityPageInner />
    </Suspense>
  );
}
