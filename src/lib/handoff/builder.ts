// Investor handoff data assembly. Pulls everything we have on a
// validation into a single shape used by both the Excel generator and
// the printable HTML page. Pure-ish: takes a validation_id and a
// supabase client, returns a HandoffDocument.

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTier } from "@/lib/risk/factors";
import type { RiskFactor, Tier } from "@/lib/risk/factors";
import { normalizeAddress } from "@/lib/domain/upsert";
import type { UwSizingResultV1, UwJudgmentV1 } from "@/lib/schemas/jsonb";
import { computeVerdictsForValidations } from "@/lib/validation/verdict-batch";
import type { VerdictState } from "@/lib/validation/verdict";

export interface HandoffPropertyRow {
  property_id: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  acquisition_date: string | null;
  acquisition_price: number | null;
  disposition_date: string | null;
  disposition_price: number | null;
  hold_months: number | null;
  profit: number | null;
  current_avm: number | null;
  ltv_current: number | null;
  lender_name: string | null;
  lender_classification: string | null;
  source: string;
  // Manual fields (from handoff_data.properties[property_id])
  rehab_spend: number | null;
  gc_name: string | null;
  gc_license: string | null;
  narrative: string | null;
}

export interface HandoffSummary {
  property_count: number;
  current_holdings: number;
  completed_sales: number;
  realized_profit: number | null;
  estimated_portfolio_value: number | null;
  total_lien_balance: number | null;
  avg_current_ltv_pct: number | null;
  longest_hold_months: number | null;
  tier: Tier;
}

export interface HandoffDocument {
  // Header
  generated_at: string;
  org_name: string;
  preparer_name: string | null;
  preparer_email: string | null;

  // Borrower / entity
  borrower_name: string;
  entity_name: string | null;
  guarantor_name: string | null;
  validation_date: string | null;
  overall_status: string;
  experience_tier: number | null;
  confidence_score: number | null;

  // Risk
  tier: Tier;
  // Synthesized verdict (same computeVerdict() as the app), so the artifact can
  // lead with the answer (BLUF) instead of burying it (UX-REDESIGN §11.4).
  verdict: { state: VerdictState; headline: string } | null;
  risk_factors: RiskFactor[];

  // Entity check
  entity: {
    sos_status: string | null;
    state: string | null;
    formation_date: string | null;
    last_filing_date: string | null;
    registered_agent: string | null;
  } | null;

  // Sanctions
  sanctions: {
    result: string;
    sources_searched: string[];
    match_count: number;
    // Matches the disambiguation layer promoted to "confirmed" (a true hit).
    // Name-only matches stay in match_count but never count here, so the
    // handoff line can read "possible — review" instead of a raw enum.
    confirmed_count: number;
  } | null;

  // Litigation
  litigation: Array<{
    search_type: string;
    result: string;
    case_number: string | null;
    details: string | null;
    // "possible" = name-only match, capped at review by the disambiguation
    // layer — never inflated to "active" (mirrors computeVerdict()).
    status: "active" | "dismissed" | "possible" | null;
  }>;

  // Properties (ownership table — the heart of the handoff)
  properties: HandoffPropertyRow[];
  verified_property_count: number;

  // Number of Flow B (statewide owner-name) property matches still
  // sitting in the lender's verify tray awaiting confirm/reject. When
  // > 0, the handoff renderer stamps "Preliminary — lender review
  // incomplete" so capital partners know the memo isn't final.
  pending_review_count: number;

  // Summary stats
  summary: HandoffSummary;

  // Manual narrative
  overall_narrative: string | null;

  // G6.1 — when a chosen investor is set on handoff_data, builder pulls
  // the investor's name + most recent computed_terms tied to this
  // validation. Renders as an "Intended investor" block in Excel/PDF.
  intended_investor: {
    investor_id: string;
    display_name: string;
    result: "pass" | "conditional" | "fail" | null;
    rate: number | null;
    points: number | null;
    max_ltv_pct: number | null;
    max_loan_amount: number | null;
    rationale: string | null;
    computed_at: string | null;
  } | null;

  // Item 2 — when a uw_model is chosen on handoff_data, builder embeds its
  // deterministic loan sizing (constraint ladder + binding constraint) and,
  // when present, the full AI underwriting judgment. The engine sizes; the
  // AI narrates — same discipline as the rest of the product.
  loan_sizing: {
    uw_model_id: string;
    created_at: string;
    template: string;
    sizing: UwSizingResultV1;
    judgment: UwJudgmentV1 | null;
  } | null;

  // Item 4 — capital-provider mandate stamps. Which fund standards this
  // validation meets (or fails, with reasons). The endorsement surface.
  mandate_assessments: Array<{
    mandate_name: string | null;
    investor_name: string | null;
    result: "pass" | "conditional" | "fail";
    failures: { gate: string; message: string }[];
    assessed_at: string;
  }>;

  // Lender edit + override audit trail. Aggregated counts at the top
  // for the headline; full event list for the methodology PDF.
  lender_edits: {
    total: number;
    track_record_edits: number;
    track_record_adds: number;
    track_record_deletes: number;
    litigation_edits: number;
    litigation_adds: number;
    litigation_deletes: number;
    factor_overrides: number;
    events: Array<{
      table_name: string;
      field_name: string;
      edit_kind: "update" | "add" | "delete";
      // Two distinct sources of explanation, kept separate so the renderer
      // can label them differently. `edit_reason` is the lender's free-text
      // note when editing/adding/deleting a vendor row; `exclusion_reason`
      // is the lender's note when overriding a derived risk factor. They
      // used to share one `reason` field which conflated the two
      // semantically-different things.
      edit_reason: string | null;
      exclusion_reason: string | null;
      edited_at: string;
      // Light context: row_id for traceability, value summary
      row_id: string;
      value_summary: string | null;
    }>;
  };
}

export async function buildHandoffDocument(
  supabase: SupabaseClient,
  validationId: string,
  orgId: string,
): Promise<HandoffDocument | null> {
  const [validationRes, orgRes, entityRes, trackRes, verifiedRes, litigationRes, sanctionsRes, riskRes] = await Promise.all([
    supabase
      .from("borrower_validations")
      .select("*")
      .eq("id", validationId)
      .eq("org_id", orgId)
      .single(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single(),
    supabase
      .from("entity_checks")
      .select("*")
      .eq("validation_id", validationId)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("track_record_entries")
      .select(`
        property_id, property_address, acquisition_date, disposition_date,
        acquisition_price, disposition_price, hold_months, profit, source,
        raw_response, lender_id, review_status,
        properties ( city, state, zip ),
        lenders ( display_name, classification )
      `)
      .eq("validation_id", validationId),
    supabase
      .from("verified_flips")
      .select("*")
      .eq("validation_id", validationId),
    supabase
      .from("litigation_checks")
      .select("search_type, result, case_number, details, raw_response")
      .eq("validation_id", validationId),
    supabase
      .from("sanctions_checks")
      .select("result, sources_searched, match_count, matches")
      .eq("validation_id", validationId)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("risk_factors")
      .select("*")
      .eq("validation_id", validationId)
      .order("computed_at", { ascending: false }),
  ]);

  if (validationRes.error || !validationRes.data) return null;
  const v = validationRes.data;

  const handoffData = (v.handoff_data ?? {}) as {
    overall_narrative?: string;
    preparer_name?: string;
    preparer_email?: string;
    properties?: Record<string, { rehab_spend?: number; gc_name?: string; gc_license?: string; narrative?: string }>;
    chosen_investor_id?: string | null;
    chosen_uw_model_id?: string | null;
  };

  // G6.1 — pull the chosen investor's most-recent eligibility result for
  // this validation (via the linking deal_evaluation). Only runs when an
  // investor is actually chosen — keeps the unchosen-investor handoff
  // path zero-cost.
  let intendedInvestor: HandoffDocument["intended_investor"] = null;
  if (handoffData.chosen_investor_id) {
    const [invRes, evalRes] = await Promise.all([
      supabase
        .from("investors")
        .select("id, display_name")
        .eq("id", handoffData.chosen_investor_id)
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase
        .from("deal_evaluations")
        .select("id, evaluated_at")
        .eq("validation_id", validationId)
        .eq("org_id", orgId)
        .order("evaluated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (invRes.data) {
      let result: "pass" | "conditional" | "fail" | null = null;
      let rate: number | null = null;
      let points: number | null = null;
      let max_ltv_pct: number | null = null;
      let max_loan_amount: number | null = null;
      let rationale: string | null = null;
      let computedAt: string | null = null;

      if (evalRes.data) {
        const { data: elig } = await supabase
          .from("deal_eligibility_results")
          .select("result, computed_terms, reasoning, computed_at")
          .eq("deal_evaluation_id", evalRes.data.id)
          .eq("investor_id", handoffData.chosen_investor_id)
          .maybeSingle();
        if (elig) {
          result = elig.result as "pass" | "conditional" | "fail";
          const terms = (elig.computed_terms ?? {}) as Record<string, unknown>;
          const asNum = (v: unknown) => (typeof v === "number" ? v : null);
          rate = asNum(terms.rate);
          points = asNum(terms.points);
          max_ltv_pct = asNum(terms.max_ltv_pct ?? terms.max_ltv);
          max_loan_amount = asNum(terms.max_loan_amount);
          rationale = elig.reasoning ?? null;
          computedAt = elig.computed_at;
        }
      }

      intendedInvestor = {
        investor_id: invRes.data.id,
        display_name: invRes.data.display_name,
        result,
        rate,
        points,
        max_ltv_pct,
        max_loan_amount,
        rationale,
        computed_at: computedAt,
      };
    }
  }

  // Item 2 — pull the chosen underwriting model's sizing + judgment. Only
  // runs when the lender explicitly picked one, keeping the unchosen path
  // zero-cost. Org-scoped fetch; degrades gracefully (block omitted) if the
  // model is missing, cross-org, or has no sizing.
  let loanSizing: HandoffDocument["loan_sizing"] = null;
  if (handoffData.chosen_uw_model_id) {
    const { data: model } = await supabase
      .from("uw_models")
      .select("id, template, sizing, judgment, created_at")
      .eq("id", handoffData.chosen_uw_model_id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (model?.sizing) {
      loanSizing = {
        uw_model_id: model.id,
        created_at: model.created_at,
        template: model.template,
        sizing: model.sizing as UwSizingResultV1,
        judgment: (model.judgment ?? null) as UwJudgmentV1 | null,
      };
    }
  }

  // Item 4 — capital-provider mandate stamps for this validation.
  const { data: mandateRows } = await supabase
    .from("mandate_assessments")
    .select("result, failures, assessed_at, investor_mandates ( name ), investors ( display_name )")
    .eq("validation_id", validationId)
    .eq("org_id", orgId)
    .order("assessed_at", { ascending: false });
  const mandateAssessments = (mandateRows ?? []).map((a) => {
    const mj = a.investor_mandates as { name: string } | { name: string }[] | null;
    const ij = a.investors as { display_name: string } | { display_name: string }[] | null;
    return {
      mandate_name: Array.isArray(mj) ? mj[0]?.name ?? null : mj?.name ?? null,
      investor_name: Array.isArray(ij) ? ij[0]?.display_name ?? null : ij?.display_name ?? null,
      result: a.result as "pass" | "conditional" | "fail",
      failures: (a.failures ?? []) as { gate: string; message: string }[],
      assessed_at: a.assessed_at as string,
    };
  });

  const rawTracks = ((trackRes.data ?? []) as unknown as Array<{
    property_id: string | null;
    property_address: string;
    acquisition_date: string | null;
    disposition_date: string | null;
    acquisition_price: number | null;
    disposition_price: number | null;
    hold_months: number | null;
    profit: number | null;
    source: string;
    raw_response: Record<string, unknown> | null;
    lender_id: string | null;
    review_status: string | null;
    properties?: { city: string | null; state: string | null; zip: string | null } | { city: string | null; state: string | null; zip: string | null }[] | null;
    lenders?: { display_name: string; classification: string } | { display_name: string; classification: string }[] | null;
  }>).map((t) => ({
    ...t,
    properties: Array.isArray(t.properties) ? t.properties[0] ?? null : t.properties ?? null,
    lenders: Array.isArray(t.lenders) ? t.lenders[0] ?? null : t.lenders ?? null,
  }));

  // Surface the verify-tray state to the renderer so the PDF/Excel can
  // stamp "Preliminary" when the lender hasn't completed Flow B review.
  // Rejected rows are dropped entirely from the handoff — the lender
  // explicitly said those aren't theirs.
  const pendingReviewCount = rawTracks.filter((t) => t.review_status === "pending_review").length;
  const tracks = rawTracks.filter((t) => t.review_status !== "pending_review" && t.review_status !== "rejected");

  // Verified flips override / add to track-record by address
  const verifiedByAddress = new Map<string, {
    submitted_address: string;
    resolved_address: string | null;
    match_status: string;
    acquisition_date: string | null;
    acquisition_price: number | null;
    disposition_date: string | null;
    disposition_price: number | null;
    hold_months: number | null;
    profit: number | null;
  }>();
  for (const vf of (verifiedRes.data ?? []) as Array<{
    submitted_address: string;
    resolved_address: string | null;
    match_status: string;
    acquisition_date: string | null;
    acquisition_price: number | null;
    disposition_date: string | null;
    disposition_price: number | null;
    hold_months: number | null;
    profit: number | null;
  }>) {
    // Use the same normalization as upsertProperty so addresses match
    // regardless of casing / whitespace / punctuation differences. The
    // raw .toLowerCase() approach missed mixed-case Realie addresses like
    // "1310 Rosalia Ave" vs. "1310 Rosalia Ave." (different period).
    const key = normalizeAddress(vf.resolved_address ?? vf.submitted_address);
    if (key) verifiedByAddress.set(key, vf);
  }

  const properties: HandoffPropertyRow[] = tracks.map((t) => {
    const raw = t.raw_response ?? {};
    const propManual = t.property_id ? handoffData.properties?.[t.property_id] : undefined;

    // Verified-flip override on dates/prices when available — deed-chain
    // confirmed beats Realie's current-snapshot inference.
    const vf = verifiedByAddress.get(normalizeAddress(t.property_address) ?? "");
    const acquisition_date = vf?.acquisition_date ?? t.acquisition_date;
    const acquisition_price = vf?.acquisition_price ?? t.acquisition_price;
    const disposition_date = vf?.disposition_date ?? t.disposition_date;
    const disposition_price = vf?.disposition_price ?? t.disposition_price;
    const hold_months = vf?.hold_months ?? t.hold_months;
    const profit = vf?.profit ?? t.profit;

    return {
      property_id: t.property_id,
      address: t.property_address,
      city: t.properties?.city ?? (typeof raw.city === "string" ? raw.city : null),
      state: t.properties?.state ?? (typeof raw.state === "string" ? raw.state : null),
      zip: t.properties?.zip ?? (typeof raw.zipCode === "string" ? raw.zipCode : null),
      acquisition_date,
      acquisition_price,
      disposition_date,
      disposition_price,
      hold_months,
      profit,
      current_avm: typeof raw.modelValue === "number" ? raw.modelValue : null,
      ltv_current: typeof raw.LTVCurrentEstCombined === "number" ? raw.LTVCurrentEstCombined : null,
      lender_name: t.lenders?.display_name ?? (typeof raw.lenderName === "string" ? raw.lenderName : null),
      lender_classification: t.lenders?.classification ?? null,
      source: vf ? `${t.source} (deed-verified)` : t.source,
      rehab_spend: propManual?.rehab_spend ?? null,
      gc_name: propManual?.gc_name ?? null,
      gc_license: propManual?.gc_license ?? null,
      narrative: propManual?.narrative ?? null,
    };
  });

  // Summary stats
  const heldProps = properties.filter((p) => !p.disposition_date);
  const soldProps = properties.filter((p) => p.disposition_date);
  const realized_profit = soldProps.reduce((sum, p) => sum + (p.profit ?? 0), 0);
  const estimated_portfolio_value = heldProps.reduce((sum, p) => sum + (p.current_avm ?? 0), 0);
  const ltvPcts = heldProps.map((p) => p.ltv_current).filter((v): v is number => v != null);
  const longestHold = heldProps.reduce((max, p) => (p.hold_months ?? 0) > max ? (p.hold_months ?? 0) : max, 0);

  const riskFactors = (riskRes.data ?? []) as RiskFactor[];
  const tier = deriveTier(riskFactors);

  // Synthesized verdict via the SAME computeVerdict() the app uses everywhere
  // (correct GC/sanctions/entity handling + mandate roll-up), so the handoff's
  // BLUF can never disagree with the borrower's detail page.
  const verdictMap = await computeVerdictsForValidations(supabase, [
    { id: validationId, primary_borrower_id: v.primary_borrower_id ?? null, created_at: v.created_at },
  ]);
  const bv = verdictMap.get(validationId);
  const verdict = bv ? { state: bv.state, headline: bv.headline } : null;

  return {
    generated_at: new Date().toISOString(),
    org_name: orgRes.data?.name ?? "PulseClose",
    preparer_name: handoffData.preparer_name ?? null,
    preparer_email: handoffData.preparer_email ?? null,
    borrower_name: v.borrower_name,
    entity_name: v.borrower_entity_name,
    guarantor_name: v.guarantor_name,
    validation_date: v.validation_date,
    overall_status: v.overall_status,
    experience_tier: v.experience_tier,
    confidence_score: v.confidence_score,
    tier,
    verdict,
    risk_factors: riskFactors,
    entity: entityRes.data
      ? {
          sos_status: entityRes.data.sos_status,
          state: entityRes.data.state,
          formation_date: entityRes.data.formation_date,
          last_filing_date: entityRes.data.last_filing_date,
          registered_agent: entityRes.data.registered_agent,
        }
      : null,
    sanctions: sanctionsRes.data
      ? {
          result: sanctionsRes.data.result,
          sources_searched: (sanctionsRes.data.sources_searched as string[]) ?? [],
          match_count: sanctionsRes.data.match_count ?? 0,
          // Only matches the disambiguation layer confirmed are hits — mirrors
          // computeVerdict()'s sanctions logic so the handoff line agrees with
          // the BLUF verdict and the detail page.
          confirmed_count: ((sanctionsRes.data.matches as Array<{ confidence?: string | null }> | null) ?? []).filter(
            (m) => m.confidence === "confirmed",
          ).length,
        }
      : null,
    litigation: (litigationRes.data ?? []).map((l) => {
      const raw = (l.raw_response as Record<string, unknown> | null) ?? {};
      const confidence =
        ((raw._disambiguation as { confidence?: string } | undefined)?.confidence) ?? "possible";
      const terminated = !!raw.date_terminated;
      // A name-only ("possible") match is capped at review and never reads as an
      // active case — only a CONFIRMED, non-terminated docket is "active".
      let status: "active" | "dismissed" | "possible" | null = null;
      if (l.result === "found") {
        status = confidence === "confirmed" ? (terminated ? "dismissed" : "active") : "possible";
      }
      return {
        search_type: l.search_type,
        result: l.result,
        case_number: l.case_number,
        details: l.details,
        status,
      };
    }),
    properties,
    verified_property_count: verifiedByAddress.size,
    pending_review_count: pendingReviewCount,
    summary: {
      property_count: properties.length,
      current_holdings: heldProps.length,
      completed_sales: soldProps.length,
      realized_profit: realized_profit > 0 ? realized_profit : null,
      estimated_portfolio_value: estimated_portfolio_value > 0 ? estimated_portfolio_value : null,
      total_lien_balance: null,
      avg_current_ltv_pct: ltvPcts.length > 0 ? ltvPcts.reduce((s, n) => s + n, 0) / ltvPcts.length : null,
      longest_hold_months: longestHold > 0 ? longestHold : null,
      tier,
    },
    overall_narrative: handoffData.overall_narrative ?? null,
    intended_investor: intendedInvestor,
    loan_sizing: loanSizing,
    mandate_assessments: mandateAssessments,
    lender_edits: await buildLenderEditTrail(supabase, validationId),
  };
}

// Pull the data_edits + factor_overrides for this validation and
// shape into the renderer-friendly structure with aggregate counts.
async function buildLenderEditTrail(
  supabase: SupabaseClient,
  validationId: string,
): Promise<HandoffDocument["lender_edits"]> {
  const [editsRes, overridesRes] = await Promise.all([
    supabase
      .from("data_edits")
      .select("table_name, field_name, edit_kind, reason, edited_at, row_id, value_before, value_after")
      .eq("validation_id", validationId)
      .order("edited_at", { ascending: true }),
    supabase
      .from("factor_overrides")
      .select("factor_key, exclusion_reason, updated_at")
      .eq("validation_id", validationId),
  ]);

  type EditRow = {
    table_name: string;
    field_name: string;
    edit_kind: "update" | "add" | "delete";
    reason: string | null;
    edited_at: string;
    row_id: string;
    value_before: unknown;
    value_after: unknown;
  };
  const edits = (editsRes.data ?? []) as EditRow[];

  type OverrideRow = { factor_key: string; exclusion_reason: string; updated_at: string };
  const overrides = (overridesRes.data ?? []) as OverrideRow[];

  // Counts.
  let track_record_edits = 0;
  let track_record_adds = 0;
  let track_record_deletes = 0;
  let litigation_edits = 0;
  let litigation_adds = 0;
  let litigation_deletes = 0;
  for (const e of edits) {
    if (e.table_name === "track_record_entries") {
      if (e.edit_kind === "add") track_record_adds++;
      else if (e.edit_kind === "delete") track_record_deletes++;
      else track_record_edits++;
    } else if (e.table_name === "litigation_cases") {
      if (e.edit_kind === "add") litigation_adds++;
      else if (e.edit_kind === "delete") litigation_deletes++;
      else litigation_edits++;
    }
  }

  // Render-friendly events. Combines data_edits + factor_overrides into
  // one chronological list. Edit value_summary collapses before/after
  // into a one-line readable string. Each event populates exactly one of
  // edit_reason / exclusion_reason — never both — so the renderer can
  // label them distinctly without inferring intent from the table_name.
  const events: HandoffDocument["lender_edits"]["events"] = [];
  for (const e of edits) {
    let summary: string | null = null;
    if (e.edit_kind === "update") {
      const before = formatValue(e.value_before);
      const after = formatValue(e.value_after);
      summary = `${before} → ${after}`;
    } else if (e.edit_kind === "add") {
      summary = "manually added";
    } else if (e.edit_kind === "delete") {
      summary = "removed by lender";
    }
    events.push({
      table_name: e.table_name,
      field_name: e.field_name,
      edit_kind: e.edit_kind,
      edit_reason: e.reason,
      exclusion_reason: null,
      edited_at: e.edited_at,
      row_id: e.row_id,
      value_summary: summary,
    });
  }
  for (const o of overrides) {
    events.push({
      table_name: "factor_overrides",
      field_name: o.factor_key,
      edit_kind: "update",
      edit_reason: null,
      exclusion_reason: o.exclusion_reason,
      edited_at: o.updated_at,
      row_id: o.factor_key,
      value_summary: "factor excluded by lender",
    });
  }
  events.sort((a, b) => a.edited_at.localeCompare(b.edited_at));

  const total =
    track_record_edits +
    track_record_adds +
    track_record_deletes +
    litigation_edits +
    litigation_adds +
    litigation_deletes +
    overrides.length;

  return {
    total,
    track_record_edits,
    track_record_adds,
    track_record_deletes,
    litigation_edits,
    litigation_adds,
    litigation_deletes,
    factor_overrides: overrides.length,
    events,
  };
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 37) + "…" : v;
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(v).slice(0, 60);
}
