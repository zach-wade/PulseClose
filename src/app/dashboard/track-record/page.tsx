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
import { Building2, Loader2 } from "lucide-react";
import { TrackRecordTable } from "@/components/dashboard/track-record-table";
import type { TrackRecordEntry } from "@/components/dashboard/shared-types";
import { toast } from "sonner";

export default function TrackRecordPage() {
  const [borrowerName, setBorrowerName] = useState("");
  const [entityName, setEntityName] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TrackRecordEntry[] | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResults(null);

    try {
      const res = await fetch("/api/checks/track-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower_name: borrowerName,
          entity_name: entityName || undefined,
          state: state || undefined,
        }),
      });

      if (!res.ok) throw new Error("Search failed");

      const data = await res.json();
      setResults(
        data.map((p: TrackRecordEntry & { source?: string; raw_response?: Record<string, unknown> }, i: number) => ({
          id: `tr-${i}`,
          property_address: p.property_address,
          acquisition_date: p.acquisition_date,
          disposition_date: p.disposition_date,
          acquisition_price: p.acquisition_price,
          disposition_price: p.disposition_price,
          project_type: p.project_type,
          outcome: p.outcome,
          hold_months: p.hold_months,
          profit: p.profit,
          raw_response: p.raw_response,
        })),
      );
      toast.success(`Found ${data.length} properties`);
    } catch {
      toast.error("Property search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Track Record</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Property transaction history and project outcome verification
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Property Records</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="borrower_name">Borrower Name</Label>
              <Input
                id="borrower_name"
                placeholder="e.g. John Smith"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                required
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="entity_name">Entity Name (optional)</Label>
              <Input
                id="entity_name"
                placeholder="e.g. Smith Capital LLC"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor="state">State *</Label>
              <Input
                id="state"
                placeholder="CA"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                required
              />
              <p className="text-xs text-muted-foreground">Required</p>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Building2 className="mr-2 h-4 w-4" />
                )}
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-1/4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {results && results.length > 0 && <TrackRecordTable data={results} />}

      {results && results.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-sm">
              No property records found for this borrower.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !results && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-sm max-w-md text-center">
              Search property transaction records to verify borrower track
              record. View acquisition, disposition, and project outcome data.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
