"use client";

import { Badge } from "@/components/ui/badge";
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
import { Building2, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge as _Badge } from "@/components/ui/badge";
void _Badge;
import { formatCurrency, formatDate } from "./shared-types";
import type { TrackRecordEntry } from "./shared-types";
import { extractRealieDetails } from "@/lib/adapters/extract";
import { TrackRecordEditDialog } from "./track-record-edit-dialog";
import { TrackRecordAddDialog } from "./track-record-add-dialog";

export { type TrackRecordEntry };

function formatPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function formatCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function TrackRecordTable({
  data,
  validationId,
  onUpdated,
}: {
  data: TrackRecordEntry[];
  validationId?: string;
  onUpdated?: () => void;
}) {
  const [editing, setEditing] = useState<TrackRecordEntry | null>(null);
  const [adding, setAdding] = useState(false);

  const completedProjects = data.filter((t) => t.outcome === "completed");
  const currentHoldings = data.filter((t) => t.outcome !== "completed");

  // Extract Realie details for portfolio summary
  const details = data.map((t) => extractRealieDetails(t.raw_response));
  const hasRealieData = details.some((d) => d !== null);

  const totalAVM = details.reduce((sum, d) => sum + (d?.modelValue ?? 0), 0);
  const totalEquity = details.reduce((sum, d) => sum + (d?.equityEstimate ?? 0), 0);
  const totalLiens = details.reduce((sum, d) => sum + (d?.totalLienBalance ?? 0), 0);
  const ltvsWithData = details.filter((d) => d?.ltvCurrent != null);
  const avgLTV =
    ltvsWithData.length > 0
      ? ltvsWithData.reduce((sum, d) => sum + (d!.ltvCurrent ?? 0), 0) / ltvsWithData.length
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Portfolio & Track Record
          </CardTitle>
          {validationId && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add property
            </Button>
          )}
        </div>
        {/* Portfolio summary stats */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground mt-1">
          <span>{data.length} properties</span>
          {completedProjects.length > 0 && (
            <span>{completedProjects.length} sold</span>
          )}
          {currentHoldings.length > 0 && (
            <span>{currentHoldings.length} current</span>
          )}
          {hasRealieData && totalAVM > 0 && (
            <>
              <span className="text-foreground font-medium">Portfolio: {formatCompact(totalAVM)}</span>
              <span>Equity: {formatCompact(totalEquity)}</span>
              <span>Liens: {formatCompact(totalLiens)}</span>
              {avgLTV != null && <span>Avg LTV: {formatPct(avgLTV)}</span>}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Property</TableHead>
              <TableHead className="text-right">Purchase</TableHead>
              {hasRealieData ? (
                <>
                  <TableHead className="text-right">Est. Value</TableHead>
                  <TableHead>Lender</TableHead>
                  <TableHead className="text-right">Liens</TableHead>
                  <TableHead className="text-right">LTV</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-right">Sale</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </>
              )}
              <TableHead className="text-right">Hold</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((tr, i) => (
              <PropertyRow
                key={tr.id}
                entry={tr}
                details={details[i]}
                hasRealieData={hasRealieData}
                editable={Boolean(validationId)}
                onEdit={() => setEditing(tr)}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Edit + Add dialogs — only render the controllers when
          validationId was passed (read-only consumers like the
          handoff PDF preview don't need them). */}
      {validationId && (
        <>
          <TrackRecordEditDialog
            open={editing !== null}
            onOpenChange={(o) => !o && setEditing(null)}
            entry={editing}
            onSaved={() => onUpdated?.()}
          />
          <TrackRecordAddDialog
            open={adding}
            onOpenChange={setAdding}
            validationId={validationId}
            onAdded={() => onUpdated?.()}
          />
        </>
      )}
    </Card>
  );
}

function PropertyRow({
  entry: tr,
  details: d,
  hasRealieData,
  editable,
  onEdit,
}: {
  entry: TrackRecordEntry;
  details: ReturnType<typeof extractRealieDetails>;
  hasRealieData: boolean;
  editable: boolean;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusLabel =
    tr.outcome === "completed"
      ? "Sold"
      : tr.outcome === "in_progress"
        ? "Owned"
        : tr.outcome === "distressed"
          ? "Distressed"
          : tr.outcome;

  const statusVariant =
    tr.outcome === "completed"
      ? "default"
      : tr.outcome === "in_progress"
        ? "secondary"
        : ("destructive" as const);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8 px-2">
          {d ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : null}
        </TableCell>
        <TableCell className="font-medium max-w-[220px] truncate">
          {tr.property_address}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {formatCurrency(tr.acquisition_price)}
        </TableCell>
        {hasRealieData ? (
          <>
            <TableCell className="text-right font-mono text-sm">
              {formatCurrency(d?.modelValue ?? null)}
            </TableCell>
            <TableCell className="text-sm max-w-[140px] truncate">
              {d?.lenderName ?? "—"}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {d?.totalLienBalance ? formatCompact(d.totalLienBalance) : "—"}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {formatPct(d?.ltvCurrent)}
            </TableCell>
          </>
        ) : (
          <>
            <TableCell className="text-right font-mono text-sm">
              {formatCurrency(tr.disposition_price)}
            </TableCell>
            <TableCell
              className={`text-right font-mono text-sm ${
                tr.profit && tr.profit > 0
                  ? "text-green-600"
                  : tr.profit && tr.profit < 0
                    ? "text-red-600"
                    : ""
              }`}
            >
              {formatCurrency(tr.profit)}
            </TableCell>
          </>
        )}
        <TableCell className="text-right font-mono text-sm">
          {tr.hold_months != null ? `${tr.hold_months}mo` : "—"}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-between gap-2">
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            {editable && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground p-1"
                title={`Edit ${tr.property_address}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {tr.source === "manual" && (
              <span className="text-[9px] uppercase tracking-wide text-amber-700 bg-amber-50 rounded px-1 py-0.5 border border-amber-200">
                manual
              </span>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      {expanded && d && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={hasRealieData ? 9 : 7} className="py-3 px-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {d.yearBuilt && (
                <div>
                  <span className="text-muted-foreground">Year Built</span>
                  <p className="font-medium">{d.yearBuilt}</p>
                </div>
              )}
              {d.sqft && (
                <div>
                  <span className="text-muted-foreground">Size</span>
                  <p className="font-medium">{d.sqft.toLocaleString()} sqft</p>
                </div>
              )}
              {(d.beds || d.baths) && (
                <div>
                  <span className="text-muted-foreground">Bed / Bath</span>
                  <p className="font-medium">{d.beds ?? "—"} / {d.baths ?? "—"}</p>
                </div>
              )}
              {d.assessedValue && (
                <div>
                  <span className="text-muted-foreground">Assessed Value</span>
                  <p className="font-medium">{formatCurrency(d.assessedValue)}</p>
                </div>
              )}
              {d.lotAcres && (
                <div>
                  <span className="text-muted-foreground">Lot</span>
                  <p className="font-medium">{d.lotAcres.toFixed(2)} acres</p>
                </div>
              )}
              {d.zoning && (
                <div>
                  <span className="text-muted-foreground">Zoning</span>
                  <p className="font-medium">{d.zoning}</p>
                </div>
              )}
              {d.forecloseCode && (
                <div>
                  <span className="text-muted-foreground">Foreclosure</span>
                  <p className="font-medium text-red-600">{d.forecloseCode}</p>
                </div>
              )}
              {d.ltvPurchase != null && (
                <div>
                  <span className="text-muted-foreground">Purchase LTV</span>
                  <p className="font-medium">{formatPct(d.ltvPurchase)}</p>
                </div>
              )}
            </div>
            {d.transfers.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-muted-foreground mb-1">
                  Transfer History (most recent first)
                </p>
                {d.transfers.map((t, i) => (
                  <p key={i} className="text-sm">
                    <span className={i === 0 ? "font-medium" : ""}>
                      {t.grantor} <span className="text-muted-foreground mx-1">&rarr;</span> {t.grantee}
                    </span>
                    {t.price ? ` (${formatCurrency(t.price)})` : ""}
                    {t.date ? ` — ${formatDate(t.date)}` : ""}
                  </p>
                ))}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
