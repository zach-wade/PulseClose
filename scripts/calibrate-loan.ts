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

// ── Golden cases: ground truth from the real loan files ─────────────────────
interface GoldenCase {
  loan_id: string;
  // intake inputs (what we'd feed the pipeline)
  borrower_name: string;
  entity_name: string | null; // vesting LLC — null if not captured at intake
  entity_state: string;
  guarantor_name?: string | null;
  property_address: string;
  property_state: string;
  gc_name?: string | null;
  gc_state?: string | null;
  // ground truth from the file (to diff against)
  truth: {
    as_is_value?: number;
    arv?: number;
    rehab_budget?: number;
    loan_amount?: number;
    fico?: number;
    loan_purpose?: string;
    property_type?: string;
  };
}

const GOLDEN: GoldenCase[] = [
  {
    loan_id: "10228",
    borrower_name: "Mark Morrison",
    entity_name: null, // borrowerType=LLC but the vesting entity name isn't in the structure fields → GAP
    entity_state: "CA",
    guarantor_name: "Mark Morrison",
    property_address: "2290 Newgate Ct, Santa Rosa, CA 95404",
    property_state: "CA",
    gc_name: null, // heavy rehab ($2.1M) implies a GC, but no GC name captured → GAP
    gc_state: "CA",
    truth: {
      as_is_value: 550_000,
      arv: 2_850_000,
      rehab_budget: 2_114_441,
      loan_amount: 2_473_970,
      fico: 640,
      loan_purpose: "refinance",
      property_type: "sfr",
    },
  },

  // ── Distinctive-name contrast cases ──────────────────────────────────────
  // All five below have UNCOMMON names. They prove the disambiguation layer
  // doesn't over-suppress: a clean borrower should return few/zero screening
  // false positives, NOT get everything buried under "possible — review".
  // Ground truth pulled from the Nexys audit logs (10287/10294/10295) and the
  // ICC loan-request packages (286 Virginia, 544 Sunset) in the real trove.

  {
    // Audit log 10287 — luxury SFR, MA. Distinctive surname.
    loan_id: "10287",
    borrower_name: "Christopher Soverns",
    entity_name: "14 Trapps Pond LLC",
    entity_state: "MA",
    guarantor_name: "Christopher Soverns",
    property_address: "14 Trapps Pond Rd, Edgartown, MA 02539",
    property_state: "MA",
    gc_name: null,
    gc_state: "MA",
    truth: {
      as_is_value: 9_750_000,
      loan_amount: 6_630_000,
      fico: 775,
      property_type: "sfr",
    },
  },
  {
    // Audit log 10294 — non-warrantable condo, Big Sky MT; entity DE-domiciled,
    // first-time investor (0 transactions). Distinctive full name w/ middle.
    loan_id: "10294",
    borrower_name: "Prashant Bhuyan",
    entity_name: "MKRP Holdings LLC",
    entity_state: "DE",
    guarantor_name: "Prashant Bhuyan",
    property_address: "237 W Golf Course Dr #7033, Big Sky, MT 59716",
    property_state: "MT",
    gc_name: null,
    gc_state: "MT",
    truth: {
      as_is_value: 7_950_000,
      loan_amount: 5_168_146,
      fico: 771,
      loan_purpose: "purchase",
      property_type: "condo",
    },
  },
  {
    // Audit log 10295 — SFR, West LA. Entity not captured at intake (GAP).
    loan_id: "10295",
    borrower_name: "Iyad Duwaji",
    entity_name: null,
    entity_state: "CA",
    guarantor_name: "Iyad Duwaji",
    property_address: "2747 Glendon Ave, Rancho Park, CA 90064",
    property_state: "CA",
    gc_name: null,
    gc_state: "CA",
    truth: {
      as_is_value: 2_658_000,
      loan_amount: 675_000,
      property_type: "sfr",
    },
  },
  {
    // ICC package — 286 Virginia Pl: ground-up SFR, Eastside Costa Mesa.
    // Entity borrower + individual guarantor (distinctive).
    loan_id: "286-virginia",
    borrower_name: "Nik Kafetzopoulos",
    entity_name: "Achilles Properties LLC",
    entity_state: "CA",
    guarantor_name: "Nik Kafetzopoulos",
    property_address: "286 Virginia Pl, Costa Mesa, CA 92627",
    property_state: "CA",
    gc_name: null,
    gc_state: "CA",
    truth: {
      as_is_value: 1_750_000, // land cost basis
      arv: 4_615_000,
      rehab_budget: 2_500_000, // construction budget
      loan_amount: 3_292_938,
      fico: 740,
      loan_purpose: "construction",
      property_type: "sfr",
    },
  },
  {
    // ICC package — 544 Sunset Ave, Venice CA. GUC/refi construction.
    loan_id: "544-sunset",
    borrower_name: "Thomas Series",
    entity_name: null, // borrower/guarantor listed as a person; vesting entity not in package fields
    entity_state: "CA",
    guarantor_name: "Thomas Series",
    property_address: "544 Sunset Ave, Venice, CA 90291",
    property_state: "CA",
    gc_name: null,
    gc_state: "CA",
    truth: {
      as_is_value: 2_200_000, // purchase price
      arv: 6_480_000,
      rehab_budget: 2_560_725, // direct building cost remaining
      loan_amount: 4_239_490,
      fico: 731,
      loan_purpose: "construction",
      property_type: "sfr",
    },
  },
];

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
  const found = lit.filter((l) => l.result === "found");
  const confirmed = found.filter((l) => l.confidence === "confirmed").length;
  const toReview = found.filter((l) => l.review_required !== false).length;
  console.log(`③ LITIGATION  ${found.length} federal record(s) for "${g.borrower_name}" — ${confirmed} confirmed, ${toReview} possible/review (CourtListener = FEDERAL only)`);
  if (toReview > 0 && confirmed === 0) console.log(`             → ${toReview} possible ${toReview === 1 ? "match" : "matches"} — review; NOT confirmed as this borrower (disambiguation layer working).`);
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
  const sancReview = sanc.matches.filter((m) => m.review_required !== false).length;
  console.log(
    `⑤ SANCTIONS  ${sanc.result} (${sanc.matches.length} raw match(es); ${sancReview} to review · ${sanc.highest_confidence ?? "n/a"} · ${sanc.common_name_likely ? "COMMON NAME" : "name ok"}) · source: ${sanc.source}`,
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
    console.log(`             · ${m.matched_name} [${m.list_name}] ${Math.round(m.score * 100)}% — ${facts || "name-only entry"} (${m.confidence})`);
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
