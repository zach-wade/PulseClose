// Delta chip — anchors the verdict in time (UX-REDESIGN §11.2 principle 9).
// We have override-and-rerun + monitoring, so a verdict can move between runs;
// "▲ from MEDIUM last run" / "▼ from LOW" / "first run" tells the reader whether
// this is new, improving, or deteriorating.

import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Delta {
  /** "up" = improved (e.g. MEDIUM→LOW), "down" = worsened, "flat" = unchanged. */
  direction: "up" | "down" | "flat" | "first";
  label: string;
}

export function DeltaChip({ delta }: { delta: Delta }) {
  if (delta.direction === "first") {
    return (
      <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
        {delta.label}
      </span>
    );
  }
  const up = delta.direction === "up";
  const flat = delta.direction === "flat";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11.5px] font-medium",
        flat && "border-border text-muted-foreground",
        up && "border-emerald-200 text-emerald-700",
        delta.direction === "down" && "border-red-200 text-red-700",
      )}
    >
      {!flat && <Icon className="h-3 w-3" />}
      {delta.label}
    </span>
  );
}

// Derive a delta from two risk tiers (prior → current). LOW < MEDIUM < HIGH;
// a drop in tier is an IMPROVEMENT. Returns "first run" when there's no prior.
const TIER_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function deltaFromTiers(
  prior: "LOW" | "MEDIUM" | "HIGH" | null | undefined,
  current: "LOW" | "MEDIUM" | "HIGH" | null | undefined,
): Delta {
  if (!prior || !current) return { direction: "first", label: "first run" };
  const p = TIER_ORDER[prior];
  const c = TIER_ORDER[current];
  if (p === c) return { direction: "flat", label: "no change" };
  // current tier is BETTER (lower number) than prior ⇒ improvement (up arrow).
  if (c < p) return { direction: "up", label: `from ${prior} last run` };
  return { direction: "down", label: `from ${prior} last run` };
}
