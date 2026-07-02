// Pixel-drive of the live goal-seek control (UW-5 SolveControl) on LIVE prod.
// Drives a Fix & Flip (RTL) deal to the sizing step using the golden fixture
// (should size to $2,422,000), then exercises the SolveControl: set a target
// cash-to-close, read the back-solved advance, Apply, and re-size.
//
// Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-solve-control.ts
//
// Shots land in ./ux-review/solve-control/.

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/solve-control";

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

  // ── ① Terms — a Fix & Flip so the RTL sizer + SolveControl engage ──
  await page.selectOption("#loan_type", "fix_flip");
  await page.selectOption("#property_type", "sfr");
  await setNum(page, "purchase_price", "2495000");
  await setNum(page, "loan_amount", "2200000");
  await setNum(page, "arv", "3250000");
  await setNum(page, "rehab_budget", "190000");
  await setNum(page, "borrower_fico", "750");
  await setNum(page, "borrower_experience", "8");
  await page.fill("#borrower_name", "Fixflip Holdings LLC").catch(() => {});
  await page.screenshot({ path: `${OUT}/01-terms.png`, fullPage: true });
  console.log("  ✓ 01-terms (fix_flip)");

  // ── ② Eligibility → sizing ──
  await page.getByRole("button", { name: /Evaluate against investors/ }).click();
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /Size this deal/ }).click().catch(async () => {
    await page.getByRole("button", { name: /Go to sizing/ }).click();
  });
  await page.waitForTimeout(1500);

  // ── ③ Sizing — the RTL golden fixture (Option_1 → $2,422,000 max) ──
  await setNum(page, "uw_rate", "8.5");
  await setNum(page, "rtl_aiv", "2480000");
  await setNum(page, "rtl_adv", "89");
  await setNum(page, "rtl_fund", "100");
  await setNum(page, "rtl_prepaid", "1");
  await setNum(page, "rtl_close", "0.2");
  await page.selectOption("#rtl_tier", "1").catch(() => {});
  await page.selectOption("#rtl_rehab_type", "Light").catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02-sizing-inputs-with-solve.png`, fullPage: true });
  console.log("  ✓ 02-sizing-inputs-with-solve (SolveControl should be visible)");

  // ── ④ Exercise the SolveControl: solve advance for a $250k cash-to-close ──
  const solveTarget = page.locator("#solve_target");
  const solveVisible = await solveTarget.isVisible().catch(() => false);
  console.log(`  SolveControl target field visible: ${solveVisible}`);
  if (solveVisible) {
    await setNum(page, "solve_target", "250000");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/03-solved-advance.png`, fullPage: true });
    console.log("  ✓ 03-solved-advance (required advance readout)");

    // Apply the solved advance back into the inputs.
    await page.getByRole("button", { name: /Apply/ }).click().catch(() => {});
    await page.waitForTimeout(600);
    const advAfter = await page.locator("#rtl_adv").inputValue().catch(() => "?");
    console.log(`  advance after Apply: ${advAfter}%`);
    await page.screenshot({ path: `${OUT}/04-applied.png`, fullPage: true });
  }

  // ── ⑤ Size the deal — structured result ──
  await page.getByRole("button", { name: /^Size loan$/ }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/05-sized.png`, fullPage: true });
  console.log("  ✓ 05-sized (structured result)");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
