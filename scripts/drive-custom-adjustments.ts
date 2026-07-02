// Pixel-drive of the human override layer (UW-7 Tier-2 <CustomAdjustments>) on
// LIVE prod. Sizes a Fix & Flip (RTL golden → $2,422,000), then adds a named
// adjustment, saves it (PATCH /api/underwrite/[id]/adjust), and reads back the
// final approved loan.
//
// Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-custom-adjustments.ts
//
// Shots land in ./ux-review/custom-adjustments/.

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/custom-adjustments";

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

  await page.selectOption("#loan_type", "fix_flip");
  await page.selectOption("#property_type", "sfr");
  await setNum(page, "purchase_price", "2495000");
  await setNum(page, "loan_amount", "2200000");
  await setNum(page, "arv", "3250000");
  await setNum(page, "rehab_budget", "190000");
  await setNum(page, "borrower_fico", "750");
  await setNum(page, "borrower_experience", "8");

  await page.getByRole("button", { name: /Evaluate against investors/ }).click();
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /Size this deal/ }).click().catch(async () => {
    await page.getByRole("button", { name: /Go to sizing/ }).click();
  });
  await page.waitForTimeout(1500);

  await setNum(page, "uw_rate", "8.5");
  await setNum(page, "rtl_aiv", "2480000");
  await setNum(page, "rtl_adv", "89");
  await setNum(page, "rtl_fund", "100");
  await setNum(page, "rtl_prepaid", "1");
  await setNum(page, "rtl_close", "0.2");
  await page.selectOption("#rtl_tier", "1").catch(() => {});
  await page.selectOption("#rtl_rehab_type", "Light").catch(() => {});
  await page.getByRole("button", { name: /^Size loan$/ }).click();
  await page.waitForTimeout(4000);

  // Custom adjustments panel
  const labelField = page.locator('input[placeholder="e.g. Seller credit"]').first();
  const visible = await labelField.isVisible().catch(() => false);
  console.log(`  CustomAdjustments panel visible: ${visible}`);
  if (visible) {
    await labelField.fill("Cross-collateral bump");
    await page.locator('input[placeholder="-40000"]').first().fill("150000");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/01-adjustment-entered.png`, fullPage: true });

    const beforeSave = await page.getByText(/Final approved/).first().innerText().catch(() => "(none)");
    console.log(`  live readout: ${beforeSave}`);

    await page.getByRole("button", { name: /Save adjustments/ }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/02-saved.png`, fullPage: true });
    const savedBadge = await page.getByText(/^Saved$/).first().isVisible().catch(() => false);
    console.log(`  saved badge visible: ${savedBadge}`);
    const finalText = await page.getByText(/Final approved/).first().innerText().catch(() => "(none)");
    console.log(`  final readout: ${finalText}`);
  }

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
