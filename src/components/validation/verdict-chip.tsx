// Compact verdict chip for list rows (UX-REDESIGN §11.4) — the same three
// states as the detail hero, driven by the same computeVerdict(), so a row and
// its detail page never disagree. Color + icon + shape (never color alone).

import type { VerdictState, RiskTier } from "@/lib/validation/verdict";
import { VERDICT_TOKENS } from "./status";
import { DeltaChip, deltaFromTiers } from "./delta-chip";
import { cn } from "@/lib/utils";

const LABEL: Record<VerdictState, string> = {
  verified: "Verified",
  needs_review: "Needs review",
  flagged: "Flagged",
};

export interface VerdictChipData {
  state: VerdictState;
  tier?: RiskTier | null;
  prior_tier?: RiskTier | null;
  issueCount?: number;
}

export function VerdictChip({
  verdict,
  showDelta = false,
  className,
}: {
  verdict: VerdictChipData | null | undefined;
  showDelta?: boolean;
  className?: string;
}) {
  if (!verdict) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const token = VERDICT_TOKENS[verdict.state];
  const Icon = token.icon;
  const count = verdict.issueCount ?? 0;
  const label =
    verdict.state === "flagged" && count > 0 ? `Flagged · ${count}` : LABEL[verdict.state];
  const delta = showDelta ? deltaFromTiers(verdict.prior_tier, verdict.tier) : null;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
          token.bg,
          token.border,
          token.fg,
        )}
      >
        <Icon className="h-3 w-3" strokeWidth={2.5} />
        {label}
      </span>
      {delta && delta.direction !== "first" ? <DeltaChip delta={delta} /> : null}
    </span>
  );
}
