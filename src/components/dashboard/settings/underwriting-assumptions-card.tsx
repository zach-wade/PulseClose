// Settings editor for per-org underwriting assumptions (principle 14).
//
// The house defaults (sizing caps/floors, exit/takeout terms, DSCR target) become
// config here — set once, applied as the fallbacks in /api/underwrite. A blank
// field means "use the app default" (shown as the placeholder). Storage is
// canonical decimals (0.75); this form edits in human units (75%, 1.25x, 360mo).
"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_UW_ASSUMPTIONS } from "@/lib/underwriting/org-assumptions";

type Unit = "pct" | "x" | "months" | "bps";

interface FieldDef {
  key: keyof typeof DEFAULT_UW_ASSUMPTIONS;
  label: string;
  unit: Unit;
  group: string;
}

const FIELDS: FieldDef[] = [
  { key: "house_max_ltv", label: "Max LTV", unit: "pct", group: "House sizing caps & floors" },
  { key: "house_max_ltc", label: "Max LTC", unit: "pct", group: "House sizing caps & floors" },
  { key: "house_max_ltarv", label: "Max LTARV", unit: "pct", group: "House sizing caps & floors" },
  { key: "house_min_dscr", label: "Min DSCR", unit: "x", group: "House sizing caps & floors" },
  { key: "house_min_debt_yield", label: "Min debt yield", unit: "pct", group: "House sizing caps & floors" },
  { key: "takeout_max_ltv", label: "Perm max LTV", unit: "pct", group: "Exit / takeout" },
  { key: "takeout_min_dscr", label: "Perm min DSCR", unit: "x", group: "Exit / takeout" },
  { key: "takeout_amort_months", label: "Perm amortization (mo)", unit: "months", group: "Exit / takeout" },
  { key: "takeout_rate_spread_bps", label: "Perm rate spread inside bridge (bps)", unit: "bps", group: "Exit / takeout" },
  { key: "takeout_rate_floor", label: "Perm rate floor", unit: "pct", group: "Exit / takeout" },
  { key: "dscr_target", label: "DSCR-rental target", unit: "x", group: "DSCR (rental)" },
];

// stored decimal → display string
function toDisplay(unit: Unit, v: number): string {
  if (unit === "pct") return String(Math.round(v * 1000) / 10); // 0.75 → 75
  return String(v); // x / months / bps stored as-is
}
// display string → stored number (null if blank/invalid)
function toStored(unit: Unit, raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return unit === "pct" ? n / 100 : n;
}

const GROUPS = ["House sizing caps & floors", "Exit / takeout", "DSCR (rental)"];

export function UnderwritingAssumptionsCard({
  initial,
  canEdit,
  onSaved,
}: {
  initial: Record<string, number> | null;
  canEdit: boolean;
  onSaved?: (stored: Record<string, number> | null) => void;
}) {
  const seed = () => {
    const m: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = initial?.[f.key];
      m[f.key] = typeof v === "number" ? toDisplay(f.unit, v) : "";
    }
    return m;
  };
  const [vals, setVals] = useState<Record<string, string>>(seed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, v: string) {
    setVals((p) => ({ ...p, [key]: v }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const stored: Record<string, number> = {};
      for (const f of FIELDS) {
        const n = toStored(f.unit, vals[f.key] ?? "");
        if (n != null) stored[f.key] = n;
      }
      const payload = Object.keys(stored).length === 0 ? null : { schema_version: 1, ...stored };
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ underwriting_assumptions: payload }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      setSaved(true);
      onSaved?.(payload ? stored : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Underwriting assumptions</CardTitle>
        <CardDescription>
          Your house defaults for sizing and exit. These apply automatically when a deal doesn&apos;t
          override them — set your box once instead of re-keying it per deal. A blank field uses the
          PulseClose default (shown as the placeholder).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{group}</p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {FIELDS.filter((f) => f.group === group).map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`uwa_${f.key}`} className="text-xs">
                    {f.label} {f.unit === "pct" ? "(%)" : f.unit === "x" ? "(x)" : f.unit === "bps" ? "(bps)" : "(mo)"}
                  </Label>
                  <Input
                    id={`uwa_${f.key}`}
                    type="number"
                    step={f.unit === "x" ? "0.05" : f.unit === "pct" ? "0.5" : "1"}
                    value={vals[f.key] ?? ""}
                    placeholder={toDisplay(f.unit, DEFAULT_UW_ASSUMPTIONS[f.key])}
                    onChange={(e) => set(f.key, e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {canEdit ? "Applies to new sizings across your org." : "Only an owner or admin can change these."}
          </p>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-success">Saved</span>}
            {canEdit && (
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save assumptions"}
              </Button>
            )}
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
