"use client";

// Unified property table — Phase 1 of the property-card consolidation.
// Replaces both TrackRecordTable (auto-discovered properties from
// Realie/Regrid/RentCast) and the row-listing of VerifiedTrackRecord
// (borrower-claimed properties checked against deed records). One row
// per property; provenance is metadata in a small badge column.
//
// Provenance states:
//   verified       — found in deed records AND borrower-claimed (highest trust)
//   public_record  — found in deed records only (borrower didn't claim it)
//   claimed_only   — borrower-claimed but NOT in deed records (yellow flag)
//   manual         — lender added directly via the "+ Add property" affordance
//
// Edit dispatch: the existing /api/track-record/[id] PATCH endpoint
// only edits track_record_entries. Rows with provenance = claimed_only
// have no track_record_entries row backing them, so edit is disabled
// for those (would need to "promote" them to a track_record entry — a
// Phase 2 feature). All other rows route through the existing edit
// dialog.

import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Term } from "@/components/ui/term";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  ShieldCheck,
  Database,
  AlertTriangle,
  PencilLine,
} from "lucide-react";
import { formatCurrency, formatDate } from "./shared-types";
import type { TrackRecordEntry, VerifiedFlip } from "./shared-types";
import { extractRealieDetails } from "@/lib/adapters/extract";
import { TrackRecordEditDialog } from "./track-record-edit-dialog";
import { TrackRecordAddDialog } from "./track-record-add-dialog";

// API returns more columns than the shared TrackRecordEntry type exposes.
// Captured here so the merge logic can use property_id + lender info
// without forcing a global type change.
type RichTrackRecord = TrackRecordEntry & {
  property_id?: string | null;
  lender_id?: string | null;
  lenders?: { id: string; display_name: string; classification?: string | null } | null;
};

type RichVerifiedFlip = VerifiedFlip & {
  property_id?: string | null;
};

type Provenance = "verified" | "public_record" | "claimed_only" | "manual";

interface UnifiedRow {
  // Stable key for React + filtering
  key: string;
  // Canonical property_id for anchor links from the Why-this-rating panel
  // (e.g. market_outlier / foreclosure_distress factor evidence rows).
  property_id: string | null;
  provenance: Provenance;
  property_address: string;
  acquisition_date: string | null;
  disposition_date: string | null;
  acquisition_price: number | null;
  disposition_price: number | null;
  hold_months: number | null;
  profit: number | null;
  // For lender column: from track_record join, or null on claimed_only rows
  lender_name: string | null;
  // Realie expansion data — only present for track_record-backed rows
  raw_response?: Record<string, unknown> | null;
  // For dispatch
  track_record_entry?: RichTrackRecord;
  verified_flip?: RichVerifiedFlip;
  // Borrower's own claim about hold/profit, when it differs from public record
  borrower_claim?: {
    hold_months: number | null;
    acquisition_price: number | null;
    disposition_price: number | null;
    match_status: VerifiedFlip["match_status"];
  };
}

interface ProvenanceMeta {
  label: string;
  Icon: typeof ShieldCheck;
  badgeClass: string;
  rowClass: string;
}

const PROVENANCE: Record<Provenance, ProvenanceMeta> = {
  verified: {
    label: "Verified",
    Icon: ShieldCheck,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rowClass: "",
  },
  public_record: {
    label: "Public",
    Icon: Database,
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    rowClass: "",
  },
  claimed_only: {
    label: "Claimed only",
    Icon: AlertTriangle,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    // Tint the whole row so unmatched borrower claims are obvious at a glance.
    rowClass: "bg-amber-50/40",
  },
  manual: {
    label: "Manual",
    Icon: PencilLine,
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
    rowClass: "",
  },
};

function ProvenanceBadge({ p }: { p: Provenance }) {
  const meta = PROVENANCE[p];
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${meta.badgeClass}`}
      title={
        p === "verified"
          ? "Found in public deed records AND borrower-claimed."
          : p === "public_record"
            ? "Found in public deed records. Borrower did not include this in their submitted list."
            : p === "claimed_only"
              ? "Borrower claimed this address but it does not appear in public deed records — verify before underwriting."
              : "Manually added by the lender."
      }
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function mergeRows(
  trackRecord: RichTrackRecord[],
  verifiedFlips: RichVerifiedFlip[],
): UnifiedRow[] {
  // Match by canonical property_id when both sides have one. Falls back
  // to comparing addresses (case-insensitive line-1) for rows missing a
  // property_id — verified_flips' property_id wasn't always populated
  // historically. Keep the fallback narrow so we don't over-match.
  const flipsByPropertyId = new Map<string, RichVerifiedFlip>();
  const flipsByAddrKey = new Map<string, RichVerifiedFlip>();
  const consumedFlipIds = new Set<string>();

  function addrKey(addr: string | null | undefined): string {
    if (!addr) return "";
    return addr.split(",")[0]?.trim().toLowerCase() ?? "";
  }

  for (const vf of verifiedFlips) {
    if (vf.property_id) flipsByPropertyId.set(vf.property_id, vf);
    const k1 = addrKey(vf.resolved_address);
    const k2 = addrKey(vf.submitted_address);
    if (k1) flipsByAddrKey.set(k1, vf);
    if (k2 && !flipsByAddrKey.has(k2)) flipsByAddrKey.set(k2, vf);
  }

  const out: UnifiedRow[] = [];

  for (const tr of trackRecord) {
    let matchedFlip: RichVerifiedFlip | undefined;
    if (tr.property_id) matchedFlip = flipsByPropertyId.get(tr.property_id);
    if (!matchedFlip) {
      const k = addrKey(tr.property_address);
      if (k) matchedFlip = flipsByAddrKey.get(k);
    }
    if (matchedFlip) consumedFlipIds.add(matchedFlip.id);

    let provenance: Provenance;
    if (matchedFlip && matchedFlip.match_status !== "not_found" && matchedFlip.match_status !== "never_owned") {
      provenance = "verified";
    } else if (tr.source === "manual") {
      provenance = "manual";
    } else {
      provenance = "public_record";
    }

    out.push({
      key: `tr-${tr.id}`,
      property_id: tr.property_id ?? matchedFlip?.property_id ?? null,
      provenance,
      property_address: tr.property_address,
      acquisition_date: tr.acquisition_date,
      disposition_date: tr.disposition_date,
      acquisition_price: tr.acquisition_price,
      disposition_price: tr.disposition_price,
      hold_months: tr.hold_months,
      profit: tr.profit,
      lender_name: tr.lenders?.display_name ?? null,
      raw_response: tr.raw_response ?? null,
      track_record_entry: tr,
      verified_flip: matchedFlip,
      borrower_claim:
        matchedFlip && (
          matchedFlip.hold_months !== tr.hold_months ||
          matchedFlip.acquisition_price !== tr.acquisition_price ||
          matchedFlip.disposition_price !== tr.disposition_price
        )
          ? {
              hold_months: matchedFlip.hold_months,
              acquisition_price: matchedFlip.acquisition_price,
              disposition_price: matchedFlip.disposition_price,
              match_status: matchedFlip.match_status,
            }
          : undefined,
    });
  }

  // Any verified_flip not consumed above is either unmatched (claimed_only)
  // OR matched-by-status-but-no-track-record-entry (treat as verified standalone).
  for (const vf of verifiedFlips) {
    if (consumedFlipIds.has(vf.id)) continue;
    const isUnmatched = vf.match_status === "not_found" || vf.match_status === "never_owned";
    out.push({
      key: `vf-${vf.id}`,
      property_id: vf.property_id ?? null,
      provenance: isUnmatched ? "claimed_only" : "verified",
      property_address: vf.resolved_address ?? vf.submitted_address,
      acquisition_date: vf.acquisition_date,
      disposition_date: vf.disposition_date,
      acquisition_price: vf.acquisition_price,
      disposition_price: vf.disposition_price,
      hold_months: vf.hold_months,
      profit: vf.profit,
      lender_name: null,
      raw_response: vf.raw_response ?? null,
      verified_flip: vf,
    });
  }

  return out;
}

interface Props {
  trackRecord: RichTrackRecord[];
  verifiedFlips: RichVerifiedFlip[];
  validationId?: string;
  onUpdated?: () => void;
}

export function UnifiedPropertyTable({
  trackRecord,
  verifiedFlips,
  validationId,
  onUpdated,
}: Props) {
  const [editing, setEditing] = useState<RichTrackRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Provenance | "all">("all");

  const rows = useMemo(
    () => mergeRows(trackRecord, verifiedFlips),
    [trackRecord, verifiedFlips],
  );

  const counts = useMemo(() => {
    const c: Record<Provenance | "all", number> = {
      all: rows.length,
      verified: 0,
      public_record: 0,
      claimed_only: 0,
      manual: 0,
    };
    for (const r of rows) c[r.provenance]++;
    return c;
  }, [rows]);

  const visibleRows = filter === "all" ? rows : rows.filter((r) => r.provenance === filter);

  // Realie deep-detail summary stats — only across track_record-backed rows.
  const realieDetails = rows.map((r) =>
    r.track_record_entry ? extractRealieDetails(r.track_record_entry.raw_response) : null,
  );
  const hasRealieData = realieDetails.some((d) => d !== null);

  const totalAVM = realieDetails.reduce((s, d) => s + (d?.modelValue ?? 0), 0);
  const totalEquity = realieDetails.reduce((s, d) => s + (d?.equityEstimate ?? 0), 0);
  const totalLiens = realieDetails.reduce((s, d) => s + (d?.totalLienBalance ?? 0), 0);
  const ltvsWithData = realieDetails.filter((d) => d?.ltvCurrent != null);
  const avgLTV =
    ltvsWithData.length > 0
      ? ltvsWithData.reduce((s, d) => s + (d!.ltvCurrent ?? 0), 0) / ltvsWithData.length
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Property Track Record
          </CardTitle>
          {validationId && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add property
            </Button>
          )}
        </div>
        {/* Headline counts strip — answers "what am I looking at?" at a glance */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
          <span>
            <span className="text-foreground font-medium">{counts.all}</span> properties
          </span>
          {counts.verified > 0 && (
            <span>
              <span className="text-emerald-700 font-medium">{counts.verified}</span> verified
            </span>
          )}
          {counts.public_record > 0 && (
            <span>
              <span className="text-sky-700 font-medium">{counts.public_record}</span> public-record
            </span>
          )}
          {counts.claimed_only > 0 && (
            <span>
              <span className="text-amber-700 font-medium">{counts.claimed_only}</span> claimed only
            </span>
          )}
          {counts.manual > 0 && (
            <span>
              <span className="text-slate-700 font-medium">{counts.manual}</span> manual
            </span>
          )}
          {hasRealieData && totalAVM > 0 && (
            <>
              <span className="text-foreground font-medium ml-2">Portfolio: ${(totalAVM / 1_000_000).toFixed(1)}M</span>
              <span>Equity: ${(totalEquity / 1_000_000).toFixed(1)}M</span>
              <span>Liens: ${(totalLiens / 1_000_000).toFixed(1)}M</span>
              {avgLTV != null && <span>Avg LTV: {avgLTV.toFixed(1)}%</span>}
            </>
          )}
        </div>
        {/* Filter pills — single click to scope the table */}
        {counts.all > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(["all", "verified", "public_record", "claimed_only", "manual"] as const).map((f) => {
              if (f !== "all" && counts[f] === 0) return null;
              const label = f === "all" ? "All" : PROVENANCE[f].label;
              const active = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {label} <span className="opacity-70">{counts[f]}</span>
                </button>
              );
            })}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic px-6 py-8 text-center">
            {filter === "all"
              ? "No properties on record."
              : `No ${PROVENANCE[filter as Provenance].label.toLowerCase()} properties.`}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-[110px]">Source</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="text-right">Purchase</TableHead>
                <TableHead className="text-right">Sale</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Hold</TableHead>
                <TableHead>Lender</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r, i) => (
                <UnifiedRowDisplay
                  key={r.key}
                  row={r}
                  details={realieDetails[rows.indexOf(r)] ?? null}
                  editable={Boolean(validationId) && Boolean(r.track_record_entry)}
                  onEdit={() => r.track_record_entry && setEditing(r.track_record_entry)}
                  rowIndex={i}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

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

function UnifiedRowDisplay({
  row,
  details,
  editable,
  onEdit,
}: {
  row: UnifiedRow;
  details: ReturnType<typeof extractRealieDetails> | null;
  editable: boolean;
  onEdit: () => void;
  rowIndex: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const provenanceMeta = PROVENANCE[row.provenance];
  const anchorId = row.property_id ? `property-${row.property_id}` : undefined;

  // When a factor-evidence link points at this row, scroll-anchor lands here
  // — auto-expand the Realie detail pane so the user sees the data they came
  // for, not a collapsed row.
  useEffect(() => {
    if (typeof window === "undefined" || !anchorId || !details) return;
    const apply = () => {
      if (window.location.hash === `#${anchorId}`) setExpanded(true);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [anchorId, details]);

  return (
    <>
      <TableRow
        id={anchorId}
        className={`${details ? "cursor-pointer" : ""} hover:bg-muted/40 ${provenanceMeta.rowClass} scroll-mt-20`}
        onClick={() => details && setExpanded(!expanded)}
      >
        <TableCell className="w-8 px-2">
          {details ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : null}
        </TableCell>
        <TableCell>
          <ProvenanceBadge p={row.provenance} />
        </TableCell>
        <TableCell className="font-medium max-w-[260px] truncate">
          {row.property_address}
          {row.borrower_claim && (
            <div className="text-[10px] text-amber-700 mt-0.5">
              borrower claims:{" "}
              {row.borrower_claim.hold_months != null
                ? `${row.borrower_claim.hold_months}mo hold`
                : ""}
              {row.borrower_claim.acquisition_price != null
                ? ` · acq ${formatCurrency(row.borrower_claim.acquisition_price)}`
                : ""}
            </div>
          )}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {formatCurrency(row.acquisition_price)}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {formatCurrency(row.disposition_price)}
        </TableCell>
        <TableCell
          className={`text-right font-mono text-sm ${
            row.profit && row.profit > 0
              ? "text-emerald-700"
              : row.profit && row.profit < 0
                ? "text-red-700"
                : ""
          }`}
        >
          {formatCurrency(row.profit)}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {row.hold_months != null ? `${row.hold_months}mo` : "—"}
        </TableCell>
        <TableCell className="text-sm max-w-[160px] truncate">
          {row.lender_name ?? "—"}
        </TableCell>
        <TableCell className="w-10 text-right pr-2">
          {editable ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-1"
              title={`Edit ${row.property_address}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-3 w-3" />
            </button>
          ) : row.provenance === "claimed_only" ? (
            <span
              className="inline-block w-4 h-4"
              title="Borrower-claimed addresses can't be edited yet — promote to track record first (Phase 2)."
            />
          ) : null}
        </TableCell>
      </TableRow>

      {expanded && details && (
        <TableRow className={`bg-muted/20 ${provenanceMeta.rowClass}`}>
          <TableCell colSpan={9} className="py-3 px-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {details.yearBuilt && (
                <div>
                  <span className="text-muted-foreground">Year Built</span>
                  <p className="font-medium">{details.yearBuilt}</p>
                </div>
              )}
              {details.sqft && (
                <div>
                  <span className="text-muted-foreground">Size</span>
                  <p className="font-medium">{details.sqft.toLocaleString()} sqft</p>
                </div>
              )}
              {(details.beds || details.baths) && (
                <div>
                  <span className="text-muted-foreground">Bed / Bath</span>
                  <p className="font-medium">
                    {details.beds ?? "—"} / {details.baths ?? "—"}
                  </p>
                </div>
              )}
              {details.assessedValue && (
                <div>
                  <span className="text-muted-foreground">Assessed Value</span>
                  <p className="font-medium">{formatCurrency(details.assessedValue)}</p>
                </div>
              )}
              {details.modelValue && (
                <div>
                  <span className="text-muted-foreground">Est. Value (AVM)</span>
                  <p className="font-medium">{formatCurrency(details.modelValue)}</p>
                </div>
              )}
              {details.totalLienBalance != null && (
                <div>
                  <span className="text-muted-foreground">Liens</span>
                  <p className="font-medium">{formatCurrency(details.totalLienBalance)}</p>
                </div>
              )}
              {details.ltvCurrent != null && (
                <div>
                  <span className="text-muted-foreground">Current <Term>LTV</Term></span>
                  <p className="font-medium">{details.ltvCurrent.toFixed(1)}%</p>
                </div>
              )}
              {details.forecloseCode && (
                <div>
                  <span className="text-muted-foreground">Foreclosure</span>
                  <p className="font-medium text-red-700">{details.forecloseCode}</p>
                </div>
              )}
            </div>
            {details.transfers.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-muted-foreground mb-1">
                  Transfer history (most recent first)
                </p>
                {details.transfers.map((t, i) => (
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
