// ── Core domain types for PulseClose ──

export type ValidationStatus = "pending" | "verified" | "partial" | "flagged";
export type ExperienceTier = 1 | 2 | 3 | 4;
export type SOSStatus =
  | "active"
  | "suspended"
  | "dissolved"
  | "not_found"
  | "pending";
export type LicenseStatus = "active" | "expired" | "suspended" | "revoked";
export type LitigationResult = "clear" | "found" | "pending";
export type CheckConfidence = "high" | "medium" | "low";
export type ProjectOutcome =
  | "completed"
  | "in_progress"
  | "distressed"
  | "foreclosed";
export type ProjectType = "flip" | "ground_up" | "hold" | "rehab";

// ── Borrower Validation (top-level per-deal record) ──

export interface BorrowerValidation {
  id: string;
  org_id: string;
  borrower_name: string;
  borrower_entity_name: string | null;
  guarantor_name: string | null;
  overall_status: ValidationStatus;
  confidence_score: number; // 0-100
  experience_tier: ExperienceTier;
  validation_date: string;
  created_at: string;
  updated_at: string;
}

// ── Entity Checks ──

export interface EntityCheck {
  id: string;
  validation_id: string;
  entity_name: string;
  state: string;
  entity_type: string;
  sos_status: SOSStatus;
  formation_date: string | null;
  last_filing_date: string | null;
  registered_agent: string | null;
  source_url: string | null;
  check_date: string;
  confidence: CheckConfidence;
  flags: string[];
}

// ── Track Record Entries ──

export interface TrackRecordEntry {
  id: string;
  validation_id: string;
  property_address: string;
  acquisition_date: string | null;
  disposition_date: string | null;
  acquisition_price: number | null;
  disposition_price: number | null;
  rehab_cost: number | null;
  project_type: ProjectType;
  outcome: ProjectOutcome;
  hold_months: number | null;
  profit: number | null;
  source: string;
  confidence: CheckConfidence;
  verified: boolean;
}

// ── GC Validation ──

export interface GCValidation {
  id: string;
  validation_id: string;
  gc_name: string;
  license_number: string | null;
  license_state: string;
  license_status: LicenseStatus;
  license_classification: string | null;
  expiration_date: string | null;
  disciplinary_actions: string[];
  related_party_flag: boolean;
  insurance_verified: boolean;
  source_url: string | null;
  confidence: CheckConfidence;
}

// ── Litigation Checks ──

export interface LitigationCheck {
  id: string;
  validation_id: string;
  search_type: "bankruptcy" | "foreclosure" | "lawsuit" | "lis_pendens";
  entity_name: string;
  result: LitigationResult;
  details: string | null;
  case_number: string | null;
  source: string;
  check_date: string;
  confidence: CheckConfidence;
}

// ── Usage Metering ──

export interface UsageRecord {
  id: string;
  org_id: string;
  validation_id: string | null;
  check_type: string;
  data_source: string;
  cost_cents: number;
  timestamp: string;
  response_status: "success" | "error" | "partial";
}

// ── User / Org ──

export type UserRole = "owner" | "admin" | "analyst" | "viewer";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "pro" | "enterprise";
  created_at: string;
}

export interface UserProfile {
  id: string;
  org_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}
