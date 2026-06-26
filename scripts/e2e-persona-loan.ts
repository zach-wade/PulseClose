// Persona E2E — run a REAL ICC loan through the live validation pipeline under a
// given persona's org, using only FREE sources (NY DOS live entity, CourtListener,
// OpenSanctions, Realie/RentCast track record; FL/CA entity would need Cobalt and
// is intentionally NOT keyed here, so a miss reads "needs review", never a charge).
//
// Also builds the investor handoff document for the run so we verify the thread-1
// screening-label humanization on genuinely-pulled data (no raw potential_match).
//
// Run: set -a; source .env.local; set +a; npx tsx scripts/e2e-persona-loan.ts <loanKey>
//   loanKey ∈ nachman | pappas
import { createClient } from "@supabase/supabase-js";
import { runValidationPipeline } from "../src/lib/validations/pipeline";
import { computeVerdictsForValidations } from "../src/lib/validation/verdict-batch";
import { computeVerdict } from "../src/lib/validation/verdict";
import { buildHandoffDocument } from "../src/lib/handoff/builder";
import {
  sanctionsScreeningLabel,
  litigationSummaryLabel,
} from "../src/lib/handoff/screening-display";

const ORGS = {
  underwriter: "27296b6b-87f2-4b71-9e84-2c71f652449c",
  solo: "db330e86-bce5-4428-9cd3-81c2a683884a",
  fund: "0aada23e-56f5-47ce-b400-a872be3daaf1",
};

// Real ICC loans (Nexys "Loan Report" export) chosen for FREE coverage today.
const LOANS = {
  // #10285 — NY entity resolves free via the live DOS API (no Cobalt). No GC (NY
  // has no statewide GC) → GC pillar n/a. Underwriter / fullest-available run.
  nachman: {
    org: ORGS.underwriter,
    persona: "Underwriter",
    input: {
      borrower_name: "Sharon Nachman",
      borrower_entity_name: "L Y I LLC",
      entity_state: "NY",
      guarantor_name: "Sharon Nachman",
      property_addresses: ["7 Spencer Pl, Scarsdale, NY 10583"],
    },
  },
  // #10288 — individual borrower, no entity, no GC (FL condo bridge). Entity + GC
  // pillars n/a; litigation/sanctions/track-record run free. Solo / verify-only.
  pappas: {
    org: ORGS.solo,
    persona: "Solo (verify-only)",
    input: {
      borrower_name: "Theodore Pappas",
      borrower_entity_name: "",
      entity_state: "FL",
      guarantor_name: "Theodore Pappas",
      property_addresses: ["3300 S Ocean Blvd 104 S, Palm Beach, FL 33480"],
    },
  },
} as const;

async function main() {
  const key = (process.argv[2] ?? "nachman") as keyof typeof LOANS;
  const loan = LOANS[key];
  if (!loan) throw new Error(`unknown loan key: ${key}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log(`\n=== ${loan.persona} · real loan "${key}" ===`);
  console.log(`borrower=${loan.input.borrower_name} entity=${loan.input.borrower_entity_name || "(none)"} state=${loan.input.entity_state}`);

  const result = await runValidationPipeline({
    supabase,
    orgId: loan.org,
    actorUserId: null,
    checksUsed: 0,
    background: true,
    input: loan.input,
  });

  console.log(`\nvalidation_id : ${result.validation_id}`);
  console.log(`overall_status: ${result.overall_status}`);
  console.log(`tier          : ${result.tier}  ·  confidence ${result.confidence_score}%`);

  // Authoritative verdict via the SAME computeVerdict() the detail page uses —
  // assembled from the persisted checks, so this doubles as a consistency check
  // against the batch path (lists/handoff) below.
  const [ecs, trs, lits, gcs, sans] = await Promise.all([
    supabase.from("entity_checks").select("state, sos_status, flags, raw_response").eq("validation_id", result.validation_id),
    supabase.from("track_record_entries").select("outcome, review_status").eq("validation_id", result.validation_id),
    supabase.from("litigation_checks").select("result, details, raw_response").eq("validation_id", result.validation_id),
    supabase.from("gc_validations").select("license_status").eq("validation_id", result.validation_id),
    supabase.from("sanctions_checks").select("result, matches, match_count").eq("validation_id", result.validation_id),
  ]);
  const v = computeVerdict({
    entity_checks: ecs.data ?? [],
    track_record: trs.data ?? [],
    litigation_checks: lits.data ?? [],
    gc_validations: gcs.data ?? [],
    sanctions_checks: (sans.data ?? []) as never,
    tier: (result.tier as "LOW" | "MEDIUM" | "HIGH") ?? null,
  });
  console.log(`\nVERDICT: ${v.state}  "${v.headline}"`);
  console.log(`  why: ${v.reason}`);
  for (const p of v.pillars) {
    console.log(`  · ${p.label.padEnd(16)} ${p.status.padEnd(14)} ${(p.subLabel ?? "").padEnd(22)} — ${p.message}`);
  }

  // Cross-check: the batch path (used by lists + the handoff BLUF) must agree.
  const vmap = await computeVerdictsForValidations(supabase, [
    { id: result.validation_id, primary_borrower_id: null, created_at: new Date().toISOString() },
  ]);
  const bv = vmap.get(result.validation_id);
  const agree = bv?.state === v.state && bv?.headline === v.headline;
  console.log(`  consistency: detail vs batch ${agree ? "✓ agree" : `✗ MISMATCH (batch="${bv?.state}/${bv?.headline}")`}`);

  // Entity source (free vs Cobalt).
  const ec = (ecs.data ?? [])[0];
  if (ec) {
    const raw = ec.raw_response as { _error?: boolean; _source?: string; source?: string } | null;
    console.log(`\nEntity: sos_status=${ec.sos_status} _error=${raw?._error ?? false} source=${raw?._source ?? raw?.source ?? "?"}`);
  } else {
    console.log(`\nEntity: (no entity check — individual borrower)`);
  }

  // Thread-1 verification: the handoff's screening labels on real data.
  const doc = await buildHandoffDocument(supabase, result.validation_id, loan.org);
  if (doc) {
    console.log(`\nHandoff screening labels (thread-1 humanization):`);
    console.log(`  Sanctions / PEP    → "${sanctionsScreeningLabel(doc.sanctions)}"`);
    console.log(`  Federal litigation → "${litigationSummaryLabel(doc.litigation)}"`);
    console.log(`  BLUF verdict       → "${doc.verdict?.headline}"`);
  }

  console.log(`\nLive: https://app.pulseclose.com/dashboard/validations/${result.validation_id}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
