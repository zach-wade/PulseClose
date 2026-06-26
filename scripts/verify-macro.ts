// Smoke test for the FRED macro overlay (src/lib/macro/fred.ts).
//   npx tsx scripts/verify-macro.ts            → null-path + format (no key needed)
//   set -a; source .env.local; set +a; npx tsx scripts/verify-macro.ts   → live FRED
import { getMacroContext, formatMacroForFacts } from "../src/lib/macro/fred";

async function main() {
  const ctx = await getMacroContext();
  if (!ctx) {
    console.log("getMacroContext() → null (no FRED_API_KEY or fetch failed — judgment runs without macro). ✓");
    console.log("Set FRED_API_KEY to exercise the live path (free key: fred.stlouisfed.org/docs/api/api_key.html).");
    return;
  }
  console.log(`Regime: ${ctx.regime}\nBasis:  ${ctx.regimeBasis}\nAs of:  ${ctx.asOf}\nSeries resolved: ${ctx.indicators.length}/7\n`);
  console.log("Facts block as the AI sees it:\n");
  console.log(formatMacroForFacts(ctx));
  // Sanity: every indicator has a signal + read.
  const bad = ctx.indicators.filter((i) => !i.signal || !i.read);
  console.log(bad.length === 0 ? "\n✓ all indicators well-formed" : `\n✗ ${bad.length} malformed indicators`);
}
main().catch((e) => { console.error(e); process.exit(1); });
