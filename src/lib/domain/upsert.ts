// Upsert-or-find helpers for domain entities (borrowers, entities,
// properties, lenders). Each helper takes the org context plus identifying
// fields and returns the existing record's id if a match is found, else
// inserts a new row and returns its id.
//
// Match keys (canonical-name dedup, 00021_canonical_name_dedup.sql):
//   borrowers   → (org_id, normalized_canonical)                  fall back to (org_id, normalized_name)
//   entities    → (org_id, normalized_canonical, state)            fall back to (org_id, normalized_name, state)
//   properties  → (org_id, address_normalized)                    [address canonicalization deferred]
//   lenders     → (org_id, normalized_canonical)                  fall back to (org_id, normalized_name)
//                                                                 plus a global (org_id IS NULL) match path
//
// `normalized_canonical` is a generated column computed by Postgres'
// `canonicalize_name(text, strip_entity_suffixes bool)`. Same logic must
// live in `canonicalizeName` below — drift between the two creates
// infinite duplicates instead of dedupes.

import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export function normalizeText(input: string | null | undefined): string | null {
  if (!input) return null;
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeAddress(input: string | null | undefined): string | null {
  if (!input) return null;
  return input
    .trim()
    .toLowerCase()
    .replace(/[,.#]/g, "")
    .replace(/\s+/g, " ");
}

// Canonical name key — must mirror Postgres canonicalize_name() exactly.
// Tokenize on non-alphanumeric, drop short noise, optionally drop entity
// suffixes, sort, join with single space. This collapses input variants
// like "Kim An Truong" / "TRUONG, KIM AN" / "Truong, Kim-An" to the same
// value ("an kim truong"). Entity-mode also collapses "Co LLC" / "L.L.C."
// suffixes.
const ENTITY_SUFFIX_TOKENS = new Set([
  "llc", "inc", "incorporated", "corp", "corporation",
  "ltd", "limited", "lp", "llp", "trust", "company", "co",
]);

export function canonicalizeName(
  input: string | null | undefined,
  opts: { stripEntitySuffixes?: boolean } = {},
): string | null {
  if (!input) return null;
  const stripEntity = opts.stripEntitySuffixes ?? false;
  // Keep length >= 1 — see migration 00021 comment for rationale (single-
  // letter prefixes like "S&T Bank" are meaningful and length-2 collapsed
  // four distinct FDIC banks together on first apply).
  const tokens = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 1)
    .filter((t) => !stripEntity || !ENTITY_SUFFIX_TOKENS.has(t))
    .sort();
  if (tokens.length === 0) return null;
  return tokens.join(" ");
}

// ── Borrowers ──────────────────────────────────────────────────────────

export async function upsertBorrower(
  supabase: Admin,
  orgId: string,
  displayName: string | null | undefined,
): Promise<string | null> {
  const name = displayName?.trim();
  if (!name) return null;
  const canonical = canonicalizeName(name, { stripEntitySuffixes: false });
  const normalized = normalizeText(name);
  if (!canonical && !normalized) return null;

  // Look up by canonical first — collapses "Kim An Truong" and "TRUONG, KIM
  // AN" to the same row. Fall back to legacy normalized_name for any rows
  // that pre-date 00021's generated column (Postgres backfills generated
  // columns automatically, but a tenant on a stale schema could still hit
  // this code path).
  if (canonical) {
    const { data: existing } = await supabase
      .from("borrowers")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_canonical", canonical)
      .maybeSingle();
    if (existing) return existing.id;
  }
  if (normalized) {
    const { data: existing } = await supabase
      .from("borrowers")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_name", normalized)
      .maybeSingle();
    if (existing) return existing.id;
  }

  const { data: created, error } = await supabase
    .from("borrowers")
    .insert({ org_id: orgId, display_name: name })
    .select("id")
    .single();

  if (error) {
    // Race: another writer beat us OR our lookup missed a sibling row whose
    // canonical key collides with ours (the unique index on
    // (org_id, normalized_canonical) raised 23505). Re-read by canonical.
    if (canonical) {
      const { data: race } = await supabase
        .from("borrowers")
        .select("id")
        .eq("org_id", orgId)
        .eq("normalized_canonical", canonical)
        .maybeSingle();
      if (race) return race.id;
    }
    if (normalized) {
      const { data: race } = await supabase
        .from("borrowers")
        .select("id")
        .eq("org_id", orgId)
        .eq("normalized_name", normalized)
        .maybeSingle();
      return race?.id ?? null;
    }
    return null;
  }
  return created.id;
}

// ── Entities ───────────────────────────────────────────────────────────

export interface UpsertEntityInput {
  displayName: string;
  state?: string | null;
  entityType?: string | null;
  formationDate?: string | null;
  latestSosStatus?: string | null;
  latestSosCheckAt?: string | null;
  latestRegisteredAgent?: string | null;
}

export async function upsertEntity(
  supabase: Admin,
  orgId: string,
  input: UpsertEntityInput,
): Promise<string | null> {
  const name = input.displayName?.trim();
  if (!name) return null;
  const canonical = canonicalizeName(name, { stripEntitySuffixes: true });
  const normalized = normalizeText(name);
  if (!canonical && !normalized) return null;
  const state = input.state ?? null;

  // Canonical lookup first — collapses "TT Investment Properties, LLC" /
  // "TT INVESTMENT PROPERTIES LLC" / "TT investment properties l.l.c." to
  // one row per state.
  let existing: { id: string } | null = null;
  if (canonical) {
    const q = supabase
      .from("entities")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_canonical", canonical);
    const { data } = await (state ? q.eq("state", state) : q.is("state", null)).maybeSingle();
    existing = data;
  }
  if (!existing && normalized) {
    const q = supabase
      .from("entities")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_name", normalized);
    const { data } = await (state ? q.eq("state", state) : q.is("state", null)).maybeSingle();
    existing = data;
  }

  // Cached-state fields to refresh on write. Only set when present so we
  // don't blow away prior values with nulls.
  const cachedFields: Record<string, string | null> = {};
  if (input.entityType !== undefined) cachedFields.entity_type = input.entityType;
  if (input.formationDate !== undefined) cachedFields.formation_date_known = input.formationDate;
  if (input.latestSosStatus !== undefined) cachedFields.latest_sos_status = input.latestSosStatus;
  if (input.latestSosCheckAt !== undefined) cachedFields.latest_sos_check_at = input.latestSosCheckAt;
  if (input.latestRegisteredAgent !== undefined) cachedFields.latest_registered_agent = input.latestRegisteredAgent;

  if (existing) {
    if (Object.keys(cachedFields).length > 0) {
      await supabase.from("entities").update(cachedFields).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("entities")
    .insert({ org_id: orgId, display_name: name, state, ...cachedFields })
    .select("id")
    .single();

  if (error) {
    // Race: re-read by canonical first, then legacy normalized_name.
    if (canonical) {
      const q = supabase
        .from("entities")
        .select("id")
        .eq("org_id", orgId)
        .eq("normalized_canonical", canonical);
      const { data: race } = await (state ? q.eq("state", state) : q.is("state", null)).maybeSingle();
      if (race) return race.id;
    }
    if (normalized) {
      const q = supabase
        .from("entities")
        .select("id")
        .eq("org_id", orgId)
        .eq("normalized_name", normalized);
      const { data: race } = await (state ? q.eq("state", state) : q.is("state", null)).maybeSingle();
      return race?.id ?? null;
    }
    return null;
  }
  return created.id;
}

// ── Properties ─────────────────────────────────────────────────────────

export interface UpsertPropertyInput {
  addressDisplay: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  apn?: string | null;
  latestAvm?: number | null;
  latestAvmCheckAt?: string | null;
}

export async function upsertProperty(
  supabase: Admin,
  orgId: string,
  input: UpsertPropertyInput,
): Promise<string | null> {
  const address = input.addressDisplay?.trim();
  if (!address) return null;
  const normalized = normalizeAddress(address);
  if (!normalized) return null;

  const { data: existing } = await supabase
    .from("properties")
    .select("id")
    .eq("org_id", orgId)
    .eq("address_normalized", normalized)
    .maybeSingle();

  const enrichments: Record<string, string | number | null> = {};
  if (input.city !== undefined) enrichments.city = input.city;
  if (input.state !== undefined) enrichments.state = input.state;
  if (input.zip !== undefined) enrichments.zip = input.zip;
  if (input.apn !== undefined) enrichments.apn = input.apn;
  if (input.latestAvm !== undefined) enrichments.latest_avm = input.latestAvm;
  if (input.latestAvmCheckAt !== undefined) enrichments.latest_avm_check_at = input.latestAvmCheckAt;

  if (existing) {
    if (Object.keys(enrichments).length > 0) {
      await supabase.from("properties").update(enrichments).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("properties")
    .insert({ org_id: orgId, address_display: address, ...enrichments })
    .select("id")
    .single();

  if (error) {
    const { data: race } = await supabase
      .from("properties")
      .select("id")
      .eq("org_id", orgId)
      .eq("address_normalized", normalized)
      .maybeSingle();
    return race?.id ?? null;
  }
  return created.id;
}

// ── Borrower-Entity link (M:M) ─────────────────────────────────────────

export type BorrowerEntityRole =
  | "member"
  | "manager"
  | "agent"
  | "guarantor"
  | "officer"
  | "other";

export async function linkBorrowerToEntity(
  supabase: Admin,
  borrowerId: string,
  entityId: string,
  role: BorrowerEntityRole,
  source: "sos" | "user" | "inferred" = "inferred",
  confidence: "high" | "medium" | "low" = "medium",
): Promise<void> {
  // Optimistic pre-check — the partial unique index added in 00016 will be
  // the actual race guard, but the read is free in the common case where
  // the link already exists.
  const { data: existing } = await supabase
    .from("borrower_entities")
    .select("id")
    .eq("borrower_id", borrowerId)
    .eq("entity_id", entityId)
    .is("superseded_at", null)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase.from("borrower_entities").insert({
    borrower_id: borrowerId,
    entity_id: entityId,
    role,
    source,
    confidence,
  });

  // Race winner: the parallel writer's row already satisfies the constraint;
  // ignore the conflict and let our caller proceed. Other errors are real and
  // must surface — current code silently swallowed them all.
  if (error && error.code !== "23505") {
    throw new Error(`linkBorrowerToEntity failed (${borrowerId}, ${entityId}): ${error.message}`);
  }
}

// ── Lenders ────────────────────────────────────────────────────────────

export interface UpsertLenderInput {
  displayName: string;
  classification?: "bank" | "bridge" | "private_credit" | "unknown";
  fdicId?: string | null;
  nmlsId?: string | null;
}

export async function upsertLender(
  supabase: Admin,
  orgId: string,
  input: UpsertLenderInput,
): Promise<string | null> {
  const name = input.displayName?.trim();
  if (!name) return null;
  const canonical = canonicalizeName(name, { stripEntitySuffixes: true });
  const normalized = normalizeText(name);
  if (!canonical && !normalized) return null;

  // Try global (org_id IS NULL) by canonical first — FDIC-classified rows
  // are shared across all orgs and should be reused before falling back to
  // creating an org-scoped lender row.
  if (canonical) {
    const { data: globalMatch } = await supabase
      .from("lenders")
      .select("id")
      .is("org_id", null)
      .eq("normalized_canonical", canonical)
      .maybeSingle();
    if (globalMatch) return globalMatch.id;
  }
  if (normalized) {
    const { data: globalMatch } = await supabase
      .from("lenders")
      .select("id")
      .is("org_id", null)
      .eq("normalized_name", normalized)
      .maybeSingle();
    if (globalMatch) return globalMatch.id;
  }

  if (canonical) {
    const { data: orgMatch } = await supabase
      .from("lenders")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_canonical", canonical)
      .maybeSingle();
    if (orgMatch) return orgMatch.id;
  }
  if (normalized) {
    const { data: orgMatch } = await supabase
      .from("lenders")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_name", normalized)
      .maybeSingle();
    if (orgMatch) return orgMatch.id;
  }

  const { data: created, error } = await supabase
    .from("lenders")
    .insert({
      org_id: orgId,
      display_name: name,
      classification: input.classification ?? "unknown",
      fdic_id: input.fdicId ?? null,
      nmls_id: input.nmlsId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (canonical) {
      const { data: race } = await supabase
        .from("lenders")
        .select("id")
        .eq("org_id", orgId)
        .eq("normalized_canonical", canonical)
        .maybeSingle();
      if (race) return race.id;
    }
    if (normalized) {
      const { data: race } = await supabase
        .from("lenders")
        .select("id")
        .eq("org_id", orgId)
        .eq("normalized_name", normalized)
        .maybeSingle();
      return race?.id ?? null;
    }
    return null;
  }
  return created.id;
}
