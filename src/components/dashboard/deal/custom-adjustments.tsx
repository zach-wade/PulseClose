// Human override layer (UW-7 Tier-2) — the "structured core, open edges" escape
// hatch. The deterministic engine sizes the loan; the underwriter adds named ±
// dollar adjustments (seller credit, cross-collateral bump, environmental
// holdback) the model has no field for, producing a final approved loan. Persists
// via PATCH /api/underwrite/[id]/adjust (base loan derived server-side; audited).
"use client";

import { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usd } from "@/lib/deal/view-model";
import type { UwAdjustmentsV1 } from "@/lib/schemas/jsonb";

interface Row {
  label: string;
  amount: string; // signed dollars, as typed
  reason: string;
}

function rowsFrom(initial: UwAdjustmentsV1 | null | undefined): Row[] {
  if (!initial || initial.items.length === 0) return [{ label: "", amount: "", reason: "" }];
  return initial.items.map((i) => ({ label: i.label, amount: String(i.amount), reason: i.reason ?? "" }));
}

export function CustomAdjustments({
  uwModelId,
  baseLoan,
  initial,
  onSaved,
}: {
  uwModelId: string;
  baseLoan: number;
  initial?: UwAdjustmentsV1 | null;
  onSaved?: (finalLoan: number, hasItems: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>(rowsFrom(initial));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(initial ? Date.now() : null);
  const [error, setError] = useState<string | null>(null);

  const valid = rows.filter((r) => r.label.trim() !== "" && r.amount.trim() !== "" && Number.isFinite(Number(r.amount)));
  const totalDelta = valid.reduce((s, r) => s + Number(r.amount), 0);
  const finalLoan = Math.max(0, baseLoan + totalDelta);
  const dirty = savedAt == null;

  function update(i: number, key: keyof Row, v: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
    setSavedAt(null);
  }
  function addRow() {
    setRows((rs) => [...rs, { label: "", amount: "", reason: "" }]);
    setSavedAt(null);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? [{ label: "", amount: "", reason: "" }] : rs.filter((_, j) => j !== i)));
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const items = valid.map((r) => ({
        label: r.label.trim(),
        amount: Number(r.amount),
        ...(r.reason.trim() ? { reason: r.reason.trim() } : {}),
      }));
      const res = await fetch(`/api/underwrite/${uwModelId}/adjust`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      setSavedAt(Date.now());
      onSaved?.(json.adjustments?.final_loan ?? finalLoan, items.length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">Custom adjustments — the deal-specific tweaks the model has no field for</p>
        <p className="text-[11px] text-muted-foreground">You override; the engine still sizes. Audited.</p>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_1.2fr_auto] gap-2 items-end">
            <div className="space-y-1">
              {i === 0 && <Label className="text-[11px] text-muted-foreground">Adjustment</Label>}
              <Input value={r.label} placeholder="e.g. Seller credit" onChange={(e) => update(i, "label", e.target.value)} />
            </div>
            <div className="space-y-1">
              {i === 0 && <Label className="text-[11px] text-muted-foreground">± Amount ($)</Label>}
              <Input type="number" step="1000" value={r.amount} placeholder="-40000" onChange={(e) => update(i, "amount", e.target.value)} />
            </div>
            <div className="space-y-1">
              {i === 0 && <Label className="text-[11px] text-muted-foreground">Reason (optional)</Label>}
              <Input value={r.reason} placeholder="why" onChange={(e) => update(i, "reason", e.target.value)} />
            </div>
            <Button variant="ghost" size="icon" aria-label="Remove adjustment" onClick={() => removeRow(i)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add adjustment
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
        <div className="text-sm">
          <span className="text-muted-foreground">Engine sized </span>
          <span className="tabular-nums">{usd(baseLoan)}</span>
          {totalDelta !== 0 && (
            <span className="text-muted-foreground">
              {" "}
              {totalDelta >= 0 ? "+" : "−"} {usd(Math.abs(totalDelta))} adjustment{valid.length === 1 ? "" : "s"} →{" "}
            </span>
          )}
          {totalDelta !== 0 && (
            <span className="font-semibold tabular-nums">Final approved {usd(finalLoan)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!dirty && (
            <span className="text-xs text-success flex items-center gap-1">
              <Check className="h-3.5 w-3.5" aria-hidden /> Saved
            </span>
          )}
          <Button size="sm" onClick={save} disabled={saving || (!dirty && valid.length === 0)}>
            {saving ? "Saving…" : dirty ? "Save adjustments" : "Saved"}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
