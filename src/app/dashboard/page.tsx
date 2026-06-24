"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  GitCompare,
  Search,
  Download,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { GCStatusChip, type GCSummaryView } from "@/components/dashboard/gc-status-chip";
import { UsageMeter } from "@/components/dashboard/usage-meter";

interface Validation {
  id: string;
  borrower_name: string;
  borrower_entity_name: string;
  overall_status: string;
  confidence_score: number;
  experience_tier: number | null;
  property_count: number | null;
  flag_count: number | null;
  ai_analysis: unknown;
  gc_summary: GCSummaryView | null;
  validation_date: string | null;
  created_at: string;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }
> = {
  verified: { label: "Verified", variant: "default", icon: CheckCircle2 },
  partial: { label: "Partial", variant: "secondary", icon: Clock },
  flagged: { label: "Flagged", variant: "destructive", icon: AlertTriangle },
  pending: { label: "Pending", variant: "outline", icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.pending;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

type StatusFilter = "all" | "verified" | "partial" | "pending" | "flagged";
type TierFilter = "all" | "1" | "2" | "3" | "4";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildValidationsCsv(rows: Validation[]): string {
  const header = [
    "id",
    "borrower_name",
    "borrower_entity_name",
    "overall_status",
    "confidence_score",
    "experience_tier",
    "property_count",
    "flag_count",
    "validation_date",
    "created_at",
  ];
  const lines = [header.join(",")];
  for (const v of rows) {
    lines.push([
      csvEscape(v.id),
      csvEscape(v.borrower_name),
      csvEscape(v.borrower_entity_name),
      csvEscape(v.overall_status),
      csvEscape(v.confidence_score),
      csvEscape(v.experience_tier),
      csvEscape(v.property_count),
      csvEscape(v.flag_count),
      csvEscape(v.validation_date),
      csvEscape(v.created_at),
    ].join(","));
  }
  return lines.join("\n");
}

export default function DashboardPage() {
  const [validations, setValidations] = useState<Validation[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguish "no validations exist yet" from "the API failed to load".
  // Without this, both render as the empty state and a real outage looks
  // like a fresh tenant during a live demo.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Selection state for the Compare action. Only 2 IDs allowed at a time
  // because /api/validations/compare returns a side-by-side diff.
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const router = useRouter();

  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Cap at 2; replace the older selection on the third click.
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/validations");
        if (!res.ok) {
          setLoadError(`Couldn't load validations (${res.status}). Refresh the page to retry.`);
          return;
        }
        setValidations(await res.json());
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Network error loading validations");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const verified = validations.filter((v) => v.overall_status === "verified").length;
  const flagged = validations.filter((v) => v.overall_status === "flagged").length;
  const pending = validations.filter((v) => v.overall_status === "pending").length;

  // Apply client-side search + filter. Validation set is small enough
  // that a server round-trip per keystroke isn't worth it. Property
  // address search would need an API call (joining properties); deferred.
  const searchLower = search.trim().toLowerCase();
  const filteredValidations = validations.filter((v) => {
    if (statusFilter !== "all" && v.overall_status !== statusFilter) return false;
    if (tierFilter !== "all" && String(v.experience_tier ?? "") !== tierFilter) return false;
    if (searchLower) {
      const haystack = [
        v.borrower_name,
        v.borrower_entity_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    return true;
  });

  const filtersActive = search.trim() !== "" || statusFilter !== "all" || tierFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setTierFilter("all");
  }

  function exportCsv() {
    const csv = buildValidationsCsv(filteredValidations);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `validations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const stats = [
    { label: "Total", value: validations.length, icon: Shield, color: "text-primary" },
    { label: "Verified", value: verified, icon: CheckCircle2, color: "text-green-600" },
    { label: "Flagged", value: flagged, icon: AlertTriangle, color: "text-amber-500" },
    { label: "Pending", value: pending, icon: Clock, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Validations</h1>
          <p className="text-muted-foreground mt-1">
            Borrower entity, track record, and credential checks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {validations.length > 0 && (
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
          <Button render={<Link href="/dashboard/new" />}>
            <Plus className="mr-2 h-4 w-4" />
            New Validation
          </Button>
        </div>
      </div>

      {/* Trial / usage meter */}
      <UsageMeter />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Validation list or empty state */}
      {loading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Completeness</TableHead>
                  <TableHead className="text-right">Tier</TableHead>
                  <TableHead className="text-right">Props</TableHead>
                  <TableHead className="text-right">Flags</TableHead>
                  <TableHead className="hidden md:table-cell">GC</TableHead>
                  <TableHead>AI</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertTriangle className="h-12 w-12 text-destructive/70 mb-4" />
            <h3 className="text-lg font-semibold">Couldn&apos;t load validations</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
              {loadError}
            </p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
          </CardContent>
        </Card>
      ) : validations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">Start here</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
              PulseClose takes a borrower from validation to a capital-ready
              handoff in three steps.
            </p>
            <ol className="mt-6 w-full max-w-md space-y-3">
              {[
                {
                  n: 1,
                  title: "Validate the borrower",
                  body: "Entity, track-record, litigation, and sanctions checks run in parallel — a report in 30–60 seconds.",
                },
                {
                  n: 2,
                  title: "Evaluate against your investors",
                  body: "Size the loan and compare best execution across every investor box you've configured.",
                },
                {
                  n: 3,
                  title: "Hand off to capital",
                  body: "Generate the polished investor Excel + PDF and route the deal.",
                },
              ].map((s) => (
                <li key={s.n} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {s.n}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button render={<Link href="/dashboard/new" />}>
                <Plus className="mr-2 h-4 w-4" />
                Run your first validation
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search + filter toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search borrower or entity…"
                className="w-full rounded-md border border-input bg-background pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                aria-label="Search validations"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(["all", "verified", "partial", "pending", "flagged"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 text-xs rounded-md border capitalize transition-colors ${
                    statusFilter === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-input text-foreground/70"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {(["all", "1", "2", "3", "4"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierFilter(t)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    tierFilter === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-input text-foreground/70"
                  }`}
                >
                  {t === "all" ? "All tiers" : `T${t}`}
                </button>
              ))}
            </div>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
            <p className="text-xs text-muted-foreground ml-auto">
              {filteredValidations.length} of {validations.length}
            </p>
          </div>

          {selected.length > 0 && (
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-md border bg-background/95 backdrop-blur px-4 py-2 shadow-sm">
              <p className="text-sm">
                <span className="font-medium">{selected.length}</span> selected
                {selected.length === 1 && (
                  <span className="text-muted-foreground"> — pick one more to compare</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected([])}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  disabled={selected.length !== 2}
                  onClick={() =>
                    router.push(`/dashboard/compare?a=${selected[0]}&b=${selected[1]}`)
                  }
                >
                  <GitCompare className="mr-2 h-4 w-4" />
                  Compare selected
                </Button>
              </div>
            </div>
          )}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Completeness</TableHead>
                  <TableHead className="text-right">Tier</TableHead>
                  <TableHead className="text-right">Props</TableHead>
                  <TableHead className="text-right">Flags</TableHead>
                  <TableHead className="hidden md:table-cell">GC</TableHead>
                  <TableHead>AI</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredValidations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                      No validations match your filters.{" "}
                      <button type="button" onClick={clearFilters} className="text-primary hover:underline">
                        Clear them
                      </button>{" "}
                      to see all {validations.length}.
                    </TableCell>
                  </TableRow>
                )}
                {filteredValidations.map((v) => (
                  <TableRow key={v.id} className={selected.includes(v.id) ? "bg-muted/50" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input cursor-pointer accent-primary"
                        checked={selected.includes(v.id)}
                        onChange={() => toggleSelect(v.id)}
                        aria-label={`Select ${v.borrower_name} for compare`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/dashboard/validations/${v.id}`}
                          className="font-medium hover:underline"
                        >
                          {v.borrower_name}
                        </Link>
                        {/* Mobile-only GC chip — desktop has its own column. */}
                        <span className="md:hidden">
                          <GCStatusChip summary={v.gc_summary} />
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.borrower_entity_name}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={v.overall_status} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {v.confidence_score}%
                    </TableCell>
                    <TableCell className="text-right">
                      {v.experience_tier ? `T${v.experience_tier}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {v.property_count ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {v.flag_count == null ? "—" : v.flag_count > 0 ? (
                        <span className="text-amber-600 font-medium">{v.flag_count}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <GCStatusChip summary={v.gc_summary} />
                    </TableCell>
                    <TableCell>
                      {v.ai_analysis ? (
                        <Badge variant="default" className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          <Sparkles className="h-3 w-3" />
                          Ready
                        </Badge>
                      ) : v.overall_status === "pending" ? (
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Waiting
                        </Badge>
                      ) : Date.now() - new Date(v.created_at).getTime() < 5 * 60 * 1000 ? (
                        // Memo generation is async; only show "Generating…" while a
                        // run is plausibly still in flight (created < 5 min ago).
                        // After that, a null memo means it didn't run — show a
                        // terminal state instead of spinning forever.
                        <Badge variant="secondary" className="gap-1">
                          <Sparkles className="h-3 w-3 animate-pulse" />
                          Generating…
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          No memo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.validation_date
                        ? new Date(v.validation_date).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" },
                          )
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}
    </div>
  );
}
