"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateSelect } from "@/components/ui/state-select";
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
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { DocIngest, type IngestExtraction } from "@/components/dashboard/doc-ingest";

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

  function applyExtraction(data: IngestExtraction) {
    if (data.borrower_name) setBorrowerName(data.borrower_name);
    if (data.borrower_entity_name) setEntityName(data.borrower_entity_name);
    if (data.entity_state) setEntityState(data.entity_state);
    if (data.guarantor_name) setGuarantorName(data.guarantor_name);
    if (data.gc_name) setGcName(data.gc_name);
    if (data.gc_license_number) setGcLicense(data.gc_license_number);
    if (data.gc_state) setGcState(data.gc_state);
    const filledCount = [
      data.borrower_name,
      data.borrower_entity_name,
      data.entity_state,
      data.guarantor_name,
      data.gc_name,
    ].filter(Boolean).length;
    if (filledCount > 0) {
      toast.success(`Pre-filled ${filledCount} field${filledCount === 1 ? "" : "s"} from the document. Review before running.`);
    } else {
      toast.warning("Document parsed but no fields could be extracted with confidence.");
    }
  }

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

      <DocIngest onExtracted={applyExtraction} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Borrower Information
            </CardTitle>
            <CardDescription>
              Individual principal/guarantor — typically a person, not an LLC. The borrowing entity goes in the next section.
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
                <p className="text-xs text-muted-foreground">
                  Person&apos;s legal name. Avoid LLC/Corp suffixes here — they belong in Entity below.
                </p>
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
              Borrowing entity (LLC, Corp, Trust, LP) — the legal name on the loan. We verify this against state SOS records and check whether the borrower above appears in the entity&apos;s filings.
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
                <StateSelect
                  id="entityState"
                  value={entityState}
                  onChange={setEntityState}
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
                  placeholder="Contractor name"
                  value={gcName}
                  onChange={(e) => setGcName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gcLicense">License number</Label>
                <Input
                  id="gcLicense"
                  placeholder="License #"
                  value={gcLicense}
                  onChange={(e) => setGcLicense(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gcState">License state</Label>
                <StateSelect
                  id="gcState"
                  value={gcState}
                  onChange={setGcState}
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
                  { icon: Shield, label: "Sanctions / PEP screening" },
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
