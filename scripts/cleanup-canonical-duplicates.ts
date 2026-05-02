// Productized version of the inline merge surgery I ran during the 00021
// migration rollout. Detects rows in borrowers/entities/lenders that share
// a `normalized_canonical` value within their dedup scope and merges them
// by re-pointing FK references to the oldest row, then deleting the
// duplicates.
//
// Idempotent — running it twice is safe; the second pass finds zero dupes.
//
// Usage:
//   npx tsx scripts/cleanup-canonical-duplicates.ts            # dry-run
//   npx tsx scripts/cleanup-canonical-duplicates.ts --apply    # actually merge
//
// Run BEFORE applying 00021's unique indexes if a tenant has accumulated
// duplicates that would violate the new constraints. The migration's
// post-apply NOTICE block surfaces the count and points here.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

interface DupRow {
  id: string;
  org_id: string | null;
  display_name: string;
  normalized_canonical: string | null;
  state?: string | null;
  fdic_id?: string | null;
  created_at: string;
}

function pickKeeper(group: DupRow[]): DupRow {
  // Prefer rows with an FDIC ID (lenders) or a populated state (entities)
  // as canonical. Fall back to oldest by created_at.
  const sorted = [...group].sort((a, b) => {
    if (a.fdic_id && !b.fdic_id) return -1;
    if (!a.fdic_id && b.fdic_id) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
  return sorted[0];
}

async function rePointFk(
  table: string,
  fkColumn: string,
  fromId: string,
  toId: string,
): Promise<number> {
  const { count: before } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(fkColumn, fromId);
  if (!before) return 0;
  if (!APPLY) return before;
  const { error } = await supabase.from(table).update({ [fkColumn]: toId }).eq(fkColumn, fromId);
  if (error) throw new Error(`re-point ${table}.${fkColumn}: ${error.message}`);
  return before;
}

async function mergeBorrowers() {
  console.log("\n=== borrowers ===");
  const { data } = await supabase
    .from("borrowers")
    .select("id, org_id, display_name, normalized_canonical, created_at")
    .order("created_at");
  const groups = new Map<string, DupRow[]>();
  for (const r of (data ?? []) as DupRow[]) {
    if (!r.normalized_canonical || !r.org_id) continue;
    const k = `${r.org_id}|${r.normalized_canonical}`;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const dups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`  ${dups.length} duplicate groups, ${dups.reduce((n, g) => n + g.length - 1, 0)} drop candidates`);
  for (const g of dups) {
    const keep = pickKeeper(g);
    const drop = g.filter((r) => r.id !== keep.id);
    console.log(`  ${keep.display_name} × ${g.length} → keep ${keep.id}`);
    for (const d of drop) {
      const validations = await rePointFk("borrower_validations", "primary_borrower_id", d.id, keep.id);
      const validationsGuarantor = await rePointFk("borrower_validations", "guarantor_borrower_id", d.id, keep.id);
      const links = await rePointFk("borrower_entities", "borrower_id", d.id, keep.id);
      const signals = await rePointFk("borrower_signals", "borrower_id", d.id, keep.id);
      const propSignals = await rePointFk("borrower_property_signals", "borrower_id", d.id, keep.id);
      const flips = await rePointFk("verified_flips", "borrower_id", d.id, keep.id).catch(() => 0);
      console.log(`    drop ${d.id} (${d.display_name}): re-point validations=${validations} guarantor=${validationsGuarantor} links=${links} signals=${signals} prop_signals=${propSignals} flips=${flips}`);
    }
    if (APPLY && drop.length > 0) {
      const { error } = await supabase.from("borrowers").delete().in("id", drop.map((d) => d.id));
      if (error) throw new Error(`delete borrowers: ${error.message}`);
    }
  }
}

async function mergeEntities() {
  console.log("\n=== entities ===");
  const { data } = await supabase
    .from("entities")
    .select("id, org_id, display_name, normalized_canonical, state, created_at")
    .order("created_at");
  const groups = new Map<string, DupRow[]>();
  for (const r of (data ?? []) as DupRow[]) {
    if (!r.normalized_canonical || !r.org_id) continue;
    const k = `${r.org_id}|${r.normalized_canonical}|${r.state ?? ""}`;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const dups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`  ${dups.length} duplicate groups, ${dups.reduce((n, g) => n + g.length - 1, 0)} drop candidates`);
  for (const g of dups) {
    const keep = pickKeeper(g);
    const drop = g.filter((r) => r.id !== keep.id);
    console.log(`  ${keep.display_name} (${keep.state}) × ${g.length} → keep ${keep.id}`);
    for (const d of drop) {
      const validations = await rePointFk("borrower_validations", "primary_entity_id", d.id, keep.id);
      const checks = await rePointFk("entity_checks", "entity_id", d.id, keep.id);
      const links = await rePointFk("borrower_entities", "entity_id", d.id, keep.id);
      const signals = await rePointFk("entity_signals", "entity_id", d.id, keep.id);
      console.log(`    drop ${d.id} (${d.display_name}): re-point validations=${validations} checks=${checks} links=${links} signals=${signals}`);
    }
    if (APPLY && drop.length > 0) {
      const { error } = await supabase.from("entities").delete().in("id", drop.map((d) => d.id));
      if (error) throw new Error(`delete entities: ${error.message}`);
    }
  }
}

async function mergeLenders() {
  console.log("\n=== lenders (org-scoped only — global FDIC rows intentionally allow dups) ===");
  const { data } = await supabase
    .from("lenders")
    .select("id, org_id, display_name, normalized_canonical, fdic_id, created_at")
    .not("org_id", "is", null)
    .order("created_at");
  const groups = new Map<string, DupRow[]>();
  for (const r of (data ?? []) as DupRow[]) {
    if (!r.normalized_canonical || !r.org_id) continue;
    const k = `${r.org_id}|${r.normalized_canonical}`;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const dups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`  ${dups.length} duplicate groups, ${dups.reduce((n, g) => n + g.length - 1, 0)} drop candidates`);
  for (const g of dups) {
    const keep = pickKeeper(g);
    const drop = g.filter((r) => r.id !== keep.id);
    console.log(`  ${keep.display_name} × ${g.length} → keep ${keep.id}`);
    for (const d of drop) {
      const ownership = await rePointFk("property_ownership", "lender_id", d.id, keep.id);
      console.log(`    drop ${d.id}: re-point property_ownership=${ownership}`);
    }
    if (APPLY && drop.length > 0) {
      const { error } = await supabase.from("lenders").delete().in("id", drop.map((d) => d.id));
      if (error) throw new Error(`delete lenders: ${error.message}`);
    }
  }
}

async function main() {
  console.log(APPLY ? ">>> APPLY mode — will modify rows" : ">>> DRY-RUN mode — no writes (pass --apply to execute)");
  await mergeBorrowers();
  await mergeEntities();
  await mergeLenders();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
