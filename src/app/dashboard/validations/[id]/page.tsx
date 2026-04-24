"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Star,
  FileDown,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
} from "lucide-react";
import { EntityResultCard } from "@/components/dashboard/entity-result-card";
import { TrackRecordTable } from "@/components/dashboard/track-record-table";
import { LitigationGrid } from "@/components/dashboard/litigation-grid";
import { GCResultCard } from "@/components/dashboard/gc-result-card";
import type { EntityCheck } from "@/components/dashboard/shared-types";
import type { TrackRecordEntry } from "@/components/dashboard/shared-types";
import type { LitigationCheck } from "@/components/dashboard/shared-types";
import type { GCValidation } from "@/components/dashboard/shared-types";

interface AIAnalysis {
  summary: string;
  risk_rating: "low" | "medium" | "high";
  pillar_assessments: {
    entity: string;
    track_record: string;
    litigation: string;
    gc: string | null;
  };
  flags: string[];
  recommendations: string[];
}

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
  ai_analysis: AIAnalysis | null;
  entity_checks: EntityCheck[];
  track_record: TrackRecordEntry[];
  litigation_checks: LitigationCheck[];
  gc_validations: GCValidation[];
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
  const stars = 5 - tier;
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
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-1/4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
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

      {/* Data source banner — only show if stub data was actually used in any check */}
      {(() => {
        const allRaw = [
          ...data.entity_checks.map((e) => (e as unknown as Record<string, unknown>).raw_response),
          ...data.track_record.map((t) => (t as unknown as Record<string, unknown>).raw_response),
          ...data.litigation_checks.map((l) => (l as unknown as Record<string, unknown>).raw_response),
          ...(data.gc_validations ?? []).map((g) => (g as unknown as Record<string, unknown>).raw_response),
        ];
        const hasStub = allRaw.some((r) => r && JSON.stringify(r).includes('"_demo":true'));
        if (!hasStub) return null;
        return (
          <div className="rounded-md border border-info/30 bg-info/5 p-3 flex items-center gap-2">
            <Badge variant="secondary" className="bg-info/20 text-info">
              DEMO DATA
            </Badge>
            <p className="text-sm text-muted-foreground">
              Some check results use simulated data. Real vendor APIs will replace
              stub data as they are connected.
            </p>
          </div>
        );
      })()}

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
            <p className="text-sm text-muted-foreground">Properties Found</p>
            <p className="text-2xl font-bold mt-1">
              {data.track_record.length}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({completedProjects.length > 0
                  ? `${completedProjects.length} sold`
                  : `${data.track_record.length} current`})
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

      {/* AI Analysis */}
      {data.ai_analysis && (
        <Card className="border-info/30 bg-gradient-to-br from-info/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-info" />
              AI Risk Assessment
              <Badge
                variant={
                  data.ai_analysis.risk_rating === "low"
                    ? "default"
                    : data.ai_analysis.risk_rating === "high"
                      ? "destructive"
                      : "secondary"
                }
                className="ml-2"
              >
                {data.ai_analysis.risk_rating === "low" && (
                  <TrendingDown className="mr-1 h-3 w-3" />
                )}
                {data.ai_analysis.risk_rating === "medium" && (
                  <Minus className="mr-1 h-3 w-3" />
                )}
                {data.ai_analysis.risk_rating === "high" && (
                  <TrendingUp className="mr-1 h-3 w-3" />
                )}
                {data.ai_analysis.risk_rating.toUpperCase()} RISK
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed">{data.ai_analysis.summary}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entity</p>
                <p className="text-sm">{data.ai_analysis.pillar_assessments.entity}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Track Record</p>
                <p className="text-sm">{data.ai_analysis.pillar_assessments.track_record}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Litigation</p>
                <p className="text-sm">{data.ai_analysis.pillar_assessments.litigation}</p>
              </div>
              {data.ai_analysis.pillar_assessments.gc && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">GC</p>
                  <p className="text-sm">{data.ai_analysis.pillar_assessments.gc}</p>
                </div>
              )}
            </div>

            {data.ai_analysis.flags.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Flags</p>
                {data.ai_analysis.flags.map((flag, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {flag}
                  </div>
                ))}
              </div>
            )}

            {data.ai_analysis.recommendations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommendations</p>
                {data.ai_analysis.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-info" />
                    {rec}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Entity Checks */}
      {data.entity_checks.map((ec) => (
        <EntityResultCard key={ec.id} data={ec} />
      ))}

      {/* Track Record */}
      {data.track_record.length > 0 && (
        <TrackRecordTable data={data.track_record} />
      )}

      {/* Litigation */}
      {data.litigation_checks.length > 0 && (
        <LitigationGrid data={data.litigation_checks} isStub />
      )}

      {/* GC Validation */}
      {data.gc_validations.map((gc) => (
        <GCResultCard key={gc.id} data={gc} isStub />
      ))}
    </div>
  );
}
