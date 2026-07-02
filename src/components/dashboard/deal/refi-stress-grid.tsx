// Refi NOI-stress grid (UW-7 / CALIBRATION #26) — "does the bridge STILL exit if
// stabilized NOI comes in light?" Renders the deterministic grid from
// src/lib/underwriting/exit.ts stressTakeout(): the takeout re-sized across NOI
// haircuts, with the break-even haircut called out. Presentational only.
"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { usd } from "@/lib/deal/view-model";
import type { RefiStressResult, RefiStressRow } from "@/lib/deal/view-model";

// Row verdict → color + icon + shape (UX-AUDIT-RUBRIC: never color alone).
function rowStatus(r: RefiStressRow) {
  if (!r.refinanceable) return { Icon: XCircle, cls: "text-destructive", label: "shorts" };
  if (r.coverage < 1.1) return { Icon: AlertTriangle, cls: "text-warning-foreground", label: "thin" };
  return { Icon: CheckCircle2, cls: "text-success", label: "clears" };
}

export function RefiStressGrid({ grid }: { grid: RefiStressResult }) {
  const be = grid.breakEvenHaircut;
  // Headline: how much NOI can come in light before the takeout stops repaying.
  const headline =
    be == null
      ? { text: "No bridge balance to refinance at exit.", cls: "text-muted-foreground", Icon: CheckCircle2 }
      : be === 0
        ? { text: "Shorts the bridge at the plan NOI — needs equity or better takeout terms to exit.", cls: "text-destructive", Icon: XCircle }
        : be < 0.1
          ? { text: `Thin exit — the takeout shorts the bridge after just a −${(be * 100).toFixed(0)}% NOI haircut.`, cls: "text-warning-foreground", Icon: AlertTriangle }
          : { text: `Exits cleanly to a −${(be * 100).toFixed(0)}% NOI haircut before the takeout shorts the bridge.`, cls: "text-success", Icon: CheckCircle2 };

  return (
    <div className="pt-2 border-t border-border/50 space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Refi stress — does it still exit if NOI comes in light?
      </p>
      <p className={`text-sm font-medium flex items-center gap-1.5 ${headline.cls}`}>
        <headline.Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span>{headline.text}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground text-left">
              <th className="font-normal py-1 pr-3">NOI haircut</th>
              <th className="font-normal py-1 pr-3">Stabilized NOI</th>
              <th className="font-normal py-1 pr-3">Value</th>
              <th className="font-normal py-1 pr-3">Max takeout</th>
              <th className="font-normal py-1 pr-3">Coverage</th>
              <th className="font-normal py-1">Exit</th>
            </tr>
          </thead>
          <tbody>
            {grid.levels.map((r) => {
              const s = rowStatus(r);
              return (
                <tr key={r.haircut} className={`border-t border-border/40 ${r.haircut === 0 ? "font-medium" : ""}`}>
                  <td className="py-1 pr-3">{r.haircut === 0 ? "Base" : `−${(r.haircut * 100).toFixed(0)}%`}</td>
                  <td className="py-1 pr-3">{usd(r.stabilizedNOI)}</td>
                  <td className="py-1 pr-3">{usd(r.stabilizedValue)}</td>
                  <td className="py-1 pr-3">{usd(r.maxTakeout)}</td>
                  <td className="py-1 pr-3">{r.coverage.toFixed(2)}x</td>
                  <td className="py-1">
                    <span className={`inline-flex items-center gap-1 ${s.cls}`}>
                      <s.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {s.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Perm takeout re-sized at each NOI level (value = NOI ÷ exit cap); coverage = max takeout ÷ bridge balance at exit.
      </p>
    </div>
  );
}
