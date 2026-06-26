// Status tokens — color + ICON + SHAPE, never color alone (UX-REDESIGN §11.2
// principle 5; ~1 in 12 men are colorblind). The verdict and the per-pillar
// quad both read from here so a "needs review" looks the same everywhere.
//
// Shape is load-bearing: a triangle (needs-review) reads differently from a
// circle (verified/flagged) even in grayscale.

import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from "lucide-react";
import type { PillarStatus, VerdictState } from "@/lib/validation/verdict";

export interface StatusToken {
  icon: typeof CheckCircle2;
  /** icon + accent text color */
  fg: string;
  /** hero / chip background */
  bg: string;
  /** hero / chip border */
  border: string;
  /** solid badge fill (the small circular pill in the quad) */
  fill: string;
}

export const VERDICT_TOKENS: Record<VerdictState, StatusToken> = {
  verified: {
    icon: CheckCircle2,
    fg: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    fill: "bg-emerald-600",
  },
  needs_review: {
    icon: AlertTriangle,
    fg: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    fill: "bg-amber-600",
  },
  flagged: {
    icon: XCircle,
    fg: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    fill: "bg-red-600",
  },
};

export const PILLAR_TOKENS: Record<PillarStatus, StatusToken> = {
  verified: VERDICT_TOKENS.verified,
  incomplete: VERDICT_TOKENS.needs_review,
  flagged: VERDICT_TOKENS.flagged,
  not_applicable: {
    icon: MinusCircle,
    fg: "text-slate-400",
    bg: "bg-slate-50",
    border: "border-slate-200",
    fill: "bg-slate-400",
  },
};

/** The big circular badge used in the verdict hero + pillar quad. */
export function StatusBadge({
  token,
  size = "md",
}: {
  token: StatusToken;
  size?: "sm" | "md";
}) {
  const Icon = token.icon;
  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const px = size === "sm" ? "text-[10px]" : "text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${token.fill} ${dim} ${px}`}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={3} />
    </span>
  );
}
