// Human-readable labels for the handoff's "Litigation & sanctions" section.
// Shared by the PDF (app/handoff/[id]/page.tsx) and the Excel generator so the
// two artifacts can never drift, and so the disambiguation rule is enforced in
// ONE place: a name-only match is "possible — review", never a hit. Only a
// CONFIRMED match reads as a hit — mirrors computeVerdict()'s sanctions logic
// (UX-POLISH-BACKLOG #1, ROADMAP disambiguation principle).

export interface SanctionsDisplay {
  result: string;
  sources_searched: string[];
  /** Sanctions/PEP matches the disambiguation layer promoted to "confirmed". */
  confirmed_count: number;
  /** Sanctions/PEP matches at possible/probable confidence — review items. Weak
   *  matches and regulatory-exclusion noise are already filtered out upstream. */
  possible_count: number;
}

/** One readable line for the Sanctions / PEP row. Never emits raw enum values. */
export function sanctionsScreeningLabel(s: SanctionsDisplay | null): string {
  if (!s || s.result === "not_run" || s.result === "pending") {
    return "Not run";
  }
  const sources = s.sources_searched.length;
  const sourceSuffix = sources > 0 ? ` across ${sources} source${sources === 1 ? "" : "s"}` : "";
  if (s.confirmed_count > 0) {
    return `${s.confirmed_count} confirmed match${s.confirmed_count === 1 ? "" : "es"} — hit${sourceSuffix}`;
  }
  // A name-only match is a review item, not a hit — say so plainly.
  if (s.possible_count > 0) {
    return `${s.possible_count} possible — review (name-only, unconfirmed)${sourceSuffix}`;
  }
  return `Clear — no matches${sourceSuffix}`;
}

export type LitigationStatus = "active" | "dismissed" | "possible" | null;

/** Per-case status label. "possible" = name-only, capped at review. */
export function litigationStatusLabel(status: LitigationStatus): string {
  if (status === "active") return "Active";
  if (status === "dismissed") return "Dismissed / terminated";
  if (status === "possible") return "Possible — review (name-only)";
  return "No match";
}

interface LitigationLike {
  result: string;
  status: LitigationStatus;
}

/** One readable summary line for the Federal litigation row. */
export function litigationSummaryLabel(litigation: LitigationLike[]): string {
  if (litigation.some((l) => l.result === "not_run" || l.result === "pending")) {
    return "Screening did not complete — re-run (CourtListener)";
  }
  const active = litigation.filter((l) => l.status === "active").length;
  const dismissed = litigation.filter((l) => l.status === "dismissed").length;
  const possible = litigation.filter((l) => l.status === "possible").length;
  if (active === 0 && dismissed === 0 && possible === 0) {
    return "Clear — no federal cases (CourtListener)";
  }
  const parts: string[] = [];
  if (active > 0) parts.push(`${active} active`);
  if (dismissed > 0) parts.push(`${dismissed} dismissed`);
  if (possible > 0) parts.push(`${possible} possible — review`);
  return parts.join(", ");
}

const SEARCH_TYPE_LABELS: Record<string, string> = {
  bankruptcy: "Bankruptcy",
  lawsuit: "Civil lawsuit",
  civil: "Civil lawsuit",
  foreclosure: "Foreclosure",
  lis_pendens: "Lis pendens",
};

/** Prettify a raw `search_type` enum into title-case prose. */
export function humanizeSearchType(searchType: string): string {
  return (
    SEARCH_TYPE_LABELS[searchType] ??
    searchType
      .split(/[_\s]+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ")
  );
}
