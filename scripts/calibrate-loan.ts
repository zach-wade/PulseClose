// Loan calibration harness — run a REAL historical ICC loan through the LIVE
// vendor pipeline and diff what PulseClose pulls against the loan-file ground
// truth, surfacing every gap. This is the fidelity loop: "we ran your real loan
// and here's where it matched your file and where it didn't."
//
// Ground truth is extracted from the Nexys audit logs / loan packages in
// ~/Downloads + the consulting data folder. Calls the live adapters directly
// (bypassing the auth'd API) so it's a pure data-fidelity test, no DB writes.
//
// Run:  set -a; source .env.local; set +a; npx tsx scripts/calibrate-loan.ts
//
// NOTE: this fires real vendor calls (Cobalt/Realie/RentCast/CourtListener/CSLB/
// OpenSanctions) against a real borrower — it is diligence the product runs in
// production. No data is persisted.

import { getAdapter, getPropertyDataSource, getGCDataSource } from "../src/lib/adapters";
import { enrichPropertiesWithRentcast } from "../src/lib/adapters/rentcast";
import { GOLDEN, type GoldenCase } from "./golden-loans";

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
const GAP = "⛔ GAP";
const OK = "✓";
const PARTIAL = "◐";

async function calibrate(g: GoldenCase) {
  const adapter = getAdapter();
  console.log(`\n${"═".repeat(78)}\nLOAN ${g.loan_id} — ${g.borrower_name} · ${g.property_address}`);
  console.log(`Ground truth: as-is ${usd(g.truth.as_is_value)} · ARV ${usd(g.truth.arv)} · rehab ${usd(g.truth.rehab_budget)} · loan ${usd(g.truth.loan_amount)} · FICO ${g.truth.fico} · ${g.truth.loan_purpose}`);
  console.log(`Property source: ${getPropertyDataSource()} · GC source: ${getGCDataSource(g.gc_state ?? g.property_state, undefined)}`);
  console.log("─".repeat(78));
  const gaps: string[] = [];

  // ── ① Entity (Cobalt SOS) ──
  if (g.entity_name) {
    const e = await adapter.lookupEntity({ entity_name: g.entity_name, state: g.entity_state });
    console.log(`① ENTITY  ${e.sos_status === "active" ? OK : PARTIAL} ${e.entity_name} — ${e.sos_status} · agent: ${e.registered_agent ?? "—"}`);
  } else {
    console.log(`① ENTITY  ${GAP} no vesting entity name captured at intake (loan is LLC-titled) — entity lookup CANNOT run`);
    gaps.push("Entity: intake must capture the vesting LLC name (it's on the title/loan package, not in our 4-field intake).");
  }

  // ── ② Track record (Realie owner search → RentCast enrich) ──
  let props = await adapter.searchProperties({ borrower_name: g.borrower_name, entity_name: g.entity_name ?? g.borrower_name, state: g.property_state });
  console.log(`② TRACK RECORD  found ${props.length} propert${props.length === 1 ? "y" : "ies"} for "${g.borrower_name}" in ${g.property_state}`);
  if (props.length === 0) {
    console.log(`     ${GAP} owner search returned nothing — can't build a track record from the borrower name alone`);
    gaps.push("Track record: owner-name search found 0 properties — either name-match miss or borrower holds via LLCs (need entity-anchored search).");
  } else {
    // Enrich up to 3 with RentCast sale history to test price/profit completeness
    const enriched = await enrichPropertiesWithRentcast(props.slice(0, 3), process.env.RENTCAST_API_KEY ?? "");
    let missingPrice = 0;
    for (const p of enriched) {
      const priced = p.acquisition_price != null && p.disposition_price != null;
      if (!priced) missingPrice++;
      console.log(`     • ${p.property_address}`);
      console.log(`        acq ${usd(p.acquisition_price)} (${p.acquisition_date ?? "—"}) → disp ${usd(p.disposition_price)} (${p.disposition_date ?? "—"}) · profit ${usd(p.profit)} · ${p.project_type ?? "—"}`);
    }
    if (missingPrice > 0) gaps.push(`Track record: ${missingPrice}/${enriched.length} enriched properties missing a sale price (non-disclosure states) — profit uncomputable from public data.`);
    gaps.push("Track record: REHAB SPEND is never in public records (RentCast/Realie) — must ingest from the loan package. Profit is therefore understated for flips.");
  }
  // Does the subject property's own history come back?
  const subj = await enrichPropertiesWithRentcast(
    [{ property_address: g.property_address, acquisition_date: null, acquisition_price: null, disposition_date: null, disposition_price: null, hold_months: null, profit: null, project_type: null, outcome: null, source: "subject", raw_response: {} } as never],
    process.env.RENTCAST_API_KEY ?? "",
  );
  const s = subj[0] as { acquisition_date: string | null; acquisition_price: number | null };
  console.log(`     subject ${g.property_address}: last acquisition ${usd(s.acquisition_price)} (${s.acquisition_date ?? "—"}) [truth as-is ${usd(g.truth.as_is_value)}]`);

  // ── ③ Litigation (CourtListener — FEDERAL ONLY) ──
  const lit = await adapter.searchLitigation({ entity_name: g.entity_name ?? g.borrower_name, borrower_name: g.borrower_name, known_states: [g.property_state].filter(Boolean) as string[] });
  const litIncomplete = lit.some((l) => l.result === "not_run");
  const found = lit.filter((l) => l.result === "found");
  const confirmed = found.filter((l) => l.confidence === "confirmed").length;
  const toReview = found.filter((l) => l.confidence === "possible" || l.confidence === "probable").length;
  const weak = found.filter((l) => l.confidence === "weak").length;
  if (litIncomplete) {
    console.log(`③ LITIGATION  ${PARTIAL} SCREEN INCOMPLETE (not_run) — rate-limited/upstream error; NOT presented as clear (finding #13 fix). ${found.length} partial record(s).`);
  } else {
    console.log(`③ LITIGATION  ${found.length} federal record(s) for "${g.borrower_name}" — ${confirmed} confirmed · ${toReview} possible/review · ${weak} unlikely (not the named party) (CourtListener = FEDERAL only)`);
    if (toReview > 0 && confirmed === 0) console.log(`             → ${toReview} possible ${toReview === 1 ? "match" : "matches"} — review; ${weak} caption non-matches filtered to "unlikely" (disambiguation working).`);
  }
  gaps.push("Litigation: CourtListener is federal-only — NO state-court judgments/liens (TLOxp/LexisNexis would fill, FCRA-gated).");

  // ── ④ GC (CSLB / Cobalt contractor) ──
  if (g.gc_name) {
    const gc = await adapter.lookupGC({ gc_name: g.gc_name, state: g.gc_state ?? g.property_state });
    console.log(`④ GC  ${gc.license_status === "active" ? OK : PARTIAL} ${gc.gc_name} — ${gc.license_status}`);
  } else {
    console.log(`④ GC  ${GAP} no GC name captured — heavy rehab (${usd(g.truth.rehab_budget)}) but no contractor to validate`);
    gaps.push("GC: intake didn't capture the GC; and CSLB is CA-only (no national contractor API exists).");
  }

  // ── ⑤ Sanctions (OpenSanctions → OFAC) ──
  const sanc = await adapter.screenSanctions({ borrower_name: g.borrower_name, entity_name: g.entity_name ?? g.borrower_name, guarantor_name: g.guarantor_name ?? undefined, known_states: [g.property_state].filter(Boolean) as string[] });
  const isScreening = (m: { category?: string }) => m.category == null || m.category === "sanction" || m.category === "pep";
  const screening = sanc.matches.filter(isScreening);
  const excl = sanc.matches.length - screening.length;
  const sancReview = screening.filter((m) => m.confidence === "possible" || m.confidence === "probable").length;
  console.log(
    `⑤ SANCTIONS  ${sanc.result} (${screening.length} sanctions/PEP [${sancReview} to review], ${excl} exclusion-list [informational] · ${sanc.highest_confidence ?? "n/a"} · ${sanc.common_name_likely ? "COMMON NAME" : "name ok"}) · source: ${sanc.source}`,
  );
  if (sanc.review_summary) console.log(`             → ${sanc.review_summary}`);
  for (const m of sanc.matches.slice(0, 3)) {
    const id = m.identifiers;
    const facts = id
      ? [
          id.dob?.length ? `DOB ${id.dob.slice(0, 2).join("/")}` : null,
          id.nationality?.length ? `nat ${id.nationality.slice(0, 2).join("/")}` : null,
          id.birth_place?.length ? `POB ${id.birth_place[0]}` : null,
          id.positions?.length ? `role ${id.positions[0]}` : null,
        ].filter(Boolean).join(" · ")
      : "no published identifiers";
    console.log(`             · ${m.matched_name} [${m.list_name}] ${Math.round(m.score * 100)}% · ${(m.category ?? "—").toUpperCase()} — ${facts || "name-only entry"} (${m.confidence})`);
  }

  // ── Underwriting inputs (NOT vendor-pullable) ──
  console.log(`⑥ UW INPUTS  ${GAP} as-is/ARV/rehab/NOI come from the appraisal + loan package, never an API`);
  gaps.push("Underwriting: as-is value, ARV, rehab budget, NOI/rents are appraisal/package data — ingest, never pull.");

  console.log(`\n  GAPS SURFACED (${gaps.length}):`);
  gaps.forEach((x, i) => console.log(`   ${i + 1}. ${x}`));
  return gaps;
}

async function main() {
  console.log("PulseClose loan calibration — live pipeline vs. real loan-file ground truth");
  for (const g of GOLDEN) await calibrate(g);
  console.log(`\n${"═".repeat(78)}\nDone. Review the GAPS per loan above.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
