"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, AlertTriangle, CheckCircle2 } from "lucide-react";

interface MonitorChange {
  field: string;
  before: unknown;
  after: unknown;
  source: string;
  severity: "info" | "warning" | "critical";
}

interface MonitorRun {
  id: string;
  ran_at: string;
  status: "clean" | "changes_found" | "error";
  changes: MonitorChange[];
  error_message: string | null;
  cost_cents: number;
  notified_at: string | null;
}

interface MonitorSubscription {
  id: string;
  enabled: boolean;
  cadence: "daily" | "weekly" | "monthly";
  next_run_at: string;
  last_run_at: string | null;
  notify_emails: string[];
}

interface State {
  subscription: MonitorSubscription | null;
  runs: MonitorRun[];
}

const CADENCES = ["daily", "weekly", "monthly"] as const;

export function MonitorCard({ validationId }: { validationId: string }) {
  const [state, setState] = useState<State>({ subscription: null, runs: [] });
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/validations/${validationId}/monitor`);
      if (res.ok) setState(await res.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationId]);

  async function update(patch: Partial<MonitorSubscription>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/validations/${validationId}/monitor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addEmail() {
    const email = emailInput.trim();
    if (!email) return;
    const next = [...(state.subscription?.notify_emails ?? []), email];
    setEmailInput("");
    await update({ notify_emails: Array.from(new Set(next)) });
  }

  async function removeEmail(email: string) {
    const next = (state.subscription?.notify_emails ?? []).filter((e) => e !== email);
    await update({ notify_emails: next });
  }

  const sub = state.subscription;
  const lastRun = state.runs[0] ?? null;
  const recentChangesCount = state.runs.reduce(
    (n, r) => n + (r.status === "changes_found" ? r.changes.length : 0),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            {sub?.enabled ? <Bell className="h-4 w-4 text-info" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
            Continuous monitoring
            {sub?.enabled && (
              <Badge variant="secondary" className="text-xs">{sub.cadence}</Badge>
            )}
          </span>
          {!loading && (
            <Button
              size="sm"
              variant={sub?.enabled ? "outline" : "default"}
              disabled={busy}
              onClick={() =>
                sub
                  ? update({ enabled: !sub.enabled })
                  : update({ enabled: true })
              }
            >
              {sub?.enabled ? "Pause" : "Enable monitoring"}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Re-runs entity SOS, federal litigation, and sanctions screens on the configured cadence; emails recipients when something changes (entity status, new litigation case, new sanctions hit). Track-record + GC stay one-shot — too costly per run.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {sub && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm pt-2 border-t border-border/50">
              <div>
                <p className="text-xs text-muted-foreground">Cadence</p>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={sub.cadence}
                  onChange={(e) => update({ cadence: e.target.value as MonitorSubscription["cadence"] })}
                  disabled={busy}
                >
                  {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last run</p>
                <p>{sub.last_run_at ? new Date(sub.last_run_at).toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next run</p>
                <p>{new Date(sub.next_run_at).toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label className="text-xs">Notify recipients</Label>
              <div className="flex flex-wrap gap-1.5">
                {sub.notify_emails.map((e) => (
                  <Badge key={e} variant="outline" className="gap-1.5">
                    {e}
                    <button
                      type="button"
                      onClick={() => removeEmail(e)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${e}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
                {sub.notify_emails.length === 0 && (
                  <span className="text-xs text-muted-foreground">No recipients — alerts will be persisted but not emailed.</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="add@email.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={addEmail} disabled={busy || !emailInput.trim()}>
                  Add
                </Button>
              </div>
            </div>

            {lastRun && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Recent runs</p>
                {state.runs.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-start gap-2 text-sm">
                    {r.status === "clean" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                    {r.status === "changes_found" && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                    {r.status === "error" && <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">
                        <span className="font-medium">{new Date(r.ran_at).toLocaleString()}</span>
                        <span className="text-muted-foreground ml-2">
                          {r.status === "clean" && "no changes"}
                          {r.status === "changes_found" && `${r.changes.length} change${r.changes.length === 1 ? "" : "s"}${r.notified_at ? " — emailed" : ""}`}
                          {r.status === "error" && (r.error_message ?? "error")}
                        </span>
                      </p>
                      {r.status === "changes_found" && r.changes.length > 0 && (
                        <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          {r.changes.map((c, i) => (
                            <li key={i}>
                              <span className="font-medium">{c.field}</span>: {String(c.before ?? "—")} → {typeof c.after === "object" ? JSON.stringify(c.after) : String(c.after)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
                {recentChangesCount > 0 && state.runs.length > 5 && (
                  <p className="text-xs text-muted-foreground italic">
                    + {state.runs.length - 5} older run{state.runs.length - 5 === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
