"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, FileText } from "lucide-react";

// Surfaces borrower-submitted artifacts on the lender side: photo
// verifications + bank statement summaries. Auto-hides if neither
// table has rows for this validation. Each item shows a verdict /
// summary; the underlying file lives in storage with documents row.

interface PhotoRow {
  id: string;
  property_id: string | null;
  exif_lat: number | null;
  exif_lng: number | null;
  exif_timestamp: string | null;
  vision_verdict: string | null;
  vision_notes: string | null;
  distance_from_property_m: number | null;
  verified_at: string;
}

interface BankRow {
  id: string;
  ending_balance_cents: number | null;
  avg_daily_balance_cents: number | null;
  monthly_inflow_cents: number | null;
  monthly_outflow_cents: number | null;
  nsf_count: number | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
  created_at: string;
}

interface Props {
  validationId: string;
}

const VERDICT_COLOR: Record<string, string> = {
  plausible_property: "text-emerald-700",
  stock_or_synthetic: "text-red-700",
  indoor_only: "text-amber-700",
  unknown: "text-muted-foreground",
};

function fmtCents(c: number | null): string {
  if (c == null) return "—";
  return `$${Math.round(c / 100).toLocaleString()}`;
}

export function BorrowerUploadsCard({ validationId }: Props) {
  const [photos, setPhotos] = useState<PhotoRow[] | null>(null);
  const [statements, setStatements] = useState<BankRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/validations/${validationId}/borrower-uploads`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((j: { photos: PhotoRow[]; statements: BankRow[] }) => {
        if (cancelled) return;
        setPhotos(j.photos);
        setStatements(j.statements);
      })
      .catch(() => {
        if (!cancelled) {
          setPhotos([]);
          setStatements([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [validationId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasPhotos = (photos ?? []).length > 0;
  const hasStatements = (statements ?? []).length > 0;
  if (!hasPhotos && !hasStatements) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Borrower-submitted artifacts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasPhotos && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Camera className="h-4 w-4" />
              Property photos
              <Badge variant="outline" className="text-xs font-normal">
                {photos!.length}
              </Badge>
            </div>
            <div className="space-y-1.5">
              {photos!.map((p) => (
                <div key={p.id} className="rounded-md border p-2 text-xs space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.vision_verdict && (
                      <span className={`font-medium ${VERDICT_COLOR[p.vision_verdict] ?? ""}`}>
                        {p.vision_verdict.replace(/_/g, " ")}
                      </span>
                    )}
                    {p.exif_lat != null && p.exif_lng != null ? (
                      <span className="font-mono text-muted-foreground">
                        {p.exif_lat.toFixed(4)}, {p.exif_lng.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">No GPS metadata</span>
                    )}
                    {p.distance_from_property_m != null && (
                      <span
                        className={
                          p.distance_from_property_m > 150
                            ? "text-amber-700"
                            : "text-emerald-700"
                        }
                      >
                        {p.distance_from_property_m}m from property
                      </span>
                    )}
                    <span className="text-muted-foreground ml-auto">
                      {new Date(p.verified_at).toLocaleString()}
                    </span>
                  </div>
                  {p.vision_notes && (
                    <p className="text-muted-foreground italic">{p.vision_notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasStatements && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Bank statements
              <Badge variant="outline" className="text-xs font-normal">
                {statements!.length}
              </Badge>
            </div>
            <div className="space-y-1.5">
              {statements!.map((s) => (
                <div key={s.id} className="rounded-md border p-2 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1">
                    <div>
                      <span className="text-muted-foreground">Ending: </span>
                      <span className="font-medium">{fmtCents(s.ending_balance_cents)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg daily: </span>
                      <span className="font-medium">{fmtCents(s.avg_daily_balance_cents)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Inflow: </span>
                      <span className="font-medium">{fmtCents(s.monthly_inflow_cents)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Outflow: </span>
                      <span className="font-medium">{fmtCents(s.monthly_outflow_cents)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">NSFs: </span>
                      <span
                        className={
                          (s.nsf_count ?? 0) > 0 ? "text-amber-700 font-medium" : "font-medium"
                        }
                      >
                        {s.nsf_count ?? "—"}
                      </span>
                    </div>
                  </div>
                  <p className="text-muted-foreground mt-1">
                    {s.statement_period_start && s.statement_period_end
                      ? `${s.statement_period_start} → ${s.statement_period_end}`
                      : "Period unknown"}{" "}
                    · uploaded {new Date(s.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
