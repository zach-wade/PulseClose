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
import { HardHat, Loader2 } from "lucide-react";
import { GCResultCard } from "@/components/dashboard/gc-result-card";
import type { GCValidation } from "@/components/dashboard/shared-types";
import { toast } from "sonner";

export default function GCValidationPage() {
  const [gcName, setGcName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GCValidation | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/checks/gc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gc_name: gcName,
          license_number: licenseNumber || undefined,
          state: state.toUpperCase(),
        }),
      });

      if (!res.ok) throw new Error("Lookup failed");

      const data = await res.json();
      setResult({
        id: crypto.randomUUID(),
        gc_name: data.gc_name,
        license_number: data.license_number,
        license_state: data.license_state,
        license_status: data.license_status,
        license_classification: data.license_classification,
        expiration_date: data.expiration_date,
        disciplinary_actions: data.disciplinary_actions,
        insurance_verified: data.insurance_verified,
      });
      toast.success("GC validation complete");
    } catch {
      toast.error("GC lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">GC Validation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Contractor license verification, insurance, and disciplinary history.
          CSLB lookup is live for California. Other states coming soon.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Validate Contractor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="gc_name">Contractor Name</Label>
              <Input
                id="gc_name"
                placeholder="e.g. ABC Construction Inc"
                value={gcName}
                onChange={(e) => setGcName(e.target.value)}
                required
              />
            </div>
            <div className="w-full sm:w-48 space-y-1.5">
              <Label htmlFor="license_number">License # (optional)</Label>
              <Input
                id="license_number"
                placeholder="e.g. B-123456"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
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
                  <HardHat className="mr-2 h-4 w-4" />
                )}
                Validate
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
          </CardContent>
        </Card>
      )}

      {result && <GCResultCard data={result} />}

      {!loading && !result && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <HardHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-sm max-w-md text-center">
              Verify general contractor credentials. Check license status,
              insurance, and disciplinary history across state licensing boards.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
