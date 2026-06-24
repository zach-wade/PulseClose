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
  // States the borrower is known to operate in (operating state + property
  // states). Used as weak jurisdiction corroboration in disambiguation — a
  // docket in the borrower's state is slightly more likely to be theirs.
  known_states?: string[];
}

export interface LitigationRecord {
  search_type: "bankruptcy" | "foreclosure" | "lawsuit" | "lis_pendens";
  entity_name: string;
  result: "clear" | "found";
  details: string | null;
  case_number: string | null;
  source: string;
  raw_response: Record<string, unknown> | null;
  // Disambiguation (src/lib/screening/disambiguation.ts). CourtListener is a
  // name search; a common name returns many unrelated dockets. A name-only
  // match is capped at "possible — review" and never asserted as the borrower.
  confidence?: "confirmed" | "probable" | "possible" | "weak";
  name_match?: "exact" | "strong" | "partial" | "none";
  review_required?: boolean;
}

// Sanctions / PEP screening — borrower + entity names against OFAC SDN,
// global sanctions, and PEP lists.
export interface SanctionsScreenRequest {
  borrower_name: string;
  entity_name?: string;
  guarantor_name?: string;
  // Additional individuals to screen — typically officers, members, or
  // the registered agent pulled from the entity's SOS filing. Each is
  // screened as a Person against PEP + sanctions lists so we don't miss
  // a hit on a controlling-but-not-named-borrower party.
  additional_persons?: string[];
  // Borrower's known operating/property states — weak jurisdiction
  // corroboration in disambiguation (a US-listed entry vs a US borrower is
  // marginally more relevant; an obviously-foreign listing helps clear).
  known_states?: string[];
}

export interface SanctionsMatch {
  query_name: string;        // The name we searched
  matched_name: string;      // The name on the list
  list_name: string;         // e.g. "OFAC SDN", "EU Consolidated", "UK HMT"
  programs: string[];        // Sanctions programs (e.g. ["SDGT", "IRAN"])
  schema: "Person" | "Company" | "LegalEntity" | "Other";
  score: number;             // 0..1 vendor fuzzy similarity
  source_url: string | null;
  // Disambiguation layer (src/lib/screening/disambiguation.ts). A name-only
  // match on a common name can never exceed "possible" — never asserted as a
  // confirmed hit. Optional so historical rows and other producers still type.
  confidence?: "confirmed" | "probable" | "possible" | "weak";
  name_match?: "exact" | "strong" | "partial" | "none";
  review_required?: boolean;
  match_reasons?: string[];
  // Distinguishing identifiers the list publishes about THIS entry — the
  // facts a reviewer uses to clear a common-name false positive ("the SDN
  // 'Mark Morrison' was born 1962 in Tehran; our borrower is a CA flipper").
  // Surfacing them is the disambiguation aid, even before we hold the
  // borrower's own DOB/address to auto-corroborate. (OFAC FAQ: evaluate a
  // possible hit against the listed DOB / POB / nationality / address.)
  identifiers?: SanctionsIdentifiers;
}

export interface SanctionsIdentifiers {
  dob?: string[];           // birth dates the list carries (often several)
  birth_place?: string[];
  nationality?: string[];
  countries?: string[];
  addresses?: string[];
  id_numbers?: string[];
  positions?: string[];     // for PEPs — role/office held
}

export interface SanctionsScreenResult {
  result: "clear" | "potential_match" | "not_run";
  sources_searched: string[];   // e.g. ["OpenSanctions default", "OFAC SDN"]
  matches: SanctionsMatch[];
  source: string;               // Adapter that produced this result
  raw_response: Record<string, unknown> | null;
  // Group-level disambiguation roll-up across all screened names. When a name
  // returns many dispersed matches we say "name appears common" rather than
  // implying a hit. Drives the UI badge tone + copy.
  common_name_likely?: boolean;
  review_summary?: string;
  highest_confidence?: "confirmed" | "probable" | "possible" | "weak";
}

// Adapter interface — each vendor implements this
export interface ValidationAdapter {
  lookupEntity(req: SOSLookupRequest): Promise<SOSLookupResult>;
  searchProperties(req: PropertySearchRequest): Promise<PropertyRecord[]>;
  lookupGC(req: GCLookupRequest): Promise<GCLookupResult>;
  searchLitigation(req: LitigationSearchRequest): Promise<LitigationRecord[]>;
  screenSanctions(req: SanctionsScreenRequest): Promise<SanctionsScreenResult>;
}
