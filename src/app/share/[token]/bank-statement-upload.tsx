"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUp, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

// Borrower-facing bank statement upload. Posts a single PDF / CSV /
// text statement to /api/share/[token]/extract-bank-statement, shows
// the extracted summary back. Persists with 90-day expiry per privacy
// posture; lender sees the summary on validation detail.

interface Summary {
  ending_balance: number | null;
  avg_daily_balance: number | null;
  monthly_inflow: number | null;
  monthly_outflow: number | null;
  nsf_count: number | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
}

interface Props {
  token: string;
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function BankStatementUpload({ token }: Props) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/share/${token}/extract-bank-statement`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => null)) as { summary?: Summary; error?: string; message?: string } | null;
      if (!res.ok) {
        toast.error(j?.message ?? j?.error ?? "Couldn't read the statement.");
        return;
      }
      if (j?.summary) {
        setSummary(j.summary);
        toast.success("Statement processed. Lender can see this on their report.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Bank statement (optional)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Adds liquidity context to your validation. PDF or CSV
          statements work. Your lender sees the summary (ending
          balance, avg daily balance, NSF count, monthly cash flow);
          the file itself is stored encrypted with a 90-day expiry.
        </p>
        <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Drop a PDF or CSV from your bank.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            {busy ? "Processing…" : "Upload statement"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {summary && (
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Extracted
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {summary.ending_balance != null && (
                <div>
                  <span className="text-muted-foreground">Ending balance: </span>
                  <span className="font-medium">{fmtMoney(summary.ending_balance)}</span>
                </div>
              )}
              {summary.avg_daily_balance != null && (
                <div>
                  <span className="text-muted-foreground">Avg daily balance: </span>
                  <span className="font-medium">{fmtMoney(summary.avg_daily_balance)}</span>
                </div>
              )}
              {summary.monthly_inflow != null && (
                <div>
                  <span className="text-muted-foreground">Inflow: </span>
                  <span className="font-medium">{fmtMoney(summary.monthly_inflow)}</span>
                </div>
              )}
              {summary.monthly_outflow != null && (
                <div>
                  <span className="text-muted-foreground">Outflow: </span>
                  <span className="font-medium">{fmtMoney(summary.monthly_outflow)}</span>
                </div>
              )}
              {summary.nsf_count != null && (
                <div>
                  <span className="text-muted-foreground">NSF count: </span>
                  <span
                    className={`font-medium ${summary.nsf_count > 0 ? "text-amber-700" : ""}`}
                  >
                    {summary.nsf_count}
                  </span>
                </div>
              )}
              {summary.statement_period_start && summary.statement_period_end && (
                <div className="col-span-2 text-xs text-muted-foreground">
                  Period: {summary.statement_period_start} → {summary.statement_period_end}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
