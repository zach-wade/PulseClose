"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck,
  CheckCircle2,
  Home,
  XCircle,
  HelpCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "./shared-types";
import type { VerifiedFlip } from "./shared-types";

const STATUS_LABEL: Record<VerifiedFlip["match_status"], string> = {
  owned_and_sold: "Verified flip",
  owned_and_held: "Verified — still owns",
  never_owned: "Not in deed chain",
  not_found: "Address not found",
  pending: "Pending",
};

function StatusBadge({ status }: { status: VerifiedFlip["match_status"] }) {
  if (status === "owned_and_sold") {
    return (
      <Badge variant="default" className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        <CheckCircle2 className="h-3 w-3" /> {STATUS_LABEL[status]}
      </Badge>
    );
  }
  if (status === "owned_and_held") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Home className="h-3 w-3" /> {STATUS_LABEL[status]}
      </Badge>
    );
  }
  if (status === "never_owned") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> {STATUS_LABEL[status]}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <HelpCircle className="h-3 w-3" /> {STATUS_LABEL[status]}
    </Badge>
  );
}

interface Props {
  validationId: string;
  initial: VerifiedFlip[];
  onUpdate: (flips: VerifiedFlip[]) => void;
}

export function VerifiedTrackRecord({ validationId, initial, onUpdate }: Props) {
  const [addressInput, setAddressInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const flips = initial;

  const summary = {
    submitted: flips.length,
    sold: flips.filter((f) => f.match_status === "owned_and_sold").length,
    held: flips.filter((f) => f.match_status === "owned_and_held").length,
    notInChain: flips.filter((f) => f.match_status === "never_owned").length,
    notFound: flips.filter((f) => f.match_status === "not_found").length,
    realizedProfit: flips
      .filter((f) => f.match_status === "owned_and_sold" && f.profit != null)
      .reduce((sum, f) => sum + (f.profit ?? 0), 0),
  };

  async function handleSubmit() {
    const lines = addressInput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("Paste at least one address");
      return;
    }
    if (lines.length > 50) {
      toast.error("Maximum 50 addresses per request");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/track-record/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validation_id: validationId,
          addresses: lines,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const { verified } = (await res.json()) as { verified: VerifiedFlip[] };
      onUpdate(verified);
      setAddressInput("");
      toast.success(`Verified ${verified.length} address${verified.length === 1 ? "" : "es"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Verified Track Record
          {flips.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground ml-2">
              {summary.submitted} submitted · {summary.sold} sold · {summary.held} still owned · {summary.notInChain} not in deed chain
              {summary.realizedProfit > 0 && ` · ${formatCurrency(summary.realizedProfit)} realized profit`}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm">
          <p className="text-xs font-medium text-info mb-1 uppercase tracking-wide">
            How this works
          </p>
          <p className="text-muted-foreground">
            Paste the addresses the borrower claims to have flipped or owned (one per line).
            We look up each address in deed records (Realie) and check whether the borrower
            or entity actually appears in the transfer chain. This is the only way to
            verify completed flips — current-portfolio search can&apos;t see properties
            already sold.
          </p>
        </div>

        <div className="space-y-2">
          <textarea
            className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:opacity-50"
            placeholder={"123 Main St, Sunnyvale, CA 94089\n456 Oak Ave, San Jose, CA 95130\n…"}
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            disabled={submitting}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              One address per line, max 50. Each lookup costs ~$0.50.
            </p>
            <Button onClick={handleSubmit} disabled={submitting || !addressInput.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Verify Addresses
                </>
              )}
            </Button>
          </div>
        </div>

        {flips.length > 0 && (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acquired</TableHead>
                  <TableHead className="text-right">Buy</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Sell</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Hold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flips.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium max-w-[260px] truncate">
                      <div>{f.submitted_address}</div>
                      {f.resolved_address && f.resolved_address !== f.submitted_address && (
                        <div className="text-xs text-muted-foreground truncate">
                          → {f.resolved_address}
                        </div>
                      )}
                      {f.match_status === "owned_and_held" && f.current_owner && (
                        <div className="text-xs text-muted-foreground truncate">
                          Current: {f.current_owner}
                        </div>
                      )}
                      {(f.raw_response as { _error?: boolean } | undefined)?._error && (
                        <div className="flex items-start gap-1 text-xs text-amber-600 mt-0.5">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{((f.raw_response as { _message?: string })?._message ?? "Lookup failed")}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={f.match_status} />
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatDate(f.acquisition_date)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatCurrency(f.acquisition_price)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatDate(f.disposition_date)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatCurrency(f.disposition_price)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm font-mono ${
                        f.profit != null && f.profit > 0
                          ? "text-emerald-700 font-medium"
                          : f.profit != null && f.profit < 0
                            ? "text-red-600"
                            : ""
                      }`}
                    >
                      {f.profit != null ? formatCurrency(f.profit) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {f.hold_months != null ? `${f.hold_months}mo` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
