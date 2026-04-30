// Upsert-or-find helpers for domain entities (borrowers, entities,
// properties, lenders). Each helper takes the org context plus identifying
// fields and returns the existing record's id if a match is found, else
// inserts a new row and returns its id.
//
// Match keys mirror the indexes added in 00010_domain_entities.sql:
//   borrowers   → (org_id, normalized_name)
//   entities    → (org_id, normalized_name, state)
//   properties  → (org_id, address_normalized)
//   lenders     → (org_id, normalized_name)  -- per-org; FDIC-derived rows
//                                                are global (org_id = null)
//
// Normalization mirrors the SQL helpers — must stay in sync.

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

// ── Borrowers ──────────────────────────────────────────────────────────

export async function upsertBorrower(
  supabase: Admin,
  orgId: string,
  displayName: string | null | undefined,
): Promise<string | null> {
  const name = displayName?.trim();
  if (!name) return null;
  const normalized = normalizeText(name);
  if (!normalized) return null;

  const { data: existing } = await supabase
    .from("borrowers")
    .select("id")
    .eq("org_id", orgId)
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("borrowers")
    .insert({ org_id: orgId, display_name: name })
    .select("id")
    .single();

  if (error) {
    // Race: another writer beat us. Re-read.
    const { data: race } = await supabase
      .from("borrowers")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_name", normalized)
      .maybeSingle();
    return race?.id ?? null;
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
  const normalized = normalizeText(name);
  if (!normalized) return null;
  const state = input.state ?? null;

  const query = supabase
    .from("entities")
    .select("id")
    .eq("org_id", orgId)
    .eq("normalized_name", normalized);
  const { data: existing } = await (state
    ? query.eq("state", state)
    : query.is("state", null)
  ).maybeSingle();

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
    const raceQuery = supabase
      .from("entities")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_name", normalized);
    const { data: race } = await (state
      ? raceQuery.eq("state", state)
      : raceQuery.is("state", null)
    ).maybeSingle();
    return race?.id ?? null;
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
  const { data: existing } = await supabase
    .from("borrower_entities")
    .select("id")
    .eq("borrower_id", borrowerId)
    .eq("entity_id", entityId)
    .is("superseded_at", null)
    .maybeSingle();
  if (existing) return;

  await supabase.from("borrower_entities").insert({
    borrower_id: borrowerId,
    entity_id: entityId,
    role,
    source,
    confidence,
  });
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
  const normalized = normalizeText(name);
  if (!normalized) return null;

  // First try a global (org_id null) match — FDIC-classified rows are
  // shared across all orgs and should be reused before falling back to
  // creating an org-scoped lender row.
  const { data: globalMatch } = await supabase
    .from("lenders")
    .select("id")
    .is("org_id", null)
    .eq("normalized_name", normalized)
    .maybeSingle();
  if (globalMatch) return globalMatch.id;

  const { data: orgMatch } = await supabase
    .from("lenders")
    .select("id")
    .eq("org_id", orgId)
    .eq("normalized_name", normalized)
    .maybeSingle();
  if (orgMatch) return orgMatch.id;

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
    const { data: race } = await supabase
      .from("lenders")
      .select("id")
      .eq("org_id", orgId)
      .eq("normalized_name", normalized)
      .maybeSingle();
    return race?.id ?? null;
  }
  return created.id;
}
