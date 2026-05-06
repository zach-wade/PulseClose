// GET /api/validations/compare?ids=uuid1,uuid2
//
// Returns a structured side-by-side diff between two validations: header
// metadata, factor rows aligned by factor_key, and portfolio metrics.
// Powers /dashboard/compare. Reusable by B6 (validation-diff-over-time)
// when called with two snapshots of the same borrower.
//
// Constraints:
//   - Both validations must belong to the caller's org. Cross-org compares
//     return 404 (RLS would too — explicit check returns clearer errors).
//   - At most 2 IDs for now; allowing N would change the diff shape.
//
// Response shape:
//   {
//     validations: [{ id, borrower_name, entity_name, validation_date,
//                     tier, flag_count, confidence_score, ... }, { ... }],
//     factors: [{ factor_key, label,
//                 severity_a, excluded_a, exclusion_reason_a,
//                 severity_b, excluded_b, exclusion_reason_b,
//                 contributing_data_a, contributing_data_b }, ...],
//     portfolio: [{ property_count, completed_sales, current_holdings,
//                   total_volume, longest_hold_months, avg_ltv_pct }, { ... }]
//   }

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { deriveTier, humanizeFactorKey, type RiskFactor, type Tier } from "@/lib/risk/factors";
import { emitActivity } from "@/lib/events/emit";

interface ValidationHeader {
  id: string;
  borrower_name: string;
  entity_name: string | null;
  validation_date: string | null;
  created_at: string;
  overall_status: string;
  confidence_score: number | null;
  experience_tier: number | null;
  property_count: number | null;
  flag_count: number | null;
  tier: Tier;
}

interface ComparedFactor {
  factor_key: string;
  label: string;
  severity_a: RiskFactor["severity"] | null;
  excluded_a: boolean | null;
  exclusion_reason_a: string | null;
  contributing_data_a: Record<string, unknown> | null;
  severity_b: RiskFactor["severity"] | null;
  excluded_b: boolean | null;
  exclusion_reason_b: string | null;
  contributing_data_b: Record<string, unknown> | null;
}

interface PortfolioMetrics {
  property_count: number;
  completed_sales: number;
  current_holdings: number;
  total_acquisition_volume: number | null;
  total_realized_profit: number | null;
  longest_hold_months: number | null;
  avg_ltv_pct: number | null;
}

// Canonical factor sequence — matches the order in factors.ts compute. Keeps
// the comparison rows visually consistent across borrowers even when one
// has factors the other doesn't.
const FACTOR_ORDER = [
  "entity_status",
  "active_fed_litigation",
  "dismissed_litigation",
  "sanctions_hit",
  "gc_license_issue",
  "extended_hold",
  "lender_concentration",
  "address_consistency",
  "foreclosure_distress",
  "market_outlier",
  "market_outlier_unavailable",
];

export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const idsRaw = url.searchParams.get("ids");
  if (!idsRaw) {
    return NextResponse.json(
      { error: "ids query param required (e.g. ?ids=uuid1,uuid2)" },
      { status: 400 },
    );
  }
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length !== 2) {
    return NextResponse.json(
      { error: "Pass exactly 2 ids" },
      { status: 400 },
    );
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ids.every((id) => uuidRe.test(id))) {
    return NextResponse.json({ error: "Invalid uuid format" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Validations belong to caller's org
  const { data: validations, error: vErr } = await supabase
    .from("borrower_validations")
    .select(
      "id, borrower_name, borrower_entity_name, validation_date, created_at, overall_status, confidence_score, experience_tier, property_count, flag_count",
    )
    .in("id", ids)
    .eq("org_id", profile.org_id);

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  if (!validations || validations.length !== 2) {
    return NextResponse.json(
      { error: "One or both validations not found in your org" },
      { status: 404 },
    );
  }

  // Re-order validations to match the request order so the UI's left/right
  // columns are deterministic.
  const validationsByOrder = ids.map((id) => validations.find((v) => v.id === id)!);

  // Factors per validation
  const { data: factorsRaw } = await supabase
    .from("risk_factors")
    .select("validation_id, factor_key, severity, excluded, exclusion_reason, contributing_data")
    .in("validation_id", ids);

  const factorsByValidation: Record<string, RiskFactor[]> = { [ids[0]]: [], [ids[1]]: [] };
  for (const f of (factorsRaw ?? []) as Array<{
    validation_id: string;
    factor_key: string;
    severity: RiskFactor["severity"];
    excluded: boolean;
    exclusion_reason: string | null;
    contributing_data: Record<string, unknown> | null;
  }>) {
    factorsByValidation[f.validation_id]?.push({
      factor_key: f.factor_key,
      severity: f.severity,
      excluded: f.excluded,
      exclusion_reason: f.exclusion_reason,
      contributing_data: f.contributing_data ?? {},
      explanation: "",
    });
  }

  const headers: ValidationHeader[] = validationsByOrder.map((v) => ({
    id: v.id,
    borrower_name: v.borrower_name,
    entity_name: v.borrower_entity_name ?? null,
    validation_date: v.validation_date,
    created_at: v.created_at,
    overall_status: v.overall_status,
    confidence_score: v.confidence_score,
    experience_tier: v.experience_tier,
    property_count: v.property_count,
    flag_count: v.flag_count,
    tier: deriveTier(factorsByValidation[v.id] ?? []),
  }));

  // Build aligned factor rows
  const allKeys = new Set<string>([
    ...factorsByValidation[ids[0]].map((f) => f.factor_key),
    ...factorsByValidation[ids[1]].map((f) => f.factor_key),
  ]);
  // Order: canonical first, then any unknown keys appended alphabetically
  const orderedKeys = [
    ...FACTOR_ORDER.filter((k) => allKeys.has(k)),
    ...[...allKeys].filter((k) => !FACTOR_ORDER.includes(k)).sort(),
  ];

  function lookup(key: string, vid: string) {
    return factorsByValidation[vid].find((f) => f.factor_key === key) ?? null;
  }

  const comparedFactors: ComparedFactor[] = orderedKeys.map((key) => {
    const a = lookup(key, ids[0]);
    const b = lookup(key, ids[1]);
    return {
      factor_key: key,
      label: humanizeFactorKey(key),
      severity_a: a?.severity ?? null,
      excluded_a: a?.excluded ?? null,
      exclusion_reason_a: a?.exclusion_reason ?? null,
      contributing_data_a: a?.contributing_data ?? null,
      severity_b: b?.severity ?? null,
      excluded_b: b?.excluded ?? null,
      exclusion_reason_b: b?.exclusion_reason ?? null,
      contributing_data_b: b?.contributing_data ?? null,
    };
  });

  // Portfolio metrics per validation
  const { data: tracksRaw } = await supabase
    .from("track_record_entries")
    .select("validation_id, acquisition_price, disposition_price, profit, hold_months")
    .in("validation_id", ids);

  const portfolio: PortfolioMetrics[] = ids.map((vid) => {
    const tracks = (tracksRaw ?? []).filter((t) => t.validation_id === vid);
    const completed = tracks.filter((t) => t.disposition_price != null);
    const held = tracks.filter((t) => t.disposition_price == null);
    const totalAcq = tracks.reduce((sum, t) => sum + (Number(t.acquisition_price) || 0), 0);
    const totalProfit = completed.reduce((sum, t) => sum + (Number(t.profit) || 0), 0);
    const longestHold = tracks.reduce((max, t) => {
      const h = Number(t.hold_months) || 0;
      return h > max ? h : max;
    }, 0);
    return {
      property_count: tracks.length,
      completed_sales: completed.length,
      current_holdings: held.length,
      total_acquisition_volume: totalAcq > 0 ? totalAcq : null,
      total_realized_profit: completed.length > 0 ? totalProfit : null,
      longest_hold_months: longestHold > 0 ? longestHold : null,
      avg_ltv_pct: null, // requires raw_response shape parsing — defer to UI/v2
    };
  });

  // Activity event — track which borrowers got compared. metadata.against
  // captures the other id for the timeline view.
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "compared",
    subjectType: "validation",
    subjectId: ids[0],
    metadata: { against_validation_id: ids[1] },
  });

  return NextResponse.json({
    validations: headers,
    factors: comparedFactors,
    portfolio,
  });
}
