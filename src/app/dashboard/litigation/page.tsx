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
import { Badge } from "@/components/ui/badge";
import { Scale, Loader2, Info } from "lucide-react";
import { LitigationGrid } from "@/components/dashboard/litigation-grid";
import type { LitigationCheck } from "@/components/dashboard/shared-types";
import { toast } from "sonner";

export default function LitigationPage() {
  const [entityName, setEntityName] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LitigationCheck[] | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResults(null);

    try {
      const res = await fetch("/api/checks/litigation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: entityName,
          borrower_name: borrowerName || undefined,
        }),
      });

      if (!res.ok) throw new Error("Search failed");

      const data = await res.json();
      setResults(
        data.map((l: LitigationCheck & { raw_response?: unknown }, i: number) => ({
          id: `lit-${i}`,
          search_type: l.search_type,
          entity_name: l.entity_name,
          result: l.result,
          details: l.details,
          case_number: l.case_number,
          source: l.source,
        })),
      );
      const found = data.filter((l: LitigationCheck) => l.result === "found").length;
      if (found > 0) {
        toast.warning(`${found} litigation record(s) found`);
      } else {
        toast.success("All screens clear");
      }
    } catch {
      toast.error("Litigation search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Litigation Screening
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bankruptcy, foreclosure, lis pendens, and lawsuit searches
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div>
          <span className="font-medium">Bankruptcy</span> and <span className="font-medium">federal lawsuit</span> searches use live court records via CourtListener.{" "}
          <span className="font-medium">Foreclosure</span> and <span className="font-medium">lis pendens</span> searches are county-level records — automated search coming soon. Manual review recommended for now.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Screen Entity / Borrower</CardTitle>
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
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="borrower_name">
                Individual Name (optional)
              </Label>
              <Input
                id="borrower_name"
                placeholder="e.g. John Smith"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Scale className="mr-2 h-4 w-4" />
                )}
                Screen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {results && results.length > 0 && <LitigationGrid data={results} />}

      {!loading && !results && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-sm max-w-md text-center">
              Screen borrowers and entities for bankruptcy filings, foreclosures,
              lis pendens, and active lawsuits across federal and state courts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
