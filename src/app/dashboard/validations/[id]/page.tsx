"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
  ArrowLeft,
  Shield,
  Search,
  Building2,
  HardHat,
  Scale,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Star,
  FileDown,
} from "lucide-react";

interface ValidationDetail {
  id: string;
  borrower_name: string;
  borrower_entity_name: string;
  guarantor_name: string | null;
  overall_status: string;
  confidence_score: number;
  experience_tier: number | null;
  validation_date: string | null;
  created_at: string;
  entity_checks: EntityCheck[];
  track_record: TrackRecordEntry[];
  litigation_checks: LitigationCheck[];
  gc_validations: GCValidation[];
}

interface EntityCheck {
  id: string;
  entity_name: string;
  state: string;
  entity_type: string | null;
  sos_status: string;
  formation_date: string | null;
  last_filing_date: string | null;
  registered_agent: string | null;
  source_url: string | null;
  confidence: string;
  flags: string[];
}

interface TrackRecordEntry {
  id: string;
  property_address: string;
  acquisition_date: string | null;
  disposition_date: string | null;
  acquisition_price: number | null;
  disposition_price: number | null;
  project_type: string;
  outcome: string;
  hold_months: number | null;
  profit: number | null;
}

interface LitigationCheck {
  id: string;
  search_type: string;
  entity_name: string;
  result: string;
  details: string | null;
  case_number: string | null;
  source: string;
}

interface GCValidation {
  id: string;
  gc_name: string;
  license_number: string | null;
  license_state: string;
  license_status: string;
  license_classification: string | null;
  expiration_date: string | null;
  disciplinary_actions: string[];
  insurance_verified: boolean;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
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

function ExperienceStars({ tier }: { tier: number | null }) {
  if (!tier) return <span className="text-muted-foreground text-sm">N/A</span>;
  const stars = 5 - tier; // tier 1 = 4 stars, tier 4 = 1 star
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="ml-1 text-sm text-muted-foreground">Tier {tier}</span>
    </div>
  );
}

function formatCurrency(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ValidationDetailPage() {
  const params = useParams();
  const [data, setData] = useState<ValidationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/validations/${params.id}`);
        if (!res.ok) throw new Error("Failed to load validation");
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-pulse text-muted-foreground">
          Loading validation...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" render={<Link href="/dashboard" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-destructive">{error || "Validation not found"}</p>
      </div>
    );
  }

  const completedProjects = data.track_record.filter(
    (t) => t.outcome === "completed",
  );
  const totalProfit = completedProjects.reduce(
    (sum, t) => sum + (t.profit ?? 0),
    0,
  );
  const avgHold =
    completedProjects.length > 0
      ? Math.round(
          completedProjects.reduce((sum, t) => sum + (t.hold_months ?? 0), 0) /
            completedProjects.length,
        )
      : 0;
  const flaggedLitigation = data.litigation_checks.filter(
    (l) => l.result === "found",
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href="/dashboard" />}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {data.borrower_name}
              </h1>
              <StatusBadge status={data.overall_status} />
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {data.borrower_entity_name}
              {data.guarantor_name && ` — Guarantor: ${data.guarantor_name}`}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <FileDown className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
      </div>

      {/* Demo banner */}
      <div className="rounded-md border border-info/30 bg-info/5 p-3 flex items-center gap-2">
        <Badge variant="secondary" className="bg-info/20 text-info">
          DEMO DATA
        </Badge>
        <p className="text-sm text-muted-foreground">
          All check results are simulated. Real vendor APIs will replace stub
          data when connected.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Confidence</p>
            <p className="text-2xl font-bold mt-1">{data.confidence_score}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Experience</p>
            <div className="mt-1">
              <ExperienceStars tier={data.experience_tier} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Projects Found</p>
            <p className="text-2xl font-bold mt-1">
              {data.track_record.length}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({completedProjects.length} completed)
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Flags</p>
            <p className="text-2xl font-bold mt-1">
              {flaggedLitigation.length +
                data.entity_checks.reduce(
                  (n, e) => n + e.flags.length,
                  0,
                )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Entity Checks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            Entity Validation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.entity_checks.map((ec) => (
            <div key={ec.id} className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Entity</p>
                  <p className="font-medium">{ec.entity_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    State / Type
                  </p>
                  <p className="font-medium">
                    {ec.state} — {ec.entity_type ?? "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">SOS Status</p>
                  <Badge
                    variant={
                      ec.sos_status === "active"
                        ? "default"
                        : ec.sos_status === "suspended"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {ec.sos_status.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Formed</p>
                  <p className="font-mono text-sm">
                    {formatDate(ec.formation_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Filing</p>
                  <p className="font-mono text-sm">
                    {formatDate(ec.last_filing_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Registered Agent
                  </p>
                  <p className="text-sm">{ec.registered_agent ?? "—"}</p>
                </div>
              </div>
              {ec.flags.length > 0 && (
                <div className="space-y-1">
                  {ec.flags.map((flag, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm text-amber-600"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {flag}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Track Record */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Track Record
            <span className="text-sm font-normal text-muted-foreground ml-1">
              {completedProjects.length} completed, {formatCurrency(totalProfit)}{" "}
              total profit, {avgHold}mo avg hold
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Purchase</TableHead>
                <TableHead className="text-right">Sale</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Hold</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.track_record.map((tr) => (
                <TableRow key={tr.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {tr.property_address}
                  </TableCell>
                  <TableCell className="capitalize">{tr.project_type}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(tr.acquisition_price)}
                  </TableCell>
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
                  <TableCell className="text-right font-mono text-sm">
                    {tr.hold_months ?? "—"}mo
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tr.outcome === "completed"
                          ? "default"
                          : tr.outcome === "in_progress"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {tr.outcome}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Litigation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4" />
            Litigation Screening
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.litigation_checks.map((lc) => (
              <div
                key={lc.id}
                className={`rounded-md border p-3 ${
                  lc.result === "found"
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium capitalize">
                    {lc.search_type.replace("_", " ")}
                  </p>
                  {lc.result === "clear" ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Clear
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Found
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lc.source}
                </p>
                {lc.details && (
                  <p className="text-sm mt-2">{lc.details}</p>
                )}
                {lc.case_number && (
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    Case: {lc.case_number}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GC Validation */}
      {data.gc_validations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardHat className="h-4 w-4" />
              GC Validation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.gc_validations.map((gc) => (
              <div key={gc.id} className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Contractor</p>
                    <p className="font-medium">{gc.gc_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">License</p>
                    <p className="font-mono text-sm">
                      {gc.license_number ?? "—"} ({gc.license_state})
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge
                      variant={
                        gc.license_status === "active"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {gc.license_status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Classification
                    </p>
                    <p className="text-sm">
                      {gc.license_classification ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Expires</p>
                    <p className="font-mono text-sm">
                      {formatDate(gc.expiration_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Insurance</p>
                    <Badge
                      variant={
                        gc.insurance_verified ? "default" : "secondary"
                      }
                    >
                      {gc.insurance_verified ? "Verified" : "Unverified"}
                    </Badge>
                  </div>
                </div>
                {gc.disciplinary_actions.length > 0 && (
                  <div className="space-y-1">
                    {gc.disciplinary_actions.map((action, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm text-red-600"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {action}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
