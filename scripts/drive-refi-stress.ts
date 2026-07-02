// Pixel-drive of the refi NOI-stress grid (UW-7 / CALIBRATION #26) on LIVE prod.
// Drives a bridge value-add (Westbrook MFR) to the sizing step and reads the
// rendered <RefiStressGrid> in the exit/takeout panel.
//
// Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-refi-stress.ts
//
// Shots land in ./ux-review/refi-stress/.

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/refi-stress";

async function setNum(page: Page, id: string, value: string) {
  const el = page.locator(`#${id}`);
  await el.fill("");
  if (value !== "") await el.fill(value);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/dashboard/evaluate`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Terms — Westbrook 8-unit MFR value-add (bridge)
  await page.selectOption("#loan_type", "bridge");
  await page.selectOption("#property_type", "small_multifamily");
  await setNum(page, "purchase_price", "2400000");
  await setNum(page, "loan_amount", "1800000");
  await setNum(page, "arv", "4145000");
  await setNum(page, "rehab_budget", "600000");
  await setNum(page, "borrower_fico", "745");
  await setNum(page, "borrower_experience", "12");

  await page.getByRole("button", { name: /Evaluate against investors/ }).click();
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /Size this deal/ }).click().catch(async () => {
    await page.getByRole("button", { name: /Go to sizing/ }).click();
  });
  await page.waitForTimeout(1500);

  // Sizing — stabilized economics so the takeout + stress grid compute
  await setNum(page, "uw_noi", "138000");
  await setNum(page, "uw_snoi", "228000");
  await setNum(page, "uw_gcap", "5.75");
  await setNum(page, "uw_ecap", "5.5");
  await setNum(page, "uw_rate", "9.5");
  // The house caps + exit/takeout inputs live in a collapsed <details> — open it.
  await page.getByText(/Advanced — house caps/).click().catch(() => {});
  await page.waitForTimeout(400);
  await setNum(page, "uw_mltv", "75");
  await setNum(page, "uw_mltc", "70");
  await setNum(page, "uw_mltarv", "70");
  await setNum(page, "uw_dscr", "");
  await setNum(page, "uw_dy", "5");
  await setNum(page, "uw_term", "24");
  await setNum(page, "uw_tltv", "70");
  await setNum(page, "uw_tdscr", "1.25");
  await setNum(page, "uw_stab", "18");

  await page.getByRole("button", { name: /^Size loan$/ }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/refi-stress.png`, fullPage: true });
  console.log("  ✓ refi-stress.png");

  const headline = await page.getByText(/NOI haircut|shorts the bridge|Exits cleanly/).first().innerText().catch(() => "(not found)");
  console.log(`  Refi-stress headline: ${headline}`);
  const rows = await page.locator("table tr").allInnerTexts().catch(() => []);
  const gridRows = rows.filter((r) => /Base|−\d+%/.test(r));
  console.log("  Grid rows:");
  for (const r of gridRows) console.log(`    ${r.replace(/\s+/g, " ").trim()}`);

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
