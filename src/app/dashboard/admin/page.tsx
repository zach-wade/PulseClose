"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wrench, Merge, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Cross-borrower / cross-entity / cross-lender merge admin UI.
// Lists canonical-key duplicate groups discovered by the dedup engine
// (00021 + JS canonicalizeName mirror) and lets an admin pick which
// row to keep + merges the others into it.

interface DupRow {
  id: string;
  display_name: string;
  state: string | null;
  created_at: string;
}

interface Group {
  entity_type: "borrower" | "entity" | "lender";
  canonical_key: string;
  rows: DupRow[];
}

const TYPE_LABEL: Record<Group["entity_type"], string> = {
  borrower: "Borrower",
  entity: "Entity",
  lender: "Lender",
};

export default function AdminToolsPage() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/duplicates");
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Load failed" }));
        toast.error(error || "Load failed");
        setGroups(null);
        return;
      }
      const j = (await res.json()) as { groups: Group[] };
      setGroups(j.groups);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleMerge(group: Group, targetId: string) {
    const sources = group.rows.filter((r) => r.id !== targetId);
    if (sources.length === 0) return;
    if (
      !confirm(
        `Merge ${sources.length} ${TYPE_LABEL[group.entity_type].toLowerCase()} record${sources.length === 1 ? "" : "s"} into "${
          group.rows.find((r) => r.id === targetId)?.display_name
        }"? This re-points every FK reference (validations, signals, signals, evaluations, etc.) and deletes the source rows.`,
      )
    ) {
      return;
    }
    const key = `${group.entity_type}-${group.canonical_key}`;
    setMerging(key);
    try {
      for (const source of sources) {
        const res = await fetch("/api/admin/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: group.entity_type,
            source_id: source.id,
            target_id: targetId,
          }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: "Merge failed" }));
          toast.error(error || "Merge failed");
          return;
        }
      }
      toast.success(`Merged ${sources.length} record${sources.length === 1 ? "" : "s"}.`);
      await refresh();
    } finally {
      setMerging(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          Admin tools
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cross-borrower / cross-entity / cross-lender merge. Lists
          canonical-name duplicates within your org and lets you pick
          which record to keep.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Merge className="h-4 w-4" />
              Duplicate records
            </span>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Two records share a canonical key when they collapse to the
            same canonicalized form (token-set, entity-suffix-stripped,
            org-scoped). The dedup logic prevents new dupes from
            forming; this surface lets you clean pre-existing pairs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : !groups || groups.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No duplicate groups found. Your dedup keys are clean.
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const key = `${g.entity_type}-${g.canonical_key}`;
                return (
                  <div key={key} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABEL[g.entity_type]}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">
                        {g.canonical_key}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({g.rows.length} records)
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {g.rows.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between gap-3 rounded border bg-muted/10 px-3 py-2"
                        >
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {r.display_name}
                              {r.state && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({r.state})
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {r.id} · created {new Date(r.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={merging === key}
                            onClick={() => handleMerge(g, r.id)}
                          >
                            {merging === key ? "Merging…" : "Keep this"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
