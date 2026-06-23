"use client";

// Underwriting Workbench panel (Module 10 + Module 6) on the evaluate page.
//
// Sizes the loan deterministically (max loan = MIN across LTV/LTC/LTARV/DSCR/
// debt-yield) and shows the constraint ladder with the binding constraint
// called out, the per-investor best-execution comparison, and — on explicit
// request — the AI judgment (Damon's 5-dimension framework + 5-concept lens +
// deal-killers + stance). Every number drills into its basis (Noah's
// drill-down principle); the AI narrates, the engine decides.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ruler, Sparkles } from "lucide-react";

type ConstraintKey = "LTV" | "LTC" | "LoanToARV" | "DSCR" | "DebtYield";

interface Constraint {
  key: ConstraintKey;
  label: string;
  maxLoan: number;
  binding: boolean;
  basis: string;
}

interface SizingResult {
  asIsValue: number;
  stabilizedValue: number | null;
  totalProjectCost: number;
  constraints: Constraint[];
  maxLoan: number;
  bindingConstraint: ConstraintKey;
  equityRequired: number;
  annualDebtService: number;
  mortgageConstant: number;
  ltv: number;
  ltc: number;
  dscrCurrent: number;
  dscrStabilized: number | null;
  debtYieldCurrent: number;
  debtYieldStabilized: number | null;
  projectProfit: number | null;
  equityMultiple: number | null;
  returnOnCost: number | null;
  developmentSpread: number | null;
}

interface PerInvestorSizing {
  investor_id: string;
  investor_name: string;
  eligibility: "pass" | "conditional" | "fail";
  sizing: SizingResult | null;
  rate_used_pct: number | null;
  note: string;
}

interface DimensionRead {
  dimension: "sponsor" | "economics" | "market" | "structure" | "exit";
  severity: "strength" | "neutral" | "concern" | "dealkiller";
  read: string;
  flags: string[];
}

interface Judgment {
  headline: string;
  framework: DimensionRead[];
  dealKillers: string[];
  fiveConcept: string;
  recommendation: { stance: "pursue" | "pursue-with-conditions" | "pass"; rationale: string };
  memo: string;
  model: string;
}

export interface UnderwritingDeal {
  loan_type: string;
  property_type: string;
  property_state: string;
  purchase_price: number | null;
  loan_amount: number;
  arv: number | null;
  rehab_budget: number | null;
  borrower_fico: number | null;
  borrower_experience: number;
  occupancy: string;
  loan_purpose: string;
  is_rural: boolean;
  borrower_name: string | null;
  property_address: string | null;
}

const usd = (n: number | null | undefined) =>
  n == null || Number.isNaN(n)
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (n: number | null | undefined, d = 1) =>
  n == null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(d)}%`;
const mult = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${n.toFixed(2)}x`;

const SEVERITY_STYLES: Record<DimensionRead["severity"], string> = {
  strength: "border-emerald-200 bg-emerald-50/40",
  neutral: "border-border bg-muted/30",
  concern: "border-amber-200 bg-amber-50/40",
  dealkiller: "border-destructive/40 bg-destructive/5",
};
const SEVERITY_LABEL: Record<DimensionRead["severity"], string> = {
  strength: "Strength",
  neutral: "Neutral",
  concern: "Concern",
  dealkiller: "Deal-killer",
};

function StanceBadge({ stance }: { stance: Judgment["recommendation"]["stance"] }) {
  if (stance === "pursue") return <Badge className="bg-emerald-500/90 text-white">Pursue</Badge>;
  if (stance === "pursue-with-conditions")
    return <Badge className="bg-amber-500/90 text-white">Pursue with conditions</Badge>;
  return <Badge variant="destructive">Pass</Badge>;
}

export function UnderwritingPanel({
  deal,
  dealEvaluationId,
}: {
  deal: UnderwritingDeal;
  dealEvaluationId?: string | null;
}) {
  // Sizing inputs (typed numeric — Excel-like; the deal economics the
  // eligibility form doesn't capture).
  const [currentNoi, setCurrentNoi] = useState("");
  const [stabilizedNoi, setStabilizedNoi] = useState("");
  const [goingInCap, setGoingInCap] = useState("6");
  const [exitCap, setExitCap] = useState("5.5");
  const [rate, setRate] = useState("9.5");
  const [amortMonths, setAmortMonths] = useState(""); // blank = interest-only
  const [closingCosts, setClosingCosts] = useState("");
  const [maxLtv, setMaxLtv] = useState("75");
  const [maxLtc, setMaxLtc] = useState("70");
  const [maxLtarv, setMaxLtarv] = useState("65");
  const [minDscr, setMinDscr] = useState("1.0");
  const [minDebtYield, setMinDebtYield] = useState("8");
  const [coverageBasis, setCoverageBasis] = useState<"current" | "stabilized">("current");

  // Qualitative context for the AI judgment.
  const [sponsor, setSponsor] = useState("");
  const [market, setMarket] = useState("");
  const [businessPlan, setBusinessPlan] = useState("");
  const [notes, setNotes] = useState("");

  const [sizing, setSizing] = useState<SizingResult | null>(null);
  const [perInvestor, setPerInvestor] = useState<PerInvestorSizing[]>([]);
  const [uwModelId, setUwModelId] = useState<string | null>(null);
  const [sizing_busy, setSizingBusy] = useState(false);
  const [judging, setJudging] = useState(false);
  const [judgment, setJudgment] = useState<Judgment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  async function handleSize() {
    setSizingBusy(true);
    setError(null);
    setJudgment(null);
    try {
      const res = await fetch("/api/underwrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...deal,
          deal_name: deal.borrower_name,
          current_noi: numOrNull(currentNoi),
          stabilized_noi: numOrNull(stabilizedNoi),
          going_in_cap_rate: numOrNull(goingInCap),
          exit_cap_rate: numOrNull(exitCap),
          rate: numOrNull(rate),
          amortization_months: numOrNull(amortMonths),
          closing_costs: numOrNull(closingCosts),
          max_ltv: numOrNull(maxLtv),
          max_ltc: numOrNull(maxLtc),
          max_ltarv: numOrNull(maxLtarv),
          min_dscr: numOrNull(minDscr),
          min_debt_yield: numOrNull(minDebtYield),
          coverage_basis: coverageBasis,
          deal_evaluation_id: dealEvaluationId ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      setSizing(json.sizing);
      setPerInvestor(json.per_investor ?? []);
      setUwModelId(json.uw_model_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSizingBusy(false);
    }
  }

  async function handleJudge() {
    if (!uwModelId) return;
    setJudging(true);
    setError(null);
    try {
      const res = await fetch(`/api/underwrite/${uwModelId}/judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            sponsor: sponsor || undefined,
            market: market || undefined,
            businessPlan: businessPlan || undefined,
            notes: notes || undefined,
          },
          redactNames: {
            borrower_name: deal.borrower_name,
            property_address: deal.property_address,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      setJudgment(json.judgment);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJudging(false);
    }
  }

  const maxLadder = sizing ? Math.max(...sizing.constraints.map((c) => c.maxLoan)) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-info/10 p-2">
            <Ruler className="h-5 w-5 text-info" />
          </div>
          <div>
            <CardTitle className="text-base">Underwriting Workbench — size &amp; judge</CardTitle>
            <p className="text-muted-foreground text-xs mt-0.5">
              Sizes the loan as the minimum across LTV / LTC / LTARV / DSCR / debt-yield, then
              compares best execution across investors. AI judgment is optional and explicit.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Sizing inputs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="uw_noi">In-place NOI *</Label>
            <Input id="uw_noi" type="number" value={currentNoi} onChange={(e) => setCurrentNoi(e.target.value)} placeholder="600000" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uw_snoi">Stabilized NOI</Label>
            <Input id="uw_snoi" type="number" value={stabilizedNoi} onChange={(e) => setStabilizedNoi(e.target.value)} placeholder="1200000" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uw_gcap">Going-in cap %</Label>
            <Input id="uw_gcap" type="number" step="0.1" value={goingInCap} onChange={(e) => setGoingInCap(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uw_ecap">Exit cap %</Label>
            <Input id="uw_ecap" type="number" step="0.1" value={exitCap} onChange={(e) => setExitCap(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uw_rate">Rate %</Label>
            <Input id="uw_rate" type="number" step="0.05" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uw_amort">Amort. months (blank = IO)</Label>
            <Input id="uw_amort" type="number" value={amortMonths} onChange={(e) => setAmortMonths(e.target.value)} placeholder="IO" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uw_closing">Closing costs</Label>
            <Input id="uw_closing" type="number" value={closingCosts} onChange={(e) => setClosingCosts(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uw_basis">Coverage basis</Label>
            <select
              id="uw_basis"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={coverageBasis}
              onChange={(e) => setCoverageBasis(e.target.value as "current" | "stabilized")}
            >
              <option value="current">Current NOI</option>
              <option value="stabilized">Stabilized NOI</option>
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            House sizing constraints (deal-level; investors override below)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="uw_mltv">Max LTV %</Label>
              <Input id="uw_mltv" type="number" value={maxLtv} onChange={(e) => setMaxLtv(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uw_mltc">Max LTC %</Label>
              <Input id="uw_mltc" type="number" value={maxLtc} onChange={(e) => setMaxLtc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uw_mltarv">Max LTARV %</Label>
              <Input id="uw_mltarv" type="number" value={maxLtarv} onChange={(e) => setMaxLtarv(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uw_dscr">Min DSCR</Label>
              <Input id="uw_dscr" type="number" step="0.05" value={minDscr} onChange={(e) => setMinDscr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uw_dy">Min debt yield %</Label>
              <Input id="uw_dy" type="number" step="0.1" value={minDebtYield} onChange={(e) => setMinDebtYield(e.target.value)} />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSize} disabled={sizing_busy}>
            {sizing_busy ? "Sizing…" : "Size loan"}
          </Button>
        </div>

        {/* Sizing result */}
        {sizing && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Max loan</p>
                <p className="text-lg font-bold">{usd(sizing.maxLoan)}</p>
                <p className="text-xs text-muted-foreground">bound by {sizing.bindingConstraint}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Equity required</p>
                <p className="text-lg font-semibold">{usd(sizing.equityRequired)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">As-is value</p>
                <p className="text-lg font-semibold">{usd(sizing.asIsValue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Stabilized / ARV</p>
                <p className="text-lg font-semibold">{usd(sizing.stabilizedValue)}</p>
              </div>
            </div>

            {/* Constraint ladder */}
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Constraint ladder — lowest permitted loan binds the deal
              </p>
              <div className="space-y-1.5">
                {sizing.constraints.map((c) => (
                  <div key={c.key} className="flex items-center gap-3">
                    <div className="w-44 shrink-0 text-sm">
                      <span className={c.binding ? "font-semibold" : ""}>{c.label}</span>
                      {c.binding && (
                        <Badge className="ml-2 bg-foreground text-background text-[10px] px-1.5 py-0">binding</Badge>
                      )}
                    </div>
                    <div className="flex-1 h-6 rounded bg-muted/40 overflow-hidden">
                      <div
                        className={`h-full ${c.binding ? "bg-info" : "bg-info/30"}`}
                        style={{ width: `${maxLadder > 0 ? (c.maxLoan / maxLadder) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="w-48 shrink-0 text-right text-sm">
                      <span className="font-medium">{usd(c.maxLoan)}</span>
                      <span className="block text-[11px] text-muted-foreground">{c.basis}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resulting metrics */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm pt-2 border-t border-border/50">
              <Metric label="LTV (as-is)" value={pct(sizing.ltv)} />
              <Metric label="LTC" value={pct(sizing.ltc)} />
              <Metric label="DSCR in-place" value={mult(sizing.dscrCurrent)} />
              <Metric label="DSCR stab." value={mult(sizing.dscrStabilized)} />
              <Metric label="Debt yield" value={pct(sizing.debtYieldCurrent)} />
              <Metric label="Equity mult." value={mult(sizing.equityMultiple)} />
            </div>
            {sizing.stabilizedValue != null && (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Metric label="Yield-on-cost" value={pct(sizing.returnOnCost)} />
                <Metric label="Dev. spread vs exit cap" value={pct(sizing.developmentSpread)} />
                <Metric label="Project profit" value={usd(sizing.projectProfit)} />
              </div>
            )}

            {/* Per-investor best execution */}
            {perInvestor.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Best execution by investor — sized at each investor&apos;s caps + priced rate
                </p>
                <div className="space-y-1.5">
                  {perInvestor.map((pi) => (
                    <div
                      key={pi.investor_id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{pi.investor_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{pi.note}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {pi.sizing ? (
                          <>
                            <span className="font-semibold">{usd(pi.sizing.maxLoan)}</span>
                            <Badge variant="outline" className="text-[10px]">{pi.sizing.bindingConstraint}</Badge>
                            <span className="text-xs text-muted-foreground w-14 text-right">
                              {pi.rate_used_pct != null ? `${pi.rate_used_pct.toFixed(2)}%` : "—"}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">not sized</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI judgment */}
            <div className="pt-3 border-t border-border space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-info" /> AI underwriting judgment
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Optional. The AI reads only the figures above + the context you provide, and judges
                    deal structure — it never sets the loan amount.
                  </p>
                </div>
                <Button variant="outline" onClick={handleJudge} disabled={judging || !uwModelId}>
                  {judging ? "Judging…" : "Run AI judgment"}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ContextField label="Sponsor" value={sponsor} onChange={setSponsor} placeholder="Track record, experience, liquidity, credit…" />
                <ContextField label="Market" value={market} onChange={setMarket} placeholder="Submarket, supply/demand, comps, location…" />
                <ContextField label="Business plan" value={businessPlan} onChange={setBusinessPlan} placeholder="The value-add thesis (rehab / lease-up)…" />
                <ContextField label="Notes" value={notes} onChange={setNotes} placeholder="Structure quirks, exit channel, timing…" />
              </div>

              {judgment && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
                    <div>
                      <p className="font-medium">{judgment.headline}</p>
                      <p className="text-xs text-muted-foreground mt-1">{judgment.recommendation.rationale}</p>
                    </div>
                    <StanceBadge stance={judgment.recommendation.stance} />
                  </div>

                  {judgment.dealKillers.length > 0 && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-destructive mb-1">Deal-killers</p>
                      <ul className="text-sm space-y-0.5 list-disc list-inside text-destructive">
                        {judgment.dealKillers.map((k, i) => <li key={i}>{k}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {judgment.framework.map((d) => (
                      <div key={d.dimension} className={`rounded-md border p-3 ${SEVERITY_STYLES[d.severity]}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium capitalize">{d.dimension}</span>
                          <Badge variant="outline" className="text-[10px]">{SEVERITY_LABEL[d.severity]}</Badge>
                        </div>
                        <p className="text-xs">{d.read}</p>
                        {d.flags.length > 0 && (
                          <ul className="text-[11px] text-muted-foreground mt-1.5 space-y-0.5 list-disc list-inside">
                            {d.flags.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">5-concept lens</p>
                    <p className="text-sm">{judgment.fiveConcept}</p>
                  </div>

                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Partner memo</p>
                    <p className="text-sm whitespace-pre-line">{judgment.memo}</p>
                    <p className="text-[11px] text-muted-foreground mt-2">Generated by {judgment.model}. Reviewed by a human underwriter.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function ContextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <textarea
        className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
