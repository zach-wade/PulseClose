// GET /api/borrowers/search?q=name — B4 "have we seen this borrower" guard.
//
// Looks up borrowers in the caller's org by canonical-name token subset.
// Surfaces inline on /dashboard/new so the lender doesn't burn vendor
// API calls re-validating someone they handled 3 weeks ago.
//
// Match is canonical-token-subset (same primitive as the dedup key) so
// "Kim An Truong" matches "Truong, Kim An" and a partial "Kim An" still
// matches the full name. We deliberately also do a person-name 2-token
// safety filter — if the caller's typed query has only 1 token of
// length >= 3, fall back to a startsWith lookup to avoid false-positive
// matches like "An" hitting "An Soon Kim".

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { canonicalizeName } from "@/lib/domain/upsert";

interface BorrowerHit {
  id: string;
  display_name: string;
  validation_count: number;
  latest_validation_at: string | null;
  match_quality: "exact" | "subset" | "prefix";
}

export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json({ matches: [] });
  }

  const supabase = createAdminClient();
  const canonical = canonicalizeName(q, { stripEntitySuffixes: false });
  if (!canonical) {
    return NextResponse.json({ matches: [] });
  }
  const tokens = canonical.split(" ").filter((t) => t.length > 0);

  // Pull all borrowers for the org. At single-tenant scale this is a few
  // dozen rows; we scan in JS for the canonical-token-subset match. When
  // a real customer has thousands, add a Postgres function backed by the
  // normalized_canonical generated column.
  const { data: borrowers } = await supabase
    .from("borrowers")
    .select("id, display_name, normalized_canonical")
    .eq("org_id", profile.org_id)
    .limit(500);

  type Row = { id: string; display_name: string; normalized_canonical: string | null };

  const candidates = (borrowers ?? []) as Row[];
  const hits: Array<Row & { match_quality: BorrowerHit["match_quality"] }> = [];

  for (const b of candidates) {
    const bCanonical = b.normalized_canonical || canonicalizeName(b.display_name);
    if (!bCanonical) continue;
    const bTokens = bCanonical.split(" ").filter((t) => t.length > 0);

    if (bCanonical === canonical) {
      hits.push({ ...b, match_quality: "exact" });
      continue;
    }
    // Subset match: every typed token appears in borrower's tokens.
    // Skip when the typed query is a single short token (prefix mode handles that).
    if (tokens.length >= 2) {
      const everyMatched = tokens.every((t) => bTokens.includes(t));
      if (everyMatched) {
        hits.push({ ...b, match_quality: "subset" });
        continue;
      }
    }
    // Prefix safety net for 1-token typed queries — e.g. user typed
    // "Truong" and we have "Truong, Kim An" in the borrower row.
    if (tokens.length === 1 && tokens[0].length >= 3) {
      const onlyToken = tokens[0];
      if (bTokens.some((t) => t.startsWith(onlyToken))) {
        hits.push({ ...b, match_quality: "prefix" });
        continue;
      }
    }
  }

  if (hits.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  // Pull validation counts per matched borrower in one query.
  const ids = hits.map((h) => h.id);
  const { data: validations } = await supabase
    .from("borrower_validations")
    .select("primary_borrower_id, created_at")
    .eq("org_id", profile.org_id)
    .in("primary_borrower_id", ids);

  const countByBorrower = new Map<string, number>();
  const latestByBorrower = new Map<string, string>();
  for (const v of validations ?? []) {
    if (!v.primary_borrower_id) continue;
    countByBorrower.set(
      v.primary_borrower_id,
      (countByBorrower.get(v.primary_borrower_id) ?? 0) + 1,
    );
    const prev = latestByBorrower.get(v.primary_borrower_id);
    if (!prev || v.created_at > prev) {
      latestByBorrower.set(v.primary_borrower_id, v.created_at);
    }
  }

  // Rank: exact > subset > prefix; within each, more validations first.
  const qualityRank = { exact: 0, subset: 1, prefix: 2 };
  const matches: BorrowerHit[] = hits
    .map((h) => ({
      id: h.id,
      display_name: h.display_name,
      validation_count: countByBorrower.get(h.id) ?? 0,
      latest_validation_at: latestByBorrower.get(h.id) ?? null,
      match_quality: h.match_quality,
    }))
    .sort((a, b) => {
      const q = qualityRank[a.match_quality] - qualityRank[b.match_quality];
      if (q !== 0) return q;
      return b.validation_count - a.validation_count;
    })
    .slice(0, 5);

  return NextResponse.json({ matches });
}
