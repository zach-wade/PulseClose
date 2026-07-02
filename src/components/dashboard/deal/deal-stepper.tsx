"use client";

// The Deal analyzer stepper (UX-REDESIGN-PLAN §2). Replaces the two-engine wall
// (`Deal scenario` form stacked on the `Underwriting Workbench`) with ONE Deal
// object moving through 5 steps:
//   ① Terms (shared, entered once) → ② Eligibility (evaluate engine; verify-only
//   stops here) → ③ Sizing (opt-in) → ④ Judgment (opt-in AI) → ⑤ Hand off.
// Editing a Term marks ②/③ "stale — re-run" instead of leaving them silently
// wrong. ③/④ are opt-in, so a verify-only lender never sees sizing inputs.
//
// No new tables / APIs: ② POSTs /api/evaluate (deal_evaluations), ③ POSTs
// /api/underwrite (uw_models), ④ POSTs /api/underwrite/[id]/judge — all reused
// verbatim. The engine sizes + the human decides; AI narrates, never sets the
// number (it's gated behind an explicit "Run AI judgment").

import { useReducer, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Term } from "@/components/ui/term";
import { Counterfactual } from "@/components/validation/counterfactual";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateSelect } from "@/components/ui/state-select";
import { ChevronRight, Ruler, Sparkles } from "lucide-react";
import { EvaluateScenarios } from "@/components/dashboard/evaluate-scenarios";
import { DocIngest, type IngestExtraction } from "@/components/dashboard/doc-ingest";
import { enumLabel } from "@/lib/format/labels";
import {
  type Deal,
  type DealTerms,
  type SizingTerms,
  type JudgmentContext,
  type EligibilityResult,
  type SizingResult,
  type PerInvestorSizing,
  type Judgment,
  type DimensionRead,
  type DealPrefill,
  emptyDeal,
  hashTerms,
  hashSizing,
  defaultSizingConstraintsFromResults,
  numOrNull,
  usd,
  ratioPct,
  mult,
  loosePct,
  rate2,
  LOAN_TYPES,
  PROPERTY_TYPES,
  OCCUPANCIES,
  LOAN_PURPOSES,
} from "@/lib/deal/view-model";
import { StructuredSizing } from "@/components/dashboard/deal/structured-sizing";
import { sizingModeForLoanType, type SizeDealResult, type SizingMode } from "@/lib/underwriting/dispatch";

type StepId = "terms" | "eligibility" | "sizing" | "judgment" | "handoff";

// ── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: "setTerm"; key: keyof DealTerms; value: string | boolean }
  | { type: "setSizing"; key: keyof SizingTerms; value: string }
  | { type: "setJudgmentCtx"; key: keyof JudgmentContext; value: string }
  | { type: "runStart"; step: "eligibility" | "sizing" | "judgment" }
  | { type: "eligibilityDone"; evaluationId: string | null; results: EligibilityResult[]; hash: string }
  | { type: "sizingDone"; uwModelId: string | null; sizing: SizingResult | null; mode: SizingMode | null; structured: SizeDealResult | null; perInvestor: PerInvestorSizing[]; hash: string }
  | { type: "judgmentDone"; judgment: Judgment }
  | { type: "runError"; step: "eligibility" | "sizing" | "judgment"; error: string }
  | { type: "optInSizing" }
  | { type: "optInJudgment" }
  | { type: "clearError" };

function reducer(d: Deal, a: Action): Deal {
  switch (a.type) {
    case "setTerm": {
      const terms = { ...d.terms, [a.key]: a.value };
      const h = hashTerms(terms);
      const steps = { ...d.steps };
      if (d.computedFrom.eligibility && d.steps.eligibility === "done" && h !== d.computedFrom.eligibility)
        steps.eligibility = "stale";
      if (d.computedFrom.sizing && d.steps.sizing === "done" && !d.computedFrom.sizing.startsWith(h + "|"))
        steps.sizing = "stale";
      return { ...d, terms, steps };
    }
    case "setSizing": {
      const sizing = { ...d.sizing, [a.key]: a.value };
      const combined = hashTerms(d.terms) + "|" + hashSizing(sizing);
      const steps = { ...d.steps };
      if (d.computedFrom.sizing && d.steps.sizing === "done" && combined !== d.computedFrom.sizing)
        steps.sizing = "stale";
      return { ...d, sizing, steps };
    }
    case "setJudgmentCtx":
      return { ...d, judgmentCtx: { ...d.judgmentCtx, [a.key]: a.value } };
    case "runStart":
      return { ...d, error: null, steps: { ...d.steps, [a.step]: "running" } };
    case "eligibilityDone":
      return {
        ...d,
        evaluation_id: a.evaluationId,
        eligibilityResults: a.results,
        computedFrom: { ...d.computedFrom, eligibility: a.hash },
        steps: { ...d.steps, eligibility: "done" },
      };
    case "sizingDone":
      return {
        ...d,
        uw_model_id: a.uwModelId,
        sizingResult: a.sizing,
        mode: a.mode,
        structured: a.structured,
        perInvestor: a.perInvestor,
        judgmentResult: null, // a fresh size invalidates any prior judgment
        computedFrom: { ...d.computedFrom, sizing: a.hash },
        steps: {
          ...d.steps,
          sizing: "done",
          judgment: d.optedInJudgment ? "ready" : "untouched",
        },
      };
    case "judgmentDone":
      return { ...d, judgmentResult: a.judgment, steps: { ...d.steps, judgment: "done" } };
    case "runError":
      return { ...d, error: a.error, steps: { ...d.steps, [a.step]: "error" } };
    case "optInSizing": {
      const defaults = defaultSizingConstraintsFromResults(d.eligibilityResults);
      const sizing = defaults ? { ...d.sizing, ...defaults } : d.sizing;
      return { ...d, optedInSizing: true, sizing, steps: { ...d.steps, sizing: "ready" } };
    }
    case "optInJudgment":
      return { ...d, optedInJudgment: true, steps: { ...d.steps, judgment: "ready" } };
    case "clearError":
      return { ...d, error: null };
  }
}

// ── API body helpers ────────────────────────────────────────────────────────

function termsToApi(t: DealTerms) {
  return {
    loan_type: t.loan_type,
    property_type: t.property_type,
    property_state: t.property_state,
    purchase_price: numOrNull(t.purchase_price),
    loan_amount: Number(t.loan_amount),
    arv: numOrNull(t.arv),
    rehab_budget: numOrNull(t.rehab_budget),
    borrower_fico: numOrNull(t.borrower_fico),
    borrower_experience: t.borrower_experience ? Number(t.borrower_experience) : 0,
    occupancy: t.occupancy,
    loan_purpose: t.loan_purpose,
    is_rural: t.is_rural,
    borrower_name: t.borrower_name || null,
    property_address: t.property_address || null,
  };
}

// ── Container ───────────────────────────────────────────────────────────────

export function DealStepper({
  prefill,
  investorCount,
  onEvaluated,
  resume,
}: {
  prefill: DealPrefill;
  investorCount: number | null;
  onEvaluated?: () => void;
  // When present, the stepper resumes a saved evaluation (eligibility + sizing
  // + judgment already done) rather than starting empty (evaluate/[id]).
  resume?: Deal;
}) {
  const [deal, dispatch] = useReducer(reducer, null as unknown as Deal, () => resume ?? emptyDeal(prefill));
  const [active, setActive] = useState<StepId>(
    resume?.steps.sizing === "done" ? "sizing" : resume?.steps.eligibility === "done" ? "eligibility" : "terms",
  );

  async function runEligibility() {
    dispatch({ type: "runStart", step: "eligibility" });
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...termsToApi(deal.terms), validation_id: deal.validation_id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      dispatch({
        type: "eligibilityDone",
        evaluationId: json.evaluation_id ?? null,
        results: json.results ?? [],
        hash: hashTerms(deal.terms),
      });
      setActive("eligibility");
      onEvaluated?.();
    } catch (err) {
      dispatch({ type: "runError", step: "eligibility", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runSizing() {
    dispatch({ type: "runStart", step: "sizing" });
    try {
      const s = deal.sizing;
      const res = await fetch("/api/underwrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...termsToApi(deal.terms),
          deal_name: deal.terms.borrower_name || null,
          current_noi: numOrNull(s.current_noi),
          stabilized_noi: numOrNull(s.stabilized_noi),
          going_in_cap_rate: numOrNull(s.going_in_cap),
          exit_cap_rate: numOrNull(s.exit_cap),
          rate: numOrNull(s.rate),
          amortization_months: numOrNull(s.amort_months),
          closing_costs: numOrNull(s.closing_costs),
          max_ltv: numOrNull(s.max_ltv),
          max_ltc: numOrNull(s.max_ltc),
          max_ltarv: numOrNull(s.max_ltarv),
          min_dscr: numOrNull(s.min_dscr),
          min_debt_yield: numOrNull(s.min_debt_yield),
          coverage_basis: s.coverage_basis,
          term_months: numOrNull(s.term_months),
          takeout_max_ltv: numOrNull(s.takeout_max_ltv),
          takeout_min_dscr: numOrNull(s.takeout_min_dscr),
          takeout_rate: numOrNull(s.takeout_rate),
          months_to_stabilize: numOrNull(s.months_to_stabilize),
          // structured-mode inputs (RTL / ground-up / DSCR). Percent fields are
          // sent as-is; the API normalizes >1 as a percent.
          as_is_value: numOrNull(s.as_is_value),
          purchase_advance_pct: numOrNull(s.purchase_advance_pct),
          rehab_funding_pct: numOrNull(s.rehab_funding_pct),
          prepaid_interest_months: numOrNull(s.prepaid_interest_months),
          closing_costs_pct: numOrNull(s.closing_costs_pct),
          tier: numOrNull(s.tier),
          rehab_type: s.rehab_type || null,
          construction_budget: numOrNull(s.construction_budget),
          reserve_months: numOrNull(s.reserve_months),
          reserve_discount: numOrNull(s.reserve_discount),
          construction_holdback_pct: numOrNull(s.construction_holdback_pct),
          origination_fee_pct: numOrNull(s.origination_fee_pct),
          fixed_closing_costs: numOrNull(s.fixed_closing_costs),
          monthly_rent: numOrNull(s.monthly_rent),
          target_dscr: numOrNull(s.target_dscr),
          monthly_taxes: numOrNull(s.monthly_taxes),
          monthly_insurance: numOrNull(s.monthly_insurance),
          monthly_hoa: numOrNull(s.monthly_hoa),
          property_value: numOrNull(s.property_value),
          deal_evaluation_id: deal.evaluation_id,
          validation_id: deal.validation_id,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      dispatch({
        type: "sizingDone",
        uwModelId: json.uw_model_id ?? null,
        sizing: json.sizing ?? null,
        mode: json.mode ?? null,
        structured: json.structured ?? null,
        perInvestor: json.per_investor ?? [],
        hash: hashTerms(deal.terms) + "|" + hashSizing(deal.sizing),
      });
    } catch (err) {
      dispatch({ type: "runError", step: "sizing", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runJudgment() {
    if (!deal.uw_model_id) return;
    dispatch({ type: "runStart", step: "judgment" });
    try {
      const c = deal.judgmentCtx;
      const res = await fetch(`/api/underwrite/${deal.uw_model_id}/judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            sponsor: c.sponsor || undefined,
            market: c.market || undefined,
            businessPlan: c.businessPlan || undefined,
            notes: c.notes || undefined,
          },
          redactNames: {
            borrower_name: deal.terms.borrower_name || null,
            property_address: deal.terms.property_address || null,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      dispatch({ type: "judgmentDone", judgment: json.judgment });
    } catch (err) {
      dispatch({ type: "runError", step: "judgment", error: err instanceof Error ? err.message : String(err) });
    }
  }

  const canHandoff =
    (deal.eligibilityResults?.some((r) => r.result !== "fail") ?? false) || deal.steps.sizing === "done";

  return (
    <div className="space-y-5">
      <DealSpine deal={deal} active={active} canHandoff={canHandoff} onNavigate={setActive} />

      {deal.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {deal.error}
        </div>
      )}

      {active === "terms" && (
        <StepTerms
          deal={deal}
          dispatch={dispatch}
          investorCount={investorCount}
          onEvaluate={runEligibility}
        />
      )}
      {active === "eligibility" && (
        <StepEligibility deal={deal} dispatch={dispatch} onReEvaluate={runEligibility} onGoSizing={() => setActive("sizing")} onGoHandoff={() => setActive("handoff")} />
      )}
      {active === "sizing" && (
        <StepSizing deal={deal} dispatch={dispatch} onSize={runSizing} onGoJudgment={() => setActive("judgment")} onGoHandoff={() => setActive("handoff")} />
      )}
      {active === "judgment" && (
        <StepJudgment deal={deal} dispatch={dispatch} onJudge={runJudgment} onGoHandoff={() => setActive("handoff")} />
      )}
      {active === "handoff" && <StepHandoff deal={deal} />}
    </div>
  );
}

// ── Progress spine ────────────────────────────────────────────────────────

const STEP_LABELS: { id: StepId; n: number; label: string }[] = [
  { id: "terms", n: 1, label: "Terms" },
  { id: "eligibility", n: 2, label: "Eligibility" },
  { id: "sizing", n: 3, label: "Sizing" },
  { id: "judgment", n: 4, label: "Judgment" },
  { id: "handoff", n: 5, label: "Hand off" },
];

function statusDot(status: Deal["steps"]["eligibility"] | "ready" | undefined): string {
  switch (status) {
    case "done":
      return "bg-emerald-500";
    case "stale":
      return "bg-amber-500";
    case "running":
      return "bg-info animate-pulse";
    case "error":
      return "bg-destructive";
    case "ready":
      return "bg-info/40";
    default:
      return "bg-muted-foreground/30";
  }
}

function DealSpine({
  deal,
  active,
  canHandoff,
  onNavigate,
}: {
  deal: Deal;
  active: StepId;
  canHandoff: boolean;
  onNavigate: (s: StepId) => void;
}) {
  const enabled: Record<StepId, boolean> = {
    terms: true,
    eligibility: true,
    sizing: deal.optedInSizing,
    judgment: deal.optedInJudgment,
    handoff: canHandoff,
  };
  const statusFor = (id: StepId) =>
    id === "terms"
      ? undefined
      : id === "handoff"
        ? canHandoff
          ? "ready"
          : undefined
        : deal.steps[id as "eligibility" | "sizing" | "judgment"];

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEP_LABELS.map((s, i) => {
            const isEnabled = enabled[s.id];
            const isActive = active === s.id;
            const optional = s.id === "sizing" || s.id === "judgment";
            return (
              <div key={s.id} className="flex items-center">
                <button
                  type="button"
                  disabled={!isEnabled}
                  onClick={() => isEnabled && onNavigate(s.id)}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    isActive ? "bg-foreground text-background" : isEnabled ? "hover:bg-accent" : "opacity-40 cursor-not-allowed"
                  }`}
                  title={!isEnabled && optional ? "Opt in from the previous step" : undefined}
                >
                  <span className={`h-2 w-2 rounded-full ${isActive ? "bg-background" : statusDot(statusFor(s.id))}`} />
                  <span className="font-medium">{s.n}. {s.label}</span>
                  {optional && <span className={`text-[10px] ${isActive ? "text-background/70" : "text-muted-foreground"}`}>optional</span>}
                </button>
                {i < STEP_LABELS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function selectCls() {
  return "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm";
}

function StaleBanner({ onRerun, running }: { onRerun: () => void; running: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm">
      <span className="text-amber-900">Terms changed since this ran — results may be out of date.</span>
      <Button size="sm" variant="outline" onClick={onRerun} disabled={running}>
        {running ? "Re-running…" : "Re-run"}
      </Button>
    </div>
  );
}

function ResultBadge({ result }: { result: "pass" | "conditional" | "fail" }) {
  if (result === "pass") return <Badge className="bg-emerald-500/90 text-white hover:bg-emerald-500">Eligible</Badge>;
  if (result === "conditional") return <Badge className="bg-amber-500/90 text-white hover:bg-amber-500">Conditional</Badge>;
  return <Badge variant="destructive">Ineligible</Badge>;
}

// ── ① Terms ──────────────────────────────────────────────────────────────────

function StepTerms({
  deal,
  dispatch,
  investorCount,
  onEvaluate,
}: {
  deal: Deal;
  dispatch: React.Dispatch<Action>;
  investorCount: number | null;
  onEvaluate: () => void;
}) {
  const t = deal.terms;
  const set = (key: keyof DealTerms, value: string | boolean) => dispatch({ type: "setTerm", key, value });
  const running = deal.steps.eligibility === "running";

  // Pre-fill the terms from a dropped loan package (Noah: "the less you ask the
  // borrower, the better"). as-is/ARV/rehab/loan/FICO are appraisal/package
  // data that can't be pulled from any API — ingesting them is the only way to
  // avoid re-keying. The lender can edit anything after.
  function applyExtraction(d: IngestExtraction) {
    const apply = (key: keyof DealTerms, v: string | null | undefined) => {
      if (v != null && v !== "") set(key, v);
    };
    const num = (n: number | null) => (n != null ? String(n) : null);
    apply("loan_amount", num(d.loan_amount));
    apply("purchase_price", num(d.purchase_price ?? d.as_is_value));
    apply("arv", num(d.arv));
    apply("rehab_budget", num(d.rehab_budget));
    apply("borrower_fico", num(d.fico));
    apply("borrower_name", d.borrower_name);
    apply("property_address", d.property_addresses?.[0]);
    // Pre-fill the Sizing step's economics too (#25) — NOI / cap rate are
    // package-only data the appraisal/pro-forma carries. Threaded straight into
    // deal.sizing so opting into Sizing later shows them filled (the investor-cap
    // defaults only touch LTV/LTC/LTARV/DSCR, so these survive). Derive going-in
    // cap from NOI ÷ as-is when the doc states NOI but not a cap rate.
    const setSize = (key: keyof SizingTerms, v: string | null | undefined) => {
      if (v != null && v !== "") dispatch({ type: "setSizing", key, value: v });
    };
    const asIs = d.as_is_value ?? d.purchase_price;
    const derivedGoingIn =
      d.going_in_cap_rate == null && d.current_noi != null && asIs != null && asIs > 0
        ? Number(((d.current_noi / asIs) * 100).toFixed(2))
        : d.going_in_cap_rate;
    setSize("current_noi", num(d.current_noi));
    setSize("stabilized_noi", num(d.stabilized_noi));
    setSize("going_in_cap", num(derivedGoingIn));
    setSize("exit_cap", num(d.exit_cap_rate));
    // Property state from the first address ("…, Costa Mesa, CA 92627").
    const st = d.property_addresses?.[0]?.match(/\b([A-Z]{2})\b(?:\s+\d{5})?\s*$/)?.[1];
    apply("property_state", st);
    // Map the extractor's enums onto the stepper's allowed values; skip when
    // there's no clean match (lender picks from the dropdown).
    const ptMap: Record<string, string> = {
      sfr: "sfr", condo: "condo", mixed_use: "mixed_use", multifamily: "small_multifamily",
    };
    if (d.property_type && ptMap[d.property_type]) set("property_type", ptMap[d.property_type]);
    const lpMap: Record<string, string> = { purchase: "purchase", refinance: "refinance" };
    if (d.loan_purpose && lpMap[d.loan_purpose]) set("loan_purpose", lpMap[d.loan_purpose]);
    const ltMap: Record<string, string> = { construction: "ground_up", bridge: "bridge" };
    if (d.loan_purpose && ltMap[d.loan_purpose]) set("loan_type", ltMap[d.loan_purpose]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">① Terms</CardTitle>
        <p className="text-muted-foreground text-xs">
          The shared deal parameters — entered once. Eligibility and Sizing both read these; you never re-type them.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <DocIngest onExtracted={applyExtraction} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="loan_type">Loan type</Label>
            <select id="loan_type" className={selectCls()} value={t.loan_type} onChange={(e) => set("loan_type", e.target.value)}>
              {LOAN_TYPES.map((lt) => <option key={lt} value={lt}>{enumLabel(lt)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property_type">Property type</Label>
            <select id="property_type" className={selectCls()} value={t.property_type} onChange={(e) => set("property_type", e.target.value)}>
              {PROPERTY_TYPES.map((pt) => <option key={pt} value={pt}>{enumLabel(pt)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property_state">State</Label>
            <StateSelect id="property_state" value={t.property_state} onChange={(v) => set("property_state", v)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchase_price">Purchase price</Label>
            <Input id="purchase_price" type="number" value={t.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan_amount">Loan amount *</Label>
            <Input id="loan_amount" type="number" value={t.loan_amount} onChange={(e) => set("loan_amount", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="arv">ARV</Label>
            <Input id="arv" type="number" value={t.arv} onChange={(e) => set("arv", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rehab_budget">Rehab budget</Label>
            <Input id="rehab_budget" type="number" value={t.rehab_budget} onChange={(e) => set("rehab_budget", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="borrower_fico">Borrower FICO</Label>
            <Input id="borrower_fico" type="number" value={t.borrower_fico} onChange={(e) => set("borrower_fico", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="borrower_experience">Experience (deals completed)</Label>
            <Input id="borrower_experience" type="number" value={t.borrower_experience} onChange={(e) => set("borrower_experience", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="occupancy">Occupancy</Label>
            <select id="occupancy" className={selectCls()} value={t.occupancy} onChange={(e) => set("occupancy", e.target.value)}>
              {OCCUPANCIES.map((o) => <option key={o} value={o}>{enumLabel(o)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan_purpose">Loan purpose</Label>
            <select id="loan_purpose" className={selectCls()} value={t.loan_purpose} onChange={(e) => set("loan_purpose", e.target.value)}>
              {LOAN_PURPOSES.map((lp) => <option key={lp} value={lp}>{enumLabel(lp)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={t.is_rural} onChange={(e) => set("is_rural", e.target.checked)} />
              <span className="text-sm">Rural property</span>
            </label>
          </div>
          <div className="space-y-1.5 col-span-2 md:col-span-3">
            <Label htmlFor="property_address">Property address (optional)</Label>
            <Input id="property_address" value={t.property_address} onChange={(e) => set("property_address", e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2 md:col-span-3">
            <Label htmlFor="borrower_name">Borrower (optional)</Label>
            <Input id="borrower_name" value={t.borrower_name} onChange={(e) => set("borrower_name", e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={onEvaluate} disabled={running || investorCount === 0 || !t.loan_amount}>
            {running ? "Evaluating…" : "Evaluate against investors"}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── ② Eligibility ────────────────────────────────────────────────────────────

function StepEligibility({
  deal,
  dispatch,
  onReEvaluate,
  onGoSizing,
  onGoHandoff,
}: {
  deal: Deal;
  dispatch: React.Dispatch<Action>;
  onReEvaluate: () => void;
  onGoSizing: () => void;
  onGoHandoff: () => void;
}) {
  const results = deal.eligibilityResults;
  const sorted = results
    ? [...results].sort((a, b) => {
        const order: Record<string, number> = { pass: 0, conditional: 1, fail: 2 };
        if (order[a.result] !== order[b.result]) return order[a.result] - order[b.result];
        return (a.estimated_rate_pct ?? Infinity) - (b.estimated_rate_pct ?? Infinity);
      })
    : null;
  const anyEligible = sorted?.some((r) => r.result !== "fail") ?? false;

  if (!sorted) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Run an evaluation from <button className="underline" onClick={() => dispatch({ type: "clearError" })}>① Terms</button> to see which investors accept this deal.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">② Eligibility — which investors accept this?</CardTitle>
        <p className="text-muted-foreground text-xs">Best execution first. A verify-only deal can stop here and head to hand off.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {deal.steps.eligibility === "stale" && <StaleBanner onRerun={onReEvaluate} running={false} />}
        {sorted.map((r) => (
          <div
            key={r.investor_id}
            className={`rounded-md border p-3 ${
              r.result === "pass" ? "border-emerald-200 bg-emerald-50/30" : r.result === "conditional" ? "border-amber-200 bg-amber-50/30" : "border-destructive/30 bg-destructive/5"
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
                <Field label={<>Max <Term>LTV</Term></>} value={loosePct(r.max_ltv)} />
                <Field label={<>Max <Term>LTC</Term></>} value={loosePct(r.max_ltc)} />
                <Field label={<>Max <Term>LTARV</Term></>} value={loosePct(r.max_ltarv)} />
                <Field label="Rate" value={rate2(r.estimated_rate_pct)} />
                <Field label="Points" value={r.estimated_points != null ? r.estimated_points.toFixed(2) : "—"} />
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

        {/* Scenario comparison + rate stress (reused) */}
        {sorted.length > 0 && (
          <EvaluateScenarios
            baseResults={sorted}
            deal={{
              loan_type: deal.terms.loan_type,
              property_type: deal.terms.property_type,
              property_state: deal.terms.property_state,
              purchase_price: numOrNull(deal.terms.purchase_price),
              loan_amount: Number(deal.terms.loan_amount),
              arv: numOrNull(deal.terms.arv),
              rehab_budget: numOrNull(deal.terms.rehab_budget),
              borrower_fico: numOrNull(deal.terms.borrower_fico),
              borrower_experience: deal.terms.borrower_experience ? Number(deal.terms.borrower_experience) : 0,
              occupancy: deal.terms.occupancy,
              loan_purpose: deal.terms.loan_purpose,
              is_rural: deal.terms.is_rural,
              borrower_name: deal.terms.borrower_name || null,
              property_address: deal.terms.property_address || null,
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {!deal.optedInSizing ? (
            <Button variant="outline" onClick={() => { dispatch({ type: "optInSizing" }); onGoSizing(); }}>
              <Ruler className="mr-1.5 h-4 w-4" /> Size this deal
            </Button>
          ) : (
            <Button variant="outline" onClick={onGoSizing}>
              <Ruler className="mr-1.5 h-4 w-4" /> Go to sizing
            </Button>
          )}
          {anyEligible && (
            <Button onClick={onGoHandoff}>
              Ready for handoff <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── ③ Sizing ─────────────────────────────────────────────────────────────────

function StepSizing({
  deal,
  dispatch,
  onSize,
  onGoJudgment,
  onGoHandoff,
}: {
  deal: Deal;
  dispatch: React.Dispatch<Action>;
  onSize: () => void;
  onGoJudgment: () => void;
  onGoHandoff: () => void;
}) {
  const s = deal.sizing;
  const set = (key: keyof SizingTerms, value: string) => dispatch({ type: "setSizing", key, value });
  const running = deal.steps.sizing === "running";
  const sizing = deal.sizingResult;
  const maxLadder = sizing ? Math.max(...sizing.constraints.map((c) => c.maxLoan)) : 0;
  const hadDefaults = defaultSizingConstraintsFromResults(deal.eligibilityResults) != null;
  // Resolve the sizing mode from the loan type + economics (mirrors the API).
  const mode = sizingModeForLoanType(deal.terms.loan_type, {
    rehabBudget: numOrNull(deal.terms.rehab_budget) ?? undefined,
    asIsValue: numOrNull(s.as_is_value) ?? undefined,
    constructionBudget: numOrNull(s.construction_budget) ?? undefined,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Ruler className="h-4 w-4 text-info" /> ③ Sizing — how big, and what binds it?</CardTitle>
        <p className="text-muted-foreground text-xs">
          Max loan = the minimum across LTV / LTC / LTARV / DSCR / debt-yield. Leverage caps default from your matched investors{hadDefaults ? "" : " (none matched — house defaults shown)"}; DSCR / debt-yield are house floors.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {deal.steps.sizing === "stale" && <StaleBanner onRerun={onSize} running={running} />}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NumField id="uw_noi" label={<><Term term="NOI">In-place NOI</Term> *</>} value={s.current_noi} onChange={(v) => set("current_noi", v)} placeholder="600000" />
          <NumField id="uw_snoi" label={<Term term="NOI">Stabilized NOI</Term>} value={s.stabilized_noi} onChange={(v) => set("stabilized_noi", v)} placeholder="1200000" />
          <NumField id="uw_gcap" label={<><Term term="going-in cap">Going-in cap</Term> %</>} step="0.1" value={s.going_in_cap} onChange={(v) => set("going_in_cap", v)} />
          <NumField id="uw_ecap" label={<><Term term="exit cap">Exit cap</Term> %</>} step="0.1" value={s.exit_cap} onChange={(v) => set("exit_cap", v)} />
          <NumField id="uw_rate" label="Rate %" step="0.05" value={s.rate} onChange={(v) => set("rate", v)} />
          <NumField id="uw_amort" label="Amort. months (blank = IO)" value={s.amort_months} onChange={(v) => set("amort_months", v)} placeholder="IO" />
          <NumField id="uw_closing" label="Closing costs" value={s.closing_costs} onChange={(v) => set("closing_costs", v)} />
          <div className="space-y-1.5">
            <Label htmlFor="uw_basis">Coverage basis</Label>
            <select id="uw_basis" className={selectCls()} value={s.coverage_basis} onChange={(e) => set("coverage_basis", e.target.value)}>
              <option value="current">Current NOI</option>
              <option value="stabilized">Stabilized NOI</option>
            </select>
          </div>
        </div>

        {/* Mode-specific inputs (UX-2). The loan type routes to a deal-type sizer;
            these fields feed it. Bridge uses the NOI/cap economics above. Purchase
            price / ARV / rehab / FICO come from the Terms step. */}
        {mode !== "bridge" && (
          <div className="rounded-md border border-info/30 bg-info/5 px-3 py-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-info font-medium">
              {mode === "rtl" ? "Fix & Flip / RTL sizing inputs" : mode === "construction" ? "Ground-Up Construction sizing inputs" : "DSCR (Rental) sizing inputs"}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {mode === "rtl" && (
                <>
                  <NumField id="rtl_aiv" label="As-is value" value={s.as_is_value} onChange={(v) => set("as_is_value", v)} placeholder="2480000" />
                  <NumField id="rtl_adv" label="Purchase advance %" step="0.5" value={s.purchase_advance_pct} onChange={(v) => set("purchase_advance_pct", v)} placeholder="89" />
                  <NumField id="rtl_fund" label="Rehab funding %" value={s.rehab_funding_pct} onChange={(v) => set("rehab_funding_pct", v)} placeholder="100" />
                  <NumField id="rtl_prepaid" label="Prepaid interest (mo)" value={s.prepaid_interest_months} onChange={(v) => set("prepaid_interest_months", v)} placeholder="1" />
                  <NumField id="rtl_close" label="Closing costs %" step="0.1" value={s.closing_costs_pct} onChange={(v) => set("closing_costs_pct", v)} placeholder="0.2" />
                  <div className="space-y-1.5">
                    <Label htmlFor="rtl_tier">Borrower tier</Label>
                    <select id="rtl_tier" className={selectCls()} value={s.tier} onChange={(e) => set("tier", e.target.value)}>
                      <option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rtl_rehab_type">Rehab type</Label>
                    <select id="rtl_rehab_type" className={selectCls()} value={s.rehab_type} onChange={(e) => set("rehab_type", e.target.value)}>
                      <option value="Light">Light</option><option value="Moderate">Moderate</option><option value="Heavy">Heavy</option>
                    </select>
                  </div>
                </>
              )}
              {mode === "construction" && (
                <>
                  <NumField id="con_budget" label="Construction budget" value={s.construction_budget} onChange={(v) => set("construction_budget", v)} placeholder="2178318" />
                  <NumField id="con_aiv" label="As-is value" value={s.as_is_value} onChange={(v) => set("as_is_value", v)} placeholder="1400000" />
                  <NumField id="con_adv" label="Initial advance %" step="0.5" value={s.purchase_advance_pct} onChange={(v) => set("purchase_advance_pct", v)} placeholder="20" />
                  <NumField id="con_hold" label="Construction holdback %" value={s.construction_holdback_pct} onChange={(v) => set("construction_holdback_pct", v)} placeholder="100" />
                  <NumField id="con_rmo" label="Interest-reserve months" value={s.reserve_months} onChange={(v) => set("reserve_months", v)} placeholder="18" />
                  <NumField id="con_rdisc" label="Reserve draw-weight %" value={s.reserve_discount} onChange={(v) => set("reserve_discount", v)} placeholder="78" />
                  <NumField id="con_orig" label="Origination fee %" step="0.1" value={s.origination_fee_pct} onChange={(v) => set("origination_fee_pct", v)} placeholder="2" />
                  <NumField id="con_fixed" label="Fixed closing costs" value={s.fixed_closing_costs} onChange={(v) => set("fixed_closing_costs", v)} placeholder="5000" />
                </>
              )}
              {mode === "dscr" && (
                <>
                  <NumField id="dscr_rent" label="Monthly rent" value={s.monthly_rent} onChange={(v) => set("monthly_rent", v)} placeholder="3000" />
                  <NumField id="dscr_target" label="Target DSCR" step="0.05" value={s.target_dscr} onChange={(v) => set("target_dscr", v)} placeholder="1.20" />
                  <NumField id="dscr_tax" label="Monthly taxes" value={s.monthly_taxes} onChange={(v) => set("monthly_taxes", v)} placeholder="300" />
                  <NumField id="dscr_ins" label="Monthly insurance" value={s.monthly_insurance} onChange={(v) => set("monthly_insurance", v)} placeholder="120" />
                  <NumField id="dscr_hoa" label="Monthly HOA" value={s.monthly_hoa} onChange={(v) => set("monthly_hoa", v)} placeholder="0" />
                  <NumField id="dscr_val" label="Property value (LTV)" value={s.property_value} onChange={(v) => set("property_value", v)} placeholder="500000" />
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">Rate {mode === "dscr" ? "+ amortization months" : ""} above; purchase price / ARV / rehab / FICO from the Terms step.</p>
          </div>
        )}
        {/* Progressive disclosure (UX-REDESIGN §10 #3): the 10 advanced caps +
            exit/takeout inputs default from the matched investors, so a basic
            user never has to touch them. Collapsed by default → the sizing step
            opens as ~8 core economics fields, not an 18-field wall. Children stay
            mounted (just hidden), so values + the size computation are unaffected. */}
        <details className="group rounded-md border border-border/60 bg-muted/20">
          <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Advanced — house caps + exit/takeout (defaulted from your matched investors; open to override)
          </summary>
          <div className="space-y-4 px-3 pb-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">House sizing constraints (defaulted from matched investors; override as needed)</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <NumField id="uw_mltv" label={<><Term>LTV</Term> max %</>} value={s.max_ltv} onChange={(v) => set("max_ltv", v)} />
                <NumField id="uw_mltc" label={<><Term>LTC</Term> max %</>} value={s.max_ltc} onChange={(v) => set("max_ltc", v)} />
                <NumField id="uw_mltarv" label={<><Term>LTARV</Term> max %</>} value={s.max_ltarv} onChange={(v) => set("max_ltarv", v)} />
                <NumField id="uw_dscr" label={<>Min <Term>DSCR</Term></>} step="0.05" value={s.min_dscr} onChange={(v) => set("min_dscr", v)} />
                <NumField id="uw_dy" label={<>Min <Term term="debt yield">debt yield</Term> %</>} step="0.1" value={s.min_debt_yield} onChange={(v) => set("min_debt_yield", v)} />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Exit / takeout assumptions (the permanent loan that repays the bridge — you govern the exit)</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <NumField id="uw_term" label="Bridge term (mo)" value={s.term_months} onChange={(v) => set("term_months", v)} placeholder="24" />
                <NumField id="uw_tltv" label={<>Perm max <Term>LTV</Term> %</>} value={s.takeout_max_ltv} onChange={(v) => set("takeout_max_ltv", v)} placeholder="70" />
                <NumField id="uw_tdscr" label={<>Perm min <Term>DSCR</Term></>} step="0.05" value={s.takeout_min_dscr} onChange={(v) => set("takeout_min_dscr", v)} placeholder="1.25" />
                <NumField id="uw_trate" label="Perm rate % (blank = est.)" step="0.05" value={s.takeout_rate} onChange={(v) => set("takeout_rate", v)} placeholder="auto" />
                <NumField id="uw_stab" label="Months to stabilize" value={s.months_to_stabilize} onChange={(v) => set("months_to_stabilize", v)} placeholder="18" />
              </div>
            </div>
          </div>
        </details>

        <div className="flex justify-end">
          <Button onClick={onSize} disabled={running}>{running ? "Sizing…" : "Size loan"}</Button>
        </div>

        {/* Structured (RTL / construction / DSCR) result — Excel-parity layout. */}
        {deal.structured && deal.structured.mode !== "bridge" && (
          <div className="space-y-4 pt-2 border-t border-border">
            <StructuredSizing result={deal.structured} />
          </div>
        )}

        {sizing && (
          <div className="space-y-4 pt-2 border-t border-border">
            {/* Money-tile header — lead with the answer (UX-REDESIGN §11.2
                principle 12): the dominant tile is max loan + its binding
                constraint; supporting tiles muted alongside. */}
            <div className="rounded-xl border border-info/30 bg-info/5 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Max loan · bound by {sizing.bindingConstraint}
                  </p>
                  <p className="text-2xl font-bold leading-tight">{usd(sizing.maxLoan)}</p>
                  <p className="text-xs text-muted-foreground">
                    {sizing.constraints.find((c) => c.binding)?.label ?? sizing.bindingConstraint} is the{" "}
                    <Term term="binding constraint">binding constraint</Term>
                  </p>
                </div>
                <Field label="Equity required" value={usd(sizing.equityRequired)} big />
                <Field label="As-is value" value={usd(sizing.asIsValue)} big />
                <Field label="Stabilized / ARV" value={usd(sizing.stabilizedValue)} big />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Constraint ladder — lowest permitted loan binds the deal</p>
              <div className="space-y-1.5">
                {sizing.constraints.map((c) => {
                  // Highlight the binding row; mute the in-range ones and show
                  // each one's headroom above the sized loan (§11.2 principle 11).
                  const headroom = c.maxLoan - sizing.maxLoan;
                  return (
                  <div key={c.key} className={`flex items-center gap-3 rounded-md px-2 py-1 ${c.binding ? "bg-info/10" : ""}`}>
                    <div className="w-44 shrink-0 text-sm">
                      <span className={c.binding ? "font-semibold" : "text-muted-foreground"}>{c.label}</span>
                      {c.binding && <Badge className="ml-2 bg-foreground text-background text-[10px] px-1.5 py-0">binding</Badge>}
                    </div>
                    <div className="flex-1 h-6 rounded bg-muted/40 overflow-hidden">
                      <div className={`h-full ${c.binding ? "bg-info" : "bg-info/30"}`} style={{ width: `${maxLadder > 0 ? (c.maxLoan / maxLadder) * 100 : 0}%` }} />
                    </div>
                    <div className="w-48 shrink-0 text-right text-sm">
                      <span className={c.binding ? "font-semibold" : "font-medium text-muted-foreground"}>{usd(c.maxLoan)}</span>
                      <span className="block text-[11px] text-muted-foreground">{c.binding ? c.basis : `+${usd(headroom)} headroom`}</span>
                    </div>
                  </div>
                  );
                })}
              </div>
              {/* Counterfactual — what would change the number (§11.2 principle 7). */}
              {(() => {
                const bindingC = sizing.constraints.find((c) => c.binding);
                const nextC = [...sizing.constraints]
                  .sort((a, b) => a.maxLoan - b.maxLoan)
                  .find((c) => !c.binding && c.maxLoan > sizing.maxLoan);
                if (!bindingC) return null;
                const text = nextC
                  ? `Bound by ${bindingC.label} at ${usd(sizing.maxLoan)} — relax it and ${nextC.label} binds next at ${usd(nextC.maxLoan)} (+${usd(nextC.maxLoan - sizing.maxLoan)}).`
                  : `Bound by ${bindingC.label} at ${usd(sizing.maxLoan)} — every other constraint permits more.`;
                return <Counterfactual text={text} />;
              })()}
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm pt-2 border-t border-border/50">
              <Field label={<Term term="LTV">LTV (as-is)</Term>} value={ratioPct(sizing.ltv)} />
              <Field label={<Term>LTC</Term>} value={ratioPct(sizing.ltc)} />
              <Field label={<Term term="DSCR">DSCR in-place</Term>} value={mult(sizing.dscrCurrent)} />
              <Field label={<Term term="DSCR">DSCR stab.</Term>} value={mult(sizing.dscrStabilized)} />
              <Field label={<Term>Debt yield</Term>} value={ratioPct(sizing.debtYieldCurrent)} />
              <Field label="Equity mult." value={mult(sizing.equityMultiple)} />
            </div>
            {deal.perInvestor && deal.perInvestor.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Best execution by investor — sized at each investor&apos;s caps + priced rate</p>
                <div className="space-y-1.5">
                  {deal.perInvestor.map((pi) => (
                    <div key={pi.investor_id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{pi.investor_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{pi.note}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {pi.sizing ? (
                          <>
                            <span className="text-xs text-muted-foreground w-28 text-right">
                              {ratioPct(pi.sizing.ltv)} LTV · {ratioPct(pi.sizing.ltc)} LTC
                            </span>
                            <span className="font-semibold w-24 text-right">{usd(pi.sizing.maxLoan)}</span>
                            <Badge variant="outline" className="text-[10px]" title="binding constraint">{pi.sizing.bindingConstraint}</Badge>
                            <span className="text-xs text-muted-foreground w-14 text-right">{pi.rate_used_pct != null ? `${pi.rate_used_pct.toFixed(2)}%` : "—"}</span>
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
            {sizing.takeout && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    Exit / takeout — does the permanent loan repay the bridge?
                  </p>
                  <Badge className={sizing.takeout.refinanceable ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
                    {sizing.takeout.refinanceable ? "Takeout clears the bridge" : "Takeout shorts the bridge"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Max permanent takeout</p>
                    <p className="text-lg font-bold">{usd(sizing.takeout.maxTakeout)}</p>
                    <p className="text-xs text-muted-foreground">bound by {sizing.takeout.bindingConstraint}</p>
                  </div>
                  <Field label="Bridge balance at exit" value={usd(sizing.takeout.bridgeBalanceAtExit)} big />
                  <Field label="Takeout coverage" value={`${sizing.takeout.takeoutCoverage.toFixed(2)}x`} big />
                  <Field
                    label={sizing.takeout.refinanceable ? "Cushion" : "Shortfall"}
                    value={usd(sizing.takeout.refinanceable ? sizing.takeout.cushion : sizing.takeout.shortfall)}
                    big
                  />
                </div>
                <div className="space-y-1.5">
                  {sizing.takeout.constraints.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                      <div className="w-44 shrink-0">
                        <span className={c.binding ? "font-semibold" : ""}>{c.label}</span>
                        {c.binding && <Badge className="ml-2 bg-foreground text-background text-[10px] px-1.5 py-0">binding</Badge>}
                      </div>
                      <div className="text-right">
                        <span className="font-medium">{usd(c.maxLoan)}</span>
                        <span className="block text-[11px] text-muted-foreground">{c.basis}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {sizing.takeout.flags.length > 0 && (
                  <ul className="space-y-1 pt-1 border-t border-border/50">
                    {sizing.takeout.flags.map((f, i) => (
                      <li key={i} className="text-xs text-warning-foreground flex gap-1.5">
                        <span aria-hidden>⚠</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {sizing.stabilization && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Stabilization path — years to {sizing.stabilization.targetDSCR.toFixed(2)}x DSCR</p>
                  <Badge variant="outline" className="text-[11px]">
                    {sizing.stabilization.clearsWithinHorizon
                      ? `clears in ~${(sizing.stabilization.monthsToClear! / 12).toFixed(1)} yr`
                      : "never clears in horizon"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{sizing.stabilization.summary}</p>
                <div className="grid grid-cols-5 gap-2">
                  {sizing.stabilization.years.map((y) => (
                    <div key={y.year} className={`rounded-md border px-2 py-1.5 text-center ${y.clearsTarget ? "border-success/40 bg-success/5" : "border-border"}`}>
                      <p className="text-[10px] uppercase text-muted-foreground">Yr {y.year}</p>
                      <p className={`text-sm font-semibold ${y.clearsTarget ? "text-success" : ""}`}>{mult(y.dscr)}</p>
                      <p className="text-[10px] text-muted-foreground">{usd(y.noi)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sizing.interestReserve && sizing.interestReserve.netReserve > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <p className="text-sm font-semibold">Interest reserve — carry to stabilization</p>
                {/* Lead with GROSS — the full debt service over the period, which
                    is the number a lender actually funds. Net (less projected
                    in-place income) is the realistic secondary line; leading with
                    net read as confusingly small next to monthly DS. */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="Reserve (full debt service)" value={usd(sizing.interestReserve.grossReserve)} big />
                  <Field label="Net if in-place income services debt" value={usd(sizing.interestReserve.netReserve)} />
                  <Field label="Monthly debt service" value={usd(sizing.interestReserve.monthlyDebtService)} />
                  <Field label="Reserve period" value={`${sizing.interestReserve.reserveMonths} mo`} />
                </div>
                <p className="text-xs text-muted-foreground">{sizing.interestReserve.summary}</p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {!deal.optedInJudgment ? (
                <Button variant="outline" onClick={() => { dispatch({ type: "optInJudgment" }); onGoJudgment(); }} disabled={!deal.uw_model_id}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Add AI judgment
                </Button>
              ) : (
                <Button variant="outline" onClick={onGoJudgment}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Go to judgment
                </Button>
              )}
              <Button onClick={onGoHandoff}>Ready for handoff <ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ④ Judgment ───────────────────────────────────────────────────────────────

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

// Macro indicator signal → a small colored dot (drill-down evidence behind the
// memo's regime read — the deterministic table, not AI characterization).
const MACRO_SIGNAL_DOT: Record<"supportive" | "neutral" | "caution" | "warning", string> = {
  supportive: "bg-emerald-500",
  neutral: "bg-muted-foreground/50",
  caution: "bg-amber-500",
  warning: "bg-destructive",
};

function StanceBadge({ stance }: { stance: Judgment["recommendation"]["stance"] }) {
  if (stance === "pursue") return <Badge className="bg-emerald-500/90 text-white">Pursue</Badge>;
  if (stance === "pursue-with-conditions") return <Badge className="bg-amber-500/90 text-white">Pursue with conditions</Badge>;
  return <Badge variant="destructive">Pass</Badge>;
}

function StepJudgment({
  deal,
  dispatch,
  onJudge,
  onGoHandoff,
}: {
  deal: Deal;
  dispatch: React.Dispatch<Action>;
  onJudge: () => void;
  onGoHandoff: () => void;
}) {
  const c = deal.judgmentCtx;
  const set = (key: keyof JudgmentContext, value: string) => dispatch({ type: "setJudgmentCtx", key, value });
  const [showContext, setShowContext] = useState(false);
  const judging = deal.steps.judgment === "running";
  const j = deal.judgmentResult;

  if (!deal.uw_model_id) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Size the deal in ③ first — the AI reads the engine&apos;s numbers, so a sizing model must exist before it can judge.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-info" /> ④ AI underwriting judgment</CardTitle>
        <p className="text-muted-foreground text-xs">Optional. The AI reads only the sized figures + the context you add, and judges deal structure — it never sets the loan amount.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!showContext && !j && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">Add optional context (sponsor, market, business plan, notes) to sharpen the judgment, or run it on the numbers alone.</p>
            <Button variant="outline" onClick={() => setShowContext(true)}>Add context</Button>
          </div>
        )}
        {showContext && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ContextField label="Sponsor" value={c.sponsor} onChange={(v) => set("sponsor", v)} placeholder="Track record, experience, liquidity, credit…" />
            <ContextField label="Market" value={c.market} onChange={(v) => set("market", v)} placeholder="Submarket, supply/demand, comps, location…" />
            <ContextField label="Business plan" value={c.businessPlan} onChange={(v) => set("businessPlan", v)} placeholder="The value-add thesis (rehab / lease-up)…" />
            <ContextField label="Notes" value={c.notes} onChange={(v) => set("notes", v)} placeholder="Structure quirks, exit channel, timing…" />
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={onJudge} disabled={judging}>{judging ? "Judging…" : "Run AI judgment"}</Button>
        </div>

        {j && (
          <div className="space-y-3 pt-1">
            <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
              <div>
                <p className="font-medium">{j.headline}</p>
                <p className="text-xs text-muted-foreground mt-1">{j.recommendation.rationale}</p>
              </div>
              <StanceBadge stance={j.recommendation.stance} />
            </div>
            {j.dealKillers.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs uppercase tracking-wide text-destructive mb-1">Deal-killers</p>
                <ul className="text-sm space-y-0.5 list-disc list-inside text-destructive">
                  {j.dealKillers.map((k, i) => <li key={i}>{k}</li>)}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {j.framework.map((d) => (
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
              <p className="text-sm">{j.fiveConcept}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Partner memo</p>
              <p className="text-sm whitespace-pre-line">{j.memo}</p>
              <p className="text-[11px] text-muted-foreground mt-2">Generated by {j.model}. Reviewed by a human underwriter.</p>
            </div>
            {j.macro && j.macro.indicators.length > 0 && (
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Macro context — {j.macro.regime}</p>
                  <span className="text-[11px] text-muted-foreground">{j.macro.source} · as of {j.macro.asOf}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">{j.macro.regimeBasis}</p>
                <div className="space-y-1.5">
                  {j.macro.indicators.map((ind) => (
                    <div key={ind.key} className="flex items-start gap-2 text-xs">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${MACRO_SIGNAL_DOT[ind.signal]}`} aria-label={ind.signal} />
                      <span className="w-56 shrink-0 text-muted-foreground">{ind.label}</span>
                      <span className="w-20 shrink-0 font-medium tabular-nums">{ind.value}</span>
                      <span className="text-muted-foreground">{ind.read}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">Deterministic — the regime + signals are computed from FRED data, not the AI. The memo above narrates this context.</p>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={onGoHandoff}>Ready for handoff <ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ⑤ Hand off ───────────────────────────────────────────────────────────────

function StepHandoff({ deal }: { deal: Deal }) {
  const s = deal.sizingResult;
  const best = deal.eligibilityResults
    ?.filter((r) => r.result !== "fail")
    .sort((a, b) => (a.estimated_rate_pct ?? Infinity) - (b.estimated_rate_pct ?? Infinity))[0];
  return (
    <Card className="border-info/30 bg-info/5">
      <CardHeader>
        <CardTitle className="text-base">⑤ Hand off</CardTitle>
        <p className="text-muted-foreground text-xs">The validation&apos;s Handoff card assembles the polished Excel + PDF (sizing + judgment + mandate stamp). This Deal&apos;s sizing model is linked to it.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Best-execution investor" value={best?.investor_name ?? "—"} />
          <Field label="Priced rate" value={rate2(best?.estimated_rate_pct ?? null)} />
          <Field label="Sized max loan" value={s ? usd(s.maxLoan) : "—"} />
          <Field label="Binding constraint" value={s?.bindingConstraint ?? "—"} />
        </div>
        {deal.judgmentResult && (
          <div className="rounded-md border border-border bg-background/60 p-3 text-sm">
            <span className="font-medium">AI stance: </span>
            {deal.judgmentResult.recommendation.stance} — {deal.judgmentResult.headline}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href={deal.validation_id ? `/dashboard/validations/${deal.validation_id}#handoff` : "/dashboard"} />}>
            {deal.validation_id ? "Go to handoff" : "Open a validation"}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        {!deal.validation_id && (
          <p className="text-xs text-muted-foreground">
            Tip: open this deal from a borrower&apos;s validation (the &quot;Evaluate against my investors&quot; button) to deep-link the handoff back to that borrower.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── small shared presentational helpers ─────────────────────────────────────

function Field({ label, value, big }: { label: React.ReactNode; value: string; big?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={big ? "text-lg font-semibold" : "font-semibold"}>{value}</p>
    </div>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
  placeholder,
  step,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ContextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
