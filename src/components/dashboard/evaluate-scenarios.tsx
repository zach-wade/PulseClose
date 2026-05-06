"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers3, TrendingUp } from "lucide-react";

// F1 — Multi-deal scenario comparison: same deal at 3 leverage tiers
// (loan_amount derived from purchase_price × {0.70, 0.75, 0.80}).
// Each scenario is a fresh POST to /api/evaluate so the engine
// re-applies all rules including LTV/LTC/LTARV constraints.
//
// F2 — Rate-shock stress test: client-side bps slider that re-paints
// the rate column on a frozen result set. The shock is purely visual
// (rates are an OUTPUT, not a constraint) but it answers the
// "what if my cost of capital moves" question without round-tripping.

interface DealParams {
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

interface Result {
  investor_id: string;
  investor_name: string;
  result: "pass" | "conditional" | "fail";
  estimated_rate_pct: number | null;
  estimated_points: number | null;
  max_ltv: number | null;
}

interface ScenarioRun {
  ltv_pct: number;
  loan_amount: number;
  results: Result[];
}

interface Props {
  deal: DealParams;
  baseResults: Result[];
}

// F1 leverage tiers — common sponsor-asks for fix-flip:
//   65% LTV (conservative), 75% LTV (median), 80% LTV (max-leverage)
const LEVERAGE_TIERS = [0.65, 0.75, 0.8];

// F2 rate-shock scenarios — typical Fed-cycle stress.
const RATE_SHOCKS = [0, 100, 200];

export function EvaluateScenarios({ deal, baseResults }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [shockBps, setShockBps] = useState(0);

  async function runScenarios() {
    if (!deal.purchase_price) return;
    setLoading(true);
    try {
      const runs = await Promise.all(
        LEVERAGE_TIERS.map(async (ltv) => {
          const newLoanAmount = Math.round((deal.purchase_price ?? 0) * ltv);
          const res = await fetch("/api/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...deal, loan_amount: newLoanAmount }),
          });
          if (!res.ok) {
            throw new Error(`Scenario ${Math.round(ltv * 100)}% LTV failed (${res.status})`);
          }
          const j = (await res.json()) as { results: Result[] };
          return { ltv_pct: ltv, loan_amount: newLoanAmount, results: j.results ?? [] };
        }),
      );
      setScenarios(runs);
    } catch {
      setScenarios(null);
    } finally {
      setLoading(false);
    }
  }

  // Build the per-investor matrix view. Investors that aren't seen in
  // any scenario row are dropped (they were filtered out by some
  // upstream rule, not just LTV).
  const investorOrder = baseResults.map((r) => ({ id: r.investor_id, name: r.investor_name }));

  function findResult(investorId: string, scenario: ScenarioRun): Result | null {
    return scenario.results.find((r) => r.investor_id === investorId) ?? null;
  }

  // F2 — apply a bps shock to the base-result rate column.
  const shocked = baseResults.map((r) => ({
    ...r,
    estimated_rate_pct: r.estimated_rate_pct != null ? r.estimated_rate_pct + shockBps / 100 : null,
  }));
  const passCount = shocked.filter((r) => r.result === "pass").length;

  return (
    <div className="space-y-4">
      {/* F1 — leverage scenario comparison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers3 className="h-4 w-4" />
              Scenario comparison
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || !deal.purchase_price}
              onClick={runScenarios}
              title={!deal.purchase_price ? "Needs purchase price" : "Re-run at 65% / 75% / 80% LTV"}
            >
              {loading ? "Running…" : scenarios ? "Re-run scenarios" : "Compare leverage tiers"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!scenarios ? (
            <p className="text-xs text-muted-foreground">
              Re-runs the same deal at {LEVERAGE_TIERS.map((l) => `${Math.round(l * 100)}%`).join(" / ")} LTV
              and shows which investors pass at each tier — useful when
              the sponsor wants to know how much leverage they can pull.
              {!deal.purchase_price && " Requires purchase price on the form."}
            </p>
          ) : loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Investor</th>
                    {scenarios.map((s) => (
                      <th key={s.ltv_pct} className="text-center p-2 font-medium">
                        {Math.round(s.ltv_pct * 100)}% LTV
                        <p className="text-xs text-muted-foreground font-normal">
                          ${(s.loan_amount / 1000).toFixed(0)}K
                        </p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {investorOrder.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{inv.name}</td>
                      {scenarios.map((s) => {
                        const r = findResult(inv.id, s);
                        return (
                          <td key={s.ltv_pct} className="p-2 text-center">
                            {!r ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <ScenarioCell result={r} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* F2 — rate-shock stress test */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Rate stress test
            </span>
            <div className="flex items-center gap-1">
              {RATE_SHOCKS.map((bps) => (
                <Button
                  key={bps}
                  size="sm"
                  variant={shockBps === bps ? "default" : "outline"}
                  onClick={() => setShockBps(bps)}
                >
                  {bps === 0 ? "Base" : `+${bps}bps`}
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Adds {shockBps}bps to every quoted rate. Eligibility verdicts
            are frozen at base — Fed moves don&apos;t typically toggle
            pass/fail (rates are an output) — but this surfaces what the
            quoted package looks like under tighter market conditions.
            <strong> {passCount}</strong> investor{passCount === 1 ? "" : "s"} eligible at base.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Investor</th>
                  <th className="text-center p-2 font-medium">Base rate</th>
                  <th className="text-center p-2 font-medium">Shocked rate</th>
                  <th className="text-center p-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {shocked.map((r) => (
                  <tr key={r.investor_id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{r.investor_name}</td>
                    <td className="p-2 text-center">
                      {baseResults.find((b) => b.investor_id === r.investor_id)?.estimated_rate_pct?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="p-2 text-center font-medium">
                      {r.estimated_rate_pct != null ? `${r.estimated_rate_pct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="p-2 text-center">
                      <ScenarioBadge result={r.result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioCell({ result }: { result: Result }) {
  if (result.result === "pass") {
    return (
      <div className="text-emerald-700">
        <Badge className="bg-emerald-500/90 text-white hover:bg-emerald-500 text-[10px]">
          Pass
        </Badge>
        <p className="text-xs mt-0.5">
          {result.estimated_rate_pct != null ? `${result.estimated_rate_pct.toFixed(2)}%` : "—"}
        </p>
      </div>
    );
  }
  if (result.result === "conditional") {
    return (
      <Badge className="bg-amber-500/90 text-white hover:bg-amber-500 text-[10px]">
        Conditional
      </Badge>
    );
  }
  return <Badge variant="destructive" className="text-[10px]">Fail</Badge>;
}

function ScenarioBadge({ result }: { result: Result["result"] }) {
  if (result === "pass") return <Badge className="bg-emerald-500/90 text-white text-[10px]">Pass</Badge>;
  if (result === "conditional") return <Badge className="bg-amber-500/90 text-white text-[10px]">Cond</Badge>;
  return <Badge variant="destructive" className="text-[10px]">Fail</Badge>;
}
