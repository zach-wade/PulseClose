// Pure extraction: litigation_checks.raw_response → LitigationCase[].
//
// CourtListener returns one docket object per check; nature_of_suit + court_id
// drive the category + status derivation. Defensive — any individual check
// can have a missing field without poisoning the whole batch.

export interface LitigationCheckRow {
  id: string;
  validation_id: string;
  search_type: string;          // 'bankruptcy' | 'lawsuit' | 'foreclosure' | 'lis_pendens'
  result: string;               // 'clear' | 'found' | 'pending'
  case_number: string | null;
  details: string | null;
  raw_response: Record<string, unknown> | null;
  source: string | null;
}

export type CaseCategory =
  | "bankruptcy"
  | "civil"
  | "lien"
  | "tax"
  | "foreclosure"
  | "other";

export type CaseStatus =
  | "pending"
  | "closed"
  | "discharged"
  | "dismissed"
  | "judgment"
  | "unknown";

export interface ExtractedCase {
  case_name: string;
  case_number: string | null;
  court: string | null;
  court_id: string | null;
  filed_at: string | null;       // ISO date
  terminated_at: string | null;  // ISO date
  nature_of_suit: string | null;
  category: CaseCategory;
  status: CaseStatus;
  dollar_amount_estimated: number | null;
  source_doc_url: string | null;
  raw: Record<string, unknown>;
}

const COURTLISTENER_BASE = "https://www.courtlistener.com";

function deriveCategory(
  searchType: string,
  natureOfSuit: string | null,
  courtId: string | null,
): CaseCategory {
  // Bankruptcy courts have IDs containing "bankr" (e.g. cacb, bankr_*).
  if (courtId && courtId.includes("bankr")) return "bankruptcy";
  if (searchType === "bankruptcy") return "bankruptcy";
  if (searchType === "foreclosure") return "foreclosure";
  if (searchType === "lis_pendens") return "lien";

  const nos = (natureOfSuit ?? "").toLowerCase();
  if (nos.includes("tax")) return "tax";
  if (nos.includes("lien")) return "lien";
  if (nos.includes("foreclosure")) return "foreclosure";
  if (nos.includes("bankruptcy")) return "bankruptcy";
  if (searchType === "lawsuit") return "civil";
  return "other";
}

function deriveStatus(
  terminatedAt: string | null,
  category: CaseCategory,
): CaseStatus {
  if (!terminatedAt) return "pending";
  // We don't have disposition text reliably; default closed cases to
  // "closed". Bankruptcy cases that terminate are typically discharged or
  // dismissed; leave the finer call to future enrichment.
  if (category === "bankruptcy") return "discharged";
  return "closed";
}

function safeDate(input: unknown): string | null {
  if (typeof input !== "string" || !input) return null;
  // Strip time portion if present, keep ISO YYYY-MM-DD.
  return input.slice(0, 10);
}

function safeStr(input: unknown): string | null {
  if (typeof input === "string" && input.length > 0) return input;
  return null;
}

// Read the first non-empty string under any of the given keys from a raw
// JSON object. CourtListener's /search/ endpoint returns several fields
// in camelCase (caseName, dateFiled, dateTerminated, docketNumber,
// suitNature, docket_absolute_url) while the /dockets/ endpoint uses
// snake_case throughout. Old litigation_checks rows may have either
// shape, so read both.
function pick(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const s = safeStr(raw[k]);
    if (s) return s;
  }
  return null;
}

/**
 * Extract a structured case from a single litigation_checks row. Returns
 * null when the row is a "clear" / "pending" result — only "found" rows
 * yield a case.
 */
export function extractCase(check: LitigationCheckRow): ExtractedCase | null {
  if (check.result !== "found") return null;
  const raw = (check.raw_response ?? {}) as Record<string, unknown>;

  const caseName =
    pick(raw, "caseName", "case_name", "case_name_short") ??
    check.details ??
    "Unknown case";
  const courtId = pick(raw, "court_id");
  const court = pick(raw, "court", "court_citation_string") ?? courtId;
  const natureOfSuit = pick(raw, "suitNature", "nature_of_suit");
  const filedAt = safeDate(raw.dateFiled ?? raw.date_filed);
  const terminatedAt = safeDate(raw.dateTerminated ?? raw.date_terminated);
  const absoluteUrl = pick(raw, "docket_absolute_url", "absolute_url");
  const docUrl = absoluteUrl
    ? absoluteUrl.startsWith("http")
      ? absoluteUrl
      : `${COURTLISTENER_BASE}${absoluteUrl}`
    : null;
  // Pull docket number from raw_response when the row's case_number column
  // is null (older runs from before the adapter field-name fix).
  const caseNumber =
    check.case_number ?? pick(raw, "docketNumber", "docket_number");

  const category = deriveCategory(check.search_type, natureOfSuit, courtId);
  const status = deriveStatus(terminatedAt, category);

  return {
    case_name: caseName,
    case_number: caseNumber,
    court,
    court_id: courtId,
    filed_at: filedAt,
    terminated_at: terminatedAt,
    nature_of_suit: natureOfSuit,
    category,
    status,
    dollar_amount_estimated: null,  // CourtListener doesn't expose; future enrichment
    source_doc_url: docUrl,
    raw,
  };
}

/**
 * Extract cases for a batch of litigation_checks rows. Filters out clear
 * results and dedupes by (case_number) within the validation. case_number
 * absent → dedupe by case_name.
 */
export function extractCases(checks: LitigationCheckRow[]): ExtractedCase[] {
  const cases: ExtractedCase[] = [];
  const seen = new Set<string>();
  for (const c of checks) {
    const extracted = extractCase(c);
    if (!extracted) continue;
    const key = extracted.case_number || extracted.case_name;
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push(extracted);
  }
  return cases;
}
