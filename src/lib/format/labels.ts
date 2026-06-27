// Human-readable labels for the enum / snake_case values that the data model
// uses internally. The UX audit found these leaking raw into the UI in several
// places (occupancy dropdown "non_owner_occupied", investor type "table_funded",
// risk factor "active_fed_litigation", loan type "fix_flip", property type "sfr").
// The brand voice is "specific + professional" — raw snake_case reads like a
// debug view. One formatter, used everywhere a stored enum is shown to a user.

// Exact overrides where Title-Case-the-tokens isn't right (acronyms, &, ranges).
const OVERRIDES: Record<string, string> = {
  // loan types
  bridge: "Bridge",
  fix_flip: "Fix & flip",
  ground_up: "Ground-up",
  dscr: "DSCR",
  // property types
  sfr: "SFR",
  "2_4_unit": "2–4 unit",
  small_multifamily: "Small multifamily",
  condo: "Condo",
  townhouse: "Townhouse",
  mixed_use: "Mixed-use",
  multifamily: "Multifamily",
  commercial: "Commercial",
  land: "Land",
  // occupancy
  non_owner_occupied: "Non-owner-occupied",
  owner_occupied: "Owner-occupied",
  investment: "Investment",
  // loan purpose
  purchase: "Purchase",
  refinance: "Refinance",
  cash_out_refi: "Cash-out refi",
  construction: "Construction",
  // investor type
  table_funded: "Table-funded",
  balance_sheet: "Balance sheet",
  securitizer: "Securitizer",
};

/** Title-case a snake_case / lower enum value into prose. */
export function enumLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const key = value.toLowerCase();
  if (OVERRIDES[key]) return OVERRIDES[key];
  return value
    .split(/[_\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Risk-factor keys → the lender-facing name. Mirrors the factor vocabulary in
// src/lib/risk/factors.ts; keep in sync when a new factor_key is added.
const FACTOR_LABELS: Record<string, string> = {
  entity_status: "Entity status",
  active_fed_litigation: "Active federal litigation",
  litigation_review: "Litigation — review",
  dismissed_litigation: "Dismissed litigation",
  sanctions_hit: "Sanctions / PEP match",
  extended_hold: "Extended hold period",
  extended_hold_period: "Extended hold period",
  lender_concentration: "Lender concentration",
  market_outlier: "Market outlier",
  thin_track_record: "Thin track record",
  gc_license: "GC license",
  registered_agent_is_borrower: "Registered agent is the borrower",
  recent_formation: "Recently formed entity",
};

/** Risk-factor key → human label. Falls back to Title-cased tokens. */
export function factorLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return FACTOR_LABELS[key] ?? enumLabel(key);
}
