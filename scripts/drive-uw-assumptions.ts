// Pixel-drive of per-org underwriting assumptions (principle 14) on LIVE prod.
// (1) Set a distinctive house default in Settings (perm max LTV = 55%), save,
// reload, confirm it persisted. (2) Size a Westbrook bridge deal WITHOUT filling
// the takeout LTV → confirm the org's 55% flows through to the takeout constraint.
// (3) Clear it back so the test org is left clean.
//
// Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-uw-assumptions.ts
//
// Shots land in ./ux-review/uw-assumptions/.

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/uw-assumptions";

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

  // ── (1) Set the house default in Settings ──
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: /Organization/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  await setNum(page, "uwa_takeout_max_ltv", "55");
  await page.getByRole("button", { name: /Save assumptions/ }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/01-settings-saved.png`, fullPage: true });

  // reload → confirm persistence
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: /Organization/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  const persisted = await page.locator("#uwa_takeout_max_ltv").inputValue().catch(() => "?");
  console.log(`  persisted perm max LTV after reload: ${persisted} (expect 55)`);

  // ── (2) Size a bridge deal WITHOUT a takeout LTV → org default should apply ──
  await page.goto(`${BASE}/dashboard/evaluate`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
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
  // Core economics only; leave the takeout LTV blank so the org default applies.
  await setNum(page, "uw_noi", "138000");
  await setNum(page, "uw_snoi", "228000");
  await setNum(page, "uw_gcap", "5.75");
  await setNum(page, "uw_ecap", "5.5");
  await setNum(page, "uw_rate", "9.5");
  await page.getByRole("button", { name: /^Size loan$/ }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/02-sized.png`, fullPage: true });
  const permBasis = await page.getByText(/% of stabilized value/).first().innerText().catch(() => "(not found)");
  console.log(`  takeout Perm-LTV basis: ${permBasis} (expect 55% of stabilized value)`);

  // ── (3) Clear the override so the test org is left clean ──
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: /Organization/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  await setNum(page, "uwa_takeout_max_ltv", "");
  await page.getByRole("button", { name: /Save assumptions/ }).click();
  await page.waitForTimeout(2000);
  console.log("  cleared the override (test org reset).");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
