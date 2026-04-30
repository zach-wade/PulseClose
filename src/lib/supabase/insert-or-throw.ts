// Surface silent insert/update failures. Supabase's `.insert()` and
// `.update()` return `{ error }` rather than throwing — easy to forget
// to check, and a forgotten check means data quietly disappears.
//
// We learned this the hard way after migration 00016 added NOT NULL
// org_id to four snapshot tables: every validation since the deploy
// silently dropped its entity/track/litigation/gc data because the
// inserts violated the constraint and nobody read the error.
//
// Usage:
//   import { insertOrThrow, updateOrThrow } from "@/lib/supabase/insert-or-throw";
//
//   await insertOrThrow(
//     supabase.from("entity_checks").insert({...}),
//     "entity_checks insert (validation_id=...)",
//   );

import type { PostgrestError } from "@supabase/supabase-js";

interface ResultLike {
  error: PostgrestError | null;
}

export async function insertOrThrow<T extends ResultLike>(
  query: PromiseLike<T>,
  label: string,
): Promise<T> {
  const result = await query;
  if (result.error) {
    throw new Error(
      `${label} failed: ${result.error.message}${
        result.error.details ? ` (${result.error.details})` : ""
      }${result.error.hint ? ` [hint: ${result.error.hint}]` : ""}`,
    );
  }
  return result;
}

// Same shape, different name — improves readability at update sites.
export const updateOrThrow = insertOrThrow;
