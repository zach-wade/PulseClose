"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, MessageSquare, Webhook, Trash2, Send, Plus } from "lucide-react";
import { toast } from "sonner";

// D2 — Slack/Teams notifications + universal preferences UI.
//
// Per-user: pick which event_type fires, what channel, what target.
// Channels supported: email (existing Resend wrapper), slack (incoming
// webhook), teams (incoming webhook), webhook (generic POST). SMS is
// stubbed in the schema but no provider yet.

interface Preference {
  id: string;
  channel: "email" | "slack" | "teams" | "sms" | "webhook";
  event_type: string;
  target_address: string;
  enabled: boolean;
  created_at: string;
}

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "monitor_change", label: "Monitor change (entity / litigation / sanctions diff)" },
  { value: "tier_changed", label: "Validation tier changed" },
  { value: "signal_applied", label: "Override signal applied" },
  { value: "deal_evaluated", label: "Deal evaluated against investors" },
  { value: "handoff_sent", label: "Handoff downloaded / sent" },
  { value: "expected_close_reminder", label: "Closing-date reminder" },
  { value: "consensus_match", label: "Cross-tenant consensus match (E3)" },
];

const CHANNELS: { value: Preference["channel"]; label: string; placeholder: string; icon: typeof Mail }[] = [
  { value: "email", label: "Email", placeholder: "you@example.com", icon: Mail },
  { value: "slack", label: "Slack", placeholder: "https://hooks.slack.com/services/...", icon: MessageSquare },
  { value: "teams", label: "Teams", placeholder: "https://outlook.office.com/webhook/...", icon: MessageSquare },
  { value: "webhook", label: "Generic webhook", placeholder: "https://your-system.example.com/hook", icon: Webhook },
];

export function NotificationsTab() {
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newChannel, setNewChannel] = useState<Preference["channel"]>("slack");
  const [newEventType, setNewEventType] = useState("monitor_change");
  const [newTarget, setNewTarget] = useState("");
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/notifications/preferences");
    if (res.ok) {
      const j = await res.json();
      setPrefs(j.preferences ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    if (!newTarget.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: newChannel,
          event_type: newEventType,
          target_address: newTarget.trim(),
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(error || "Failed to add");
        return;
      }
      setNewTarget("");
      setAdding(false);
      await refresh();
      toast.success("Notification added.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this notification?")) return;
    const res = await fetch(`/api/notifications/preferences?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await refresh();
      toast.success("Deleted.");
    } else {
      toast.error("Couldn't delete.");
    }
  }

  async function handleTest(id: string) {
    setTesting(id);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preference_id: id }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Test failed" }));
        toast.error(error || "Test failed");
        return;
      }
      const j = await res.json();
      const r = j.result;
      if (r.sent > 0) {
        toast.success(`Test sent. Check your ${r.sent === 1 ? "channel" : "channels"}.`);
      } else if (r.failed > 0) {
        toast.error("Test send failed — check the URL is correct and reachable.");
      } else {
        toast.warning("No matching enabled preference fired.");
      }
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Notification preferences
        </CardTitle>
        <CardDescription>
          Per-user routing for monitor diffs, signal overrides, handoff
          sends, and other events. Slack and Teams use incoming-webhook
          URLs; Generic webhook receives a JSON POST. Today email is the
          default channel for monitor cron output — adding a Slack pref
          for <code className="text-xs">monitor_change</code> sends to
          both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : prefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No notification preferences yet. Add one below to route events
            to Slack / Teams / a generic webhook in addition to email.
          </p>
        ) : (
          <div className="space-y-2">
            {prefs.map((p) => {
              const channelMeta = CHANNELS.find((c) => c.value === p.channel);
              const Icon = channelMeta?.icon ?? Mail;
              const eventLabel = EVENT_TYPES.find((e) => e.value === p.event_type)?.label ?? p.event_type;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {channelMeta?.label ?? p.channel}
                        </Badge>
                        <span className="text-sm font-medium">{eventLabel}</span>
                        {!p.enabled && (
                          <Badge variant="secondary" className="text-xs">
                            disabled
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.channel === "email"
                          ? p.target_address
                          : maskUrl(p.target_address)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTest(p.id)}
                      disabled={testing === p.id || !p.enabled}
                      title="Send a test payload to this destination"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {testing === p.id ? " …" : null}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {adding ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new_channel">Channel</Label>
                <select
                  id="new_channel"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value as Preference["channel"])}
                >
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_event">Event</Label>
                <select
                  id="new_event"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={newEventType}
                  onChange={(e) => setNewEventType(e.target.value)}
                >
                  {EVENT_TYPES.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_target">Target</Label>
              <Input
                id="new_target"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder={CHANNELS.find((c) => c.value === newChannel)?.placeholder}
              />
              <p className="text-xs text-muted-foreground">
                {newChannel === "email" &&
                  "Any email address — uses Resend."}
                {newChannel === "slack" &&
                  "Slack incoming webhook URL. Channel is set on Slack's side; we POST text + blocks."}
                {newChannel === "teams" &&
                  "Teams incoming webhook URL. Renders as a MessageCard."}
                {newChannel === "webhook" &&
                  "Receives a JSON POST: { event_type, org_id, user_id, subject, html, text, sent_at }."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={creating}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={creating || !newTarget.trim()}>
                {creating ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add notification
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Hide the secret part of webhook URLs so a screen-share doesn't leak
// the token. Slack/Teams URLs are bearer-token-shaped — the path is the
// secret.
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}/…${u.pathname.slice(-12)}`;
  } catch {
    return url;
  }
}
