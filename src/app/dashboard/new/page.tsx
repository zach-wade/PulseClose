"use client";

import { useState } from "react";
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
} from "lucide-react";
import Link from "next/link";

export default function NewValidationPage() {
  const [borrowerName, setBorrowerName] = useState("");
  const [entityName, setEntityName] = useState("");
  const [entityState, setEntityState] = useState("");
  const [guarantorName, setGuarantorName] = useState("");
  const [gcName, setGcName] = useState("");
  const [gcLicense, setGcLicense] = useState("");
  const [gcState, setGcState] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: POST to /api/validations
    // For now, just simulate
    setTimeout(() => setLoading(false), 1000);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
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
        {/* Borrower Info */}
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

        {/* Entity Info */}
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

        {/* GC Info (optional) */}
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

        <div className="flex justify-end gap-3">
          <Button variant="outline" render={<Link href="/dashboard" />}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            <Search className="mr-2 h-4 w-4" />
            {loading ? "Running checks..." : "Run Validation"}
          </Button>
        </div>
      </form>
    </div>
  );
}
