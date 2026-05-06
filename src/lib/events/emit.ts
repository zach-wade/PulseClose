// activity_events emission helper. Every state change in the app should
// fire one of these so the activity feed (B5) and validation diff (B6)
// have a single source of truth for "what happened".
//
// Usage:
//   import { emitActivity } from "@/lib/events/emit";
//
//   emitActivity(supabase, {
//     orgId: profile.org_id,
//     actorUserId: profile.id,
//     verb: "created",
//     subjectType: "validation",
//     subjectId: validation.id,
//     metadata: { borrower_name },
//   });
//
// Fire-and-forget by design — the caller doesn't await unless it cares.
// Wrap in withErrorLog() at call sites that DO await so a failed emit
// doesn't poison the request.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityVerb =
  | "created"
  | "updated"
  | "deleted"
  | "applied_signal"
  | "ran_monitor"
  | "changed_tier"
  | "sent_handoff"
  | "sent_share_link"
  | "downloaded_handoff"
  | "evaluated_deal"
  | "extracted_doc"
  | "extracted_investor_criteria"
  | "uploaded_photo"
  | "uploaded_document"
  | "reported_outcome"
  | "subscribed_to_monitor"
  | "unsubscribed_from_monitor"
  | "overrode_factor"
  | "removed_factor_override"
  | "compared"
  | "regenerated_memo"
  | "added_gc"
  | "routed_to_investor";

export type ActivitySubjectType =
  | "validation"
  | "borrower"
  | "property"
  | "entity"
  | "signal"
  | "monitor_run"
  | "monitor_subscription"
  | "deal_evaluation"
  | "document"
  | "investor"
  | "handoff";

export interface ActivityEvent {
  orgId: string;
  actorUserId: string | null;
  verb: ActivityVerb;
  subjectType: ActivitySubjectType;
  subjectId: string;
  metadata?: Record<string, unknown>;
}

export async function emitActivity(
  supabase: SupabaseClient,
  event: ActivityEvent,
): Promise<void> {
  const { error } = await supabase.from("activity_events").insert({
    org_id: event.orgId,
    actor_user_id: event.actorUserId,
    verb: event.verb,
    subject_type: event.subjectType,
    subject_id: event.subjectId,
    metadata: event.metadata ?? {},
  });
  if (error) {
    // Activity-log write failures should never break the user request.
    // Log + continue.
    console.warn(`[activity_events] insert failed:`, error.message, { event });
  }
}
