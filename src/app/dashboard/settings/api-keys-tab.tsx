"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Key, Plus, Trash2, Copy, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// D5 — Public REST API key management. Plaintext keys are returned ONCE
// at creation time; the table only stores hash + prefix.

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  // The plaintext token is shown once after create, then cleared.
  const [justCreated, setJustCreated] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const j = await res.json();
      setKeys(j.keys ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(error || "Failed");
        return;
      }
      const j = (await res.json()) as { token: string; key: { name: string } };
      setJustCreated({ token: j.token, name: j.key.name });
      setNewName("");
      setAdding(false);
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? Any integrations using this key will stop working immediately.`)) return;
    const res = await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      await refresh();
      toast.success("Revoked.");
    } else {
      toast.error("Couldn't revoke.");
    }
  }

  async function copyToken() {
    if (!justCreated) return;
    await navigator.clipboard.writeText(justCreated.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Token copied. Save it now — it won't be shown again.");
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" />
            API keys
          </CardTitle>
          <CardDescription>
            Programmatic access to validations, borrower records, and the
            handoff doc (JSON or Excel). Bearer-token auth in the
            Authorization header. Keys are issued once at creation — we
            store only the hash + prefix; revoke + reissue if a key
            leaks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* One-time plaintext display after creation */}
          {justCreated && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-900">
                  <p className="font-medium">
                    New key &ldquo;{justCreated.name}&rdquo; — copy it now.
                  </p>
                  <p className="text-xs mt-1">
                    This is the only time the full token is shown.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-white px-3 py-2 font-mono text-xs break-all">
                  {justCreated.token}
                </code>
                <Button size="sm" variant="outline" onClick={copyToken}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setJustCreated(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No keys yet. Create one to start hitting the public REST API.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{k.name}</span>
                      <Badge variant="outline" className="text-xs font-mono">
                        {k.key_prefix}…
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used_at
                        ? ` · last used ${new Date(k.last_used_at).toLocaleString()}`
                        : " · never used"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleRevoke(k.id, k.name)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="rounded-md border p-3 space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="new_key_name">Key name</Label>
                <Input
                  id="new_key_name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Internal LOS bridge"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
                  {creating ? "Creating…" : "Create key"}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New API key
            </Button>
          )}
        </CardContent>
      </Card>

      <BookmarkletCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API documentation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium mb-1">Base URL</p>
            <code className="block rounded bg-muted px-3 py-2 font-mono text-xs">
              https://app.pulseclose.com/api/public/v1
            </code>
          </div>
          <div>
            <p className="font-medium mb-1">Authentication</p>
            <p className="text-muted-foreground text-xs mb-1">
              Bearer-token in the Authorization header.
            </p>
            <code className="block rounded bg-muted px-3 py-2 font-mono text-xs">
              Authorization: Bearer pck_live_…
            </code>
          </div>
          <div>
            <p className="font-medium mb-1">Endpoints</p>
            <pre className="rounded bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">
{`GET /validations?limit=50&offset=0&borrower=truong
GET /validations/{id}
GET /validations/{id}/handoff
GET /validations/{id}/handoff?format=excel
GET /borrowers/{id}`}
            </pre>
          </div>
          <div>
            <p className="font-medium mb-1">Example</p>
            <pre className="rounded bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">
{`curl https://app.pulseclose.com/api/public/v1/validations \\
  -H "Authorization: Bearer pck_live_..."`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// D4 — Browser bookmarklet. Drag the "Validate this" link to the
// bookmarks bar. When clicked on any page, the bookmarklet:
//  - grabs the highlighted text (if any) as the borrower address
//  - falls back to the page title (Zillow / Realtor.com)
//  - opens /dashboard/new with ?address=... and ?source=bookmarklet
function BookmarkletCard() {
  const APP_BASE =
    typeof window !== "undefined" ? window.location.origin : "https://app.pulseclose.com";

  // Compact javascript: URL. Build the script as a single line so the
  // browser accepts it as a bookmark target. encodeURIComponent on the
  // address / borrower keeps query-param boundaries safe. document.title
  // is sliced to 80 chars before encoding — Zillow titles routinely run
  // 200+ chars and overflow URL length limits.
  const SCRIPT = `(function(){var s=window.getSelection&&String(window.getSelection())||'';var a=encodeURIComponent(s.trim().slice(0,200));var t=encodeURIComponent((document.title||'').slice(0,80));var u='${APP_BASE}/dashboard/new?source=bookmarklet'+(a?'&address='+a:'')+(t?'&borrower='+t:'');window.open(u,'_blank');})();`;
  const HREF = `javascript:${encodeURIComponent(SCRIPT)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Browser bookmarklet</CardTitle>
        <CardDescription>
          Drag the link below to your bookmarks bar. On any page (Zillow,
          a CRM record, an email), highlight the borrower address or
          name, click the bookmarklet — PulseClose opens a new
          validation pre-filled from the highlight + page title.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/20 p-4 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={HREF}
            onClick={(e) => {
              e.preventDefault();
              toast.info("Drag this link to your bookmarks bar.");
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium cursor-grab"
          >
            Validate with PulseClose
          </a>
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            View the bookmarklet source
          </summary>
          <pre className="mt-2 p-2 rounded bg-muted overflow-x-auto whitespace-pre-wrap break-all">
            {SCRIPT}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
