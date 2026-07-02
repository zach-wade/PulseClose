// Cross-check for the refi NOI-stress grid (UW-7 / CALIBRATION #26).
//
// stressTakeout() re-runs the (already-trusted) sizeTakeout() across NOI haircuts.
// The disciplines: (1) the base row reproduces sizeTakeout() exactly; (2) coverage
// is monotone-decreasing; (3) maxTakeout scales linearly with (1−haircut) — the
// binding constraint is stress-invariant; (4) the closed-form break-even haircut
// agrees with the grid; (5) a deal that shorts at base reports break-even 0.
//
// Run:  npx tsx scripts/verify-refi-stress.ts   (exit 0 all-pass, 1 on fail)

import { sizeTakeout, stressTakeout, type TakeoutInputs } from "../src/lib/underwriting/exit";

let failures = 0;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// A refinanceable value-add takeout (stabilized MFR, DSCR-bound perm).
const BASE: TakeoutInputs = {
  stabilizedValue: 4_145_454.545, // 228,000 / 5.5% exit cap
  stabilizedNOI: 228_000,
  bridgeBalanceAtExit: 1_800_000,
  takeoutMaxLTV: 0.7,
  takeoutMinDSCR: 1.25,
  takeoutRate: 0.065,
  takeoutAmortizationMonths: 360,
  bridgeTermMonths: 24,
  monthsToStabilize: 18,
};

console.log("\n1. Base row reproduces sizeTakeout() exactly:");
const g = stressTakeout(BASE);
const base = sizeTakeout(BASE);
const row0 = g.levels.find((r) => r.haircut === 0)!;
check("grid[haircut=0].maxTakeout == sizeTakeout().maxTakeout", near(row0.maxTakeout, base.maxTakeout, 0.01), `${row0.maxTakeout} vs ${base.maxTakeout}`);
check("grid[haircut=0].coverage == sizeTakeout().takeoutCoverage", near(row0.coverage, base.takeoutCoverage, 1e-9));
check("baseCoverage surfaced", near(g.baseCoverage, base.takeoutCoverage, 1e-9), `${g.baseCoverage}`);

console.log("\n2. Grid shape (default 5 levels 0..20%):");
check("5 levels", g.levels.length === 5);
check("levels are 0/5/10/15/20%", g.levels.map((r) => r.haircut).join(",") === "0,0.05,0.1,0.15,0.2");

console.log("\n3. Monotonicity + linearity (binding constraint stress-invariant):");
let mono = true, linear = true, sameBind = true;
for (const r of g.levels) {
  if (r.coverage > row0.coverage + 1e-9) mono = false;
  if (!near(r.maxTakeout, base.maxTakeout * (1 - r.haircut), 0.5)) linear = false;
  if (r.bindingConstraint !== base.bindingConstraint) sameBind = false;
}
check("coverage decreases with haircut", mono);
check("maxTakeout(h) == maxTakeout(0)·(1−h)", linear);
check("binding constraint is the same at every stress level", sameBind, base.bindingConstraint);

console.log("\n4. Break-even haircut (closed form vs. grid):");
// coverage(h) = baseCoverage·(1−h) = 1 ⇒ h* = 1 − 1/baseCoverage
const expected = 1 - 1 / base.takeoutCoverage;
check("breakEvenHaircut == 1 − 1/baseCoverage", near(g.breakEvenHaircut as number, expected, 1e-9), `${g.breakEvenHaircut} vs ${expected}`);
// sanity: at the break-even haircut, a fresh grid level lands coverage ≈ 1.0
const atBreak = stressTakeout(BASE, [g.breakEvenHaircut as number]).levels[0];
check("coverage at break-even haircut ≈ 1.00", near(atBreak.coverage, 1, 1e-6), `${atBreak.coverage}`);
check("this deal exits cleanly beyond a −20% haircut (break-even > 0.20)", (g.breakEvenHaircut as number) > 0.2, `${g.breakEvenHaircut}`);
check("still refinanceable at the −20% level", g.levels[4].refinanceable, `cov=${g.levels[4].coverage.toFixed(3)}`);

console.log("\n5. A deal that shorts at base → break-even 0, not refinanceable:");
const shorts = stressTakeout({ ...BASE, bridgeBalanceAtExit: 3_000_000 });
check("baseCoverage < 1 (shorts at plan NOI)", shorts.baseCoverage < 1, `${shorts.baseCoverage.toFixed(3)}`);
check("breakEvenHaircut == 0 (can absorb no haircut)", shorts.breakEvenHaircut === 0, `${shorts.breakEvenHaircut}`);
check("base row not refinanceable + reports a shortfall", !shorts.levels[0].refinanceable && shorts.levels[0].shortfall > 0, `shortfall ${shorts.levels[0].shortfall.toFixed(0)}`);

console.log("");
if (failures > 0) { console.error(`Refi stress grid: ${failures} check(s) FAILED.`); process.exit(1); }
console.log("Refi stress grid: all checks passed — reuses sizeTakeout(), scales linearly, break-even is exact.");
