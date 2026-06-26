"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  AlertTriangle,
  Star,
  FileDown,
  Sparkles,
  Calculator,
  Info,
  ChevronRight,
  ChevronDown,
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
import { ThirdPartyReportsCard } from "@/components/dashboard/third-party-reports-card";
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
import { VerdictHero } from "@/components/validation/verdict-hero";
import { computeVerdict, type MandateStanding, type Pillar } from "@/lib/validation/verdict";
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

interface MandateAssessment {
  result: "pass" | "conditional" | "fail";
  mandate_name: string | null;
  investor_name: string | null;
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

// Roll the per-mandate assessments up to one binding standing for the hero
// (worst across all rows; fail > conditional > pass). Returns null when the
// org has no mandates configured for this validation.
const MANDATE_RANK: Record<MandateAssessment["result"], number> = { pass: 0, conditional: 1, fail: 2 };
const TO_STANDING: Record<MandateAssessment["result"], MandateStanding> = {
  pass: "meets",
  conditional: "conditional",
  fail: "does_not_meet",
};
function bindingMandate(rows: MandateAssessment[]): { standing: MandateStanding; label: string } | null {
  if (rows.length === 0) return null;
  const worst = rows.reduce((a, b) => (MANDATE_RANK[b.result] > MANDATE_RANK[a.result] ? b : a));
  const label = [worst.mandate_name, worst.investor_name].filter(Boolean).join(" · ") || "Mandate";
  return { standing: TO_STANDING[worst.result], label };
}

export default function ValidationDetailPage() {
  const params = useParams();
  const [data, setData] = useState<ValidationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Detail-page tabs (UX-REDESIGN-PLAN §3), now nested inside the "Full report"
  // disclosure under the verdict hero (§11.3 — two-level disclosure).
  const [tab, setTab] = useState("summary");
  const [reportOpen, setReportOpen] = useState(false);
  // Binding mandate standing for the verdict hero (loaded separately; the
  // MandateAssessmentsCard inside the report carries the per-mandate drill-down).
  const [mandate, setMandate] = useState<{ standing: MandateStanding; label: string } | null>(null);

  useEffect(() => {
    // Deep-links from the evaluate handoff CTA / next-step strip open the report
    // straight to the Hand off tab.
    if (typeof window !== "undefined" && window.location.hash === "#handoff") {
      setReportOpen(true);
      setTab("handoff");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/validations/${params.id}/mandate-assessments`)
      .then((r) => (r.ok ? r.json() : { assessments: [] }))
      .then((j) => {
        if (!cancelled) setMandate(bindingMandate((j.assessments ?? []) as MandateAssessment[]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [params.id]);

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

    // Poll for the AI memo until it lands or ~3 minutes pass (30 × 6s).
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

  // After an override / edit / signal: refetch for the new tier immediately,
  // then poll ~3 min for the regenerated AI memo (fire-and-forget, 30s+).
  const handleSignalApplied = useCallback(async () => {
    const before = await refetch();
    const beforeJson = JSON.stringify(before?.ai_analysis ?? null);
    let polls = 0;
    const tick = async () => {
      polls++;
      if (polls > 30) return;
      await new Promise((r) => setTimeout(r, 6000));
      const next = await refetch();
      const nextJson = JSON.stringify(next?.ai_analysis ?? null);
      if (nextJson !== beforeJson) return;
      void tick();
    };
    void tick();
  }, [refetch]);

  // Drill from a verdict pillar → the matching evidence card. Opens the report,
  // switches to the Evidence tab, and scrolls to the pillar's section.
  const openEvidence = useCallback((pillar?: Pillar["key"]) => {
    setReportOpen(true);
    setTab("evidence");
    if (pillar) {
      setTimeout(() => {
        document.getElementById(`pillar-${pillar}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  }, []);

  const verdict = useMemo(() => {
    if (!data) return null;
    return computeVerdict({
      entity_checks: data.entity_checks,
      track_record: data.track_record,
      verified_flips: data.verified_flips,
      litigation_checks: data.litigation_checks,
      gc_validations: data.gc_validations,
      sanctions_checks: data.sanctions_checks,
      tier: data.tier,
      mandate: mandate?.standing ?? null,
    });
  }, [data, mandate]);

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
        <Skeleton className="h-44 w-full rounded-xl" />
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

  const completedProjects = data.track_record.filter((t) => t.outcome === "completed");
  const litigationConfidence = (l: LitigationCheck) =>
    ((l as unknown as { raw_response?: { _disambiguation?: { confidence?: string } } })
      .raw_response?._disambiguation?.confidence) ?? "possible";
  const flaggedLitigation = data.litigation_checks.filter(
    (l) => l.result === "found" && litigationConfidence(l) === "confirmed",
  );
  const confirmedSanctions = (data.sanctions_checks?.[0]?.matches ?? []).filter(
    (m) => m.confidence === "confirmed",
  ).length;

  // Pre-filled "size + route this deal" link, reused by the hero + Deal tab.
  const evaluateHref = {
    pathname: "/dashboard/evaluate",
    query: {
      borrower: data.borrower_name,
      state: data.entity_checks[0]?.state ?? "",
      experience: data.experience_tier ?? "",
      validation_id: data.id,
    },
  } as const;

  // Verdict-state-specific actions (imperative verbs; §11.2 principle 8).
  // No fake backend: the "review" actions drill into the Evidence tab, the
  // forward actions reuse the existing evaluate/handoff routes.
  const heroActions =
    verdict?.state === "verified" ? (
      <>
        <Button size="sm" render={<Link href={evaluateHref} />}>
          Evaluate against investors
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setReportOpen(true); setTab("handoff"); }}>
          Hand off
        </Button>
      </>
    ) : verdict?.state === "flagged" ? (
      <>
        <Button size="sm" onClick={() => openEvidence()}>
          Review flags
        </Button>
        <Button size="sm" variant="outline" render={<Link href={evaluateHref} />}>
          Evaluate anyway
        </Button>
      </>
    ) : (
      <>
        <Button size="sm" onClick={() => openEvidence()}>
          Review evidence
        </Button>
        <Button size="sm" variant="outline" render={<Link href={evaluateHref} />}>
          Evaluate against investors
        </Button>
      </>
    );

  return (
    <div className="space-y-6">
      {/* Header — identity + SECONDARY actions only. The verdict + the primary
          next action live in the hero below (§11.3). */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" render={<Link href="/dashboard" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{data.borrower_name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {data.borrower_entity_name}
              {data.guarantor_name && ` — Guarantor: ${data.guarantor_name}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-start sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/validations/${data.id}/risk-methodology?print=1`, "_blank")}
            title="One-page printable showing the deterministic factor decomposition, severity, and signal-override audit trail."
          >
            <FileDown className="mr-2 h-4 w-4" />
            Methodology
          </Button>
          {data.primary_borrower_id && (
            <CompareToPriorButton
              borrowerId={data.primary_borrower_id}
              currentValidationId={data.id}
              currentCreatedAt={data.created_at}
            />
          )}
          <RouteToInvestorButton validationId={data.id} />
        </div>
      </div>

      {/* Verdict hero — the answer first (§11.3). Carries the Achilles fix: a
          429'd entity lookup reads "Needs review", never "Verified". */}
      {verdict && (
        <VerdictHero
          verdict={verdict}
          mandate={mandate}
          onSelectPillar={(key) => openEvidence(key)}
          actions={heroActions}
        />
      )}

      {/* Full report — the entire prior page, demoted one disclosure level. */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setReportOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${reportOpen ? "" : "-rotate-90"}`} />
          Full report — evidence · AI memo · why this rating · methodology · monitoring
        </button>

        {reportOpen && (
          <div className="space-y-6 border-t border-border p-4">
            {/* Input warnings */}
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

            {/* Pending-review banner — memo built off un-reviewed Flow B matches. */}
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
                      We auto-discovered properties registered to a similar name but the
                      corroborating signals aren&apos;t strong enough to auto-add. Confirm or
                      reject in the verify tray below — the memo + tier will regenerate from
                      your final set.
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

            {/* Demo-data banner — only when stub data was actually used. */}
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
                    Some check results use simulated data. Real vendor APIs will replace stub
                    data as they are connected.
                  </p>
                </div>
              );
            })()}

            {/* Summary stat cards */}
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
                        <p>
                          <span className="font-semibold text-emerald-300">+</span> Entity SOS active
                          (+15) · 10+ properties (+20) / 5+ (+15) / 1+ (+10) · No active federal
                          litigation (+10) · GC license active or N/A (+5) · Sanctions clear (+5)
                        </p>
                        <p>
                          <span className="font-semibold text-red-300">−</span> Entity
                          suspended/dissolved (−20) · Active litigation (−15) · Sanctions hit (−30)
                        </p>
                        <p className="opacity-70">
                          Higher = more verified data + cleaner flags. This is not a model
                          prediction.
                        </p>
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
                      data.entity_checks.reduce((n, e) => n + e.flags.length, 0) +
                      confirmedSanctions}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Capital-provider mandate stamps — full per-mandate drill-down. */}
            <MandateAssessmentsCard validationId={data.id} />

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="deal">Deal</TabsTrigger>
                <TabsTrigger value="handoff">Hand off</TabsTrigger>
                <TabsTrigger value="book">Portfolio</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-6 pt-4">
                {!data.ai_analysis && (
                  <Card className="border-info/30 bg-gradient-to-br from-info/5 to-transparent">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Sparkles className="h-4 w-4 text-info animate-pulse shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">AI Risk Assessment is generating…</p>
                        <p className="text-xs text-muted-foreground">
                          Claude is analyzing the validation data. This page will update
                          automatically — usually within 30 seconds.
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
                      const el = document.getElementById(`risk-factor-${key}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  />
                ) : null}

                <WhyThisRating
                  tier={data.tier}
                  riskFactors={data.risk_factors ?? []}
                  borrowerId={data.primary_borrower_id}
                  validationId={data.id}
                  onSignalApplied={handleSignalApplied}
                />
              </TabsContent>

              <TabsContent value="evidence" className="space-y-6 pt-4">
                {/* Entity */}
                <div id="pillar-entity" className="scroll-mt-24 space-y-6">
                  {data.entity_checks.map((ec) => (
                    <EntityResultCard
                      key={ec.id}
                      data={ec}
                      borrowerName={data.borrower_name}
                      guarantorName={data.guarantor_name}
                    />
                  ))}
                </div>

                {/* Track record */}
                <div id="pillar-track" className="scroll-mt-24 space-y-6">
                  <UnifiedPropertyTable
                    trackRecord={data.track_record.filter(
                      (r) => r.review_status !== "pending_review" && r.review_status !== "rejected",
                    )}
                    verifiedFlips={data.verified_flips ?? []}
                    validationId={data.id}
                    onUpdated={handleSignalApplied}
                  />
                  <VerifyTray
                    pendingRows={data.track_record.filter((r) => r.review_status === "pending_review")}
                    onReviewed={handleSignalApplied}
                  />
                  <BorrowerUploadsCard validationId={data.id} />
                  <VerifiedTrackRecord
                    validationId={data.id}
                    initial={data.verified_flips ?? []}
                    onUpdate={(flips) => setData({ ...data, verified_flips: flips })}
                  />
                </div>

                {/* Litigation */}
                <div id="pillar-litigation" className="scroll-mt-24">
                  <LitigationCases
                    cases={data.litigation_cases ?? []}
                    legacyChecks={data.litigation_checks}
                    validationId={data.id}
                    onUpdated={handleSignalApplied}
                  />
                </div>

                {/* Sanctions */}
                <div id="pillar-sanctions" className="scroll-mt-24">
                  {data.sanctions_checks?.[0] && <SanctionsCard data={data.sanctions_checks[0]} />}
                </div>

                <ThirdPartyReportsCard />

                {/* GC */}
                <div id="pillar-gc" className="scroll-mt-24">
                  {data.gc_validations.length === 0 ? (
                    <AddGCCard
                      validationId={data.id}
                      defaultState={data.entity_checks?.[0]?.state ?? null}
                      onAdded={handleSignalApplied}
                    />
                  ) : (
                    data.gc_validations.map((gc) => <GCResultCard key={gc.id} data={gc} />)
                  )}
                </div>
              </TabsContent>

              <TabsContent value="deal" className="space-y-6 pt-4">
                <Card className="border-info/30 bg-info/5">
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Size + route this loan</p>
                      <p className="text-sm text-muted-foreground">
                        Run this borrower through the Deal analyzer — eligibility across your
                        investors, then sizing + AI judgment.
                      </p>
                    </div>
                    <Button render={<Link href={evaluateHref} />}>
                      <Calculator className="mr-2 h-4 w-4" />
                      Size this deal
                    </Button>
                  </CardContent>
                </Card>
                <BorrowerEvaluationsCard validationId={data.id} borrowerId={data.primary_borrower_id} />
              </TabsContent>

              <TabsContent value="handoff" className="space-y-6 pt-4">
                <div id="handoff" className="scroll-mt-24">
                  <HandoffCard validationId={data.id} initial={data.handoff_data} />
                </div>
                <Card className="border-info/30 bg-info/5">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-medium">What&apos;s next</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <RouteToInvestorButton validationId={data.id} />
                      <Button variant="outline" size="sm" onClick={() => setTab("book")}>
                        Watch it in Portfolio
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setTab("book")}>
                        Record the outcome
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Route the packet to a capital partner&apos;s queue, then track funding +
                      outcomes from Portfolio so the deal&apos;s result flows back into the
                      borrower&apos;s record.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="book" className="space-y-6 pt-4">
                {data.primary_borrower_id && (
                  <BorrowerHistoryCard borrowerId={data.primary_borrower_id} currentValidationId={data.id} />
                )}
                <MonitorCard
                  validationId={data.id}
                  borrowerId={data.primary_borrower_id}
                  borrowerName={data.borrower_name}
                  orgMonitorPausedUntil={data.org_monitor_paused_until}
                />
                <DealOutcomeCard validationId={data.id} initial={data.deal_outcome} />
                <ActivityStrip validationId={data.id} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
