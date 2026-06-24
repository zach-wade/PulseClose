export interface EntityCheck {
  id: string;
  entity_name: string;
  state: string;
  entity_type: string | null;
  sos_status: string;
  formation_date: string | null;
  last_filing_date: string | null;
  registered_agent: string | null;
  source_url: string | null;
  confidence: string;
  flags: string[];
  raw_response?: Record<string, unknown>;
}

export interface TrackRecordEntry {
  id: string;
  property_id?: string | null;
  property_address: string;
  acquisition_date: string | null;
  disposition_date: string | null;
  acquisition_price: number | null;
  disposition_price: number | null;
  project_type: string;
  outcome: string;
  hold_months: number | null;
  profit: number | null;
  raw_response?: Record<string, unknown>;
  source?: string | null;
  lender_notes?: string | null;
  // Verify-tray architecture (00039).
  review_status?: "auto_accepted" | "pending_review" | "confirmed" | "rejected";
  review_confidence?: number | null;
  review_signals?: Record<string, { value: unknown; note: string }> | null;
}

export interface LitigationCheck {
  id: string;
  search_type: string;
  entity_name: string;
  result: string;
  details: string | null;
  case_number: string | null;
  source: string;
  raw_response?: Record<string, unknown>;
}

export interface GCValidation {
  id: string;
  gc_name: string;
  license_number: string | null;
  license_state: string;
  license_status: string;
  license_classification: string | null;
  expiration_date: string | null;
  disciplinary_actions: string[];
  insurance_verified: boolean;
  raw_response?: Record<string, unknown>;
}

export interface SanctionsCheck {
  id: string;
  borrower_name: string;
  entity_name: string | null;
  guarantor_name: string | null;
  result: "clear" | "potential_match" | "not_run" | "pending";
  match_count: number;
  matches: SanctionsMatch[];
  sources_searched: string[];
  source: string;
  check_date: string;
  raw_response?: Record<string, unknown>;
  // Disambiguation roll-up (src/lib/screening/disambiguation.ts).
  common_name_likely?: boolean;
  review_summary?: string;
  highest_confidence?: "confirmed" | "probable" | "possible" | "weak";
}

export interface SanctionsMatch {
  query_name: string;
  matched_name: string;
  list_name: string;
  programs: string[];
  schema: "Person" | "Company" | "LegalEntity" | "Other";
  score: number;
  source_url: string | null;
  confidence?: "confirmed" | "probable" | "possible" | "weak";
  name_match?: "exact" | "strong" | "partial" | "none";
  review_required?: boolean;
  match_reasons?: string[];
  category?: "sanction" | "pep" | "exclusion" | "other";
  topics?: string[];
  identifiers?: {
    dob?: string[];
    birth_place?: string[];
    nationality?: string[];
    countries?: string[];
    addresses?: string[];
    id_numbers?: string[];
    positions?: string[];
  };
}

export interface VerifiedFlip {
  id: string;
  submitted_address: string;
  resolved_address: string | null;
  match_status: "owned_and_sold" | "owned_and_held" | "never_owned" | "not_found" | "pending";
  acquisition_date: string | null;
  acquisition_price: number | null;
  disposition_date: string | null;
  disposition_price: number | null;
  hold_months: number | null;
  profit: number | null;
  current_owner: string | null;
  grantor_chain: { grantor: string; grantee: string; date: string | null; price: number | null }[];
  source: string;
  raw_response?: Record<string, unknown> | null;
}

export function formatCurrency(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
