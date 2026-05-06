"use client";

// G3.4 — "Add GC after the fact" card. Shown on the validation detail
// page when no gc_validations rows exist. Click → inline form → POST
// /api/validations/[id]/gc → reload.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardHat, Plus } from "lucide-react";

interface AddGCCardProps {
  validationId: string;
  defaultState?: string | null;
  onAdded: () => void;
}

export function AddGCCard({ validationId, defaultState, onAdded }: AddGCCardProps) {
  const [open, setOpen] = useState(false);
  const [gcName, setGcName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [state, setState] = useState((defaultState ?? "").toUpperCase());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!gcName.trim()) {
      setError("GC name is required");
      return;
    }
    if (state.trim().length !== 2) {
      setError("Enter a 2-letter state code");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/validations/${validationId}/gc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gc_name: gcName.trim(),
          license_number: licenseNumber.trim() || undefined,
          gc_state: state.trim().toUpperCase(),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Request failed (${res.status})`);
      }
      setGcName("");
      setLicenseNumber("");
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardHat className="h-4 w-4" />
            GC Validation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              No general contractor on this validation yet. Add one to verify license, classification, and disciplinary history.
            </p>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add GC
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4" />
          Add GC validation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="add-gc-name" className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              GC name
            </label>
            <input
              id="add-gc-name"
              type="text"
              value={gcName}
              onChange={(e) => setGcName(e.target.value)}
              placeholder="ACME Construction Inc"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="add-gc-license" className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              License # (optional)
            </label>
            <input
              id="add-gc-license"
              type="text"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="123456"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="add-gc-state" className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              State
            </label>
            <input
              id="add-gc-state"
              type="text"
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              placeholder="CA"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase"
              disabled={submitting}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Only California (CSLB) is fully automated today. Other states return a NOT-AUTOMATED placeholder card so the GC is on record for manual review.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting}>
            {submitting ? "Verifying…" : "Verify GC"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
