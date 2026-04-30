"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, FileText, Save } from "lucide-react";

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

  async function save() {
    setSaving(true);
    setError(null);
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
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
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
              onClick={() => window.open(`/api/handoff/${validationId}/excel`, "_blank")}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Download Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/handoff/${validationId}`, "_blank")}
            >
              <FileText className="mr-2 h-4 w-4" />
              Open PDF view
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
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preparer_email">Prepared by (email)</Label>
            <Input
              id="preparer_email"
              type="email"
              value={preparerEmail}
              onChange={(e) => setPreparerEmail(e.target.value)}
              placeholder="damon@insigniacapitalcorp.com"
            />
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
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
