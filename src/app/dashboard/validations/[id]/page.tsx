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
  Info,
  ChevronRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EntityResultCard } from "@/components/dashboard/entity-result-card";
import { UnifiedPropertyTable } from "@/components/dashboard/unified-property-table";
import { VerifyTray } from "@/components/dashboard/verify-tray";
import { LitigationCases, type LitigationCaseRow } from "@/components/dashboard/litigation-cards";
import { GCResultCard } from "@/components/dashboard/gc-result-card";
import { AddGCCard } from "@/components/dashboard/add-gc-card";
import { SanctionsCard } from "@/components/dashboard/sanctions-card";
import { VerifiedTrackRecord } from "@/components/dashboard/verified-track-record";
import { WhyThisRating } from "@/components/dashboard/why-this-rating";
import { HandoffCard } from "@/components/dashboard/handoff-card";
import { MonitorCard } from "@/components/dashboard/monitor-card";
import { DealOutcomeCard, type DealOutcome } from "@/components/dashboard/deal-outcome-card";
import { AIMemo } from "@/components/dashboard/ai-memo";
import { ActivityStrip } from "@/components/dashboard/activity-strip";
import { BorrowerHistoryCard } from "@/components/dashboard/borrower-history-card";
import { BorrowerEvaluationsCard } from "@/components/dashboard/borrower-evaluations-card";
import { MandateAssessmentsCard } from "@/components/dashboard/mandate-assessments-card";
import { CompareToPriorButton } from "@/components/dashboard/compare-to-prior-button";
import { RouteToInvestorButton } from "@/components/dashboard/route-to-investor-button";
import { BorrowerUploadsCard } from "@/components/dashboard/borrower-uploads-card";
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
    chosen_investor_id?: string | null;
  } | null;
  deal_outcome: DealOutcome | null;
  org_monitor_paused_until: string | null;
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

// Derive a live status from the current tier so the badge reflects
// post-override state, not the frozen overall_status that was set at
// validation creation. Overrides that drop tier from HIGH→LOW now show
// up as Flagged→Verified instead of stuck-at-Flagged.
function statusFromTier(
  tier: "HIGH" | "MEDIUM" | "LOW" | null | undefined,
  overallStatus: string,
): string {
  if (overallStatus === "pending") return "pending";
  if (tier === "HIGH") return "flagged";
  if (tier === "MEDIUM") return "partial";
  if (tier === "LOW") return "verified";
  return overallStatus;
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
  // Detail-page tabs (UX-REDESIGN-PLAN §3). Deep-links to #handoff (from the
  // evaluate handoff CTA + the next-step strip) open the Hand off tab.
  const [tab, setTab] = useState("summary");
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#handoff") setTab("handoff");
  }, []);

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

  // After an override / edit / signal is applied: refetch immediately
  // to pick up the new risk_factors + tier (synchronous via the
  // recompute RPC), then start a polling loop for ~3 minutes looking
  // for the AI memo to update. Memo regen is fire-and-forget and takes
  // 30s+; without this the page sees the new tier but a stale memo
  // until manual refresh.
  const handleSignalApplied = useCallback(async () => {
    const before = await refetch();
    const beforeJson = JSON.stringify(before?.ai_analysis ?? null);
    let polls = 0;
    const tick = async () => {
      polls++;
      if (polls > 30) return; // ~3 min @ 6s
      await new Promise((r) => setTimeout(r, 6000));
      const next = await refetch();
      const nextJson = JSON.stringify(next?.ai_analysis ?? null);
      if (nextJson !== beforeJson) return; // memo actually updated, done
      void tick();
    };
    void tick();
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
              <StatusBadge status={statusFromTier(data.tier, data.overall_status)} />
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {data.borrower_entity_name}
              {data.guarantor_name && ` — Guarantor: ${data.guarantor_name}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-start sm:justify-end">
          <Button
            render={
              <Link
                href={{
                  pathname: "/dashboard/evaluate",
                  query: {
                    borrower: data.borrower_name,
                    state: data.entity_checks[0]?.state ?? "",
                    experience: data.experience_tier ?? "",
                    validation_id: data.id,
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
            onClick={() => window.open(`/validations/${data.id}/risk-methodology?print=1`, "_blank")}
            title="One-page printable showing the deterministic factor decomposition, severity, and signal-override audit trail. Opens the system print dialog directly — choose 'Save as PDF' as the destination."
          >
            <FileDown className="mr-2 h-4 w-4" />
            Download risk methodology
          </Button>
          {/* B6 — Compare-to-prior CTA. Auto-hides if no prior validation exists. */}
          {data.primary_borrower_id && (
            <CompareToPriorButton
              borrowerId={data.primary_borrower_id}
              currentValidationId={data.id}
              currentCreatedAt={data.created_at}
            />
          )}
          {/* F3 — route this validation to an investor's queue. */}
          <RouteToInvestorButton validationId={data.id} />
        </div>
      </div>

      {/* Next-step progress strip — orient the lender in the
          validate → evaluate → hand off arc so the single next action is
          obvious without scrolling the full report (UX-PLAN §1.2). */}
      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Validate
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="flex items-center gap-1.5 font-medium text-info">
            <Calculator className="h-4 w-4" /> Evaluate
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <button
            type="button"
            onClick={() => setTab("handoff")}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileDown className="h-4 w-4" /> Hand off
          </button>
        </div>
        <Button
          size="sm"
          render={
            <Link
              href={{
                pathname: "/dashboard/evaluate",
                query: {
                  borrower: data.borrower_name,
                  state: data.entity_checks[0]?.state ?? "",
                  experience: data.experience_tier ?? "",
                  validation_id: data.id,
                },
              }}
            />
          }
        >
          Next: Evaluate against investors
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
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

      {/* Review-status banner — surfaces when the AI memo is rendering
          off of data that still has un-reviewed Flow B matches. Soft
          gate: the memo + tier still render, but the lender (and a
          handoff PDF reader) sees that some property matches are
          pending lender confirmation, and a one-click jump to the
          verify tray. */}
      {(() => {
        const pendingCount = data.track_record.filter(
          (r) => r.review_status === "pending_review",
        ).length;
        if (pendingCount === 0) return null;
        return (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                Memo is preliminary — {pendingCount} property match
                {pendingCount === 1 ? "" : "es"} pending review.
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                We auto-discovered properties registered to a similar name but
                the corroborating signals aren&apos;t strong enough to auto-add.
                Confirm or reject in the verify tray below — the memo + tier
                will regenerate from your final set.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab("evidence")}
              className="shrink-0 text-xs font-medium text-amber-900 hover:text-amber-700 underline"
            >
              Review now →
            </button>
          </div>
        );
      })()}

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
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="text-sm text-muted-foreground inline-flex items-center gap-1 cursor-help">
                    Completeness
                    <Info className="h-3 w-3 opacity-60" />
                  </span>
                }
              />
              <TooltipContent side="bottom" className="max-w-sm">
                <div className="space-y-1.5 text-left">
                  <p className="font-semibold">How this is computed</p>
                  <p>Composite signal score, base 50, clamped 10–100.</p>
                  <p><span className="font-semibold text-emerald-300">+</span> Entity SOS active (+15) · 10+ properties (+20) / 5+ (+15) / 1+ (+10) · No active federal litigation (+10) · GC license active or N/A (+5) · Sanctions clear (+5)</p>
                  <p><span className="font-semibold text-red-300">−</span> Entity suspended/dissolved (−20) · Active litigation (−15) · Sanctions hit (−30)</p>
                  <p className="opacity-70">Higher = more verified data + cleaner flags. This is not a model prediction.</p>
                </div>
              </TooltipContent>
            </Tooltip>
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

      {/* Promoted: capital-provider mandate stamps — the downstream-adopter's
          headline outcome, lifted out of the old 11th-of-13 scroll position
          to sit directly under the summary (UX-REDESIGN-PLAN §3). */}
      <MandateAssessmentsCard validationId={data.id} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="deal">Deal</TabsTrigger>
          <TabsTrigger value="handoff">Hand off</TabsTrigger>
          <TabsTrigger value="book">Book</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6 pt-4">

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
          pendingReviewCount={data.track_record.filter((r) => r.review_status === "pending_review").length}
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
        validationId={data.id}
        onSignalApplied={handleSignalApplied}
      />
        </TabsContent>

        <TabsContent value="evidence" className="space-y-6 pt-4">

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

      {/* Unified Property Track Record (Phase 1) — merges auto-discovered
          (Realie/Regrid/Attom), borrower-claimed (verified_flips), and
          manual rows into one card with provenance badges. Replaces the
          old paired TrackRecordTable + VerifiedTrackRecord-rows display.
          Pending-review rows (Flow B hits below auto-promote threshold)
          render below in <VerifyTray> instead of polluting the headline. */}
      <UnifiedPropertyTable
        trackRecord={data.track_record.filter(
          (r) => r.review_status !== "pending_review" && r.review_status !== "rejected",
        )}
        verifiedFlips={data.verified_flips ?? []}
        validationId={data.id}
        onUpdated={handleSignalApplied}
      />

      {/* Flow B's "we also found these, are they actually theirs?" tray.
          Auto-hides when empty. */}
      <VerifyTray
        pendingRows={data.track_record.filter((r) => r.review_status === "pending_review")}
        onReviewed={handleSignalApplied}
      />

      {/* Borrower-uploaded artifacts (photos + bank statements) — auto-
          hides when neither table has rows for this validation. */}
      <BorrowerUploadsCard validationId={data.id} />

      {/* Borrower address verification — workflow surface only (share
          link, send-to-borrower, paste form). Property rows that this
          flow surfaces now appear in the unified table above with a
          "Verified" or "Claimed only" badge. */}
      <VerifiedTrackRecord
        validationId={data.id}
        initial={data.verified_flips ?? []}
        onUpdate={(flips) => setData({ ...data, verified_flips: flips })}
      />

      {/* Litigation — render even when empty so the lender can add a
          case the vendor missed (state court, county lien, etc.) */}
      <LitigationCases
        cases={data.litigation_cases ?? []}
        legacyChecks={data.litigation_checks}
        validationId={data.id}
        onUpdated={handleSignalApplied}
      />

      {/* Sanctions / PEP */}
      {data.sanctions_checks?.[0] && (
        <SanctionsCard data={data.sanctions_checks[0]} />
      )}

      {/* GC Validation — render existing or offer to add one */}
      {data.gc_validations.length === 0 ? (
        <AddGCCard
          validationId={data.id}
          defaultState={data.entity_checks?.[0]?.state ?? null}
          onAdded={handleSignalApplied}
        />
      ) : (
        data.gc_validations.map((gc) => (
          <GCResultCard key={gc.id} data={gc} />
        ))
      )}

        </TabsContent>

        <TabsContent value="deal" className="space-y-6 pt-4">
          {/* Borrower's recent evaluations — jump to deals already run. The
              Deal analyzer itself opens via the next-step strip / header CTA. */}
          <BorrowerEvaluationsCard validationId={data.id} borrowerId={data.primary_borrower_id} />
        </TabsContent>

        <TabsContent value="handoff" className="space-y-6 pt-4">
          {/* Investor handoff — Excel + PDF export */}
          <div id="handoff" className="scroll-mt-24">
            <HandoffCard validationId={data.id} initial={data.handoff_data} />
          </div>
          {/* What's next — keep the lender moving after they export the packet. */}
          <Card className="border-info/30 bg-info/5">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">What&apos;s next</p>
              <div className="flex flex-wrap items-center gap-2">
                <RouteToInvestorButton validationId={data.id} />
                <Button variant="outline" size="sm" onClick={() => setTab("book")}>
                  Watch it in Book
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setTab("book")}>
                  Record the outcome
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Route the packet to a capital partner&apos;s queue, then track funding + outcomes from Book so the deal&apos;s result flows back into the borrower&apos;s record.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="book" className="space-y-6 pt-4">
          {/* History with this borrower (E2) — only when prior history exists. */}
          {data.primary_borrower_id && (
            <BorrowerHistoryCard borrowerId={data.primary_borrower_id} currentValidationId={data.id} />
          )}
          {/* Continuous monitoring */}
          <MonitorCard
            validationId={data.id}
            borrowerId={data.primary_borrower_id}
            borrowerName={data.borrower_name}
            orgMonitorPausedUntil={data.org_monitor_paused_until}
          />
          {/* Deal outcome (E1) — what actually happened to this loan. */}
          <DealOutcomeCard validationId={data.id} initial={data.deal_outcome} />
          {/* Activity on this validation — borrower-side events. */}
          <ActivityStrip validationId={data.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
