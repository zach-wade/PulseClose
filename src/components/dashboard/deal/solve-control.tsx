// Live goal-seek control for the deal stepper (UW-5 SolveControl).
//
// "Replace the Excel" means replacing Solver too. Instead of the underwriter
// hand-iterating an advance % until cash-to-close lands, they set the target and
// PulseClose back-solves the lever — live, per keystroke/drag, deterministically
// (src/lib/underwriting/solve.ts solveDeal → bisection over sizeDeal). Apply writes
// the solved lever back into the sizing inputs (which marks the size stale to re-run).
//
// Presentational + client-side: the pure engine is the source of every number.
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { usd, ratioPct } from "@/lib/deal/view-model";
import { sizeDeal, type SizeDealInput } from "@/lib/underwriting/dispatch";
import { SOLVE_OPTIONS, trySolveDeal, readDealMetric, type SolveOption } from "@/lib/underwriting/solve";
import type { SizeDealResult } from "@/lib/underwriting/dispatch";

type StructuredMode = "rtl" | "construction" | "dscr";

/** The headline loan on a sized deal, per mode — what the solved structure produces. */
function headlineLoan(r: SizeDealResult): { label: string; value: number } {
  switch (r.mode) {
    case "rtl":
      return { label: "Max loan", value: r.result.recommendedMaxLoan };
    case "construction":
      return { label: "Total loan", value: r.result.totalLoan };
    case "dscr":
      return { label: "Max loan", value: r.result.maxLoan };
    case "bridge":
      return { label: "Max loan", value: r.result.maxLoan };
  }
}

export function SolveControl({
  mode,
  input,
  onApply,
}: {
  mode: StructuredMode;
  input: SizeDealInput;
  /** Write the solved lever back into the stepper inputs (percent NUMBER for the
   *  advance; DSCR as-is). Exactly one field is set per solve. */
  onApply: (patch: { advancePctNumber?: number; targetDscr?: number }) => void;
}) {
  const options: SolveOption[] = SOLVE_OPTIONS[mode];
  const [optIdx, setOptIdx] = useState(0);
  const opt = options[Math.min(optIdx, options.length - 1)];

  // Baseline metric at the CURRENT inputs → the default target + slider range.
  const baseline = useMemo(() => {
    try {
      return readDealMetric(sizeDeal(input), opt.metric);
    } catch {
      return null;
    }
  }, [input, opt.metric]);

  // Target in DISPLAY units: dollars for usd metrics, percent number for pct (LTARV).
  const [targetStr, setTargetStr] = useState<string>("");
  const displayDefault =
    baseline == null ? "" : opt.metricKind === "pct" ? (baseline * 100).toFixed(1) : Math.round(baseline).toString();
  const targetDisplay = targetStr === "" ? displayDefault : targetStr;
  const targetNum = Number(targetDisplay);
  const engineTarget = opt.metricKind === "pct" ? targetNum / 100 : targetNum;

  const solved = useMemo(() => {
    if (!Number.isFinite(engineTarget)) return null;
    return trySolveDeal(input, opt.lever, opt.metric, engineTarget, opt.bracket);
  }, [input, opt, engineTarget]);

  // Slider bounds: 0..100 for a pct target; 0..~2× the baseline dollar figure.
  const sliderMax =
    opt.metricKind === "pct" ? 100 : baseline != null && baseline > 0 ? Math.round(baseline * 2) : 1_000_000;
  const sliderStep = opt.metricKind === "pct" ? 0.5 : Math.max(Math.round(sliderMax / 200), 500);

  const leverDisplay = solved
    ? opt.leverKind === "pct"
      ? `${(solved.leverValue * 100).toFixed(2)}%`
      : solved.leverValue.toFixed(2)
    : null;

  function apply() {
    if (!solved) return;
    if (opt.lever === "purchaseAdvancePct") onApply({ advancePctNumber: solved.leverValue * 100 });
    else if (opt.lever === "targetDSCR") onApply({ targetDscr: solved.leverValue });
  }

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-info font-medium">Solve for a number (live goal-seek)</p>
        <p className="text-[11px] text-muted-foreground">
          Set the target — we back-solve the {opt.leverLabel}.
        </p>
      </div>

      {/* Which metric to solve for (only when a mode offers more than one). */}
      {options.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o, i) => (
            <button
              key={o.metric}
              type="button"
              onClick={() => {
                setOptIdx(i);
                setTargetStr("");
              }}
              className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                i === optIdx ? "border-info bg-info/10 text-info font-medium" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {o.metricLabel}
            </button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="solve_target">
            Target {opt.metricLabel} {opt.metricKind === "pct" ? "(%)" : "($)"}
          </Label>
          <Input
            id="solve_target"
            type="number"
            step={opt.metricKind === "pct" ? "0.5" : "1000"}
            value={targetDisplay}
            onChange={(e) => setTargetStr(e.target.value)}
          />
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={sliderStep}
            value={Number.isFinite(targetNum) ? Math.min(targetNum, sliderMax) : 0}
            onChange={(e) => setTargetStr(e.target.value)}
            className="w-full accent-info"
            aria-label={`Target ${opt.metricLabel}`}
          />
        </div>

        <div className="rounded-md border border-info/30 bg-info/5 px-3 py-2">
          {solved ? (
            <>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Required {opt.leverLabel}
              </p>
              <p className="text-xl font-bold leading-tight tabular-nums">{leverDisplay}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {opt.metricLabel} ={" "}
                {opt.metricKind === "pct" ? ratioPct(solved.achieved) : usd(solved.achieved)} ·{" "}
                {(() => {
                  const h = headlineLoan(solved.result);
                  return `${h.label} ${usd(h.value)}`;
                })()}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              That target isn’t reachable by adjusting the {opt.leverLabel} alone — try a value{" "}
              {opt.metricKind === "pct" ? "between 0 and 100%" : "closer to the sized figure"}.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          Applying updates the {opt.leverLabel} input — re-run <span className="font-medium">Size loan</span> to persist.
        </p>
        <Button size="sm" variant="outline" onClick={apply} disabled={!solved}>
          Apply {opt.leverLabel}
        </Button>
      </div>
    </div>
  );
}
