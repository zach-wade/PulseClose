// Full visual UX audit drive. Logs in as each persona, walks every route + every
// validation-detail tab + key interactions, and full-page-screenshots each into
// ux-review/audit/. Screens are then scored against docs/UX-AUDIT-RUBRIC.md.
//
// Run: npx tsx scripts/drive-ux-audit.ts
import { chromium, type Page, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "https://app.pulseclose.com";
const OUT = "ux-review/audit";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
// The Underwriter Nachman validation the review is centered on (6 props, mandate fail).
const UW_VALIDATION = "085575ef-5302-43c0-b3c5-605912e0bb64";

async function shoot(page: Page, file: string, note: string) {
  await page.waitForTimeout(1800);
  try {
    await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
    console.log(`  ✓ ${file}.png — ${note}`);
  } catch (e) {
    console.warn(`  ✗ ${file}.png failed: ${(e as Error).message}`);
  }
}

async function login(ctx: BrowserContext, email: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2500);
  console.log(`Logged in as ${email} → ${page.url()}`);
  return page;
}

async function visit(page: Page, path: string, file: string, note: string) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
  } catch {
    console.warn(`  (networkidle timeout on ${path}; capturing anyway)`);
  }
  await shoot(page, file, note);
}

// Click a tab/link by visible text, tolerant of base-ui button rendering.
async function clickText(page: Page, text: string): Promise<boolean> {
  for (const sel of [
    page.getByRole("tab", { name: text, exact: true }),
    page.getByRole("button", { name: text, exact: true }),
    page.getByText(text, { exact: true }),
  ]) {
    try {
      const el = sel.first();
      if (await el.count() && (await el.isVisible())) {
        await el.click({ timeout: 4000 });
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

async function auditUnderwriter(ctx: BrowserContext) {
  const page = await login(ctx, "uw@test.pulseclose.com");
  console.log("\n── Underwriter: nav routes ──");
  await visit(page, "/dashboard", "uw-00-dashboard", "dashboard home");
  await visit(page, "/dashboard/evaluate", "uw-01-deals", "Deals list");
  await visit(page, "/dashboard/evaluate/investors", "uw-02-investors", "Investors list (buy-box)");
  await visit(page, "/dashboard/capital/mandates", "uw-03-mandates", "Mandate console");
  await visit(page, "/dashboard/portfolio", "uw-04-portfolio", "Portfolio");
  await visit(page, "/dashboard/coverage", "uw-05-coverage", "Coverage map");
  await visit(page, "/dashboard/activity", "uw-06-activity", "Activity feed");
  await visit(page, "/dashboard/usage", "uw-07-usage", "Usage meter");
  await visit(page, "/dashboard/new", "uw-08-new", "New validation form");
  await visit(page, "/dashboard/settings", "uw-09-settings", "Settings");

  // Investor detail (buy-box readability)
  try {
    await page.goto(`${BASE}/dashboard/evaluate/investors`, { waitUntil: "networkidle" });
    const firstInv = page.locator('a[href*="/dashboard/evaluate/investors/"]').first();
    if (await firstInv.count()) {
      await firstInv.click();
      await page.waitForTimeout(2500);
      await shoot(page, "uw-10-investor-detail", "investor detail / buy-box");
    }
  } catch (e) { console.warn(`  investor detail: ${(e as Error).message}`); }

  // The validation detail page + every tab + interactions.
  console.log("\n── Underwriter: validation detail tabs ──");
  await visit(page, `/dashboard/validations/${UW_VALIDATION}`, "uw-20-validation-summary", "validation Summary (verdict hero)");
  for (const [tab, file] of [
    ["Evidence", "uw-21-validation-evidence"],
    ["Deal", "uw-22-validation-deal"],
    ["Hand off", "uw-23-validation-handoff"],
    ["Portfolio", "uw-24-validation-portfolio"],
    ["Story mode", "uw-25-validation-storymode"],
  ] as const) {
    const ok = await clickText(page, tab);
    await shoot(page, file, `validation ${tab} tab${ok ? "" : " (tab click MISSED)"}`);
  }

  // Back to summary; open the "Why this rating?" drawer + verify tray.
  await visit(page, `/dashboard/validations/${UW_VALIDATION}`, "uw-26-validation-resummary", "back to Summary");
  if (await clickText(page, "Why this rating?")) {
    await shoot(page, "uw-27-why-this-rating", "why-this-rating drawer");
    await page.keyboard.press("Escape").catch(() => {});
  }
  if (await clickText(page, "View evidence")) {
    await shoot(page, "uw-28-evidence-drawer", "evidence drawer");
    await page.keyboard.press("Escape").catch(() => {});
  }
  // Verify tray (the 6 pending properties)
  await visit(page, `/dashboard/validations/${UW_VALIDATION}`, "uw-29-pre-verify", "before verify tray");
  if (await clickText(page, "Review now")) {
    await shoot(page, "uw-30-verify-tray", "verify tray (6 pending properties)");
  }
  await page.close();
}

async function auditSolo(ctx: BrowserContext) {
  const page = await login(ctx, "solo@test.pulseclose.com");
  console.log("\n── Solo persona ──");
  await visit(page, "/dashboard", "solo-00-dashboard", "Solo dashboard");
  await visit(page, "/dashboard/evaluate", "solo-01-deals", "Solo deals (no investors empty state?)");
  await visit(page, "/dashboard/new", "solo-02-new", "Solo new validation");
  await page.close();
}

async function auditFund(ctx: BrowserContext) {
  const page = await login(ctx, "fund@test.pulseclose.com");
  console.log("\n── Fund persona ──");
  await visit(page, "/dashboard", "fund-00-dashboard", "Fund landing (should be mandate-shaped)");
  await visit(page, "/dashboard/capital/mandates", "fund-01-mandates", "Fund mandate console");
  await page.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const persona of [auditUnderwriter, auditSolo, auditFund]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await persona(ctx);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nDone. Screens in ${OUT}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
