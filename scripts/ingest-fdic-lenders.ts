// Populate the `lenders` table with FDIC-classified banks (global rows,
// org_id = null) plus a small known-bridge denylist for the names that
// recur in private-credit bridge lending.
//
// Run with:
//   npx tsx scripts/ingest-fdic-lenders.ts
//
// Re-runnable: each lender is matched by (org_id IS NULL, normalized_name);
// existing rows are updated, missing rows are inserted.
//
// FDIC API (free, no auth): https://banks.data.fdic.gov/api/institutions

import { createClient } from "@supabase/supabase-js";
import { normalizeText } from "../src/lib/domain/upsert";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

interface FdicInstitution {
  data: {
    NAME?: string;
    CERT?: string | number;
    ACTIVE?: string | number;
    STNAME?: string;
  };
}

interface FdicResponse {
  data?: FdicInstitution[];
  meta?: { total?: number };
}

// Known bridge / private-credit lenders that don't show up in FDIC.
// Manually curated — the 10-20 names that matter.
const KNOWN_BRIDGE: Array<{ name: string; classification: "bridge" | "private_credit" }> = [
  { name: "Insignia Capital Corp", classification: "bridge" },
  { name: "Velocity Mortgage Capital", classification: "bridge" },
  { name: "Lima One Capital", classification: "bridge" },
  { name: "RCN Capital", classification: "bridge" },
  { name: "Anchor Loans", classification: "bridge" },
  { name: "Kiavi", classification: "bridge" },
  { name: "Yabi", classification: "bridge" },
  { name: "Roc Capital", classification: "bridge" },
  { name: "Genesis Capital", classification: "bridge" },
  { name: "CoreVest Finance", classification: "bridge" },
  { name: "Temple View Capital", classification: "bridge" },
  { name: "Sharestates", classification: "private_credit" },
  { name: "Patch of Land", classification: "private_credit" },
  { name: "PeerStreet", classification: "private_credit" },
  { name: "Colchis Capital", classification: "private_credit" },
];

async function fetchFdicPage(offset: number, limit: number): Promise<FdicInstitution[]> {
  const url = new URL("https://banks.data.fdic.gov/api/institutions");
  url.searchParams.set("filters", "ACTIVE:1");
  url.searchParams.set("fields", "NAME,CERT,ACTIVE,STNAME");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`FDIC API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as FdicResponse;
  return json.data ?? [];
}

async function upsertGlobalLender(
  displayName: string,
  classification: "bank" | "bridge" | "private_credit",
  fdicId: string | null,
): Promise<"inserted" | "updated" | "skipped"> {
  const name = displayName.trim();
  if (!name) return "skipped";
  const normalized = normalizeText(name);
  if (!normalized) return "skipped";

  const { data: existing } = await supabase
    .from("lenders")
    .select("id, classification, fdic_id")
    .is("org_id", null)
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existing) {
    if (existing.classification !== classification || existing.fdic_id !== fdicId) {
      await supabase
        .from("lenders")
        .update({ classification, fdic_id: fdicId })
        .eq("id", existing.id);
      return "updated";
    }
    return "skipped";
  }

  const { error } = await supabase
    .from("lenders")
    .insert({ org_id: null, display_name: name, classification, fdic_id: fdicId });
  if (error) {
    console.warn(`  ! insert failed for "${name}": ${error.message}`);
    return "skipped";
  }
  return "inserted";
}

async function main() {
  console.log("Ingesting FDIC institutions…");
  const PAGE = 1000;
  let offset = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  while (true) {
    const page = await fetchFdicPage(offset, PAGE);
    if (page.length === 0) break;

    for (const inst of page) {
      const name = inst.data.NAME;
      const cert = inst.data.CERT != null ? String(inst.data.CERT) : null;
      if (!name) continue;
      const result = await upsertGlobalLender(name, "bank", cert);
      if (result === "inserted") totalInserted++;
      else if (result === "updated") totalUpdated++;
      else totalSkipped++;
    }

    process.stdout.write(`  processed ${offset + page.length} (in:${totalInserted} up:${totalUpdated} sk:${totalSkipped})\r`);
    offset += page.length;
    if (page.length < PAGE) break;
  }
  console.log("");

  console.log("Adding known bridge / private-credit lenders…");
  for (const { name, classification } of KNOWN_BRIDGE) {
    const result = await upsertGlobalLender(name, classification, null);
    if (result === "inserted") totalInserted++;
    else if (result === "updated") totalUpdated++;
    else totalSkipped++;
    console.log(`  ${result.padEnd(8)} ${name} (${classification})`);
  }

  console.log("");
  console.log(`Done. inserted=${totalInserted} updated=${totalUpdated} skipped=${totalSkipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
