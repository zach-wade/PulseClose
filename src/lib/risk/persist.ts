// Glue between the pure factor compute and the database. Fetches the
// validation snapshot rows, joins on lender classification + active
// borrower-property signals, computes factors, and writes them to the
// risk_factors table. Replaces existing risk_factors for the validation
// on each call so signal overrides re-derive cleanly.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeRiskFactors,
  deriveTier,
  type FactorPropertyView,
  type FactorEntityView,
  type FactorLitigationView,
  type FactorSanctionsView,
  type FactorGCView,
  type RiskFactor,
  type Tier,
} from "./factors";

export interface RecomputeResult {
  factors: RiskFactor[];
  tier: Tier;
}

export async function recomputeRiskFactorsForValidation(
  supabase: SupabaseClient,
  validationId: string,
): Promise<RecomputeResult | null> {
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, org_id, primary_borrower_id, primary_entity_id")
    .eq("id", validationId)
    .single();
  if (!validation) return null;

  const [entityRes, trackRes, litigationRes, sanctionsRes, gcRes] = await Promise.all([
    supabase
      .from("entity_checks")
      .select("sos_status, flags, last_filing_date")
      .eq("validation_id", validationId)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("track_record_entries")
      .select(`
        property_id,
        property_address,
        hold_months,
        acquisition_date,
        disposition_date,
        lender_id,
        raw_response,
        lenders ( classification )
      `)
      .eq("validation_id", validationId),
    supabase
      .from("litigation_checks")
      .select("result, case_number, details, raw_response")
      .eq("validation_id", validationId),
    supabase
      .from("sanctions_checks")
      .select("result, matches")
      .eq("validation_id", validationId)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("gc_validations")
      .select("gc_name, license_status, license_state")
      .eq("validation_id", validationId)
      .maybeSingle(),
  ]);

  // Supabase types embedded relationships as arrays even for FK joins
  // that are many-to-one. Normalize to a single value (or null) below.
  const tracks = ((trackRes.data ?? []) as unknown as Array<{
    property_id: string | null;
    property_address: string;
    hold_months: number | null;
    acquisition_date: string | null;
    disposition_date: string | null;
    lender_id: string | null;
    raw_response: Record<string, unknown> | null;
    lenders?: { classification: string } | { classification: string }[] | null;
  }>).map((t) => ({
    ...t,
    lenders: Array.isArray(t.lenders) ? (t.lenders[0] ?? null) : t.lenders ?? null,
  }));

  const propertyIds = tracks.map((t) => t.property_id).filter((id): id is string => !!id);

  // Fetch property zips + ZHVI medians for the market_outlier factor.
  // The track rows don't carry zip directly; we read from the canonical
  // properties row (where the upsert helpers stored it).
  const propertyZipMap = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: propRows } = await supabase
      .from("properties")
      .select("id, zip")
      .in("id", propertyIds);
    for (const p of (propRows ?? []) as Array<{ id: string; zip: string | null }>) {
      if (p.zip) propertyZipMap.set(p.id, p.zip);
    }
  }
  const zips = Array.from(new Set([...propertyZipMap.values()].map((z) => z.slice(0, 5))));
  const zhviByZip = new Map<string, number>();
  if (zips.length > 0) {
    const { data: zhviRows } = await supabase
      .from("zhvi_zips")
      .select("zip, median_value")
      .in("zip", zips);
    for (const r of (zhviRows ?? []) as Array<{ zip: string; median_value: number }>) {
      zhviByZip.set(r.zip, r.median_value);
    }
  }

  // Resolve active borrower_property_signals for the primary borrower across
  // every property in the validation. Used to evaluate exclusions
  // (e.g., is_primary_residence on extended_hold).
  let primaryResidenceSet = new Set<string>();
  if (validation.primary_borrower_id && propertyIds.length > 0) {
    const { data: signals } = await supabase
      .from("borrower_property_signals")
      .select("property_id, signal_value")
      .eq("borrower_id", validation.primary_borrower_id)
      .in("property_id", propertyIds)
      .eq("signal_key", "is_primary_residence")
      .is("superseded_at", null);
    primaryResidenceSet = new Set(
      (signals ?? [])
        .filter((s) => s.signal_value === true)
        .map((s) => s.property_id as string),
    );
  }

  const properties: FactorPropertyView[] = tracks.map((t) => {
    const zip = t.property_id ? propertyZipMap.get(t.property_id) ?? null : null;
    const zip5 = zip ? zip.slice(0, 5) : null;
    const zipMedian = zip5 ? zhviByZip.get(zip5) ?? null : null;
    const raw = (t.raw_response ?? {}) as Record<string, unknown>;
    const currentAvm = typeof raw.modelValue === "number" ? raw.modelValue : null;
    return {
      property_id: t.property_id,
      property_address: t.property_address,
      hold_months: t.hold_months,
      acquisition_date: t.acquisition_date,
      disposition_date: t.disposition_date,
      lender_id: t.lender_id,
      lender_classification:
        (t.lenders?.classification as FactorPropertyView["lender_classification"] | undefined) ?? null,
      is_primary_residence: t.property_id ? primaryResidenceSet.has(t.property_id) : false,
      raw_response: t.raw_response,
      zip,
      zip_median_value: zipMedian,
      current_avm: currentAvm,
    };
  });

  const entity: FactorEntityView | null = entityRes.data
    ? {
        sos_status: entityRes.data.sos_status,
        flags: (entityRes.data.flags as string[]) ?? [],
        last_filing_date: entityRes.data.last_filing_date,
      }
    : null;

  const litigation: FactorLitigationView[] = (litigationRes.data ?? []).map((l) => ({
    result: l.result,
    case_number: l.case_number,
    details: l.details,
    raw_response: l.raw_response,
  }));

  const sanctions: FactorSanctionsView | null = sanctionsRes.data
    ? {
        result: sanctionsRes.data.result,
        matches: (sanctionsRes.data.matches as Array<{ matched_name?: string; list_name?: string }>) ?? [],
      }
    : null;

  const gc: FactorGCView | null = gcRes.data
    ? {
        gc_name: gcRes.data.gc_name,
        license_status: gcRes.data.license_status,
        license_state: gcRes.data.license_state,
      }
    : null;

  const factors = computeRiskFactors({ entity, litigation, sanctions, gc, properties });
  const tier = deriveTier(factors);

  // Replace existing risk_factors for this validation. Cascade FKs aren't
  // an issue — risk_factors is a leaf table with no children.
  await supabase.from("risk_factors").delete().eq("validation_id", validationId);
  if (factors.length > 0) {
    await supabase.from("risk_factors").insert(
      factors.map((f) => ({
        validation_id: validationId,
        factor_key: f.factor_key,
        severity: f.severity,
        excluded: f.excluded,
        exclusion_reason: f.exclusion_reason,
        contributing_data: f.contributing_data,
        explanation: f.explanation,
      })),
    );
  }

  // Refresh the cached flag_count on the validation. The dashboard list
  // reads this column without joining risk_factors; without the refresh,
  // the count drifts after overrides (the "Truong example" — summary
  // showed 2 while the bullet list had 4). Count = active factors with
  // moderate/critical/minor severity. Excluded + informational + none
  // don't count as flags.
  const flagCount = factors.filter(
    (f) => !f.excluded && (f.severity === "critical" || f.severity === "moderate" || f.severity === "minor"),
  ).length;
  await supabase
    .from("borrower_validations")
    .update({ flag_count: flagCount, updated_at: new Date().toISOString() })
    .eq("id", validationId);

  return { factors, tier };
}

// Find validations affected by a signal write. Used to fan re-derivation
// out from POST /api/signals to all impacted validations in the org.
export async function findValidationsAffectedBySignal(
  supabase: SupabaseClient,
  scope: "borrower" | "property" | "borrower_property" | "entity",
  ids: { borrower_id?: string; property_id?: string; entity_id?: string },
): Promise<string[]> {
  if (scope === "borrower" || scope === "borrower_property") {
    if (!ids.borrower_id) return [];
    const baseFilter = supabase
      .from("borrower_validations")
      .select("id")
      .eq("primary_borrower_id", ids.borrower_id);

    if (scope === "borrower_property" && ids.property_id) {
      // Restrict to validations whose track_record references this property
      const { data: tracks } = await supabase
        .from("track_record_entries")
        .select("validation_id")
        .eq("property_id", ids.property_id);
      const validationIds = [...new Set((tracks ?? []).map((t) => t.validation_id))];
      if (validationIds.length === 0) return [];
      const { data } = await baseFilter.in("id", validationIds);
      return (data ?? []).map((v) => v.id);
    }
    const { data } = await baseFilter;
    return (data ?? []).map((v) => v.id);
  }

  if (scope === "property") {
    if (!ids.property_id) return [];
    const { data: tracks } = await supabase
      .from("track_record_entries")
      .select("validation_id")
      .eq("property_id", ids.property_id);
    return [...new Set((tracks ?? []).map((t) => t.validation_id))];
  }

  if (scope === "entity") {
    if (!ids.entity_id) return [];
    const { data } = await supabase
      .from("borrower_validations")
      .select("id")
      .eq("primary_entity_id", ids.entity_id);
    return (data ?? []).map((v) => v.id);
  }

  return [];
}
