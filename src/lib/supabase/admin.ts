import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Admin client bypasses RLS — use only for server-side operations
// where the session-based client can't resolve the user profile.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
