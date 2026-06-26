// Verdict hero (UX-REDESIGN §11.3) — the answer-first card that leads the
// detail page (and, restyled, the deal/handoff/fund surfaces). Lays out:
//   verdict + delta · one-line reason (BLUF) · 5-pillar quad · mandate line ·
//   counterfactual · 1–2 imperative actions.
// Everything below it (the full report) is one disclosure level down.

"use client";

import type { ReactNode } from "react";
import type { Verdict, MandateStanding, Pillar } from "@/lib/validation/verdict";
import { cn } from "@/lib/utils";
import { VERDICT_TOKENS } from "./status";
import { PillarQuad } from "./pillar-quad";
import { Counterfactual } from "./counterfactual";
import { DeltaChip, type Delta } from "./delta-chip";

const MANDATE_STYLE: Record<MandateStanding, { label: string; cls: string }> = {
  meets: { label: "✓ meets standard", cls: "bg-emerald-100 text-emerald-800" },
  conditional: { label: "conditional", cls: "bg-amber-100 text-amber-800" },
  does_not_meet: { label: "✗ does not meet", cls: "bg-red-100 text-red-800" },
};

export function VerdictHero({
  verdict,
  delta,
  mandate,
  onSelectPillar,
  actions,
}: {
  verdict: Verdict;
  delta?: Delta;
  /** Most-binding mandate standing + the capital provider's display name. */
  mandate?: { standing: MandateStanding; label: string } | null;
  onSelectPillar?: (key: Pillar["key"]) => void;
  /** Imperative-verb action buttons, wired by the host surface. */
  actions?: ReactNode;
}) {
  const token = VERDICT_TOKENS[verdict.state];
  const Icon = token.icon;

  return (
    <div className={cn("rounded-xl border p-4 sm:p-5", token.bg, token.border)}>
      {/* verdict + delta */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn("flex items-center gap-2.5 text-lg font-bold", token.fg)}>
          <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-white", token.fill)}>
            <Icon className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          {verdict.headline}
        </div>
        {delta ? <DeltaChip delta={delta} /> : null}
      </div>

      {/* one-line reason (BLUF) */}
      <p className="mt-2 pl-[30px] text-[13.5px] text-muted-foreground">{verdict.reason}</p>

      {/* 5-pillar quad */}
      <PillarQuad pillars={verdict.pillars} onSelect={onSelectPillar} />

      {/* mandate line */}
      {mandate ? (
        <div className="mt-3.5 text-[13px] text-muted-foreground">
          Mandate · {mandate.label}:{" "}
          <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", MANDATE_STYLE[mandate.standing].cls)}>
            {MANDATE_STYLE[mandate.standing].label}
          </span>
        </div>
      ) : null}

      {/* counterfactual */}
      <Counterfactual text={verdict.counterfactual} />

      {/* actions */}
      {actions ? <div className="mt-4 flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}
