"use client";

// Mandate management for one investor (Item 4). Define the fund's
// borrower-validation standard (diligence gates). Validations are
// auto-assessed against enabled mandates and stamped on the detail page +
// handoff. Owner/admin only (the API enforces it; this is the UI).

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Gates {
  max_risk_tier?: string | null;
  require_sos_active?: boolean;
  disallow_active_litigation?: boolean;
  disallow_sanctions_hit?: boolean;
  max_experience_tier?: number | null;
  min_confidence_score?: number | null;
  require_gc_active?: boolean;
  require_eligibility_pass?: boolean;
}
interface Mandate {
  id: string;
  name: string;
  gates: Gates;
  enabled: boolean;
}

const SELECT_CLS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm";

function summarizeGates(g: Gates): string {
  const parts: string[] = [];
  if (g.max_risk_tier) parts.push(`tier ≤ ${g.max_risk_tier}`);
  if (g.require_sos_active) parts.push("SOS active");
  if (g.disallow_active_litigation) parts.push("no active litigation");
  if (g.disallow_sanctions_hit) parts.push("no sanctions");
  if (g.max_experience_tier != null) parts.push(`exp tier ≤ ${g.max_experience_tier}`);
  if (g.min_confidence_score != null) parts.push(`confidence ≥ ${g.min_confidence_score}`);
  if (g.require_gc_active) parts.push("GC active");
  if (g.require_eligibility_pass) parts.push("eligible deal");
  return parts.length ? parts.join(" · ") : "no gates (passes everything)";
}

export function MandatesManager({ investorId }: { investorId: string }) {
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [name, setName] = useState("");
  const [gates, setGates] = useState<Gates>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/mandates?investor_id=${investorId}`);
    if (res.ok) setMandates((await res.json()).mandates);
  }, [investorId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/mandates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investor_id: investorId, name: name.trim(), gates }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Create failed");
      }
      setName("");
      setGates({});
      await load();
      toast.success("Mandate created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/mandates?id=${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }
  async function toggle(m: Mandate) {
    const res = await fetch(`/api/mandates?id=${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !m.enabled }),
    });
    if (res.ok) await load();
  }

  const check = (k: keyof Gates, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={!!gates[k]}
        onChange={(e) => setGates((g) => ({ ...g, [k]: e.target.checked }))}
      />
      {label}
    </label>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-info" /> Mandates
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          This fund&apos;s borrower-validation standard. Completed validations are auto-assessed
          against enabled mandates and stamped on the validation detail page + investor handoff.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {mandates.length > 0 && (
          <div className="space-y-2">
            {mandates.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm flex items-center gap-2">
                    {m.name}
                    {!m.enabled && <Badge variant="outline" className="text-[10px]">disabled</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{summarizeGates(m.gates)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => toggle(m)}>
                    {m.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border border-dashed p-3 space-y-3">
          <p className="text-sm font-medium">New mandate</p>
          <div className="space-y-1.5">
            <Label htmlFor="mandate_name">Name</Label>
            <Input
              id="mandate_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior bridge box"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Max risk tier</Label>
              <select
                className={SELECT_CLS}
                value={gates.max_risk_tier ?? ""}
                onChange={(e) => setGates((g) => ({ ...g, max_risk_tier: e.target.value || null }))}
              >
                <option value="">Any</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max experience tier</Label>
              <select
                className={SELECT_CLS}
                value={gates.max_experience_tier ?? ""}
                onChange={(e) =>
                  setGates((g) => ({ ...g, max_experience_tier: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">Any</option>
                <option value="1">1 (most)</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4 (least)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min confidence</Label>
              <Input
                type="number"
                value={gates.min_confidence_score ?? ""}
                onChange={(e) =>
                  setGates((g) => ({ ...g, min_confidence_score: e.target.value ? Number(e.target.value) : null }))
                }
                placeholder="0–100"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {check("require_sos_active", "Require SOS active")}
            {check("disallow_active_litigation", "No active litigation")}
            {check("disallow_sanctions_hit", "No sanctions hit")}
            {check("require_gc_active", "Require GC active")}
            {check("require_eligibility_pass", "Require eligible deal")}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={create} disabled={saving}>
              {saving ? "Creating…" : "Create mandate"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
