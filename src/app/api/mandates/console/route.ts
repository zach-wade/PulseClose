// GET /api/mandates/console — the fund-side roll-up: each mandate the org
// publishes + how borrowers measure against it (pass / conditional / fail
// counts, pass rate, latest assessments). This is "what a capital provider sees
// across the deals run against its standard" — the Mandate Console view.
//
// Cross-ORIGINATOR aggregation (a fund seeing verdicts across the originators it
// funds) is the gated Fund-tenant feature; this aggregates within the org. The
// console page labels the cross-originator panel as a preview.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const [mandatesRes, assessmentsRes] = await Promise.all([
    supabase
      .from("investor_mandates")
      .select("id, name, gates, enabled, investors ( display_name )")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("mandate_assessments")
      .select("mandate_id, validation_id, result, failures, created_at, borrower_validations ( borrower_name )")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false }),
  ]);

  const mandates = mandatesRes.data ?? [];
  const assessments = assessmentsRes.data ?? [];

  const rollups = mandates.map((m) => {
    const mine = assessments.filter((a) => a.mandate_id === m.id);
    const pass = mine.filter((a) => a.result === "pass").length;
    const conditional = mine.filter((a) => a.result === "conditional").length;
    const fail = mine.filter((a) => a.result === "fail").length;
    const total = mine.length;
    return {
      id: m.id,
      name: m.name,
      enabled: m.enabled,
      investor_name: (m.investors as { display_name?: string } | null)?.display_name ?? null,
      gates: m.gates,
      total,
      pass,
      conditional,
      fail,
      pass_rate: total > 0 ? pass / total : null,
      recent: mine.slice(0, 6).map((a) => ({
        validation_id: a.validation_id,
        borrower_name: (a.borrower_validations as { borrower_name?: string } | null)?.borrower_name ?? null,
        result: a.result,
        failure_count: Array.isArray(a.failures) ? a.failures.length : 0,
      })),
    };
  });

  return NextResponse.json({ mandates: rollups });
}
