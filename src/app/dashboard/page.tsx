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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { GCStatusChip, type GCSummaryView } from "@/components/dashboard/gc-status-chip";

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
        <Button render={<Link href="/dashboard/new" />}>
          <Plus className="mr-2 h-4 w-4" />
          New Validation
        </Button>
      </div>

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
                  <TableHead className="text-right">Confidence</TableHead>
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
            <h3 className="text-lg font-semibold">No validations yet</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
              Start by entering a borrower&apos;s name and entity — we&apos;ll
              run entity, track-record, litigation, and sanctions checks in
              parallel and have a report ready in 30-60 seconds.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button render={<Link href="/dashboard/new" />}>
                <Plus className="mr-2 h-4 w-4" />
                Run First Validation
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
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
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Tier</TableHead>
                  <TableHead className="text-right">Props</TableHead>
                  <TableHead className="text-right">Flags</TableHead>
                  <TableHead className="hidden md:table-cell">GC</TableHead>
                  <TableHead>AI</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validations.map((v) => (
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
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Sparkles className="h-3 w-3 animate-pulse" />
                          Generating…
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
