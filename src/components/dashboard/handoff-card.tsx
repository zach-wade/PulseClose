"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, FileText, Save } from "lucide-react";
import { toast } from "sonner";

interface HandoffData {
  overall_narrative?: string | null;
  preparer_name?: string | null;
  preparer_email?: string | null;
  properties?: Record<string, { rehab_spend?: number | null; gc_name?: string | null; gc_license?: string | null; narrative?: string | null }>;
}

interface Props {
  validationId: string;
  initial: HandoffData | null;
}

export function HandoffCard({ validationId, initial }: Props) {
  const [narrative, setNarrative] = useState(initial?.overall_narrative ?? "");
  const [preparerName, setPreparerName] = useState(initial?.preparer_name ?? "");
  const [preparerEmail, setPreparerEmail] = useState(initial?.preparer_email ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Client-side hint when the email field doesn't look like an email — not
  // a hard block (the server schema is loose), just a heads-up so the user
  // doesn't ship a handoff PDF with "Damon" where an address belongs.
  const emailHint =
    preparerEmail.trim().length > 0 && !preparerEmail.includes("@")
      ? "Doesn't look like an email — leave blank or fix before saving"
      : null;

  // Dirty tracking — disables downloads until edits are persisted, preventing
  // an investor from receiving an Excel/PDF that doesn't reflect the
  // narrative/preparer info the lender just typed.
  const dirty =
    narrative.trim() !== (initial?.overall_narrative ?? "").trim() ||
    preparerName.trim() !== (initial?.preparer_name ?? "").trim() ||
    preparerEmail.trim() !== (initial?.preparer_email ?? "").trim();

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const body: HandoffData = {
        ...initial,
        overall_narrative: narrative.trim() || null,
        preparer_name: preparerName.trim() || null,
        preparer_email: preparerEmail.trim() || null,
      };
      const res = await fetch(`/api/handoff/${validationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: Array<{ path: string; message: string }>;
        };
        // Surface per-field errors when the server returns them so the user
        // sees "preparer_email: must be an email" inline instead of the
        // generic "Invalid handoff body" toast we used to throw.
        if (msg.details && msg.details.length > 0) {
          const map: Record<string, string> = {};
          for (const d of msg.details) map[d.path] = d.message;
          setFieldErrors(map);
        }
        throw new Error(msg.error ?? `Save failed (${res.status})`);
      }
      setSavedAt(new Date());
      // Mutate the captured initial so dirty calculation goes back to clean.
      // Cheap workaround for a re-fetch round-trip.
      if (initial) {
        initial.overall_narrative = body.overall_narrative;
        initial.preparer_name = body.preparer_name;
        initial.preparer_email = body.preparer_email;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndOpen(url: string) {
    if (dirty) {
      const ok = await save();
      if (!ok) {
        toast.error("Couldn't save changes — fix the error above and try again.");
        return;
      }
      toast.success("Saved. Opening…");
    }
    window.open(url, "_blank");
  }

  return (
    <Card className="border-info/30">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-info" />
            Investor handoff
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              title={dirty ? "Unsaved changes — saving before download" : undefined}
              onClick={() => saveAndOpen(`/api/handoff/${validationId}/excel`)}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {dirty ? "Save & download Excel" : "Download Excel"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              title={dirty ? "Unsaved changes — saving before opening" : undefined}
              onClick={() => saveAndOpen(`/handoff/${validationId}`)}
            >
              <FileText className="mr-2 h-4 w-4" />
              {dirty ? "Save & open PDF view" : "Open PDF view"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Polished deliverable for the investor or fund — auto-pulled from validation data with a property table, risk factors, and litigation/sanctions summary. Add a project narrative below to elevate the handoff. The Excel sheet has fillable cells for per-property rehab spend / GC details.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="preparer_name">Prepared by (name)</Label>
            <Input
              id="preparer_name"
              value={preparerName}
              onChange={(e) => setPreparerName(e.target.value)}
              placeholder="e.g. Damon Fuhriman"
              aria-invalid={!!fieldErrors.preparer_name}
            />
            {fieldErrors.preparer_name && (
              <p className="text-xs text-destructive">{fieldErrors.preparer_name}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preparer_email">Prepared by (email)</Label>
            <Input
              id="preparer_email"
              type="email"
              value={preparerEmail}
              onChange={(e) => setPreparerEmail(e.target.value)}
              placeholder="damon@insigniacapitalcorp.com"
              aria-invalid={!!fieldErrors.preparer_email || !!emailHint}
            />
            {fieldErrors.preparer_email ? (
              <p className="text-xs text-destructive">{fieldErrors.preparer_email}</p>
            ) : emailHint ? (
              <p className="text-xs text-amber-600">{emailHint}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="narrative">Project narrative (optional)</Label>
          <textarea
            id="narrative"
            className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Project context, sponsor track record commentary, any deal-specific notes the investor should see…"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <div className="flex items-center justify-end gap-3">
          {savedAt && (
            <span className="text-xs text-muted-foreground">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
          <Button size="sm" onClick={() => save()} disabled={saving || !dirty}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
