// Excel-parity result UI for the deal-type sizers (UX-2 / UW-7). Renders the
// mode-tagged structured result from /api/underwrite (RTL fix&flip / ground-up
// construction / DSCR) the way ICC's sheets present it: a proceeds waterfall +
// a constraint ladder with cushion, or a Sources/Uses + DSCR summary.
//
// Presentational only — the engine (src/lib/underwriting/*) is the source of the
// numbers. Matches the existing bridge SizingStep styling (bg-info binding, usd()).
"use client";

import { Badge } from "@/components/ui/badge";
import { usd, ratioPct } from "@/lib/deal/view-model";
import type { SizeDealResult } from "@/lib/underwriting/dispatch";
import type { RtlSizingResult } from "@/lib/underwriting/rtl-sizer";
import type { ConstructionSizingResult } from "@/lib/underwriting/construction-sizer";
import type { ResidentialDscrSizeResult } from "@/lib/underwriting/dscr-sizer";

// ── shared primitives ───────────────────────────────────────────────────────

export interface LadderRow {
  label: string;
  maxLoan: number;
  binding: boolean;
  basis: string;
}

/** Constraint ladder — the lowest permitted loan binds; each row shows its
 *  headroom (cushion) above the sized loan. Reused across modes (UX-2 §13.2). */
export function ConstraintLadder({ rows, sizedLoan }: { rows: LadderRow[]; sizedLoan: number }) {
  const scale = Math.max(...rows.map((r) => r.maxLoan), sizedLoan, 1);
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Constraint ladder — lowest permitted loan binds the deal
      </p>
      <div className="space-y-1.5">
        {rows.map((c) => {
          const headroom = c.maxLoan - sizedLoan;
          return (
            <div key={c.label} className={`flex items-center gap-3 rounded-md px-2 py-1 ${c.binding ? "bg-info/10" : ""}`}>
              <div className="w-44 shrink-0 text-sm">
                <span className={c.binding ? "font-semibold" : "text-muted-foreground"}>{c.label}</span>
                {c.binding && <Badge className="ml-2 bg-foreground text-background text-[10px] px-1.5 py-0">binding</Badge>}
              </div>
              <div className="flex-1 h-6 rounded bg-muted/40 overflow-hidden">
                <div className={`h-full ${c.binding ? "bg-info" : "bg-info/30"}`} style={{ width: `${(c.maxLoan / scale) * 100}%` }} />
              </div>
              <div className="w-48 shrink-0 text-right text-sm">
                <span className={c.binding ? "font-semibold" : "font-medium text-muted-foreground"}>{usd(c.maxLoan)}</span>
                <span className="block text-[11px] text-muted-foreground">{c.binding ? c.basis : `+${usd(headroom)} headroom`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface WaterfallRow {
  label: string;
  amount: number;
  op: "add" | "subtract" | "subtotal" | "total";
}

/** Proceeds waterfall — advance + holdback − prepaid − closing → net → cash-to-close.
 *  The artifact that makes the sizer "replace the Excel" (UX-2 §13.2). */
export function ProceedsWaterfall({ rows }: { rows: WaterfallRow[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Proceeds waterfall</p>
      <div className="space-y-0.5">
        {rows.map((r, i) => {
          const strong = r.op === "total" || r.op === "subtotal";
          const sign = r.op === "subtract" ? "−" : r.op === "add" ? "+" : "";
          return (
            <div
              key={`${r.label}-${i}`}
              className={`flex items-baseline justify-between px-2 py-1 rounded-md text-sm ${
                r.op === "total" ? "bg-muted/60 font-semibold" : r.op === "subtotal" ? "border-t border-border font-medium" : ""
              }`}
            >
              <span className={strong ? "" : "text-muted-foreground"}>{r.label}</span>
              <span className="tabular-nums">
                {sign && <span className="text-muted-foreground mr-1">{sign}</span>}
                {usd(Math.abs(r.amount))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── mode renderers ───────────────────────────────────────────────────────────

function RtlView({ r }: { r: RtlSizingResult }) {
  const ladder: LadderRow[] = r.constraints
    .filter((c) => c.maxLoan != null)
    .map((c) => ({ label: c.label, maxLoan: c.maxLoan as number, binding: c.key === r.bindingConstraint, basis: c.basis }));
  const waterfall: WaterfallRow[] = [
    { label: "Purchase advance", amount: r.purchaseAdvance, op: "add" },
    { label: "Rehab holdback", amount: r.rehabHoldback, op: "add" },
    { label: "Proposed loan", amount: r.proposedLoan, op: "subtotal" },
    { label: "Less: rehab holdback (funded at draws)", amount: r.rehabHoldback, op: "subtract" },
    { label: "Less: prepaid interest", amount: r.prepaidInterest, op: "subtract" },
    { label: "Less: closing costs", amount: r.closingCosts, op: "subtract" },
    { label: "Net proceeds at close", amount: r.netProceedsAtClose, op: "subtotal" },
    { label: "Cash to close (borrower)", amount: r.cashToClose, op: "total" },
  ];
  return (
    <div className="space-y-5">
      <HeadlineMax label={`Max loan · bound by ${r.bindingConstraint}`} value={r.recommendedMaxLoan}
        sub={`Borrower equity ${ratioPct(r.borrowerEquityPct)} · FICO ${r.guideline.tier ? `tier ${r.guideline.tier}` : ""} ${r.guideline.rehabType}`}
        status={r.overallStatus} />
      <div className="grid md:grid-cols-2 gap-6">
        <ProceedsWaterfall rows={waterfall} />
        <ConstraintLadder rows={ladder} sizedLoan={r.recommendedMaxLoan} />
      </div>
    </div>
  );
}

function ConstructionView({ r }: { r: ConstructionSizingResult }) {
  const ladder: LadderRow[] = [
    r.maxLoanByLTC != null && { label: "Max by LTC", maxLoan: r.maxLoanByLTC, binding: r.recommendedMaxLoan === r.maxLoanByLTC, basis: "loan-to-cost cap" },
    r.maxLoanByLTARV != null && { label: "Max by LTARV", maxLoan: r.maxLoanByLTARV, binding: r.recommendedMaxLoan === r.maxLoanByLTARV, basis: "loan-to-ARV cap" },
  ].filter(Boolean) as LadderRow[];
  const sources: WaterfallRow[] = [
    { label: "Initial disbursement", amount: r.initialDisbursement, op: "add" },
    { label: "Construction holdback", amount: r.constructionHoldback, op: "add" },
    { label: "Capitalized interest reserve", amount: r.interestReserve, op: "add" },
    { label: "Total loan", amount: r.totalLoan, op: "total" },
  ];
  return (
    <div className="space-y-5">
      <HeadlineMax label="Total loan (sized)" value={r.totalLoan}
        sub={`LTC ${ratioPct(r.ltcExclReserve)} excl. reserve · ${ratioPct(r.ltcInclReserve)} incl. · LTARV ${ratioPct(r.ltarv)}${r.initialLtais != null ? ` · LTAIS ${ratioPct(r.initialLtais)}` : ""} · equity required ${usd(r.equityRequired)}`} />
      <div className="grid md:grid-cols-2 gap-6">
        <ProceedsWaterfall rows={sources} />
        {ladder.length > 0 && <ConstraintLadder rows={ladder} sizedLoan={r.recommendedMaxLoan ?? r.totalLoan} />}
      </div>
    </div>
  );
}

function DscrView({ r }: { r: ResidentialDscrSizeResult }) {
  const rows: WaterfallRow[] = [
    { label: "Supportable PITIA (rent ÷ DSCR)", amount: r.supportablePitia, op: "add" },
    { label: "Less: taxes + insurance + HOA", amount: r.tia, op: "subtract" },
    { label: "Supportable P&I", amount: r.supportablePI, op: "subtotal" },
    { label: "Max loan (PV of P&I)", amount: r.maxLoan, op: "total" },
  ];
  return (
    <div className="space-y-5">
      <HeadlineMax label={`Max loan · DSCR floor ${r.targetDSCR}`} value={r.maxLoan}
        sub={`PITIA convention · DSCR at max ${r.atMaxLoan.dscrAmortizing.toFixed(2)}${r.ltvAtMax != null ? ` · LTV ${ratioPct(r.ltvAtMax)}` : ""}`} />
      <div className="md:w-1/2"><ProceedsWaterfall rows={rows} /></div>
    </div>
  );
}

function HeadlineMax({ label, value, sub, status }: { label: string; value: number; sub?: string; status?: "PASS" | "FAIL" }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        {status && <Badge className={`ml-2 text-[10px] ${status === "PASS" ? "bg-success text-background" : "bg-danger text-background"}`}>{status}</Badge>}
      </p>
      <p className="text-2xl font-bold leading-tight">{usd(value)}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/** Dispatch a mode-tagged structured result to the right Excel-parity view. */
export function StructuredSizing({ result }: { result: SizeDealResult }) {
  switch (result.mode) {
    case "rtl":
      return <RtlView r={result.result} />;
    case "construction":
      return <ConstructionView r={result.result} />;
    case "dscr":
      return <DscrView r={result.result} />;
    case "bridge":
      return null; // bridge renders through the existing SizingStep ladder
  }
}
