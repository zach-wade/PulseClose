"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Loader2 } from "lucide-react";
import { EntityResultCard } from "@/components/dashboard/entity-result-card";
import type { EntityCheck } from "@/components/dashboard/shared-types";
import { toast } from "sonner";

export default function EntitySearchPage() {
  const [entityName, setEntityName] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EntityCheck | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/checks/entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_name: entityName, state: state.toUpperCase() }),
      });

      if (!res.ok) throw new Error("Search failed");

      const data = await res.json();
      setResult({
        id: crypto.randomUUID(),
        entity_name: data.entity_name,
        state: data.state,
        entity_type: data.entity_type,
        sos_status: data.sos_status,
        formation_date: data.formation_date,
        last_filing_date: data.last_filing_date,
        registered_agent: data.registered_agent,
        source_url: data.source_url,
        confidence: data.sos_status === "not_found" ? "low" : "medium",
        flags: data.flags,
      });
      toast.success("Entity search complete");
    } catch {
      toast.error("Entity search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entity Search</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Secretary of State lookups, entity status, and ownership verification
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search SOS Records</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="entity_name">Entity Name</Label>
              <Input
                id="entity_name"
                placeholder="e.g. Insignia Capital LLC"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                required
              />
            </div>
            <div className="w-full sm:w-32 space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                placeholder="CA"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-4 w-1/3" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </CardContent>
        </Card>
      )}

      {result && <EntityResultCard data={result} />}

      {!loading && !result && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-sm max-w-md text-center">
              Search SOS records across all 50 states. Check entity status,
              formation dates, registered agents, and annual filing compliance.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
