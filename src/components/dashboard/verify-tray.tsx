"use client";

// Verify tray — surfaces Flow B (statewide owner-name search) hits that
// the score-and-promote pass didn't clear the auto-promote threshold.
// Each row is a "we found this property registered to a similar name —
// is it actually theirs?" with confirm / reject buttons that drive the
// row's review_status and trigger AI memo regen.
//
// Sorted by confidence desc, with the named signal breakdown rendered
// inline so the lender sees WHY each row scored where it did (Noah's
// drill-down principle).

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Eye, ShieldQuestion, XCircle } from "lucide-react";
import type { TrackRecordEntry } from "./shared-types";

interface Props {
  pendingRows: TrackRecordEntry[];
  onReviewed: () => void | Promise<void>;
}

interface SignalEntry {
  key: string;
  value: unknown;
  note: string;
}

function formatConfidence(score: number | null | undefined): string {
  if (score == null) return "—";
  return `${score}/100`;
}

function confidenceTone(score: number | null | undefined): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 60) return "bg-emerald-100 text-emerald-800";
  if (score >= 30) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function entityOwnerFromRaw(raw: TrackRecordEntry["raw_response"]): string | null {
  if (!raw) return null;
  const v = raw["ownerName"];
  return typeof v === "string" ? v : null;
}

export function VerifyTray({ pendingRows, onReviewed }: Props) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...pendingRows].sort((a, b) => (b.review_confidence ?? 0) - (a.review_confidence ?? 0));
  }, [pendingRows]);

  async function review(rowId: string, action: "confirm" | "reject") {
    setPendingKey(`${rowId}:${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/track-record/${rowId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      await onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingKey(null);
    }
  }

  if (sorted.length === 0) return null;

  return (
    <Card id="verify-tray" className="scroll-mt-20 border-amber-200/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldQuestion className="h-4 w-4 text-amber-600" />
          Possible additional properties — needs review
          <Badge variant="secondary" className="ml-auto bg-amber-50 text-amber-800">
            {sorted.length} to review
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          We found {sorted.length} {sorted.length === 1 ? "property" : "properties"} registered to
          a name similar to the borrower&apos;s, but the corroborating signals
          aren&apos;t strong enough to auto-add. Confirm what&apos;s theirs, reject what
          isn&apos;t — rejected rows are hidden permanently. Higher-confidence
          matches are at the top.
        </p>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {sorted.map((row) => {
          const ownerName = entityOwnerFromRaw(row.raw_response);
          const signalEntries: SignalEntry[] = Object.entries(row.review_signals ?? {}).map(
            ([key, val]) => ({ key, value: val?.value, note: val?.note ?? "" }),
          );

          return (
            <div
              key={row.id}
              className="rounded-md border p-3 space-y-2 bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{row.property_address}</p>
                  {ownerName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deed owner: <span className="font-mono">{ownerName}</span>
                    </p>
                  )}
                </div>
                <Badge className={`shrink-0 text-xs ${confidenceTone(row.review_confidence)}`}>
                  {formatConfidence(row.review_confidence)}
                </Badge>
              </div>

              {signalEntries.length > 0 && (
                <ul className="text-xs space-y-0.5 list-disc list-inside text-muted-foreground">
                  {signalEntries.map((s) => (
                    <li key={s.key}>{s.note}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="default"
                  disabled={pendingKey === `${row.id}:confirm`}
                  onClick={() => review(row.id, "confirm")}
                  className="gap-1"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {pendingKey === `${row.id}:confirm` ? "Confirming…" : "Confirm"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingKey === `${row.id}:reject`}
                  onClick={() => review(row.id, "reject")}
                  className="gap-1"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {pendingKey === `${row.id}:reject` ? "Rejecting…" : "Reject"}
                </Button>
                <a
                  href={row.property_id ? `#property-${row.property_id}` : "#"}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  title="See raw deed details"
                >
                  <Eye className="h-3 w-3" />
                  View source
                </a>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
