// Materialize litigation_cases for one validation. Reads the raw
// litigation_checks rows, runs extract.ts, and upserts into litigation_cases.
// Idempotent — re-runs on monitor cron don't create dupes thanks to the
// partial unique indexes on (validation_id, case_number) and
// (validation_id, case_name) WHERE case_number IS NULL.

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractCases, type LitigationCheckRow } from "./extract";

export interface MaterializeResult {
  cases_extracted: number;
  cases_upserted: number;
  errors: number;
}

export async function materializeLitigationCases(
  supabase: SupabaseClient,
  validationId: string,
  orgId: string,
): Promise<MaterializeResult> {
  const { data: checks, error } = await supabase
    .from("litigation_checks")
    .select("id, validation_id, search_type, result, case_number, details, raw_response, source")
    .eq("validation_id", validationId);
  if (error) {
    console.warn(`[litigation/materialize] read failed for ${validationId}:`, error.message);
    return { cases_extracted: 0, cases_upserted: 0, errors: 1 };
  }

  const extracted = extractCases((checks ?? []) as unknown as LitigationCheckRow[]);
  if (extracted.length === 0) {
    return { cases_extracted: 0, cases_upserted: 0, errors: 0 };
  }

  // Two upsert passes — one per partial-unique-index target. Supabase doesn't
  // expose multi-target upsert, so split rows by whether they have case_number.
  const withNumber = extracted
    .filter((c) => !!c.case_number)
    .map((c) => ({
      validation_id: validationId,
      org_id: orgId,
      case_name: c.case_name,
      case_number: c.case_number,
      court: c.court,
      court_id: c.court_id,
      filed_at: c.filed_at,
      terminated_at: c.terminated_at,
      nature_of_suit: c.nature_of_suit,
      category: c.category,
      status: c.status,
      dollar_amount_estimated: c.dollar_amount_estimated,
      source_doc_url: c.source_doc_url,
      raw: { ...c.raw, schema_version: 1 },
    }));

  const withoutNumber = extracted
    .filter((c) => !c.case_number)
    .map((c) => ({
      validation_id: validationId,
      org_id: orgId,
      case_name: c.case_name,
      case_number: null,
      court: c.court,
      court_id: c.court_id,
      filed_at: c.filed_at,
      terminated_at: c.terminated_at,
      nature_of_suit: c.nature_of_suit,
      category: c.category,
      status: c.status,
      dollar_amount_estimated: c.dollar_amount_estimated,
      source_doc_url: c.source_doc_url,
      raw: { ...c.raw, schema_version: 1 },
    }));

  let upserted = 0;
  let errors = 0;

  if (withNumber.length > 0) {
    const { error: upErr, count } = await supabase
      .from("litigation_cases")
      .upsert(withNumber, {
        onConflict: "validation_id,case_number",
        count: "exact",
      });
    if (upErr) {
      console.warn(`[litigation/materialize] withNumber upsert failed:`, upErr.message);
      errors++;
    } else {
      upserted += count ?? withNumber.length;
    }
  }

  if (withoutNumber.length > 0) {
    const { error: upErr, count } = await supabase
      .from("litigation_cases")
      .upsert(withoutNumber, {
        onConflict: "validation_id,case_name",
        count: "exact",
      });
    if (upErr) {
      console.warn(`[litigation/materialize] withoutNumber upsert failed:`, upErr.message);
      errors++;
    } else {
      upserted += count ?? withoutNumber.length;
    }
  }

  return { cases_extracted: extracted.length, cases_upserted: upserted, errors };
}
