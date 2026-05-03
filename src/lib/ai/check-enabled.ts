// Per-org gate for any Claude API call. Loads `ai_extraction_enabled` from
// organizations and either returns silently (enabled, the default) or
// throws AiDisabledError (disabled — caller maps to a 503 with code
// AI_DISABLED so the UI can show "AI is disabled for your org — fill the
// form manually" instead of a generic failure).
//
// Use the admin client so this works from public endpoints (share-link
// upload) where there is no authenticated session, and so the lookup
// itself never depends on RLS.

import { createAdminClient } from "@/lib/supabase/admin";

export class AiDisabledError extends Error {
  code = "AI_DISABLED" as const;
  constructor() {
    super("AI extraction is disabled for this organization.");
    this.name = "AiDisabledError";
  }
}

export async function isAiEnabled(orgId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("ai_extraction_enabled")
    .eq("id", orgId)
    .maybeSingle();
  // Fail-open on lookup error — a transient DB hiccup shouldn't strand
  // the user with the strict-mode error message. If the row genuinely
  // doesn't exist (orgless caller, which shouldn't happen), default to
  // disabled so we don't silently leak PII.
  if (error) return true;
  if (!data) return false;
  return data.ai_extraction_enabled !== false;
}

export async function requireAiEnabled(orgId: string): Promise<void> {
  if (!(await isAiEnabled(orgId))) throw new AiDisabledError();
}
