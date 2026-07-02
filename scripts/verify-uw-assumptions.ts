// Cross-check for per-org underwriting assumptions (principle 14).
// resolveUwAssumptions() merges a stored partial over app defaults; the schema
// guards ranges. Absent/invalid → app defaults (fails safe).
//
// Run:  npx tsx scripts/verify-uw-assumptions.ts   (exit 0 all-pass, 1 on fail)

import { DEFAULT_UW_ASSUMPTIONS, resolveUwAssumptions } from "../src/lib/underwriting/org-assumptions";
import { orgUnderwritingAssumptionsV1 } from "../src/lib/schemas/jsonb";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\n1. Absent / empty → all app defaults:");
check("null → defaults", JSON.stringify(resolveUwAssumptions(null)) === JSON.stringify(DEFAULT_UW_ASSUMPTIONS));
check("undefined → defaults", JSON.stringify(resolveUwAssumptions(undefined)) === JSON.stringify(DEFAULT_UW_ASSUMPTIONS));
check("{} → defaults", JSON.stringify(resolveUwAssumptions({})) === JSON.stringify(DEFAULT_UW_ASSUMPTIONS));

console.log("\n2. Partial stored overrides only the set fields:");
const r = resolveUwAssumptions({ schema_version: 1, house_max_ltv: 0.8, takeout_min_dscr: 1.3, takeout_amort_months: 300 });
check("house_max_ltv overridden → 0.8", r.house_max_ltv === 0.8, `${r.house_max_ltv}`);
check("takeout_min_dscr overridden → 1.3", r.takeout_min_dscr === 1.3, `${r.takeout_min_dscr}`);
check("takeout_amort_months overridden → 300", r.takeout_amort_months === 300);
check("unset house_max_ltc keeps default 0.70", r.house_max_ltc === DEFAULT_UW_ASSUMPTIONS.house_max_ltc);
check("unset dscr_target keeps default 1.25", r.dscr_target === DEFAULT_UW_ASSUMPTIONS.dscr_target);

console.log("\n3. Fails safe on an invalid stored object:");
check("out-of-range field → all defaults", JSON.stringify(resolveUwAssumptions({ house_max_ltv: 5 })) === JSON.stringify(DEFAULT_UW_ASSUMPTIONS));
check("garbage → all defaults", JSON.stringify(resolveUwAssumptions("nope")) === JSON.stringify(DEFAULT_UW_ASSUMPTIONS));
check("non-finite field ignored → default", resolveUwAssumptions({ house_max_ltc: Number.NaN }).house_max_ltc === DEFAULT_UW_ASSUMPTIONS.house_max_ltc);

console.log("\n4. Schema guards:");
check("valid partial parses (schema_version defaults 1)", (() => { const p = orgUnderwritingAssumptionsV1.safeParse({ house_max_ltv: 0.7 }); return p.success && p.data.schema_version === 1; })());
check("LTV > 2 rejected", !orgUnderwritingAssumptionsV1.safeParse({ house_max_ltv: 5 }).success);
check("negative bps rejected", !orgUnderwritingAssumptionsV1.safeParse({ takeout_rate_spread_bps: -10 }).success);
check("non-integer amort rejected", !orgUnderwritingAssumptionsV1.safeParse({ takeout_amort_months: 360.5 }).success);

console.log("");
if (failures > 0) { console.error(`Org UW assumptions: ${failures} check(s) FAILED.`); process.exit(1); }
console.log("Org UW assumptions: all checks passed — merge is correct, fails safe, schema guards ranges.");
