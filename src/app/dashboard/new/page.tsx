"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Building2,
  User,
  HardHat,
  ArrowLeft,
  Search,
  Loader2,
  Scale,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function NewValidationPage() {
  const router = useRouter();
  const [borrowerName, setBorrowerName] = useState("");
  const [entityName, setEntityName] = useState("");
  const [entityState, setEntityState] = useState("");
  const [guarantorName, setGuarantorName] = useState("");
  const [gcName, setGcName] = useState("");
  const [gcLicense, setGcLicense] = useState("");
  const [gcState, setGcState] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/validations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower_name: borrowerName,
          borrower_entity_name: entityName,
          entity_state: entityState,
          guarantor_name: guarantorName || null,
          gc_name: gcName || null,
          gc_license_number: gcLicense || null,
          gc_state: gcState || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.code === "PLAN_LIMIT_REACHED") {
          setError(data.error);
          toast.error("Upgrade your plan to continue running validations");
          setLoading(false);
          return;
        }
        throw new Error(data.error || "Failed to create validation");
      }

      const { id } = await res.json();
      toast.success("Validation complete — viewing report");
      router.push(`/dashboard/validations/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            New Borrower Validation
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter borrower details to run entity, track record, and credential
            checks
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Borrower Information
            </CardTitle>
            <CardDescription>
              Primary borrower and guarantor details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="borrowerName">Borrower name *</Label>
                <Input
                  id="borrowerName"
                  placeholder="John Smith"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guarantorName">Guarantor name</Label>
                <Input
                  id="guarantorName"
                  placeholder="Same as borrower if personal guarantee"
                  value={guarantorName}
                  onChange={(e) => setGuarantorName(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Entity Information
            </CardTitle>
            <CardDescription>
              Borrowing entity for Secretary of State lookup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="entityName">Entity name *</Label>
                <Input
                  id="entityName"
                  placeholder="Smith Capital LLC"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entityState">State of formation *</Label>
                <Input
                  id="entityState"
                  placeholder="CA"
                  maxLength={2}
                  value={entityState}
                  onChange={(e) =>
                    setEntityState(e.target.value.toUpperCase())
                  }
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardHat className="h-4 w-4" />
              General Contractor
              <span className="text-sm font-normal text-muted-foreground">
                (optional)
              </span>
            </CardTitle>
            <CardDescription>
              For construction or rehab loans — license and permit validation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="gcName">GC name</Label>
                <Input
                  id="gcName"
                  placeholder="ABC Construction"
                  value={gcName}
                  onChange={(e) => setGcName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gcLicense">License number</Label>
                <Input
                  id="gcLicense"
                  placeholder="1234567"
                  value={gcLicense}
                  onChange={(e) => setGcLicense(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gcState">License state</Label>
                <Input
                  id="gcState"
                  placeholder="CA"
                  maxLength={2}
                  value={gcState}
                  onChange={(e) => setGcState(e.target.value.toUpperCase())}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {loading && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">Running validation checks...</p>
              <div className="space-y-2">
                {[
                  { icon: Search, label: "Entity lookup (SOS)" },
                  { icon: Building2, label: "Track record search" },
                  { icon: Scale, label: "Litigation screening" },
                  ...(gcName ? [{ icon: HardHat, label: "GC validation" }] : []),
                  { icon: Sparkles, label: "AI risk analysis" },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <step.icon className="h-3.5 w-3.5" />
                    {step.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" render={<Link href="/dashboard" />} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {loading ? "Running checks..." : "Run Validation"}
          </Button>
        </div>
      </form>
    </div>
  );
}
