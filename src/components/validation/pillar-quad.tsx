// Per-pillar status quad (UX-REDESIGN §11.2 principle 6): status + label +
// sub-label + plain message for each of the 5 checks, in one row. Concrete
// state only ("CA · Cobalt 429", "1 active case"), never adjectives ("minor").
// Each card drills to source evidence via the side drawer.

"use client";

import type { Pillar } from "@/lib/validation/verdict";
import { PILLAR_TOKENS, StatusBadge } from "./status";

function actionLabel(status: Pillar["status"]): string | null {
  switch (status) {
    // No single-check re-run endpoint exists yet — the link drills to the
    // check's evidence card (honest navigation), not a fake re-run action.
    case "incomplete":
      return "View status →";
    case "flagged":
      return "Review →";
    case "verified":
      return "View evidence →";
    case "not_applicable":
      return null;
  }
}

export function PillarQuad({
  pillars,
  onSelect,
}: {
  pillars: Pillar[];
  onSelect?: (key: Pillar["key"]) => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {pillars.map((p) => {
        const token = PILLAR_TOKENS[p.status];
        const label = actionLabel(p.status);
        const clickable = Boolean(onSelect) && p.status !== "not_applicable";
        return (
          <div key={p.key} className="rounded-lg border border-border bg-white px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <StatusBadge token={token} size="sm" />
              {p.label}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{p.message}</div>
            {p.subLabel ? (
              <div className="text-[11px] text-slate-400">{p.subLabel}</div>
            ) : null}
            {clickable && label ? (
              <button
                type="button"
                onClick={() => onSelect?.(p.key)}
                className="mt-1.5 text-[10.5px] font-medium text-info hover:underline"
              >
                {label}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
