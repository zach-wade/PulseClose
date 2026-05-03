// Regenerate the AI memo for an existing validation. Used by the signal
// POST endpoint after an override re-derives risk factors — the memo's
// narrative should reflect the new factor list.
//
// Validation POST does its own initial generation inline (it has all the
// vendor results in memory); this helper rehydrates from the DB so it can
// run from any caller that only has a validation id.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateValidationAnalysis } from "@/lib/ai/analysis";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import type {
  SOSLookupResult,
  PropertyRecord,
  LitigationRecord,
  GCLookupResult,
  SanctionsScreenResult,
} from "@/lib/adapters/types";
import type { RiskFactor, Tier } from "@/lib/risk/factors";
import type { VerifiedFlipForAI } from "@/lib/ai/analysis";

export async function regenerateAiMemoForValidation(
  supabase: SupabaseClient,
  validationId: string,
): Promise<void> {
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select(
      "id, org_id, borrower_name, borrower_entity_name, guarantor_name, experience_tier, overall_status, confidence_score",
    )
    .eq("id", validationId)
    .single();
  if (!validation) return;

  const recompute = await recomputeRiskFactorsForValidation(supabase, validationId);
  const factors: RiskFactor[] = recompute?.factors ?? [];
  const tier: Tier = recompute?.tier ?? "LOW";

  const [entityRes, trackRes, litigationRes, sanctionsRes, gcRes, verifiedRes] = await Promise.all([
    supabase
      .from("entity_checks")
      .select("*")
      .eq("validation_id", validationId)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("track_record_entries")
      .select("*")
      .eq("validation_id", validationId),
    supabase
      .from("litigation_checks")
      .select("*")
      .eq("validation_id", validationId),
    supabase
      .from("sanctions_checks")
      .select("*")
      .eq("validation_id", validationId)
      .order("check_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("gc_validations")
      .select("*")
      .eq("validation_id", validationId)
      .maybeSingle(),
    supabase
      .from("verified_flips")
      .select("submitted_address, resolved_address, match_status, hold_months, profit, acquisition_price, disposition_price")
      .eq("validation_id", validationId),
  ]);

  const entity_result = (entityRes.data
    ? {
        entity_name: entityRes.data.entity_name,
        state: entityRes.data.state,
        entity_type: entityRes.data.entity_type,
        sos_status: entityRes.data.sos_status,
        formation_date: entityRes.data.formation_date,
        last_filing_date: entityRes.data.last_filing_date,
        registered_agent: entityRes.data.registered_agent,
        source_url: entityRes.data.source_url,
        flags: (entityRes.data.flags as string[]) ?? [],
        raw_response: entityRes.data.raw_response,
      }
    : {
        entity_name: validation.borrower_entity_name ?? "",
        state: "",
        entity_type: null,
        sos_status: "not_found",
        formation_date: null,
        last_filing_date: null,
        registered_agent: null,
        source_url: null,
        flags: [],
        raw_response: null,
      }) as SOSLookupResult;

  const properties: PropertyRecord[] = (trackRes.data ?? []).map((t) => ({
    property_address: t.property_address,
    acquisition_date: t.acquisition_date,
    disposition_date: t.disposition_date,
    acquisition_price: t.acquisition_price,
    disposition_price: t.disposition_price,
    project_type: t.project_type,
    outcome: t.outcome,
    hold_months: t.hold_months,
    profit: t.profit,
    source: t.source,
    raw_response: t.raw_response,
  }));

  const litigation_results: LitigationRecord[] = (litigationRes.data ?? []).map((l) => ({
    search_type: l.search_type,
    entity_name: l.entity_name,
    result: l.result,
    details: l.details,
    case_number: l.case_number,
    source: l.source,
    raw_response: l.raw_response,
  }));

  const sanctions_result: SanctionsScreenResult | null = sanctionsRes.data
    ? {
        result: sanctionsRes.data.result,
        sources_searched: (sanctionsRes.data.sources_searched as string[]) ?? [],
        matches: (sanctionsRes.data.matches as SanctionsScreenResult["matches"]) ?? [],
        source: sanctionsRes.data.source,
        raw_response: sanctionsRes.data.raw_response,
      }
    : null;

  const gc_result: GCLookupResult | null = gcRes.data
    ? {
        gc_name: gcRes.data.gc_name,
        license_number: gcRes.data.license_number,
        license_state: gcRes.data.license_state,
        license_status: gcRes.data.license_status,
        license_classification: gcRes.data.license_classification,
        expiration_date: gcRes.data.expiration_date,
        disciplinary_actions: (gcRes.data.disciplinary_actions as string[]) ?? [],
        insurance_verified: gcRes.data.insurance_verified,
        source_url: gcRes.data.source_url,
        raw_response: gcRes.data.raw_response,
      }
    : null;

  const verified_flips: VerifiedFlipForAI[] = (verifiedRes.data ?? []) as VerifiedFlipForAI[];

  const aiAnalysis = await generateValidationAnalysis({
    org_id: validation.org_id,
    borrower_name: validation.borrower_name,
    entity_name: validation.borrower_entity_name ?? "",
    guarantor_name: validation.guarantor_name,
    entity_result,
    properties,
    litigation_results,
    gc_result,
    sanctions_result,
    experience_tier: validation.experience_tier ?? 4,
    overall_status: validation.overall_status,
    confidence_score: validation.confidence_score ?? 0,
    risk_factors: factors,
    tier,
    verified_flips,
  });

  if (aiAnalysis) {
    // schema_version=2 is stamped server-side by generateValidationAnalysis;
    // the 00016 CHECK constraint requires the key, which is already present.
    await supabase
      .from("borrower_validations")
      .update({ ai_analysis: aiAnalysis, updated_at: new Date().toISOString() })
      .eq("id", validationId);
  }
}
