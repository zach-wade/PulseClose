// Materialize litigation_cases for one validation. Reads the raw
// litigation_checks rows, runs extract.ts, and writes into litigation_cases.
// Idempotent — re-runs on monitor cron find existing rows by either
// (validation_id, case_number) or (validation_id, case_name) and update
// in place rather than insert duplicates.
//
// The previous implementation used Supabase upsert with onConflict pointing
// at the partial unique indexes on litigation_cases. PostgREST rejects
// partial-index targets with "there is no unique or exclusion constraint
// matching the ON CONFLICT specification" — so the upsert silently failed
// and litigation_cases was empty for every validation. Replaced with
// explicit select-then-update/insert; bulletproof and works against the
// existing partial indexes without a migration.

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractCases, type ExtractedCase, type LitigationCheckRow } from "./extract";

export interface MaterializeResult {
  cases_extracted: number;
  cases_upserted: number;
  errors: number;
}

interface CaseRow {
  validation_id: string;
  org_id: string;
  case_name: string;
  case_number: string | null;
  court: string | null;
  court_id: string | null;
  filed_at: string | null;
  terminated_at: string | null;
  nature_of_suit: string | null;
  category: ExtractedCase["category"];
  status: ExtractedCase["status"];
  dollar_amount_estimated: number | null;
  source_doc_url: string | null;
  raw: Record<string, unknown>;
}

function toRow(c: ExtractedCase, validationId: string, orgId: string): CaseRow {
  return {
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
  };
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

  // Pull existing rows once so we can decide insert vs update without N
  // round-trips per case. Validation N is small (typically 0-10 cases).
  const { data: existingRows, error: existErr } = await supabase
    .from("litigation_cases")
    .select("id, case_number, case_name")
    .eq("validation_id", validationId);
  if (existErr) {
    console.warn(`[litigation/materialize] existing read failed:`, existErr.message);
    return { cases_extracted: extracted.length, cases_upserted: 0, errors: 1 };
  }

  const byCaseNumber = new Map<string, string>();
  const byCaseName = new Map<string, string>();
  for (const r of existingRows ?? []) {
    if (r.case_number) byCaseNumber.set(r.case_number as string, r.id as string);
    else byCaseName.set(r.case_name as string, r.id as string);
  }

  let upserted = 0;
  let errors = 0;

  for (const c of extracted) {
    const row = toRow(c, validationId, orgId);
    const existingId =
      (c.case_number && byCaseNumber.get(c.case_number)) ||
      (!c.case_number && byCaseName.get(c.case_name)) ||
      null;

    if (existingId) {
      const { error: updErr } = await supabase
        .from("litigation_cases")
        .update(row)
        .eq("id", existingId);
      if (updErr) {
        console.warn(`[litigation/materialize] update failed for ${existingId}:`, updErr.message);
        errors++;
      } else {
        upserted++;
      }
    } else {
      const { error: insErr } = await supabase
        .from("litigation_cases")
        .insert(row);
      if (insErr) {
        console.warn(`[litigation/materialize] insert failed for "${c.case_name}":`, insErr.message);
        errors++;
      } else {
        upserted++;
      }
    }
  }

  return { cases_extracted: extracted.length, cases_upserted: upserted, errors };
}
