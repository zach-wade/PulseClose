"use client";

// Litigation case cards — replaces the bare "3 found" summary with
// expandable cards (case name, court, year, nature, status, link). Reads
// the materialized litigation_cases table; falls back to the legacy
// LitigationGrid render path when no materialized rows exist (e.g. an
// older validation predating migration 00018 + backfill).

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Scale,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { LitigationGrid } from "./litigation-grid";
import type { LitigationCheck } from "./shared-types";
import { LitigationEditDialog } from "./litigation-edit-dialog";
import { LitigationAddDialog } from "./litigation-add-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";

export interface LitigationCaseRow {
  id: string;
  validation_id: string;
  case_name: string;
  case_number: string | null;
  court: string | null;
  court_id: string | null;
  filed_at: string | null;
  terminated_at: string | null;
  nature_of_suit: string | null;
  category: "bankruptcy" | "civil" | "lien" | "tax" | "foreclosure" | "other";
  status: "pending" | "closed" | "discharged" | "dismissed" | "judgment" | "unknown";
  dollar_amount_estimated: number | null;
  source_doc_url: string | null;
  source?: string | null;
  lender_notes?: string | null;
  raw: Record<string, unknown>;
}

type CategoryFilter = "all" | "bankruptcy" | "civil" | "lien" | "tax" | "foreclosure";
type AgeFilter = "all" | "5y";
type StatusFilter = "all" | "pending";

interface Props {
  cases: LitigationCaseRow[];
  // Legacy fallback — passed when litigation_cases is empty so the page
  // still shows something. Old validations show the original grid.
  legacyChecks: LitigationCheck[];
  // Optional — when present, edit + delete + add affordances render.
  validationId?: string;
  onUpdated?: () => void;
}

const CATEGORY_LABELS: Record<LitigationCaseRow["category"], string> = {
  bankruptcy: "Bankruptcy",
  civil: "Civil",
  lien: "Lien",
  tax: "Tax",
  foreclosure: "Foreclosure",
  other: "Other",
};

const STATUS_LABELS: Record<LitigationCaseRow["status"], string> = {
  pending: "Pending",
  closed: "Closed",
  discharged: "Discharged",
  dismissed: "Dismissed",
  judgment: "Judgment",
  unknown: "Status unknown",
};

function categoryColor(category: LitigationCaseRow["category"]): string {
  switch (category) {
    case "bankruptcy":
      return "border-red-300 text-red-700 bg-red-50/60";
    case "foreclosure":
      return "border-orange-300 text-orange-700 bg-orange-50/60";
    case "tax":
      return "border-purple-300 text-purple-700 bg-purple-50/60";
    case "lien":
      return "border-amber-300 text-amber-700 bg-amber-50/60";
    case "civil":
      return "border-slate-300 text-slate-700 bg-slate-50/60";
    default:
      return "border-slate-200 text-slate-600";
  }
}

function statusColor(status: LitigationCaseRow["status"]): string {
  if (status === "pending") return "border-red-300 text-red-700";
  if (status === "judgment") return "border-amber-300 text-amber-700";
  if (status === "dismissed" || status === "closed" || status === "discharged") {
    return "border-emerald-300 text-emerald-700";
  }
  return "";
}

export function LitigationCases({ cases, legacyChecks, validationId, onUpdated }: Props) {
  const [editing, setEditing] = useState<LitigationCaseRow | null>(null);
  const [adding, setAdding] = useState(false);

  const [category, setCategory] = useState<CategoryFilter>("all");
  const [age, setAge] = useState<AgeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    return cases.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (status === "pending" && c.status !== "pending") return false;
      if (age === "5y" && c.filed_at && new Date(c.filed_at) < fiveYearsAgo) return false;
      return true;
    });
  }, [cases, category, age, status]);

  const counts = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const c of cases) byCat[c.category] = (byCat[c.category] ?? 0) + 1;
    return byCat;
  }, [cases]);

  const pendingCount = useMemo(
    () => cases.filter((c) => c.status === "pending").length,
    [cases],
  );

  // No materialized cases:
  //   - validationId set → render the empty card with Add button
  //   - legacy checks present → fall back to legacy grid
  //   - neither → render nothing
  if (cases.length === 0 && !validationId) {
    if (legacyChecks.length > 0) return <LitigationGrid data={legacyChecks} />;
    return null;
  }

  return (
    <Card id="litigation-card" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Public records
            <Badge variant="outline" className="text-[10px] uppercase">
              {cases.length} case{cases.length === 1 ? "" : "s"}
            </Badge>
            {pendingCount > 0 && (
              <Badge variant="destructive" className="text-[10px] uppercase">
                {pendingCount} pending
              </Badge>
            )}
          </span>
          {validationId && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add case
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* C6 — coverage disclosure. Federal-only today (CourtListener
            PACER); state/county records require a paid provider. Show
            scope so a reader doesn't assume a clean run means clean
            history. */}
        <p className="text-xs text-muted-foreground">
          Source: CourtListener (federal courts — PACER + bankruptcy).
          State court, county lien, tax warrant, and non-federal
          foreclosure searches are not yet automated.
        </p>

        {/* Filter chip row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground mr-1">Filter:</span>
          <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
            All ({cases.length})
          </FilterChip>
          {(["bankruptcy", "civil", "foreclosure", "lien", "tax"] as const).map((cat) => {
            const n = counts[cat] ?? 0;
            if (n === 0) return null;
            return (
              <FilterChip
                key={cat}
                active={category === cat}
                onClick={() => setCategory(cat)}
              >
                {CATEGORY_LABELS[cat]} ({n})
              </FilterChip>
            );
          })}
          <span className="mx-1 text-muted-foreground">·</span>
          <FilterChip active={age === "5y"} onClick={() => setAge(age === "5y" ? "all" : "5y")}>
            Last 5 years
          </FilterChip>
          <FilterChip
            active={status === "pending"}
            onClick={() => setStatus(status === "pending" ? "all" : "pending")}
          >
            Pending only
          </FilterChip>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No cases match the current filters.
          </p>
        ) : category === "all" ? (
          // C6 — when "All" is selected, group by category so the reader
          // sees distinct evidence streams. When a single category is
          // active the chip filter already handles segmentation.
          <div className="space-y-4">
            {(["bankruptcy", "foreclosure", "lien", "tax", "civil", "other"] as const).map((cat) => {
              const inCat = filtered.filter((c) => c.category === cat);
              if (inCat.length === 0) return null;
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase ${categoryColor(cat)}`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {inCat.length} case{inCat.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {inCat.map((c) => (
                      <CaseCard
                        key={c.id}
                        c={c}
                        editable={Boolean(validationId)}
                        onEdit={() => setEditing(c)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <CaseCard
                        key={c.id}
                        c={c}
                        editable={Boolean(validationId)}
                        onEdit={() => setEditing(c)}
                      />
            ))}
          </div>
        )}
      </CardContent>

      {validationId && (
        <>
          <LitigationEditDialog
            open={editing !== null}
            onOpenChange={(o) => !o && setEditing(null)}
            caseRow={editing}
            onSaved={() => onUpdated?.()}
          />
          <LitigationAddDialog
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function CaseCard({
  c,
  editable,
  onEdit,
}: {
  c: LitigationCaseRow;
  editable?: boolean;
  onEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const filedYear = c.filed_at ? new Date(c.filed_at).getFullYear() : null;
  const Icon = expanded ? ChevronDown : ChevronRight;
  const isManual = c.source === "manual";

  // Anchor target for factor-evidence hyperlinks (Why-this-rating panel).
  // Prefer the docket number when present (stable + readable in URL hash);
  // fall back to the row's uuid so cases without docketNumber still link.
  const anchorId = `case-${c.case_number ?? c.id}`;

  // Auto-expand when the user lands here via a factor-evidence hyperlink —
  // landing on a collapsed card defeats the drill-down purpose.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      if (window.location.hash === `#${anchorId}`) setExpanded(true);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [anchorId]);

  return (
    <div id={anchorId} className="rounded-md border p-3 scroll-mt-20">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex-1 flex items-start justify-between gap-3 text-left"
        >
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{c.case_name}</span>
              <Badge variant="outline" className={`text-[10px] uppercase ${categoryColor(c.category)}`}>
                {CATEGORY_LABELS[c.category]}
              </Badge>
              <Badge variant="outline" className={`text-[10px] uppercase ${statusColor(c.status)}`}>
                {c.status === "pending" ? "Pending" : STATUS_LABELS[c.status]}
                {c.status === "pending" ? null : <CheckCircle2 className="ml-1 h-2.5 w-2.5" />}
              </Badge>
              {isManual && (
                <span className="text-[9px] uppercase tracking-wide text-amber-700 bg-amber-50 rounded px-1 py-0.5 border border-amber-200">
                  manual
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {c.court && <span>{c.court}</span>}
              {filedYear && <span>Filed {filedYear}</span>}
              {c.nature_of_suit && <span>{c.nature_of_suit}</span>}
              {c.case_number && <span className="font-mono">#{c.case_number}</span>}
            </div>
          </div>
          <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        </button>
        {editable && onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="text-muted-foreground hover:text-foreground p-1"
            title="Edit case"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>

      {c.lender_notes && (
        <p className="mt-2 text-xs italic bg-blue-50 border border-blue-100 rounded px-2 py-1.5 text-blue-900">
          <span className="font-medium not-italic">Lender note: </span>
          {c.lender_notes}
        </p>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t text-xs space-y-2">
          <DocketDetails c={c} />
          {c.source_doc_url && (
            <div>
              <a
                href={c.source_doc_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Open in CourtListener
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocketDetails({ c }: { c: LitigationCaseRow }) {
  // CourtListener returns minimal docket fields — surface the structured ones
  // we have plus the unparsed cause/details for transparency.
  const cause = typeof c.raw.cause === "string" ? c.raw.cause : null;
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
      {c.filed_at && (
        <>
          <dt className="text-muted-foreground">Filed</dt>
          <dd>{new Date(c.filed_at).toLocaleDateString()}</dd>
        </>
      )}
      {c.terminated_at && (
        <>
          <dt className="text-muted-foreground">Terminated</dt>
          <dd>{new Date(c.terminated_at).toLocaleDateString()}</dd>
        </>
      )}
      {c.nature_of_suit && (
        <>
          <dt className="text-muted-foreground">Nature of suit</dt>
          <dd>{c.nature_of_suit}</dd>
        </>
      )}
      {cause && (
        <>
          <dt className="text-muted-foreground">Cause</dt>
          <dd>{cause}</dd>
        </>
      )}
      {c.dollar_amount_estimated != null && (
        <>
          <dt className="text-muted-foreground">Amount</dt>
          <dd>${c.dollar_amount_estimated.toLocaleString()}</dd>
        </>
      )}
    </dl>
  );
}
