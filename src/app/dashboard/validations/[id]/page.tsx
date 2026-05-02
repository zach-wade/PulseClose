"use client";

import { useCallback, useEffect, useState } from "react";
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
  Calculator,
} from "lucide-react";
import { EntityResultCard } from "@/components/dashboard/entity-result-card";
import { TrackRecordTable } from "@/components/dashboard/track-record-table";
import { LitigationCases, type LitigationCaseRow } from "@/components/dashboard/litigation-cards";
import { GCResultCard } from "@/components/dashboard/gc-result-card";
import { SanctionsCard } from "@/components/dashboard/sanctions-card";
import { VerifiedTrackRecord } from "@/components/dashboard/verified-track-record";
import { WhyThisRating } from "@/components/dashboard/why-this-rating";
import { HandoffCard } from "@/components/dashboard/handoff-card";
import { MonitorCard } from "@/components/dashboard/monitor-card";
import { AIMemo } from "@/components/dashboard/ai-memo";
import type { EntityCheck } from "@/components/dashboard/shared-types";
import type { TrackRecordEntry } from "@/components/dashboard/shared-types";
import type { LitigationCheck } from "@/components/dashboard/shared-types";
import type { GCValidation } from "@/components/dashboard/shared-types";
import type { SanctionsCheck } from "@/components/dashboard/shared-types";
import type { VerifiedFlip } from "@/components/dashboard/shared-types";

interface RiskFactor {
  id?: string;
  factor_key: string;
  severity: "critical" | "moderate" | "minor" | "informational" | "none";
  excluded: boolean;
  exclusion_reason: string | null;
  contributing_data: Record<string, unknown>;
  explanation: string;
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
  // ai_analysis is one of two shapes (v1 legacy or v2 Story Mode); the
  // AIMemo component branches on schema_version. Keep `unknown` here so
  // the page doesn't have to know.
  ai_analysis: unknown;
  input_warnings: string[] | null;
  entity_checks: EntityCheck[];
  track_record: TrackRecordEntry[];
  litigation_checks: LitigationCheck[];
  litigation_cases: LitigationCaseRow[];
  gc_validations: GCValidation[];
  sanctions_checks: SanctionsCheck[];
  verified_flips: VerifiedFlip[];
  primary_borrower_id: string | null;
  primary_entity_id: string | null;
  risk_factors: RiskFactor[];
  tier: "HIGH" | "MEDIUM" | "LOW";
  handoff_data: {
    overall_narrative?: string | null;
    preparer_name?: string | null;
    preparer_email?: string | null;
  } | null;
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

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/validations/${params.id}`);
      if (!res.ok) throw new Error("Failed to load validation");
      const next = (await res.json()) as ValidationDetail;
      setData(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      return null;
    }
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollCount = 0;

    async function load(isPoll = false) {
      try {
        const res = await fetch(`/api/validations/${params.id}`);
        if (!res.ok) throw new Error("Failed to load validation");
        const next = await res.json();
        if (!cancelled) setData(next);
        if (!isPoll) setLoading(false);
        return next;
      } catch (err) {
        if (!isPoll && !cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
        return null;
      }
    }

    // Poll for AI analysis if it isn't ready yet. AI runs after the
    // initial response so the page often loads before it's persisted.
    // Stop polling once it lands or after ~3 minutes (30 polls × 6s).
    // Bumped from 90s to 180s — Claude regularly takes 30-60s but a busy
    // model or rate-limit retry can push it past the old 90s window,
    // making the demo look broken when the memo would have arrived.
    function schedulePoll() {
      pollTimer = setTimeout(async () => {
        if (cancelled) return;
        pollCount++;
        const next = await load(true);
        if (next?.ai_analysis || pollCount >= 30) return;
        schedulePoll();
      }, 6000);
    }

    (async () => {
      const initial = await load(false);
      if (initial && !initial.ai_analysis) schedulePoll();
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [params.id]);

  // After an override is applied: refetch immediately to pick up new
  // risk_factors + tier, then schedule one more refetch in ~5s to catch
  // the AI memo regeneration that runs via after().
  const handleSignalApplied = useCallback(async () => {
    await refetch();
    setTimeout(() => {
      refetch();
    }, 5000);
  }, [refetch]);

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
        <div className="flex gap-2 flex-wrap justify-end">
          <Button
            render={
              <Link
                href={{
                  pathname: "/dashboard/evaluate",
                  query: {
                    borrower: data.borrower_name,
                    state: data.entity_checks[0]?.state ?? "",
                    experience: data.experience_tier ?? "",
                  },
                }}
              />
            }
            title="Evaluate this borrower's deal against your configured investors. Pre-fills borrower name, state, and experience tier; you supply loan-specific terms."
          >
            <Calculator className="mr-2 h-4 w-4" />
            Evaluate against my investors
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(`/validations/${data.id}/risk-methodology`, "_blank")}
            title="One-page printable showing the deterministic factor decomposition, severity, and signal-override audit trail."
          >
            <FileDown className="mr-2 h-4 w-4" />
            Print risk methodology
          </Button>
        </div>
      </div>

      {/* Input warnings — surface mismatched/odd inputs at the top */}
      {data.input_warnings && data.input_warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Input Warning{data.input_warnings.length > 1 ? "s" : ""}
          </p>
          {data.input_warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

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
                ) +
                (data.sanctions_checks?.[0]?.match_count ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis — pending state while async generation runs */}
      {!data.ai_analysis && (
        <Card className="border-info/30 bg-gradient-to-br from-info/5 to-transparent">
          <CardContent className="p-4 flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-info animate-pulse shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">AI Risk Assessment is generating…</p>
              <p className="text-xs text-muted-foreground">
                Claude is analyzing the validation data. This page will update automatically — usually within 30 seconds.
              </p>
            </div>
            <div className="h-1.5 w-1.5 rounded-full bg-info animate-pulse" />
          </CardContent>
        </Card>
      )}
      {data.ai_analysis ? (
        <AIMemo
          rawAnalysis={data.ai_analysis}
          onJumpToFactor={(key) => {
            // Anchor-scroll to the WhyThisRating panel — the "Why this rating?"
            // link from a Story Mode risk row jumps the credit analyst to the
            // deterministic factor that drives the tier.
            const el = document.getElementById(`risk-factor-${key}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      ) : null}

      {/* Why this rating? — deterministic factor list with inline overrides */}
      <WhyThisRating
        tier={data.tier}
        riskFactors={data.risk_factors ?? []}
        borrowerId={data.primary_borrower_id}
        onSignalApplied={handleSignalApplied}
      />

      {/*
        Pillar evidence — sits between the analytical layer (AI memo +
        WhyThisRating) and the operational layer (Handoff + Monitor) so the
        natural read order is: summary → synthesis → override → evidence →
        action. Track Record + Verified Track Record live as a pair —
        Realie auto-discovers current holdings via owner-name search, and
        VerifiedTrackRecord shows the deed-verified flips (auto-populated
        from intake doc per G1.1, top-up via paste).
      */}

      {/* Entity Checks */}
      {data.entity_checks.map((ec) => (
        <EntityResultCard
          key={ec.id}
          data={ec}
          borrowerName={data.borrower_name}
          guarantorName={data.guarantor_name}
        />
      ))}

      {/* Track Record — auto-discovered current holdings */}
      {data.track_record.length > 0 && (
        <TrackRecordTable data={data.track_record} />
      )}

      {/* Verified Track Record — deed-verified flips (intake or top-up) */}
      <VerifiedTrackRecord
        validationId={data.id}
        initial={data.verified_flips ?? []}
        onUpdate={(flips) => setData({ ...data, verified_flips: flips })}
      />

      {/* Litigation */}
      {(data.litigation_cases?.length ?? 0) > 0 || data.litigation_checks.length > 0 ? (
        <LitigationCases
          cases={data.litigation_cases ?? []}
          legacyChecks={data.litigation_checks}
        />
      ) : null}

      {/* Sanctions / PEP */}
      {data.sanctions_checks?.[0] && (
        <SanctionsCard data={data.sanctions_checks[0]} />
      )}

      {/* GC Validation */}
      {data.gc_validations.map((gc) => (
        <GCResultCard key={gc.id} data={gc} />
      ))}

      {/* Operational layer — produce artifacts + watch for changes */}

      {/* Investor handoff — Excel + PDF export */}
      <HandoffCard validationId={data.id} initial={data.handoff_data} />

      {/* Continuous monitoring */}
      <MonitorCard validationId={data.id} />
    </div>
  );
}
