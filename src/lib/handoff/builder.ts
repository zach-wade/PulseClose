// Investor handoff data assembly. Pulls everything we have on a
// validation into a single shape used by both the Excel generator and
// the printable HTML page. Pure-ish: takes a validation_id and a
// supabase client, returns a HandoffDocument.

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTier } from "@/lib/risk/factors";
import type { RiskFactor, Tier } from "@/lib/risk/factors";

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
  } | null;

  // Litigation
  litigation: Array<{
    search_type: string;
    result: string;
    case_number: string | null;
    details: string | null;
    status: "active" | "dismissed" | null;
  }>;

  // Properties (ownership table — the heart of the handoff)
  properties: HandoffPropertyRow[];
  verified_property_count: number;

  // Summary stats
  summary: HandoffSummary;

  // Manual narrative
  overall_narrative: string | null;
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
        raw_response, lender_id,
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
      .select("result, sources_searched, match_count")
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
  };

  const tracks = ((trackRes.data ?? []) as unknown as Array<{
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
    properties?: { city: string | null; state: string | null; zip: string | null } | { city: string | null; state: string | null; zip: string | null }[] | null;
    lenders?: { display_name: string; classification: string } | { display_name: string; classification: string }[] | null;
  }>).map((t) => ({
    ...t,
    properties: Array.isArray(t.properties) ? t.properties[0] ?? null : t.properties ?? null,
    lenders: Array.isArray(t.lenders) ? t.lenders[0] ?? null : t.lenders ?? null,
  }));

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
    const key = (vf.resolved_address ?? vf.submitted_address).toLowerCase();
    verifiedByAddress.set(key, vf);
  }

  const properties: HandoffPropertyRow[] = tracks.map((t) => {
    const raw = t.raw_response ?? {};
    const propManual = t.property_id ? handoffData.properties?.[t.property_id] : undefined;

    // Verified-flip override on dates/prices when available — deed-chain
    // confirmed beats Realie's current-snapshot inference.
    const vf = verifiedByAddress.get(t.property_address.toLowerCase());
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
        }
      : null,
    litigation: (litigationRes.data ?? []).map((l) => {
      const isActive = l.result === "found" && !(l.raw_response as Record<string, unknown> | null)?.date_terminated;
      return {
        search_type: l.search_type,
        result: l.result,
        case_number: l.case_number,
        details: l.details,
        status: l.result === "found" ? (isActive ? "active" : "dismissed") : null,
      };
    }),
    properties,
    verified_property_count: verifiedByAddress.size,
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
  };
}
