"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InvestorExtractModal } from "./extract-modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Trash2, BarChart3 } from "lucide-react";
import { InvestorPerformanceCard } from "@/components/dashboard/investor-performance-card";
import { InvestorCriteriaEditor } from "@/components/dashboard/investor-criteria-editor";

interface CriterionRow {
  criteria_key: string;
  criteria_value: unknown;
}

interface Investor {
  id: string;
  display_name: string;
  type: string | null;
  notes: string | null;
  criteria: CriterionRow[];
}

const STARTER_CRITERIA: CriterionRow[] = [
  { criteria_key: "loan_types", criteria_value: ["bridge", "fix_flip"] },
  { criteria_key: "property_types", criteria_value: ["sfr", "2_4_unit"] },
  { criteria_key: "min_loan_amount", criteria_value: 100000 },
  { criteria_key: "max_loan_amount", criteria_value: 3000000 },
  { criteria_key: "min_fico", criteria_value: 660 },
  { criteria_key: "max_ltv", criteria_value: 0.80 },
  { criteria_key: "max_ltc", criteria_value: 0.90 },
  { criteria_key: "max_ltarv", criteria_value: 0.75 },
];

export default function InvestorsAdminPage() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function refresh() {
    const res = await fetch("/api/investors");
    if (res.ok) setInvestors(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: newName }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = (await res.json()) as Investor;
      // Auto-seed starter criteria so the investor isn't blank
      await fetch(`/api/investors/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: STARTER_CRITERIA }),
      });
      setNewName("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this investor and all its criteria + result history?")) return;
    await fetch(`/api/investors/${id}`, { method: "DELETE" });
    refresh();
  }

  function startEdit(inv: Investor) {
    setEditing(inv.id);
    setEditError(null);
  }

  async function saveEdit(id: string, rows: CriterionRow[]) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/investors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: rows }),
      });
      if (!res.ok) {
        setEditError(`Save failed (${res.status})`);
        return;
      }
      setEditing(null);
      setEditError(null);
      await refresh();
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard/evaluate" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manage investors</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure capital partners and their guidelines. Each investor's criteria are stored as JSONB rows in <code className="text-xs bg-muted px-1 rounded">investor_criteria</code>; the engine reads all active rows when evaluating a deal.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add investor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new_name">Display name</Label>
              <Input
                id="new_name"
                placeholder="Colchis Capital"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                {creating ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Created investors get a starter criteria template — edit it to match the investor's actual guidelines.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : investors.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No investors yet. Create one above, or run{" "}
            <code className="text-xs bg-muted px-1 rounded">npx tsx scripts/seed-sample-investors.ts</code>{" "}
            to load three example configs.
          </CardContent>
        </Card>
      ) : (
        investors.map((inv) => (
          <Card key={inv.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {inv.display_name}
                    {inv.type && <Badge variant="outline" className="text-xs">{inv.type}</Badge>}
                    <Badge variant="secondary" className="text-xs">
                      {inv.criteria.length} criteria
                    </Badge>
                  </CardTitle>
                  {inv.notes && <p className="text-xs text-muted-foreground mt-1">{inv.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {editing === inv.id ? null : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        render={
                          <Link
                            href={`/dashboard/evaluate/investors/${inv.id}`}
                            title="Open investor detail page with full performance + rate trend + recent evaluations."
                          />
                        }
                      >
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Performance
                      </Button>
                      <InvestorExtractModal
                        investorId={inv.id}
                        investorName={inv.display_name}
                        onAccepted={refresh}
                      />
                      <Button size="sm" variant="outline" onClick={() => startEdit(inv)}>
                        Edit criteria
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(inv.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {editing === inv.id ? (
                <div className="space-y-2">
                  <InvestorCriteriaEditor
                    initial={inv.criteria}
                    saving={editSaving}
                    onSave={(rows) => saveEdit(inv.id, rows)}
                    onCancel={() => setEditing(null)}
                  />
                  {editError && (
                    <p className="text-sm text-destructive">{editError}</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {inv.criteria.map((c, i) => (
                    <div key={i} className="rounded-md border p-2">
                      <p className="font-medium">{c.criteria_key}</p>
                      <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(c.criteria_value, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
              {/* A4 — at-a-glance performance strip per investor */}
              <InvestorPerformanceCard investorId={inv.id} compact />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
