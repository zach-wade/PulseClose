// Visual verification of the 2026-06-26 UX coherence commits on LIVE prod:
//   - sidebar "Portfolio" rename (was "Book")
//   - validation detail header: single primary CTA (de-duplicated) + "Portfolio" tab
//   - deal stepper Sizing: progressive disclosure (Advanced collapsed → expanded)
//   - sizing result ratio row: inline glossary (dotted-underline terms)
//
// Run: EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-visual-pass.ts
// Shots → ./ux-review/coherence/

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/coherence";
const DETAIL_VID = "273b1810-caff-4051-a52b-f6d5e34a8095"; // 286 Virginia (real-loan run)

async function setNum(page: Page, id: string, value: string) {
  const el = page.locator(`#${id}`);
  if ((await el.count()) === 0) return;
  await el.fill("");
  if (value !== "") await el.fill(value);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();

  // ── Login ──
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2500);
  console.log(`Logged in; at ${page.url()}`);

  // Deploy freshness check — the sidebar should now read "Portfolio", not "Book".
  const hasPortfolio = await page.getByRole("link", { name: /Portfolio/ }).count();
  const hasBook = await page.getByText("Book", { exact: true }).count();
  console.log(`Sidebar: Portfolio=${hasPortfolio} Book=${hasBook}  ${hasPortfolio ? "✓ deploy current" : "✗ STALE DEPLOY — screenshots may be old"}`);

  // 01 — dashboard + sidebar (Portfolio rename)
  await page.screenshot({ path: `${OUT}/01-dashboard-sidebar.png` });
  console.log("  ✓ 01-dashboard-sidebar");

  // 02 — validation detail header (single primary CTA in the strip; secondary in header)
  await page.goto(`${BASE}/dashboard/validations/${DETAIL_VID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/02-detail-header.png` }); // top fold only
  console.log("  ✓ 02-detail-header");

  // 03 — the renamed "Portfolio" tab
  try {
    await page.getByRole("tab", { name: "Portfolio" }).click({ timeout: 8000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/03-detail-portfolio-tab.png` });
    console.log("  ✓ 03-detail-portfolio-tab");
  } catch (e) {
    console.warn("  ✗ Portfolio tab:", (e as Error).message);
  }

  // ── Deal stepper → Sizing ──
  await page.goto(`${BASE}/dashboard/evaluate`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.selectOption("#loan_type", "bridge").catch(() => {});
  await page.selectOption("#property_type", "small_multifamily").catch(() => {});
  await setNum(page, "purchase_price", "2400000");
  await setNum(page, "loan_amount", "1800000");
  await setNum(page, "arv", "4145000");
  await setNum(page, "rehab_budget", "600000");
  await setNum(page, "borrower_fico", "745");
  await setNum(page, "borrower_experience", "12");
  await page.getByRole("button", { name: /Evaluate against investors/ }).click().catch(() => {});
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /Size this deal/ }).click().catch(async () => {
    await page.getByRole("button", { name: /Go to sizing/ }).click().catch(() => {});
  });
  await page.waitForTimeout(1500);

  // Fill the VISIBLE core economics (the advanced caps are collapsed + defaulted).
  await setNum(page, "uw_noi", "138000");
  await setNum(page, "uw_snoi", "228000");
  await setNum(page, "uw_gcap", "5.75");
  await setNum(page, "uw_ecap", "5.5");
  await setNum(page, "uw_rate", "9.5");
  await page.waitForTimeout(500);

  // 04 — Sizing step, Advanced COLLAPSED (the win: ~8 core fields, not 18)
  await page.screenshot({ path: `${OUT}/04-sizing-advanced-collapsed.png`, fullPage: true });
  console.log("  ✓ 04-sizing-advanced-collapsed");

  // 05 — open the Advanced <details> to show the caps + exit/takeout are still there
  try {
    await page.getByText(/Advanced — house caps/).click({ timeout: 5000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/05-sizing-advanced-expanded.png`, fullPage: true });
    console.log("  ✓ 05-sizing-advanced-expanded");
  } catch (e) {
    console.warn("  ✗ Advanced toggle:", (e as Error).message);
  }

  // 06 — size + capture the results ratio row (glossary dotted-underline terms)
  await page.getByRole("button", { name: /^Size loan$/ }).click().catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/06-sizing-result-glossary.png`, fullPage: true });
  console.log("  ✓ 06-sizing-result-glossary");

  await browser.close();
  console.log(`\nDone. Screenshots in ./${OUT}/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
