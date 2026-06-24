// Interactive pixel-drive of the Deal analyzer stepper on LIVE prod — drives the
// Westbrook MFR value-add end-to-end (Terms -> Eligibility -> Sizing) and
// screenshots the NEW exit/takeout panel + per-investor best-execution, so we can
// confirm the depth add actually renders for the underwriter persona.
//
// Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-deal-stepper.ts
//
// Shots land in ./ux-review/underwriter-stepper/.

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/underwriter-stepper";

async function setNum(page: Page, id: string, value: string) {
  const el = page.locator(`#${id}`);
  await el.fill("");
  if (value !== "") await el.fill(value);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();

  // ── Login ──
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2000);
  console.log(`Logged in; at ${page.url()}`);

  // ── Open the stepper ──
  await page.goto(`${BASE}/dashboard/evaluate`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // ── ① Terms — the Westbrook 8-unit MFR value-add ──
  await page.selectOption("#loan_type", "bridge");
  await page.selectOption("#property_type", "small_multifamily");
  await setNum(page, "purchase_price", "2400000");
  await setNum(page, "loan_amount", "1800000");
  await setNum(page, "arv", "4145000");
  await setNum(page, "rehab_budget", "600000");
  await setNum(page, "borrower_fico", "745");
  await setNum(page, "borrower_experience", "12");
  await page.fill("#borrower_name", "Westbrook Capital Partners LLC").catch(() => {});
  await page.fill("#property_address", "1820 R Street, Sacramento, CA 95811").catch(() => {});
  await page.screenshot({ path: `${OUT}/01-terms.png`, fullPage: true });
  console.log("  ✓ 01-terms");

  // ── ② Eligibility — best execution against the real Colchis/Oakhurst boxes ──
  await page.getByRole("button", { name: /Evaluate against investors/ }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/02-eligibility.png`, fullPage: true });
  console.log("  ✓ 02-eligibility");

  // Opt into sizing.
  await page.getByRole("button", { name: /Size this deal/ }).click().catch(async () => {
    await page.getByRole("button", { name: /Go to sizing/ }).click();
  });
  await page.waitForTimeout(1500);

  // ── ③ Sizing — set the Westbrook economics, no in-place DSCR floor (value-add
  // carries an interest reserve), then size to see the exit/takeout panel. ──
  await setNum(page, "uw_noi", "138000");
  await setNum(page, "uw_snoi", "228000");
  await setNum(page, "uw_gcap", "5.75");
  await setNum(page, "uw_ecap", "5.5");
  await setNum(page, "uw_rate", "9.5");
  await setNum(page, "uw_mltv", "75");
  await setNum(page, "uw_mltc", "70");
  await setNum(page, "uw_mltarv", "70");
  await setNum(page, "uw_dscr", ""); // no in-place DSCR floor -> LTV-bound
  await setNum(page, "uw_dy", "5");
  await setNum(page, "uw_term", "24");
  await setNum(page, "uw_tltv", "70");
  await setNum(page, "uw_tdscr", "1.25");
  await setNum(page, "uw_stab", "18");
  await page.screenshot({ path: `${OUT}/03-sizing-inputs.png`, fullPage: true });

  await page.getByRole("button", { name: /^Size loan$/ }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/04-sizing-result-exit.png`, fullPage: true });
  console.log("  ✓ 04-sizing-result-exit (exit/takeout panel)");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
