"use client";

// AI memo renderer. Handles both v1 (legacy paragraph + flags + recs) and
// v2 (Story Mode: structured strengths / risks / recommendations).
//
// Old validations stay v1 forever (no migration). New validations write v2.
// Shared header (tier badge + summary + pillar assessments) renders the
// same way in both versions; the body diverges.

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Info,
  Lightbulb,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { humanizeFactorKey } from "@/lib/risk/factors";
import { parseAiAnalysisAny } from "@/lib/schemas";

interface Props {
  rawAnalysis: unknown;
  // Optional callback so the "Why this rating?" anchor on a v2 risk row can
  // scroll the parent's WhyThisRating panel into view.
  onJumpToFactor?: (factorKey: string) => void;
  // When > 0, render a "Preliminary — N items pending review" marker on
  // the memo header. The handoff PDF surface mirrors this so capital
  // partners can see the memo hasn't been finalized by the lender yet.
  pendingReviewCount?: number;
}

export function AIMemo({ rawAnalysis, onJumpToFactor, pendingReviewCount = 0 }: Props) {
  const parsed = parseAiAnalysisAny(rawAnalysis);
  if (parsed.version === null) {
    return (
      <Card className="border-amber-300 bg-amber-50/40">
        <CardContent className="py-4 text-sm text-amber-900">
          AI memo couldn&apos;t be parsed. Try regenerating from the validation detail page.
        </CardContent>
      </Card>
    );
  }

  const isPreliminary = pendingReviewCount > 0;

  return (
    <Card className={`border-info/30 bg-gradient-to-br from-info/5 to-transparent ${isPreliminary ? "ring-1 ring-amber-300/60" : ""}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base flex-wrap">
          <Sparkles className="h-4 w-4 text-info" />
          AI Risk Assessment
          {parsed.version === 2 && (
            <Badge variant="outline" className="text-[10px] uppercase">Story mode</Badge>
          )}
          {isPreliminary && (
            <a
              href="#verify-tray"
              className="inline-flex items-center"
              title="Memo is preliminary until pending property matches are reviewed. Click to scroll to the verify tray."
            >
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px] uppercase">
                Preliminary · {pendingReviewCount} pending
              </Badge>
            </a>
          )}
          <RiskBadge rating={parsed.data.risk_rating} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed">{parsed.data.summary}</p>

        <PillarAssessments pillars={parsed.data.pillar_assessments} />

        {parsed.version === 2 ? (
          <V2Body data={parsed.data} onJumpToFactor={onJumpToFactor} />
        ) : (
          <V1Body data={parsed.data} />
        )}
      </CardContent>
    </Card>
  );
}

function RiskBadge({ rating }: { rating: "low" | "medium" | "high" }) {
  const Icon =
    rating === "low" ? TrendingDown : rating === "high" ? TrendingUp : Minus;
  return (
    <Badge
      variant={rating === "low" ? "default" : rating === "high" ? "destructive" : "secondary"}
      className="ml-2"
    >
      <Icon className="mr-1 h-3 w-3" />
      {rating.toUpperCase()} RISK
    </Badge>
  );
}

function PillarAssessments({
  pillars,
}: {
  pillars: {
    entity: string;
    track_record: string;
    litigation: string;
    gc: string | null;
    sanctions: string | null;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Pillar label="Entity" body={pillars.entity} />
      <Pillar label="Track Record" body={pillars.track_record} />
      <Pillar label="Litigation" body={pillars.litigation} />
      {pillars.gc && <Pillar label="GC" body={pillars.gc} />}
      {pillars.sanctions && <Pillar label="Sanctions / PEP" body={pillars.sanctions} />}
    </div>
  );
}

function Pillar({ label, body }: { label: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm">{body}</p>
    </div>
  );
}

// ── v1 body (legacy) ───────────────────────────────────────────────────────

function V1Body({
  data,
}: {
  data: { flags: string[]; recommendations: string[] };
}) {
  return (
    <>
      {data.flags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Flags
          </p>
          {data.flags.map((flag, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-sm text-amber-600"
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {flag}
            </div>
          ))}
        </div>
      )}

      {data.recommendations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recommendations
          </p>
          {data.recommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-info" />
              {rec}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── v2 body (Story Mode) ───────────────────────────────────────────────────

function V2Body({
  data,
  onJumpToFactor,
}: {
  data: {
    strengths: { title: string; narrative: string }[];
    risks: { factor_key: string; severity: "critical" | "moderate" | "minor" | "informational"; narrative: string }[];
    recommendations: { priority: "must" | "should" | "consider"; narrative: string }[];
  };
  onJumpToFactor?: (factorKey: string) => void;
}) {
  const [compact, setCompact] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCompact((p) => !p)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {compact ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {compact ? "Expand all" : "Compact"}
        </button>
      </div>

      {data.strengths.length > 0 && (
        <Section title="Strengths">
          {data.strengths.map((s, i) => (
            <Block key={i} compact={compact}>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{s.title}</p>
                  {!compact && <p className="text-sm text-muted-foreground">{s.narrative}</p>}
                </div>
              </div>
            </Block>
          ))}
        </Section>
      )}

      {data.risks.length > 0 && (
        <Section title="Risks">
          {data.risks.map((r, i) => {
            const Icon = r.severity === "informational" ? Info : AlertTriangle;
            return (
            <Block key={i} compact={compact} severity={r.severity}>
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${severityColor(r.severity)}`} />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{humanizeFactorKey(r.factor_key)}</p>
                    <Badge variant="outline" className={`text-[10px] uppercase ${severityBadgeColor(r.severity)}`}>
                      {r.severity}
                    </Badge>
                    {onJumpToFactor && (
                      <button
                        type="button"
                        onClick={() => onJumpToFactor(r.factor_key)}
                        className="text-[11px] text-info hover:underline"
                      >
                        Why this rating? →
                      </button>
                    )}
                  </div>
                  {!compact && <p className="text-sm text-muted-foreground">{r.narrative}</p>}
                </div>
              </div>
            </Block>
            );
          })}
        </Section>
      )}

      {data.recommendations.length > 0 && (
        <Section title="Recommendations">
          {data.recommendations.map((rec, i) => (
            <Block key={i} compact={compact}>
              <div className="flex items-start gap-2">
                <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-info" />
                <div className="space-y-0.5 flex-1">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {rec.priority === "must" && "Must"}
                    {rec.priority === "should" && "Should"}
                    {rec.priority === "consider" && "Consider"}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{rec.narrative}</p>
                </div>
              </div>
            </Block>
          ))}
        </Section>
      )}

      {data.strengths.length === 0 && data.risks.length === 0 && data.recommendations.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No structured findings. The deterministic risk factors below remain the source of truth for tier.
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Block({
  children,
  compact,
  severity,
}: {
  children: React.ReactNode;
  compact: boolean;
  severity?: "critical" | "moderate" | "minor" | "informational";
}) {
  const accent =
    severity === "critical"
      ? "border-l-red-400"
      : severity === "moderate"
        ? "border-l-amber-400"
        : severity === "minor"
          ? "border-l-yellow-300"
          : severity === "informational"
            ? "border-l-sky-300"
            : "border-l-slate-200";
  return (
    <div className={`border-l-2 pl-3 ${accent} ${compact ? "py-1" : "py-1.5"}`}>
      {children}
    </div>
  );
}

function severityColor(s: "critical" | "moderate" | "minor" | "informational"): string {
  if (s === "critical") return "text-red-500";
  if (s === "moderate") return "text-amber-500";
  if (s === "minor") return "text-yellow-500";
  return "text-sky-500";
}

function severityBadgeColor(s: "critical" | "moderate" | "minor" | "informational"): string {
  if (s === "critical") return "border-red-300 text-red-700";
  if (s === "moderate") return "border-amber-300 text-amber-700";
  if (s === "minor") return "border-yellow-300 text-yellow-700";
  return "border-sky-300 text-sky-700";
}
