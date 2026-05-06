"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Send } from "lucide-react";
import { toast } from "sonner";

// F3 — "Route to investor" CTA on the validation detail page header.
// Routes a deal to an investor's queue (idempotent on the server).
// The investor gets visibility via /investor when they log in.

interface InvestorOption {
  id: string;
  display_name: string;
}

interface QueuedRow {
  id: string;
  investor_id: string;
  validation_id: string;
  status: string;
  created_at: string;
}

interface Props {
  validationId: string;
}

export function RouteToInvestorButton({ validationId }: Props) {
  const [open, setOpen] = useState(false);
  const [investors, setInvestors] = useState<InvestorOption[]>([]);
  const [queued, setQueued] = useState<QueuedRow[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/investors").then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/investor-queue`).then((r) => (r.ok ? r.json() : { queue: [] })),
    ]).then(([invs, q]: [Array<{ id: string; display_name: string }>, { queue: QueuedRow[] }]) => {
      setInvestors(invs.map((i) => ({ id: i.id, display_name: i.display_name })));
      setQueued((q.queue ?? []).filter((r) => r.investor_id && r.status !== "withdrawn"));
    });
  }, [open, validationId]);

  // For this validation specifically — show which investors already have it.
  const queuedForThisValidation = queued.filter(
    (q) => q.validation_id === validationId,
  );
  const queuedInvestorIds = new Set(queuedForThisValidation.map((q) => q.investor_id));
  const available = investors.filter((i) => !queuedInvestorIds.has(i.id));

  async function handleRoute() {
    if (!picked) return;
    setSaving(true);
    try {
      const res = await fetch("/api/investor-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investor_id: picked,
          validation_id: validationId,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Route failed" }));
        toast.error(error || "Route failed");
        return;
      }
      toast.success("Routed. Investor will see it on their queue.");
      setPicked("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        title="Route this validation to a configured investor's queue. They see it on /investor when they log in."
        onClick={() => setOpen(true)}
      >
        <Send className="mr-2 h-4 w-4" />
        Route to investor
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Route to investor</DialogTitle>
          <DialogDescription>
            Adds this validation to the chosen investor&apos;s queue.
            Routing is idempotent — re-routing the same investor is a
            no-op. Investor logs in at <code className="text-xs">/investor</code>{" "}
            to see queued deals (placeholder review UI today; full
            review surface is post-NPLA).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {queuedForThisValidation.length > 0 && (
            <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
              <p className="font-medium text-muted-foreground">Already routed to:</p>
              <ul className="space-y-0.5">
                {queuedForThisValidation.map((q) => {
                  const inv = investors.find((i) => i.id === q.investor_id);
                  return (
                    <li key={q.id}>
                      {inv?.display_name ?? q.investor_id} — <span className="uppercase">{q.status}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="investor_pick">Investor</Label>
            <select
              id="investor_pick"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="">— Pick one —</option>
              {available.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.display_name}
                </option>
              ))}
            </select>
            {available.length === 0 && investors.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Already routed to every configured investor.
              </p>
            )}
            {investors.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No investors configured. Add some on{" "}
                <a className="underline" href="/dashboard/evaluate/investors">
                  Manage investors
                </a>
                .
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleRoute} disabled={saving || !picked}>
            {saving ? "Routing…" : "Route"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
