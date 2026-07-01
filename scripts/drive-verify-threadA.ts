// Verify Thread-A UX-audit fixes on prod (not assume): two-column Summary,
// property-count reconcile, entity free-source note, Borrowers-table AI/Date
// columns, and the fund-tenant nav. Reads screenshots after.
import { chromium, type Page, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "https://app.pulseclose.com";
const OUT = "ux-review/audit/threadA";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const VID = "085575ef-5302-43c0-b3c5-605912e0bb64";

async function shoot(page: Page, file: string, note: string) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  console.log(`  ✓ ${file}.png — ${note}`);
}

async function login(ctx: BrowserContext, email: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard**", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2500);
  return page;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  // --- Underwriter org ---
  const uwCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const uw = await login(uwCtx, "uw@test.pulseclose.com");

  // Borrowers table — AI/Date columns should not clip; entity col truncates.
  await shoot(uw, "a1-borrowers-table", "dashboard home — AI/Date columns, entity truncation");

  // Validation Summary — two-column at-a-glance (memo+why left, stats+mandate right).
  await uw.goto(`${BASE}/dashboard/validations/${VID}`, { waitUntil: "networkidle" });
  await uw.waitForTimeout(1500);
  await shoot(uw, "a2-summary-twocol", "two-column Summary + reconciled Track-record stat");

  // Expand Full report → Evidence → entity free-source note.
  await uw.getByText("Full report", { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
  await uw.waitForTimeout(900);
  await uw.getByRole("tab", { name: "Evidence", exact: true }).first().click().catch(() => {});
  await uw.waitForTimeout(1000);
  await shoot(uw, "a3-evidence-entity", "entity card free-source note (NY DOS limited fields)");
  await uwCtx.close();

  // --- Fund org: sidebar should show Mandates + Portfolio only ---
  const fundCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const fund = await login(fundCtx, "fund@test.pulseclose.com");
  await shoot(fund, "a4-fund-nav", "fund landing (Mandate Console) + fund-tenant sidebar");
  await fundCtx.close();

  await browser.close();
  console.log(`\nDone → ${OUT}/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
