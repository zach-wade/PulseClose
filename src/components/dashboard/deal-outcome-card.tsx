"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertOctagon,
  CircleDashed,
} from "lucide-react";
import { toast } from "sonner";

export type OutcomeStatus =
  | "withdrawn"
  | "funded"
  | "extended"
  | "repaid"
  | "defaulted";

export interface DealOutcome {
  id: string;
  status: OutcomeStatus;
  outcome_data: {
    schema_version?: number;
    close_date?: string | null;
    funded_amount?: number | null;
    extension_reason?: string | null;
    default_cause?: string | null;
  };
  lender_user_id: string;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<OutcomeStatus, string> = {
  withdrawn: "Withdrawn",
  funded: "Funded",
  extended: "Extended",
  repaid: "Repaid",
  defaulted: "Defaulted",
};

// Map status → semantic badge variant + icon. Defaulted gets the
// destructive treatment because it's the only outcome where the deal
// went sideways; withdrawn is neutral (lender chose not to proceed).
const STATUS_META: Record<
  OutcomeStatus,
  { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }
> = {
  withdrawn: { variant: "outline", icon: XCircle },
  funded: { variant: "default", icon: CheckCircle2 },
  extended: { variant: "secondary", icon: Clock },
  repaid: { variant: "default", icon: RefreshCw },
  defaulted: { variant: "destructive", icon: AlertOctagon },
};

interface Props {
  validationId: string;
  initial: DealOutcome | null;
  onSaved?: () => void;
}

export function DealOutcomeCard({ validationId, initial, onSaved }: Props) {
  const [outcome, setOutcome] = useState<DealOutcome | null>(initial);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<OutcomeStatus>(initial?.status ?? "funded");
  const [closeDate, setCloseDate] = useState<string>(
    initial?.outcome_data?.close_date ?? "",
  );
  const [fundedAmount, setFundedAmount] = useState<string>(
    initial?.outcome_data?.funded_amount != null
      ? String(initial.outcome_data.funded_amount)
      : "",
  );
  const [extensionReason, setExtensionReason] = useState<string>(
    initial?.outcome_data?.extension_reason ?? "",
  );
  const [defaultCause, setDefaultCause] = useState<string>(
    initial?.outcome_data?.default_cause ?? "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      // Build per-status payload — only include fields meaningful to the
      // chosen status so we don't persist stale values from prior edits.
      const data: Record<string, unknown> = {};
      if (status === "funded") {
        if (closeDate) data.close_date = closeDate;
        if (fundedAmount) data.funded_amount = Number(fundedAmount);
      }
      if (status === "extended" && extensionReason) {
        data.extension_reason = extensionReason;
      }
      if (status === "defaulted" && defaultCause) {
        data.default_cause = defaultCause;
      }
      // Repaid and withdrawn carry no extra fields.

      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validation_id: validationId,
          status,
          outcome_data: data,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        toast.error(error || "Save failed");
        return;
      }
      const { outcome: saved } = (await res.json()) as { outcome: DealOutcome };
      setOutcome(saved);
      setOpen(false);
      toast.success(`Outcome set to ${STATUS_LABELS[status]}`);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const meta = outcome ? STATUS_META[outcome.status] : null;
  const Icon = meta?.icon ?? CircleDashed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Icon
              className={`h-4 w-4 ${
                outcome ? "" : "text-muted-foreground"
              }`}
            />
            Deal outcome
            {outcome && meta && (
              <Badge variant={meta.variant} className="text-xs">
                {STATUS_LABELS[outcome.status]}
              </Badge>
            )}
          </span>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button size="sm" variant={outcome ? "outline" : "default"} />
              }
            >
              {outcome ? "Update" : "Set outcome"}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {outcome ? "Update deal outcome" : "Set deal outcome"}
                </DialogTitle>
                <DialogDescription>
                  Recording the outcome unlocks reputation, performance, and
                  cross-tenant analytics. Last status wins — the lender can
                  revise as the deal progresses.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {(Object.keys(STATUS_LABELS) as OutcomeStatus[]).map((s) => {
                      const SIcon = STATUS_META[s].icon;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(s)}
                          className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors ${
                            status === s
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border text-muted-foreground hover:border-foreground/40"
                          }`}
                        >
                          <SIcon className="h-4 w-4" />
                          {STATUS_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {status === "funded" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="close_date">Close date</Label>
                      <Input
                        id="close_date"
                        type="date"
                        value={closeDate}
                        onChange={(e) => setCloseDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="funded_amount">Funded amount ($)</Label>
                      <Input
                        id="funded_amount"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="1600000"
                        value={fundedAmount}
                        onChange={(e) => setFundedAmount(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {status === "extended" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="extension_reason">Extension reason</Label>
                    <Input
                      id="extension_reason"
                      placeholder="e.g. rehab schedule slip, lender-side delay"
                      value={extensionReason}
                      onChange={(e) => setExtensionReason(e.target.value)}
                    />
                  </div>
                )}

                {status === "defaulted" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="default_cause">Default cause</Label>
                    <Input
                      id="default_cause"
                      placeholder="e.g. payment delinquency, foreclosure filed, bankruptcy"
                      value={defaultCause}
                      onChange={(e) => setDefaultCause(e.target.value)}
                    />
                  </div>
                )}

                {(status === "withdrawn" || status === "repaid") && (
                  <p className="text-xs text-muted-foreground">
                    No additional fields needed for this status.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save outcome"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!outcome ? (
          <p className="text-sm text-muted-foreground">
            No outcome recorded yet. Set one once the deal lands or is shelved
            so reputation and performance dashboards can use it.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {outcome.outcome_data.close_date && (
              <>
                <dt className="text-muted-foreground">Close date</dt>
                <dd>
                  {new Date(outcome.outcome_data.close_date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </>
            )}
            {outcome.outcome_data.funded_amount != null && (
              <>
                <dt className="text-muted-foreground">Funded amount</dt>
                <dd>${Math.round(outcome.outcome_data.funded_amount).toLocaleString()}</dd>
              </>
            )}
            {outcome.outcome_data.extension_reason && (
              <>
                <dt className="text-muted-foreground">Extension reason</dt>
                <dd className="break-words">{outcome.outcome_data.extension_reason}</dd>
              </>
            )}
            {outcome.outcome_data.default_cause && (
              <>
                <dt className="text-muted-foreground">Default cause</dt>
                <dd className="break-words">{outcome.outcome_data.default_cause}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Last updated</dt>
            <dd className="text-xs text-muted-foreground">
              {new Date(outcome.updated_at).toLocaleString()}
            </dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
