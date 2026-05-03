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
  // Fail CLOSED on lookup error or missing row. This is a privacy gate —
  // if we can't confirm the org consented to LLM exposure, we don't
  // expose. A transient DB hiccup that blocks AI extraction shows a
  // clear error to the user (paste manually); a hiccup that silently
  // sends opted-out PII to Claude is a privacy violation we can't undo.
  if (error || !data) return false;
  return data.ai_extraction_enabled !== false;
}

export async function requireAiEnabled(orgId: string): Promise<void> {
  if (!(await isAiEnabled(orgId))) throw new AiDisabledError();
}
