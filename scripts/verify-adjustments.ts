// Cross-check for the human override layer (UW-7 Tier-2, adjustments.ts).
//
// Run:  npx tsx scripts/verify-adjustments.ts   (exit 0 all-pass, 1 on fail)

import { applyAdjustments } from "../src/lib/underwriting/adjustments";
import { uwAdjustmentsV1, parseUwAdjustmentsV1Strict } from "../src/lib/schemas/jsonb";

let failures = 0;
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\n1. Apply mixed adjustments:");
const a = applyAdjustments(2_422_000, [
  { label: "Seller credit", amount: -40_000 },
  { label: "Cross-collateral bump", amount: 200_000, reason: "second property pledged" },
  { label: "Environmental holdback", amount: -75_000 },
]);
check("totalDelta = +85,000", near(a.totalDelta, 85_000), `${a.totalDelta}`);
check("finalLoan = 2,507,000", near(a.finalLoan, 2_507_000), `${a.finalLoan}`);
check("baseLoan echoed", a.baseLoan === 2_422_000);

console.log("\n2. Empty list is a no-op:");
const z = applyAdjustments(1_000_000, []);
check("finalLoan == baseLoan when no items", z.finalLoan === 1_000_000 && z.totalDelta === 0);

console.log("\n3. Floor at 0 (an adjustment can't drive the loan negative):");
const neg = applyAdjustments(100_000, [{ label: "huge reduction", amount: -500_000 }]);
check("finalLoan floored at 0", neg.finalLoan === 0, `${neg.finalLoan}`);

console.log("\n4. NaN amounts are ignored (defensive):");
const nan = applyAdjustments(500_000, [{ label: "bad", amount: NaN }, { label: "ok", amount: 25_000 }]);
check("NaN skipped, valid summed", near(nan.finalLoan, 525_000), `${nan.finalLoan}`);

console.log("\n5. Zod schema round-trips + rejects bad rows:");
const good = uwAdjustmentsV1.safeParse({ base_loan: 2_422_000, items: [{ label: "x", amount: -1000 }], final_loan: 2_421_000 });
check("valid adjustments parse (schema_version defaults to 1)", good.success && good.data.schema_version === 1);
check("parseUwAdjustmentsV1Strict returns the object", parseUwAdjustmentsV1Strict({ base_loan: 1, items: [], final_loan: 1 }).final_loan === 1);
const badLabel = uwAdjustmentsV1.safeParse({ base_loan: 1, items: [{ label: "", amount: 1 }], final_loan: 2 });
check("empty label rejected", !badLabel.success);
const badAmt = uwAdjustmentsV1.safeParse({ base_loan: 1, items: [{ label: "x", amount: Infinity }], final_loan: 2 });
check("non-finite amount rejected", !badAmt.success);

console.log("");
if (failures > 0) { console.error(`Adjustments layer: ${failures} check(s) FAILED.`); process.exit(1); }
console.log("Adjustments layer: all checks passed — override sums correctly, floors at 0, schema guards bad rows.");
