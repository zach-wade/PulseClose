"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateSelect } from "@/components/ui/state-select";
import { Calculator, ChevronRight, Settings } from "lucide-react";

interface FailureReason {
  field: string;
  rule: string;
  expected: string | number | string[] | null;
  actual: string | number | null;
}

interface AppliedAdjuster {
  name: string;
  rate_bps: number;
  points_bps: number;
}

interface BoundaryWarning {
  field: string;
  message: string;
}

interface EligibilityResult {
  investor_id: string;
  investor_name: string;
  result: "pass" | "conditional" | "fail";
  failure_reasons: FailureReason[];
  boundary_warnings: BoundaryWarning[];
  max_ltv: number | null;
  max_ltc: number | null;
  max_ltarv: number | null;
  estimated_rate_pct: number | null;
  estimated_points: number | null;
  applied_adjusters: AppliedAdjuster[];
  matched_tier_index: number | null;
  reasoning: string;
}

interface RecentEvaluation {
  id: string;
  loan_amount: number;
  loan_type: string;
  property_type: string;
  location: string;
  evaluated_at: string;
  additional_params: { borrower_name?: string | null; property_address?: string | null } | null;
}

const LOAN_TYPES = ["bridge", "fix_flip", "ground_up", "dscr"] as const;
const PROPERTY_TYPES = ["sfr", "2_4_unit", "small_multifamily", "condo", "townhouse", "mixed_use"] as const;
const OCCUPANCIES = ["non_owner_occupied", "owner_occupied"] as const;
const LOAN_PURPOSES = ["purchase", "refinance", "cash_out_refi"] as const;

function fmtPct(v: number | null) {
  if (v == null) return "—";
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
}
function fmtRate(v: number | null) {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}
function fmtCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function ResultBadge({ result }: { result: "pass" | "conditional" | "fail" }) {
  if (result === "pass") return <Badge className="bg-emerald-500/90 text-white hover:bg-emerald-500">Eligible</Badge>;
  if (result === "conditional") return <Badge className="bg-amber-500/90 text-white hover:bg-amber-500">Conditional</Badge>;
  return <Badge variant="destructive">Ineligible</Badge>;
}

export default function EvaluatePage() {
  const [recent, setRecent] = useState<RecentEvaluation[]>([]);
  const [investorCount, setInvestorCount] = useState<number | null>(null);
  const [investorLoadError, setInvestorLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<EligibilityResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [loanType, setLoanType] = useState<typeof LOAN_TYPES[number]>("bridge");
  const [propertyType, setPropertyType] = useState<typeof PROPERTY_TYPES[number]>("sfr");
  const [propertyState, setPropertyState] = useState("CA");
  const [purchasePrice, setPurchasePrice] = useState("500000");
  const [loanAmount, setLoanAmount] = useState("375000");
  const [arv, setArv] = useState("");
  const [rehabBudget, setRehabBudget] = useState("");
  const [borrowerFico, setBorrowerFico] = useState("720");
  const [borrowerExperience, setBorrowerExperience] = useState("5");
  const [occupancy, setOccupancy] = useState<typeof OCCUPANCIES[number]>("non_owner_occupied");
  const [loanPurpose, setLoanPurpose] = useState<typeof LOAN_PURPOSES[number]>("purchase");
  const [isRural, setIsRural] = useState(false);
  const [borrowerName, setBorrowerName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");

  useEffect(() => {
    (async () => {
      // Track investor-fetch failure separately so the empty state below
      // can differentiate "you have 0 investors configured" from "API
      // failed to load" — without this, both render as "No investors yet"
      // and a real outage looks like a fresh tenant during a live demo.
      const [evalsRes, invsRes] = await Promise.all([
        fetch("/api/evaluate"),
        fetch("/api/investors"),
      ]);
      if (evalsRes.ok) setRecent(await evalsRes.json());
      if (invsRes.ok) {
        const invs = await invsRes.json();
        setInvestorCount(invs.length);
      } else {
        setInvestorLoadError(`Couldn't load investors (${invsRes.status})`);
      }
    })();
  }, []);

  async function handleEvaluate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loan_type: loanType,
          property_type: propertyType,
          property_state: propertyState,
          purchase_price: purchasePrice ? Number(purchasePrice) : null,
          loan_amount: Number(loanAmount),
          arv: arv ? Number(arv) : null,
          rehab_budget: rehabBudget ? Number(rehabBudget) : null,
          borrower_fico: borrowerFico ? Number(borrowerFico) : null,
          borrower_experience: borrowerExperience ? Number(borrowerExperience) : 0,
          occupancy,
          loan_purpose: loanPurpose,
          is_rural: isRural,
          borrower_name: borrowerName || null,
          property_address: propertyAddress || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const json = await res.json();
      setResults(json.results ?? []);
      // Refresh recent list
      const evals = await fetch("/api/evaluate").then((r) => (r.ok ? r.json() : []));
      setRecent(evals);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Sort: pass → conditional → fail; within group, by rate ascending (lowest rate first).
  const sortedResults = results
    ? [...results].sort((a, b) => {
        const order: Record<string, number> = { pass: 0, conditional: 1, fail: 2 };
        if (order[a.result] !== order[b.result]) return order[a.result] - order[b.result];
        const ra = a.estimated_rate_pct ?? Infinity;
        const rb = b.estimated_rate_pct ?? Infinity;
        return ra - rb;
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-info/10 p-2">
            <Calculator className="h-5 w-5 text-info" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Evaluate Deal</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Multi-investor comparison engine — best-execution recommendation across all configured investors.
            </p>
          </div>
        </div>
        <Button variant="outline" render={<Link href="/dashboard/evaluate/investors" />}>
          <Settings className="mr-2 h-4 w-4" />
          Manage investors {investorCount != null ? `(${investorCount})` : ""}
        </Button>
      </div>

      {investorLoadError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <strong>{investorLoadError}.</strong> Refresh the page to retry.
            This is an API problem, not an empty configuration.
          </CardContent>
        </Card>
      ) : investorCount === 0 ? (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4 text-sm">
            No investors configured yet. Add one or more in{" "}
            <Link href="/dashboard/evaluate/investors" className="underline font-medium">
              Manage investors
            </Link>{" "}
            (or run <code className="text-xs bg-muted px-1 rounded">npx tsx scripts/seed-sample-investors.ts</code> to load three example investor configs).
          </CardContent>
        </Card>
      ) : null}

      <form onSubmit={handleEvaluate}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deal scenario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="loan_type">Loan type</Label>
                <select
                  id="loan_type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={loanType}
                  onChange={(e) => setLoanType(e.target.value as typeof LOAN_TYPES[number])}
                >
                  {LOAN_TYPES.map((lt) => <option key={lt} value={lt}>{lt}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="property_type">Property type</Label>
                <select
                  id="property_type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value as typeof PROPERTY_TYPES[number])}
                >
                  {PROPERTY_TYPES.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="property_state">State</Label>
                <StateSelect
                  id="property_state"
                  value={propertyState}
                  onChange={(v) => setPropertyState(v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase_price">Purchase price</Label>
                <Input id="purchase_price" type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan_amount">Loan amount *</Label>
                <Input id="loan_amount" type="number" required value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arv">ARV</Label>
                <Input id="arv" type="number" value={arv} onChange={(e) => setArv(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rehab_budget">Rehab budget</Label>
                <Input id="rehab_budget" type="number" value={rehabBudget} onChange={(e) => setRehabBudget(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="borrower_fico">Borrower FICO</Label>
                <Input id="borrower_fico" type="number" value={borrowerFico} onChange={(e) => setBorrowerFico(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="borrower_experience">Experience (deals completed)</Label>
                <Input id="borrower_experience" type="number" value={borrowerExperience} onChange={(e) => setBorrowerExperience(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="occupancy">Occupancy</Label>
                <select
                  id="occupancy"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={occupancy}
                  onChange={(e) => setOccupancy(e.target.value as typeof OCCUPANCIES[number])}
                >
                  {OCCUPANCIES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan_purpose">Loan purpose</Label>
                <select
                  id="loan_purpose"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={loanPurpose}
                  onChange={(e) => setLoanPurpose(e.target.value as typeof LOAN_PURPOSES[number])}
                >
                  {LOAN_PURPOSES.map((lp) => <option key={lp} value={lp}>{lp}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isRural} onChange={(e) => setIsRural(e.target.checked)} />
                  <span className="text-sm">Rural property</span>
                </label>
              </div>
              <div className="space-y-1.5 col-span-2 md:col-span-3">
                <Label htmlFor="property_address">Property address (optional)</Label>
                <Input id="property_address" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2 md:col-span-3">
                <Label htmlFor="borrower_name">Borrower (optional)</Label>
                <Input id="borrower_name" value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting || investorCount === 0}>
                {submitting ? "Evaluating…" : "Evaluate against investors"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {sortedResults && sortedResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Results — sorted by best execution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedResults.map((r) => (
              <div
                key={r.investor_id}
                className={`rounded-md border p-3 ${
                  r.result === "pass"
                    ? "border-emerald-200 bg-emerald-50/30"
                    : r.result === "conditional"
                      ? "border-amber-200 bg-amber-50/30"
                      : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-medium">{r.investor_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.reasoning}</p>
                  </div>
                  <ResultBadge result={r.result} />
                </div>
                {(r.result === "pass" || r.result === "conditional") && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm pt-2 border-t border-border/50">
                    <div>
                      <p className="text-xs text-muted-foreground">Max LTV</p>
                      <p className="font-semibold">{fmtPct(r.max_ltv)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max LTC</p>
                      <p className="font-semibold">{fmtPct(r.max_ltc)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max LTARV</p>
                      <p className="font-semibold">{fmtPct(r.max_ltarv)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Rate</p>
                      <p className="font-semibold">{fmtRate(r.estimated_rate_pct)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Points</p>
                      <p className="font-semibold">{r.estimated_points != null ? r.estimated_points.toFixed(2) : "—"}</p>
                    </div>
                  </div>
                )}
                {r.applied_adjusters.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Rate adjusters applied</p>
                    <ul className="text-xs space-y-0.5">
                      {r.applied_adjusters.map((a, i) => (
                        <li key={i}>
                          {a.name}: {a.rate_bps > 0 ? `+${a.rate_bps}` : a.rate_bps}bps rate
                          {a.points_bps !== 0 ? `, ${a.points_bps > 0 ? "+" : ""}${a.points_bps}bps points` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.boundary_warnings.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs uppercase tracking-wide text-amber-700 mb-1">Boundary warnings</p>
                    <ul className="text-xs space-y-0.5 text-amber-900">
                      {r.boundary_warnings.map((w, i) => (
                        <li key={i}>{w.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.failure_reasons.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs uppercase tracking-wide text-destructive mb-1">Why ineligible</p>
                    <ul className="text-xs space-y-0.5">
                      {r.failure_reasons.map((f, i) => (
                        <li key={i}>
                          <span className="font-medium">{f.field}</span>: {f.rule}
                          {f.expected != null && (
                            <span className="text-muted-foreground"> (expected {Array.isArray(f.expected) ? f.expected.join(", ") : f.expected}, got {f.actual})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent evaluations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.slice(0, 10).map((e) => (
              <Link
                key={e.id}
                href={`/dashboard/evaluate/${e.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-accent text-sm transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {e.additional_params?.borrower_name ?? "(no borrower)"}
                    <span className="font-normal text-muted-foreground ml-2">
                      {fmtCurrency(e.loan_amount)} {e.loan_type} • {e.property_type} • {e.location}
                    </span>
                  </p>
                  {e.additional_params?.property_address && (
                    <p className="text-xs text-muted-foreground truncate">{e.additional_params.property_address}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(e.evaluated_at).toLocaleDateString()}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
