// Pixel-drive of the construction dual-LTC render (CALIBRATION #34) on LIVE prod.
// Drives a Ground-Up deal (the #10049 economics) to the sizing step and screenshots
// the structured result — confirming "LTC 78.7% excl. reserve · 71.5% incl." renders.
//
// Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-construction-ltc.ts
//
// Shots land in ./ux-review/construction-ltc/.

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/construction-ltc";

async function setNum(page: Page, id: string, value: string) {
  const el = page.locator(`#${id}`);
  await el.fill("");
  if (value !== "") await el.fill(value);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
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

  // Terms — Ground-Up (#10049 economics)
  await page.selectOption("#loan_type", "ground_up");
  await page.selectOption("#property_type", "sfr");
  await setNum(page, "purchase_price", "1400000");
  await setNum(page, "loan_amount", "2816807");
  await setNum(page, "arv", "5350000");
  await setNum(page, "rehab_budget", "2178318");
  await setNum(page, "borrower_fico", "740");
  await setNum(page, "borrower_experience", "10");

  await page.getByRole("button", { name: /Evaluate against investors/ }).click();
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /Size this deal/ }).click().catch(async () => {
    await page.getByRole("button", { name: /Go to sizing/ }).click();
  });
  await page.waitForTimeout(1500);

  // Sizing — construction inputs (#10049)
  await setNum(page, "uw_rate", "10.99");
  await setNum(page, "con_budget", "2178318");
  await setNum(page, "con_aiv", "1400000");
  await setNum(page, "con_adv", "19.807");
  await setNum(page, "con_hold", "100");
  await setNum(page, "con_rmo", "18");
  await setNum(page, "con_rdisc", "77.784");
  await setNum(page, "con_orig", "2");
  await setNum(page, "con_fixed", "5000");
  await page.getByRole("button", { name: /^Size loan$/ }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/construction-sized-dual-ltc.png`, fullPage: true });
  console.log("  ✓ construction-sized-dual-ltc");
  // Confirm the dual-LTC sub-line actually renders the wording.
  const ltcText = await page.getByText(/excl\. reserve/).first().innerText().catch(() => "(not found)");
  console.log(`  LTC sub-line: ${ltcText}`);

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
