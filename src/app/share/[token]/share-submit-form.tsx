"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Loader2,
  CheckCircle2,
  Home,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/components/dashboard/shared-types";
import type { VerifiedFlip } from "@/components/dashboard/shared-types";

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
  token: string;
  borrowerName: string;
  entityName: string | null;
  initialFlips: VerifiedFlip[];
}

export function ShareSubmitForm({ token, borrowerName, entityName, initialFlips }: Props) {
  const [addresses, setAddresses] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [flips, setFlips] = useState<VerifiedFlip[]>(initialFlips);

  async function handleSubmit() {
    const lines = addresses
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("Paste at least one address");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/share/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: lines }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const { verified } = (await res.json()) as { verified: VerifiedFlip[] };
      setFlips(verified);
      setAddresses("");
      toast.success(
        `Verified ${verified.length} address${verified.length === 1 ? "" : "es"} — your lender can now see the results`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Submit your addresses
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm space-y-2">
          <p>
            Searching as <span className="font-medium">{borrowerName}</span>
            {entityName && (
              <> and entity <span className="font-medium">{entityName}</span></>
            )}.
          </p>
          <p className="text-muted-foreground">
            Format: street + city + state + zip on each line, e.g.{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">123 Main St, Sunnyvale, CA 94089</code>
          </p>
        </div>

        <textarea
          className="w-full min-h-[140px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:opacity-50"
          placeholder={"123 Main St, Sunnyvale, CA 94089\n456 Oak Ave, San Jose, CA 95130\n…"}
          value={addresses}
          onChange={(e) => setAddresses(e.target.value)}
          disabled={submitting}
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Up to 50 addresses.</p>
          <Button onClick={handleSubmit} disabled={submitting || !addresses.trim()}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              <>Submit for verification</>
            )}
          </Button>
        </div>

        {flips.length > 0 && (
          <div className="space-y-3 pt-3 border-t">
            <div className="text-sm">
              <p className="font-medium">
                {summary.submitted} address{summary.submitted === 1 ? "" : "es"} verified
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {summary.sold} sold · {summary.held} still owned · {summary.notInChain} not in deed chain · {summary.notFound} not found
                {summary.realizedProfit > 0 && ` · ${formatCurrency(summary.realizedProfit)} realized profit`}
              </p>
            </div>

            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acquired</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flips.map((f) => (
                    <TableRow key={f.id ?? f.submitted_address}>
                      <TableCell className="max-w-[200px] truncate">
                        {f.submitted_address}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={f.match_status} />
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {formatDate(f.acquisition_date)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {formatDate(f.disposition_date)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-xs font-mono ${
                          f.profit != null && f.profit > 0
                            ? "text-emerald-700 font-medium"
                            : f.profit != null && f.profit < 0
                              ? "text-red-600"
                              : ""
                        }`}
                      >
                        {f.profit != null ? formatCurrency(f.profit) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
