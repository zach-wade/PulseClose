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
  validationId?: string;
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

export function WhyThisRating({ tier, riskFactors, borrowerId, validationId, onSignalApplied }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideForFactor, setOverrideForFactor] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  async function applyFactorOverride(factorKey: string) {
    const reason = overrideReason.trim();
    if (!reason) {
      setError("Provide a reason — this becomes part of the audit trail.");
      return;
    }
    if (!validationId) {
      setError("Cannot override: missing validation_id.");
      return;
    }
    setPendingKey(`factor_override:${factorKey}`);
    setError(null);
    try {
      const res = await fetch("/api/factor-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validation_id: validationId,
          factor_key: factorKey,
          exclusion_reason: reason,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setOverrideForFactor(null);
      setOverrideReason("");
      await onSignalApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingKey(null);
    }
  }

  async function removeFactorOverride(factorKey: string) {
    if (!validationId) return;
    setPendingKey(`factor_override_remove:${factorKey}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/factor-overrides?validation_id=${validationId}&factor_key=${factorKey}`,
        { method: "DELETE" },
      );
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
                id={`risk-factor-${f.factor_key}`}
                className={`rounded-md border p-3 space-y-2 scroll-mt-20 ${
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
                  {/* Universal override button — any active factor can be
                      excluded with a reason. Excluded-via-lender factors
                      get a "Remove override" affordance. */}
                  {validationId && f.severity !== "none" && (
                    <div className="shrink-0">
                      {f.excluded && f.exclusion_reason?.startsWith("Lender override:") ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pendingKey === `factor_override_remove:${f.factor_key}`}
                          onClick={() => removeFactorOverride(f.factor_key)}
                        >
                          {pendingKey === `factor_override_remove:${f.factor_key}` ? "…" : "Remove override"}
                        </Button>
                      ) : !f.excluded && overrideForFactor !== f.factor_key ? (
                        // Hide the trigger when the form is open below
                        // (cleaner than disabling — the form is the active
                        // surface, the trigger is now redundant).
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOverrideForFactor(f.factor_key);
                            setOverrideReason("");
                            setError(null);
                          }}
                        >
                          Override
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
                {/* Inline reason form for the active override target. */}
                {overrideForFactor === f.factor_key && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <p className="text-xs text-amber-900">
                      Excluding this factor from the tier computation. Reason
                      becomes part of the audit trail and renders on the
                      handoff PDF.
                    </p>
                    <textarea
                      className="w-full text-xs rounded border border-input bg-white p-2"
                      rows={2}
                      placeholder="e.g. Reviewed the case — frivolous suit dismissed in state court 2025-11"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      maxLength={1000}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setOverrideForFactor(null);
                          setOverrideReason("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          pendingKey === `factor_override:${f.factor_key}` ||
                          !overrideReason.trim()
                        }
                        onClick={() => applyFactorOverride(f.factor_key)}
                      >
                        {pendingKey === `factor_override:${f.factor_key}`
                          ? "Saving…"
                          : "Apply override"}
                      </Button>
                    </div>
                  </div>
                )}

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
            Tier is computed deterministically from the active (non-excluded) factors above, after lender overrides have been applied. Critical → HIGH; ≥2 active moderate → MEDIUM; otherwise LOW. The AI memo narrates these factors but never sets the tier.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
