// Public API key resolver. Hashes the bearer token, looks up the row,
// returns the owning org_id (or null if missing/revoked).
//
// Format: keys are issued as `pck_live_<32 url-safe chars>`. Prefix
// makes them grep-able in logs without exposing the secret half.

import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const KEY_PREFIX_DISPLAY_LEN = 12;

export function generateApiKey(): { full: string; prefix: string; hash: string } {
  // 32 url-safe characters via base64url(24 bytes). Roughly 192 bits of
  // entropy — well over the bcrypt-style guarantees we need.
  const random = randomBytes(24).toString("base64url");
  const full = `pck_live_${random}`;
  const prefix = full.slice(0, KEY_PREFIX_DISPLAY_LEN);
  const hash = sha256(full);
  return { full, prefix, hash };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface ApiKeyAuth {
  org_id: string;
  api_key_id: string;
}

/**
 * Resolve a Bearer token from an Authorization header to the owning
 * org. Updates last_used_at on hit (best-effort; failure doesn't block
 * the request).
 */
export async function resolveApiKey(
  supabase: SupabaseClient,
  authHeader: string | null,
): Promise<ApiKeyAuth | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const token = match[1];
  if (!token.startsWith("pck_")) return null;

  const hash = sha256(token);
  const { data: row } = await supabase
    .from("api_keys")
    .select("id, org_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!row || row.revoked_at) return null;

  // Best-effort touch; failure ignored.
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return { org_id: row.org_id, api_key_id: row.id };
}
