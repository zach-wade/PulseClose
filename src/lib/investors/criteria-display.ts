// Human-readable rendering of investor buy-box criteria. The editor
// (investor-criteria-editor.tsx) knows how to INPUT each criteria_key; this
// module knows how to DISPLAY one as a lender would read a term sheet — no
// snake_case keys, no raw JSON values (UX-POLISH-BACKLOG #2).
//
// Shared by the investors list + the investor detail page so the read view is
// identical. Unknown keys degrade gracefully to a prettified key + compact value.

export interface DisplayCriterion {
  /** Human label — "Max LTARV", "Allowed states". */
  label: string;
  /** Formatted value — "70%", "CA, AZ, TX", "Allowed". */
  value: string;
  /** Glossary term to gloss the label with <Term>, when it's a CRE acronym. */
  term?: string;
}

const LABELS: Record<string, string> = {
  loan_types: "Loan types",
  property_types: "Property types",
  excluded_property_types: "Excluded property types",
  allowed_states: "Allowed states",
  excluded_states: "Excluded states",
  min_loan_amount: "Min loan amount",
  max_loan_amount: "Max loan amount",
  min_fico: "Min FICO",
  min_experience: "Min experience tier",
  max_ltv: "Max LTV",
  max_ltc: "Max LTC",
  max_ltarv: "Max LTARV",
  rural_allowed: "Rural",
  allowed_occupancy: "Allowed occupancy",
  leverage_matrix: "Leverage matrix",
  rate_adjusters: "Rate adjusters",
};

// Labels that are CRE acronyms → the GLOSSARY key for <Term>.
const LABEL_TERMS: Record<string, string> = {
  max_ltv: "LTV",
  max_ltc: "LTC",
  max_ltarv: "LTARV",
};

// Percent-decimal keys (0.75 → "75%").
const PERCENT_KEYS = new Set(["max_ltv", "max_ltc", "max_ltarv"]);
// Whole-dollar keys.
const MONEY_KEYS = new Set(["min_loan_amount", "max_loan_amount"]);

// Enum tokens → prose, where the raw token isn't self-explanatory.
const TOKEN_LABELS: Record<string, string> = {
  fix_flip: "Fix & flip",
  ground_up: "Ground-up",
  dscr: "DSCR",
  sfr: "SFR",
  "2_4_unit": "2–4 unit",
  mixed_use: "Mixed-use",
  owner_occupied: "Owner-occupied",
  non_owner_occupied: "Non-owner-occupied",
};

function prettyToken(t: string): string {
  if (TOKEN_LABELS[t]) return TOKEN_LABELS[t];
  return t
    .split(/[_\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function prettyKey(key: string): string {
  return key
    .split(/[_\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatCriterion(key: string, value: unknown): DisplayCriterion {
  const label = LABELS[key] ?? prettyKey(key);
  const term = LABEL_TERMS[key];

  // Boolean — render as an allow/deny so "Rural: Not allowed" reads naturally.
  if (typeof value === "boolean") {
    return { label, value: value ? "Allowed" : "Not allowed", term };
  }

  if (PERCENT_KEYS.has(key) && typeof value === "number") {
    const pct = value <= 1 ? value * 100 : value;
    return { label, value: `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`, term };
  }

  if (MONEY_KEYS.has(key) && typeof value === "number") {
    return { label, value: fmtMoney(value), term };
  }

  if (key === "min_experience" && typeof value === "number") {
    return { label, value: `Tier ${value}`, term };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      // Empty allowed-states means "no restriction"; empty excludes mean none.
      const empty = key === "allowed_states" ? "All states" : key.startsWith("excluded_") ? "None" : "Any";
      return { label, value: empty, term };
    }
    // Arrays of objects (leverage_matrix / rate_adjusters) — summarize count
    // rather than dumping JSON.
    if (typeof value[0] === "object" && value[0] !== null) {
      return { label, value: `${value.length} configured`, term };
    }
    return { label, value: value.map((v) => prettyToken(String(v))).join(", "), term };
  }

  if (value === null || value === undefined) {
    return { label, value: "—", term };
  }

  if (typeof value === "number") {
    return { label, value: value.toLocaleString(), term };
  }

  if (typeof value === "string") {
    return { label, value: prettyToken(value), term };
  }

  // Object / fallback — never expose raw JSON to the read view.
  return { label, value: "Configured", term };
}
