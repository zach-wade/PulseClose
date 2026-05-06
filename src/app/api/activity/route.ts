// GET /api/activity — chronological feed of activity_events for the
// current org, with subject-side metadata resolved (borrower name, etc.).
// Powers /dashboard/activity (B5) and the per-validation activity strip
// on the detail page (G3.3).
//
// Query params:
//   limit         max rows (default 50, cap 200)
//   before        ISO timestamp cursor — return events strictly older
//   verb          filter to a single verb (created | applied_signal | ...)
//   subject_type  filter to a single subject_type (validation | borrower | ...)
//   subject_id    filter to a single subject id (typically a validation_id)
//
// The response includes a denormalized `subject_label` and `subject_link`
// per row so the UI doesn't have to round-trip per row. We resolve labels
// for known subject_types in a single batched query each.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";

interface ActivityEventRow {
  id: string;
  org_id: string;
  actor_user_id: string | null;
  verb: string;
  subject_type: string;
  subject_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ActivityFeedItem extends ActivityEventRow {
  actor_name: string | null;
  actor_email: string | null;
  subject_label: string | null;
  subject_link: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  const before = url.searchParams.get("before");
  // Allow either a single verb or a comma-separated list (e.g.
  // ?verb=overrode_factor,removed_factor_override,applied_signal). The
  // "Overrides" filter on the activity page now bundles multiple verbs.
  const verbParam = url.searchParams.get("verb");
  const verbs = verbParam ? verbParam.split(",").map((v) => v.trim()).filter(Boolean) : [];
  const subjectType = url.searchParams.get("subject_type");
  const subjectId = url.searchParams.get("subject_id");

  const supabase = createAdminClient();

  let q = supabase
    .from("activity_events")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("created_at", before);
  if (verbs.length === 1) q = q.eq("verb", verbs[0]);
  else if (verbs.length > 1) q = q.in("verb", verbs);
  if (subjectType) q = q.eq("subject_type", subjectType);
  if (subjectId) q = q.eq("subject_id", subjectId);

  const { data: events, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (events ?? []) as ActivityEventRow[];

  // Batch-resolve actor display names + subject labels.
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean))] as string[];
  const validationIds = [
    ...new Set(rows.filter((r) => r.subject_type === "validation").map((r) => r.subject_id)),
  ];
  const borrowerIds = [
    ...new Set(rows.filter((r) => r.subject_type === "borrower").map((r) => r.subject_id)),
  ];

  const [actorRes, validationRes, borrowerRes] = await Promise.all([
    actorIds.length > 0
      ? supabase.from("users").select("id, full_name, email").in("id", actorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null }> }),
    validationIds.length > 0
      ? supabase
          .from("borrower_validations")
          .select("id, borrower_name, borrower_entity_name")
          .in("id", validationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; borrower_name: string; borrower_entity_name: string | null }> }),
    borrowerIds.length > 0
      ? supabase.from("borrowers").select("id, display_name").in("id", borrowerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string }> }),
  ]);

  const actorById = new Map((actorRes.data ?? []).map((u) => [u.id, u]));
  const validationById = new Map((validationRes.data ?? []).map((v) => [v.id, v]));
  const borrowerById = new Map((borrowerRes.data ?? []).map((b) => [b.id, b]));

  const items: ActivityFeedItem[] = rows.map((r) => {
    const actor = r.actor_user_id ? actorById.get(r.actor_user_id) ?? null : null;
    let subjectLabel: string | null = null;
    let subjectLink: string | null = null;
    if (r.subject_type === "validation") {
      const v = validationById.get(r.subject_id);
      subjectLabel = v?.borrower_name ?? "(unknown borrower)";
      subjectLink = `/dashboard/validations/${r.subject_id}`;
    } else if (r.subject_type === "borrower") {
      const b = borrowerById.get(r.subject_id);
      subjectLabel = b?.display_name ?? "(unknown borrower)";
    } else {
      // signal / monitor_run / deal_evaluation / etc — no canonical detail
      // page yet. Surface the type as a hint.
      subjectLabel = `(${r.subject_type})`;
    }
    return {
      ...r,
      actor_name: actor?.full_name ?? null,
      actor_email: actor?.email ?? null,
      subject_label: subjectLabel,
      subject_link: subjectLink,
    };
  });

  return NextResponse.json({
    items,
    next_before: items.length === limit ? items[items.length - 1].created_at : null,
  });
}
