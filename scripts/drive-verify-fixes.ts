// Re-capture just the surfaces the UX-audit fixes touched, to VERIFY they render
// (not assume): enum humanization (deal stepper dropdowns, investor type badge,
// portfolio factor chips), SOS active badge green, reconciled property count.
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "https://app.pulseclose.com";
const OUT = "ux-review/audit/verify";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const VID = "085575ef-5302-43c0-b3c5-605912e0bb64";

async function shoot(page: Page, file: string, note: string) {
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  console.log(`  ✓ ${file}.png — ${note}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "uw@test.pulseclose.com");
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/dashboard/evaluate`, { waitUntil: "networkidle" });
  await shoot(page, "v1-deal-stepper", "deal stepper Terms dropdowns (enum labels)");

  await page.goto(`${BASE}/dashboard/portfolio`, { waitUntil: "networkidle" });
  await shoot(page, "v2-portfolio", "portfolio factor chips (factorLabel)");

  await page.goto(`${BASE}/dashboard/evaluate/investors`, { waitUntil: "networkidle" });
  const inv = page.locator('a[href*="/dashboard/evaluate/investors/"]').first();
  if (await inv.count()) { await inv.click(); await page.waitForTimeout(2000); }
  await shoot(page, "v3-investor-detail", "investor type badge (Table-funded not table_funded)");

  await page.goto(`${BASE}/dashboard/validations/${VID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shoot(page, "v4-validation-summary", "verdict hero + Track-record stat");
  await page.getByText("Full report", { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.getByRole("tab", { name: "Evidence", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await shoot(page, "v5-evidence", "SOS active badge green + property count");

  await browser.close();
  console.log(`\nDone → ${OUT}/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
