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
