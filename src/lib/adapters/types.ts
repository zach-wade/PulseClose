// Vendor adapter interfaces — each data source implements these.
// Stubs return demo data; real implementations call vendor APIs.

export interface SOSLookupRequest {
  entity_name: string;
  state: string;
}

export interface SOSLookupResult {
  entity_name: string;
  state: string;
  entity_type: string | null;
  sos_status: "active" | "suspended" | "dissolved" | "not_found";
  formation_date: string | null;
  last_filing_date: string | null;
  registered_agent: string | null;
  source_url: string | null;
  flags: string[];
  raw_response: Record<string, unknown> | null;
}

export interface PropertySearchRequest {
  borrower_name: string;
  entity_name?: string;
  state?: string;
}

export interface PropertyRecord {
  property_address: string;
  acquisition_date: string | null;
  disposition_date: string | null;
  acquisition_price: number | null;
  disposition_price: number | null;
  project_type: "flip" | "ground_up" | "hold" | "rehab";
  outcome: "completed" | "in_progress" | "distressed" | "foreclosed";
  hold_months: number | null;
  profit: number | null;
  source: string;
  raw_response: Record<string, unknown> | null;
}

export interface GCLookupRequest {
  gc_name: string;
  license_number?: string;
  state: string;
}

export interface GCLookupResult {
  gc_name: string;
  license_number: string | null;
  license_state: string;
  license_status: "active" | "expired" | "suspended" | "revoked";
  license_classification: string | null;
  expiration_date: string | null;
  disciplinary_actions: string[];
  insurance_verified: boolean;
  source_url: string | null;
  raw_response: Record<string, unknown> | null;
}

export interface LitigationSearchRequest {
  entity_name: string;
  borrower_name: string;
}

export interface LitigationRecord {
  search_type: "bankruptcy" | "foreclosure" | "lawsuit" | "lis_pendens";
  entity_name: string;
  result: "clear" | "found";
  details: string | null;
  case_number: string | null;
  source: string;
  raw_response: Record<string, unknown> | null;
}

// Adapter interface — each vendor implements this
export interface ValidationAdapter {
  lookupEntity(req: SOSLookupRequest): Promise<SOSLookupResult>;
  searchProperties(req: PropertySearchRequest): Promise<PropertyRecord[]>;
  lookupGC(req: GCLookupRequest): Promise<GCLookupResult>;
  searchLitigation(req: LitigationSearchRequest): Promise<LitigationRecord[]>;
}
