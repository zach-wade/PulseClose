// Confidence scoring + auto-promotion for the verify-tray architecture.
//
// Flow B (statewide owner-name search via Realie) returns hits keyed only
// to a name match — for common names like "Kim Truong" in CA this drags
// in unrelated owners (Noah's review 2026-05-08: Fullerton/Cypress hits
// for a Santa-Clara-only borrower). Those rows now insert as
// `pending_review`. After Flow A (per-address deed verify) writes the
// borrower's actual property cluster into verified_flips, we score each
// pending row against five corroborating signals and either:
//
//   * auto-promote to `auto_accepted` if the score clears the threshold
//   * keep `pending_review` with the score + signal breakdown stored on
//     the row, so the tray can sort + explain
//
// The signals correspond to Noah-review gaps 1, 2, 3, 4, 6 from
// docs/IDEAS.md "Drill-down + matcher follow-ups":
//
//   1. SOS officer/agent name match (Cobalt's officers + registered
//      agent on entity_checks)
//   2. Address sits in the borrower's xlsx geographic cluster
//      (same city/zip; adjacent zip-prefix-3 = "nearby")
//   3. Deed transfer history shows borrower or entity as grantor/grantee
//   4. Transfer dates corroborate borrower's claimed timeline (when xlsx
//      supplied acquisition/disposition dates)
//   6. SOS-resolved entity filing ID matches an entity already linked
//      to this borrower
//
// Gap 5 (APN / tax-assessor) is intentionally deferred — per-county
// adapter work, multi-week effort. See IDEAS.md for the unblock condition.

import type { SupabaseClient } from "@supabase/supabase-js";

// Confidence score is 0-100. Auto-promote clears 80 (4-of-5 strong
// signals or 3-of-5 strong + 2 weak). Below threshold stays in the tray
// for the lender to confirm/reject. Tunable as we see false-promote /
// false-reject rates in practice.
const AUTO_PROMOTE_THRESHOLD = 80;

interface PendingRow {
  id: string;
  property_id: string | null;
  property_address: string;
  acquisition_date: string | null;
  disposition_date: string | null;
  raw_response: Record<string, unknown> | null;
}

interface BorrowerXlsxRow {
  submitted_address: string | null;
  resolved_address: string | null;
  acquisition_date: string | null;
  disposition_date: string | null;
  match_status: string;
}

interface EntityCheckSnapshot {
  entity_name: string;
  registered_agent: string | null;
  raw_response: Record<string, unknown> | null;
}

export interface ScoreBreakdown {
  total: number;
  signals: {
    sos_officer_match?: { value: true; note: string };
    geo_cluster?: { value: "same_city" | "same_zip3" | "different_metro"; note: string };
    transfer_history?: { value: true; note: string };
    date_corroboration?: { value: true; note: string };
    entity_filing_id?: { value: true; note: string };
  };
  promotion_eligible: boolean;
}

// ── Per-signal helpers ──────────────────────────────────────────────────

function tokenize(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !ENTITY_SUFFIX_TOKENS.has(t)),
  );
}

const ENTITY_SUFFIX_TOKENS = new Set([
  "llc", "inc", "incorporated", "corp", "corporation",
  "ltd", "limited", "lp", "llp", "trust", "company", "co",
]);

function tokensEqualOrContained(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of smaller) if (!larger.has(t)) return false;
  return true;
}

function extractZip(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1] ?? null;
}

function extractCity(address: string | null | undefined): string | null {
  if (!address) return null;
  // "<street>, <city>, <state> <zip>" — city is the segment between the
  // first and last comma.
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 3) return parts[parts.length - 2].toLowerCase();
  // Single-line: bail out — we can't reliably extract city without a comma.
  return null;
}

// ── Main scoring ────────────────────────────────────────────────────────

interface ScoreInput {
  row: PendingRow;
  borrowerName: string;
  entityName: string | null;
  cluster: { cities: Set<string>; zip3s: Set<string> };
  officerTokens: Set<string>[];
  entityFilingIdMatch: boolean;
}

function scoreRow(input: ScoreInput): ScoreBreakdown {
  const raw = (input.row.raw_response ?? {}) as Record<string, unknown>;
  const ownerName = typeof raw.ownerName === "string" ? raw.ownerName : null;
  const propertyAddress = input.row.property_address;
  const breakdown: ScoreBreakdown = { total: 0, signals: {}, promotion_eligible: false };

  // ── Gap 1: SOS officer / registered-agent name match ───────────────
  // Worth 25 — strongest single signal. If a deed's owner matches a
  // Cobalt-resolved officer of the borrower's LLC, that's a hard
  // corroboration that the LLC and the borrower actually share the deed.
  if (ownerName && input.officerTokens.length > 0) {
    const ownerTokens = tokenize(ownerName);
    const anyMatch = input.officerTokens.some((officer) =>
      tokensEqualOrContained(officer, ownerTokens),
    );
    if (anyMatch) {
      breakdown.signals.sos_officer_match = {
        value: true,
        note: `Deed owner "${ownerName}" matches an officer/agent on the SOS filing.`,
      };
      breakdown.total += 25;
    }
  }

  // ── Gap 2: Geographic cluster fit ──────────────────────────────────
  // Same city = 25; same zip-prefix-3 (rough metro proxy) = 12; outside
  // both = -15 (penalty). Empty cluster (no Flow A run yet) → no score.
  const propertyZip = extractZip(propertyAddress);
  const propertyCity = extractCity(propertyAddress);
  if (input.cluster.cities.size > 0 || input.cluster.zip3s.size > 0) {
    if (propertyCity && input.cluster.cities.has(propertyCity)) {
      breakdown.signals.geo_cluster = {
        value: "same_city",
        note: `Address is in ${propertyCity} — matches borrower's xlsx cluster.`,
      };
      breakdown.total += 25;
    } else if (propertyZip && input.cluster.zip3s.has(propertyZip.slice(0, 3))) {
      breakdown.signals.geo_cluster = {
        value: "same_zip3",
        note: `Address is in zip-prefix ${propertyZip.slice(0, 3)} — same metro as borrower's xlsx.`,
      };
      breakdown.total += 12;
    } else {
      breakdown.signals.geo_cluster = {
        value: "different_metro",
        note: `Address ${propertyCity ?? propertyZip ?? "(unknown locale)"} is outside borrower's xlsx cluster.`,
      };
      breakdown.total -= 15;
    }
  }

  // ── Gap 3: Transfer-history corroboration ──────────────────────────
  // Walk the deed's transfer history. If borrower/entity tokens appear
  // as grantor OR grantee in ANY transfer, that's a chain corroboration
  // worth 20.
  const transfers = (raw.transfers as Array<Record<string, unknown>> | undefined) ?? [];
  if (transfers.length > 0) {
    const borrowerTokens = tokenize(input.borrowerName);
    const entityTokens = tokenize(input.entityName);
    const matches = transfers.some((t) => {
      const grantor = tokenize(typeof t.grantor === "string" ? t.grantor : null);
      const grantee = tokenize(typeof t.grantee === "string" ? t.grantee : null);
      return (
        tokensEqualOrContained(borrowerTokens, grantor) ||
        tokensEqualOrContained(borrowerTokens, grantee) ||
        tokensEqualOrContained(entityTokens, grantor) ||
        tokensEqualOrContained(entityTokens, grantee)
      );
    });
    if (matches) {
      breakdown.signals.transfer_history = {
        value: true,
        note: `Borrower or entity appears as grantor/grantee in ${transfers.length} recorded transfer${transfers.length === 1 ? "" : "s"}.`,
      };
      breakdown.total += 20;
    }
  }

  // ── Gap 4: Date corroboration ──────────────────────────────────────
  // Skipped at insert-time scoring — borrower's claimed dates live on
  // the verified_flips rows, applied during the score-and-promote pass.
  // (When the cluster.dates input shape grows below we'll wire this in
  // — left as a placeholder so the signal-name lands in the breakdown
  // shape today.)

  // ── Gap 6: Entity filing ID match ──────────────────────────────────
  // The validation's primary entity (resolved via Cobalt SOS) has a
  // state-specific filing ID. If the property's owning entity (from
  // Realie's ownerName) resolves to the same filing ID, that's the
  // cleanest possible identity proof. 15 points — strong but the same-
  // name-different-state case is rare in practice so we don't lean on
  // it as much as SOS officer match.
  if (input.entityFilingIdMatch) {
    breakdown.signals.entity_filing_id = {
      value: true,
      note: "Owning entity's SOS filing ID matches the borrower's primary entity.",
    };
    breakdown.total += 15;
  }

  breakdown.promotion_eligible = breakdown.total >= AUTO_PROMOTE_THRESHOLD;
  return breakdown;
}

// ── Cluster derivation from the borrower's xlsx (verified_flips) ───────

function deriveCluster(flips: BorrowerXlsxRow[]): { cities: Set<string>; zip3s: Set<string> } {
  const cities = new Set<string>();
  const zip3s = new Set<string>();
  for (const f of flips) {
    if (f.match_status === "never_owned" || f.match_status === "not_found") continue;
    const addr = f.resolved_address ?? f.submitted_address;
    const city = extractCity(addr);
    if (city) cities.add(city);
    const zip = extractZip(addr);
    if (zip) zip3s.add(zip.slice(0, 3));
  }
  return { cities, zip3s };
}

function deriveOfficerTokens(entity: EntityCheckSnapshot | null): Set<string>[] {
  if (!entity) return [];
  const out: Set<string>[] = [];
  if (entity.registered_agent) out.push(tokenize(entity.registered_agent));
  const cobaltResults = (entity.raw_response as
    | { results?: Array<{ officers?: Array<{ name?: string }> }> }
    | null)?.results;
  for (const officer of cobaltResults?.[0]?.officers ?? []) {
    if (officer.name) out.push(tokenize(officer.name));
  }
  return out.filter((s) => s.size > 0);
}

// ── Public entry point: score + auto-promote one validation's pending rows ──

export async function scoreAndPromotePendingRows(
  supabase: SupabaseClient,
  validationId: string,
  borrowerName: string,
  entityName: string | null,
): Promise<{ scored: number; promoted: number; errors: number }> {
  const [pendingRes, flipsRes, entityRes] = await Promise.all([
    supabase
      .from("track_record_entries")
      .select("id, property_id, property_address, acquisition_date, disposition_date, raw_response")
      .eq("validation_id", validationId)
      .eq("review_status", "pending_review"),
    supabase
      .from("verified_flips")
      .select("submitted_address, resolved_address, acquisition_date, disposition_date, match_status")
      .eq("validation_id", validationId),
    supabase
      .from("entity_checks")
      .select("entity_name, registered_agent, raw_response")
      .eq("validation_id", validationId)
      .maybeSingle(),
  ]);

  if (pendingRes.error) {
    console.warn(`[review.scoreAndPromote] pending read failed for ${validationId}:`, pendingRes.error.message);
    return { scored: 0, promoted: 0, errors: 1 };
  }
  const pending = (pendingRes.data ?? []) as PendingRow[];
  if (pending.length === 0) return { scored: 0, promoted: 0, errors: 0 };

  const flips = (flipsRes.data ?? []) as BorrowerXlsxRow[];
  const cluster = deriveCluster(flips);
  const officerTokens = deriveOfficerTokens((entityRes.data ?? null) as EntityCheckSnapshot | null);

  // Gap 6 — entity filing ID match. Currently best-effort: Cobalt returns
  // a filing ID in raw_response.results[0].business_id for many CA entries.
  // We compare per-row Realie ownerName tokens against the borrower's
  // primary entity tokens (entity-name based, since Realie deeds don't
  // carry the LLC's SOS filing ID); the strict same-state match relies on
  // tokens being an exact equality.
  const primaryEntityTokens = tokenize(entityName);

  let scored = 0;
  let promoted = 0;
  let errors = 0;

  for (const row of pending) {
    const raw = (row.raw_response ?? {}) as Record<string, unknown>;
    const ownerName = typeof raw.ownerName === "string" ? raw.ownerName : null;
    const entityFilingIdMatch =
      !!ownerName &&
      primaryEntityTokens.size > 0 &&
      (() => {
        const own = tokenize(ownerName);
        // Strict equality (not subset) — same-state same-name only.
        if (own.size !== primaryEntityTokens.size) return false;
        for (const t of own) if (!primaryEntityTokens.has(t)) return false;
        return true;
      })();

    const breakdown = scoreRow({
      row,
      borrowerName,
      entityName,
      cluster,
      officerTokens,
      entityFilingIdMatch,
    });

    const update: Record<string, unknown> = {
      review_confidence: Math.max(0, Math.min(100, breakdown.total)),
      review_signals: breakdown.signals,
    };
    if (breakdown.promotion_eligible) {
      update.review_status = "auto_accepted";
      promoted++;
    }

    const { error: updErr } = await supabase
      .from("track_record_entries")
      .update(update)
      .eq("id", row.id);
    if (updErr) {
      console.warn(`[review.scoreAndPromote] update failed for ${row.id}:`, updErr.message);
      errors++;
    } else {
      scored++;
    }
  }

  return { scored, promoted, errors };
}
