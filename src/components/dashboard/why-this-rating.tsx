"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertTriangle,
  Info,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Minus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type Severity = "critical" | "moderate" | "minor" | "informational" | "none";
type Tier = "HIGH" | "MEDIUM" | "LOW";

interface RiskFactor {
  id?: string;
  factor_key: string;
  severity: Severity;
  excluded: boolean;
  exclusion_reason: string | null;
  contributing_data: Record<string, unknown>;
  explanation: string;
}

interface ExtendedHoldProperty {
  property_id: string | null;
  property_address: string;
  hold_months: number | null;
  excluded: boolean;
  exclusion_reason: string | null;
}

interface Props {
  tier: Tier;
  riskFactors: RiskFactor[];
  borrowerId: string | null;
  onSignalApplied: () => void | Promise<void>;
}

const FACTOR_LABELS: Record<string, string> = {
  entity_status: "Entity status",
  active_fed_litigation: "Active federal litigation",
  dismissed_litigation: "Dismissed/terminated litigation",
  sanctions_hit: "Sanctions / PEP screen",
  gc_license_issue: "GC license issue",
  extended_hold: "Extended hold period",
  lender_concentration: "Lender concentration",
  foreclosure_distress: "Foreclosure / distress",
};

function severityBadge(severity: Severity, excluded: boolean) {
  if (excluded) {
    return (
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/40">
        Excluded
      </Badge>
    );
  }
  switch (severity) {
    case "critical":
      return <Badge variant="destructive">Critical</Badge>;
    case "moderate":
      return <Badge className="bg-amber-500/90 hover:bg-amber-500 text-white">Moderate</Badge>;
    case "minor":
      return <Badge variant="secondary">Minor</Badge>;
    case "informational":
      return <Badge variant="outline">Informational</Badge>;
    default:
      return null;
  }
}

function TierBadge({ tier }: { tier: Tier }) {
  const Icon = tier === "HIGH" ? TrendingUp : tier === "MEDIUM" ? Minus : TrendingDown;
  const variant: "default" | "secondary" | "destructive" =
    tier === "HIGH" ? "destructive" : tier === "MEDIUM" ? "secondary" : "default";
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {tier} risk
    </Badge>
  );
}

export function WhyThisRating({ tier, riskFactors, borrowerId, onSignalApplied }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyPrimaryResidenceOverride(propertyId: string, address: string) {
    if (!borrowerId) {
      setError("Cannot apply override: this validation has no resolved borrower.");
      return;
    }
    const overrideKey = `primary_residence:${propertyId}`;
    setPendingKey(overrideKey);
    setError(null);
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "borrower_property",
          borrower_id: borrowerId,
          property_id: propertyId,
          signal_key: "is_primary_residence",
          signal_value: true,
          reason: `Marked ${address} as primary residence via Why-this-rating panel`,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      await onSignalApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingKey(null);
    }
  }

  // Sort: active critical → active moderate → active minor → informational → excluded.
  const order: Record<Severity, number> = {
    critical: 0,
    moderate: 1,
    minor: 2,
    informational: 3,
    none: 4,
  };
  const sorted = [...riskFactors].sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return order[a.severity] - order[b.severity];
  });

  const activeFactors = sorted.filter((f) => !f.excluded && f.severity !== "none");
  const headlineCount = activeFactors.length;

  return (
    <Card className="border-info/30">
      <CardHeader>
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <ShieldAlert className="h-4 w-4 text-info" />
            Why this rating?
            <TierBadge tier={tier} />
            <span className="text-xs font-normal text-muted-foreground ml-2">
              {headlineCount === 0
                ? "no active factors"
                : `${headlineCount} active factor${headlineCount === 1 ? "" : "s"}`}
            </span>
          </CardTitle>
          <Sparkles className="h-4 w-4 text-info" />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No risk factors flagged. Tier defaults to LOW.
            </p>
          )}
          {sorted.map((f, i) => {
            const label = FACTOR_LABELS[f.factor_key] ?? f.factor_key.replace(/_/g, " ");
            const isExtendedHold = f.factor_key === "extended_hold";
            const properties = isExtendedHold
              ? ((f.contributing_data?.properties as ExtendedHoldProperty[] | undefined) ?? [])
              : [];

            return (
              <div
                key={f.id ?? `${f.factor_key}-${i}`}
                className={`rounded-md border p-3 space-y-2 ${
                  f.excluded ? "border-muted-foreground/20 opacity-70" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{label}</span>
                      {severityBadge(f.severity, f.excluded)}
                    </div>
                    <p className="text-sm text-muted-foreground">{f.explanation}</p>
                    {f.excluded && f.exclusion_reason && (
                      <p className="text-xs text-muted-foreground italic flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                        {f.exclusion_reason}
                      </p>
                    )}
                  </div>
                </div>

                {/* Inline overrides for extended_hold: per-property "Mark as primary residence" */}
                {isExtendedHold && properties.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Affected properties
                    </p>
                    {properties.map((p) => {
                      const overrideKey = p.property_id ? `primary_residence:${p.property_id}` : null;
                      const isPending = overrideKey !== null && pendingKey === overrideKey;
                      return (
                        <div
                          key={p.property_id ?? p.property_address}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="truncate block">{p.property_address}</span>
                            <span className="text-xs text-muted-foreground">
                              {p.hold_months} months
                              {p.excluded && p.exclusion_reason
                                ? ` — excluded (${p.exclusion_reason.replace(/_/g, " ")})`
                                : ""}
                            </span>
                          </div>
                          {!p.excluded && p.property_id && borrowerId && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() =>
                                applyPrimaryResidenceOverride(p.property_id!, p.property_address)
                              }
                            >
                              {isPending ? "Applying…" : "Mark as primary residence"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground italic pt-1">
            Tier is computed deterministically from the factor list above. Critical → HIGH; ≥2 active moderate → MEDIUM; otherwise LOW. The AI memo narrates these factors but never sets the tier.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
