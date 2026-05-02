"use client";

// Per-validation activity strip — shows the most recent ~10 events scoped
// to one validation. Lives on the detail page near the bottom; closes
// G3.3 (borrower-side activity invisible to lender).

import { useEffect, useState } from "react";
import { ActivityFeedCard, type ActivityFeedItem } from "./activity-feed";

export function ActivityStrip({ validationId }: { validationId: string }) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      subject_type: "validation",
      subject_id: validationId,
      limit: "10",
    });
    fetch(`/api/activity?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as { items: ActivityFeedItem[] };
        if (!cancelled) setItems(json.items);
      })
      .catch(() => {
        // Strip is non-essential — silently empty on failure rather than
        // breaking the detail page render.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [validationId]);

  if (loading || items.length === 0) {
    // Hide while loading + when empty so the strip doesn't add noise on
    // brand-new validations. The full feed is reachable from the sidebar.
    return null;
  }

  return (
    <ActivityFeedCard
      title="Activity on this validation"
      items={items}
      seeAllHref={`/dashboard/activity?subject_id=${validationId}`}
    />
  );
}
