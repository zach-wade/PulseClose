import { enrichWithSaleHistory } from "../src/lib/adapters/rentcast";
async function main() {
  const key = process.env.RENTCAST_API_KEY!;
  const rec: any = { property_address: "5500 Grand Lake Dr, San Antonio, TX 78244", acquisition_date: null, acquisition_price: null, disposition_date: null, disposition_price: null, hold_months: null, profit: null, project_type: null, outcome: null, source: "Regrid", raw_response: {} };
  const out = await enrichWithSaleHistory(rec, key);
  console.log("RentCast enrichment result:");
  console.log("  acquisition:", out.acquisition_date, "$" + (out.acquisition_price ?? "—"));
  console.log("  disposition:", out.disposition_date, "$" + (out.disposition_price ?? "—"));
  console.log("  hold_months:", out.hold_months, "| project_type:", out.project_type, "| outcome:", out.outcome);
  console.log("  profit:", out.profit, "| source:", out.source);
  console.log("  (note: null prices = non-disclosure, carried honestly not faked)");
  // Regrid key live-test
  const r = await fetch(`https://app.regrid.com/api/v2/parcels/query?token=${process.env.REGRID_API_TOKEN}&limit=1&query=Denver`);
  console.log("\nRegrid (rotated key): HTTP", r.status, r.status === 401 || r.status === 403 ? "AUTH FAILED" : "ACTIVE");
}
main().catch(e => { console.error(e); process.exit(1); });
