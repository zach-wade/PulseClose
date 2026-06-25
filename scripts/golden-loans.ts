// Golden loan set — real historical ICC loans with ground truth extracted from
// the loan files (Nexys audit logs, loan-request packages, signed 1003s, OMs).
// Shared by the calibration harness (scripts/calibrate-loan.ts, which runs the
// live diligence adapters) and the fidelity score (scripts/fidelity-score.ts,
// which runs the deterministic sizing engine). One source of truth for "what the
// file actually said" so the two harnesses never drift.
//
// GROUND-TRUTH RULES:
//  - Numbers are transcribed from the file; never inferred. A value we couldn't
//    find in the file is `undefined`, NOT a guess.
//  - `as_is_value` = current/as-is appraised value for refi/value-add; for a
//    construction/ground-up deal it's the land/cost basis. `purchase_price` is
//    only set when it differs from as_is (e.g. a separate land buy).
//  - `arv` = after-repair / stabilized / as-completed value (rehab/construction
//    only). `rehab_budget` = construction/renovation budget (cost-to-complete
//    where the borrower already spent down a larger budget).
//  - `soft` flags a figure that's implied/derived in the file rather than a
//    stated appraisal number — the fidelity score discounts those.

export interface GoldenCase {
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
    purchase_price?: number; // only when distinct from as_is_value
    arv?: number;
    rehab_budget?: number;
    loan_amount?: number;
    fico?: number;
    loan_purpose?: string;
    property_type?: string;
    soft?: ("as_is_value" | "arv" | "rehab_budget")[]; // implied, not appraised
    notes?: string;
  };
}

export const GOLDEN: GoldenCase[] = [
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
      loan_purpose: "cash_out_refinance",
      notes: "Small cash-out refi (25% LTV) — borrower requested far below max supportable.",
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

  // ── 2026-06-25 additions: cross-state + multifamily + post-close coverage ──
  // Extracted from the signed packages in ~/Downloads. These extend coverage to
  // a TX property (no statewide GC license), the first multifamily deal (with a
  // real named GC), and a post-close construction package (no appraisal in file).
  {
    // Signed 1003 — 905 N LBJ Dr: SFR bridge purchase, San Marcos TX.
    // CA-domiciled entity, TX property → cross-state. Non-disclosure-ish TX +
    // no statewide GC license. No purchase price / as-is stated on the app, and
    // no FICO → sizing-truth gap (the app alone is thin).
    loan_id: "905-lbj",
    borrower_name: "Evan Shapiro",
    entity_name: "Evander Co LLC",
    entity_state: "CA",
    guarantor_name: "Evan Shapiro",
    property_address: "905 N LBJ Dr, San Marcos, TX 78666",
    property_state: "TX",
    gc_name: null,
    gc_state: "TX",
    truth: {
      loan_amount: 356_250,
      loan_purpose: "purchase",
      property_type: "sfr",
      notes: "Signed app states no purchase price / as-is / FICO — sizing truth absent from the application itself.",
    },
  },
  {
    // CBRE financing-request OM — 812 Tait St: 18-unit multifamily, Oceanside CA.
    // Bridge refi+reno; TIC ownership (no single vesting LLC); REAL named GC.
    // LTARV ~66.9% (file states 66.87%). First MFR in the set.
    loan_id: "812-tait",
    borrower_name: "Christina Boisvert",
    entity_name: "JJNC Partners TIC LLC", // largest TIC member (64.84%); true structure is a 5-LLC TIC
    entity_state: "CA",
    guarantor_name: null, // recourse "negotiable" — no guarantor named
    property_address: "812 Tait St, Oceanside, CA 92054",
    property_state: "CA",
    gc_name: "Arias General Construction",
    gc_state: "CA",
    truth: {
      as_is_value: 6_600_000, // implied by 1st-TD payoff; no formal as-is appraisal in the OM
      arv: 11_663_761, // stabilized / as-completed value (4.75% cap on pro-forma NOI)
      rehab_budget: 143_645, // cost-to-complete (~$3.3M of a $3.4M budget already spent)
      loan_amount: 7_800_000,
      loan_purpose: "refinance",
      property_type: "multifamily",
      soft: ["as_is_value"],
      notes: "TIC structure (5 LLCs). LTARV 66.9% matches the OM's stated 66.87%. as-is is implied from payoff, not appraised.",
    },
  },
  {
    // Closed loan-doc package — 1310 Armadale Ave (ICC #10201), LA CA.
    // Construction/refi on already-owned property; $774k construction reserve.
    // Post-close package → NO appraisal/FICO/as-is/ARV in file (separate UW file).
    loan_id: "1310-armadale",
    borrower_name: "Ames Ingham",
    entity_name: "Ames Ingham Studio LLC",
    entity_state: "CA",
    guarantor_name: "Ames Ingham",
    property_address: "1310 Armadale Ave, Los Angeles, CA 90042",
    property_state: "CA",
    gc_name: null, // La Mesa Fund Control manages draws; no GC named in the package
    gc_state: "CA",
    truth: {
      rehab_budget: 774_000, // construction reserve
      loan_amount: 1_000_000,
      loan_purpose: "construction",
      property_type: "sfr",
      notes: "Post-close doc package: no appraisal/FICO/as-is/ARV (lives in the separate UW file). $100k existing-debt payoff + $774k construction reserve + $96k interest reserve.",
    },
  },
];
