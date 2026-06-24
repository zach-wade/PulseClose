"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Webhook, Plus, Trash2, Copy, Check, AlertTriangle, RotateCw } from "lucide-react";
import { toast } from "sonner";

// Item 3 / Phase 1 §4 — Settings UI for the webhook subsystem (migration 00043).
// Endpoints fire validation.completed / tier.changed / outcome.reported /
// mandate.assessed with an HMAC signature; the signing secret is shown ONCE.

interface Endpoint {
  id: string;
  url: string;
  event_types: string[];
  secret_masked: string;
  description: string | null;
  enabled: boolean;
  created_at: string;
}

export function WebhooksTab() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Signing secret shown once after create / rotate.
  const [justSecret, setJustSecret] = useState<{ secret: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/webhooks");
      if (!res.ok) {
        setLoadError(`Couldn't load webhooks (${res.status}).`);
        return;
      }
      const j = await res.json();
      setEndpoints(j.endpoints ?? []);
      setAvailable(j.available_events ?? []);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load webhooks. Refresh to retry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function toggleEvent(ev: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  }

  async function handleCreate() {
    if (!url.trim() || selected.size === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), event_types: Array.from(selected), description: description.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) {
        toast.error(j.error || "Failed to create endpoint");
        return;
      }
      setJustSecret({ secret: j.secret, url: url.trim() });
      setUrl("");
      setDescription("");
      setSelected(new Set());
      setAdding(false);
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(ep: Endpoint) {
    const res = await fetch(`/api/webhooks?id=${ep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !ep.enabled }),
    });
    if (res.ok) await refresh();
    else toast.error("Couldn't update endpoint.");
  }

  async function handleRotate(ep: Endpoint) {
    if (!confirm("Rotate the signing secret? The current secret stops verifying immediately — update your receiver.")) return;
    const res = await fetch(`/api/webhooks?id=${ep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotate_secret: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.secret) {
      setJustSecret({ secret: j.secret, url: ep.url });
      await refresh();
    } else {
      toast.error(j.error || "Couldn't rotate secret.");
    }
  }

  async function handleDelete(ep: Endpoint) {
    if (!confirm(`Delete ${ep.url}? Deliveries to it stop immediately.`)) return;
    const res = await fetch(`/api/webhooks?id=${ep.id}`, { method: "DELETE" });
    if (res.ok) {
      await refresh();
      toast.success("Endpoint deleted.");
    } else {
      toast.error("Couldn't delete endpoint.");
    }
  }

  async function copySecret() {
    if (!justSecret) return;
    await navigator.clipboard.writeText(justSecret.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Secret copied. Save it now — it won't be shown again.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Webhook className="h-4 w-4" />
          Webhooks
        </CardTitle>
        <CardDescription>
          Push events to your LOS or CRM as they happen — a validation completes,
          a tier changes, an outcome is reported, a capital-provider mandate is
          assessed. Each delivery is signed with an HMAC of the body using the
          endpoint&apos;s secret (header <code className="text-xs">X-PulseClose-Signature</code>);
          failures retry on a schedule. The signing secret is shown once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* One-time secret display */}
        {justSecret && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900">
                <p className="font-medium">Signing secret for {justSecret.url}</p>
                <p className="text-xs mt-1">This is the only time it&apos;s shown. Store it in your receiver to verify signatures.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-white px-3 py-2 font-mono text-xs break-all">{justSecret.secret}</code>
              <Button size="sm" variant="outline" onClick={copySecret}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setJustSecret(null)}>Dismiss</Button>
            </div>
          </div>
        )}

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <Skeleton className="h-24 w-full" />
        ) : endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No endpoints yet. Add one to push validation, tier, outcome, and mandate events to your systems in real time.
          </p>
        ) : (
          <div className="space-y-2">
            {endpoints.map((ep) => (
              <div key={ep.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium break-all">{ep.url}</span>
                      <Badge variant={ep.enabled ? "default" : "secondary"} className="text-xs">
                        {ep.enabled ? "Enabled" : "Paused"}
                      </Badge>
                    </div>
                    {ep.description && <p className="text-xs text-muted-foreground">{ep.description}</p>}
                    <div className="flex flex-wrap gap-1">
                      {ep.event_types.map((ev) => (
                        <Badge key={ev} variant="outline" className="text-[10px] font-mono">{ev}</Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Secret <code className="font-mono">{ep.secret_masked}</code> · created {new Date(ep.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleToggle(ep)} title={ep.enabled ? "Pause" : "Enable"}>
                      {ep.enabled ? "Pause" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleRotate(ep)} title="Rotate signing secret">
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(ep)} title="Delete endpoint">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="rounded-md border p-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wh_url">Endpoint URL</Label>
              <Input id="wh_url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-los.example.com/hooks/pulseclose" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh_desc">Description (optional)</Label>
              <Input id="wh_desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Nexys deal sync" />
            </div>
            <div className="space-y-1.5">
              <Label>Events</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {available.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border px-2.5 py-1.5">
                    <input type="checkbox" checked={selected.has(ev)} onChange={() => toggleEvent(ev)} />
                    <span className="font-mono text-xs">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={creating}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={creating || !url.trim() || selected.size === 0}>
                {creating ? "Creating…" : "Add endpoint"}
              </Button>
            </div>
          </div>
        ) : (
          !loadError && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add endpoint
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
