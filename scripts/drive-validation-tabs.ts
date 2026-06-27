// Focused re-drive of the validation detail page: the audit's first pass missed
// the tab content because the tabs live inside the collapsed "Full report"
// disclosure. This expands it, then screenshots each tab + the memo views + the
// why-this-rating / evidence drawers. → ux-review/audit/.
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "https://app.pulseclose.com";
const OUT = "ux-review/audit";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const VID = process.env.VID ?? "085575ef-5302-43c0-b3c5-605912e0bb64";

async function shoot(page: Page, file: string, note: string) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  console.log(`  ✓ ${file}.png — ${note}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "uw@test.pulseclose.com");
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/dashboard/validations/${VID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Expand the "Full report" disclosure to reveal the tabs.
  await page.getByText("Full report", { exact: false }).first().click({ timeout: 5000 }).catch(() => console.warn("  (Full report toggle not found)"));
  await page.waitForTimeout(1200);
  await shoot(page, "uw-t0-fullreport-open", "full report expanded (tabs visible)");

  for (const [name, file] of [
    ["Summary", "uw-t1-summary"],
    ["Evidence", "uw-t2-evidence"],
    ["Deal", "uw-t3-deal"],
    ["Hand off", "uw-t4-handoff"],
    ["Portfolio", "uw-t5-portfolio"],
  ] as const) {
    const tab = page.getByRole("tab", { name, exact: true }).first();
    const ok = await tab.count().then((c) => c > 0).catch(() => false);
    if (ok) {
      await tab.click().catch(() => {});
      await page.waitForTimeout(800);
      // Scroll the tab content into view so the full-page shot leads with it.
      await tab.scrollIntoViewIfNeeded().catch(() => {});
    }
    await shoot(page, file, `${name} tab${ok ? "" : " (TAB NOT FOUND)"}`);
  }

  // Back to Summary tab → the memo view toggle (AI Risk Assessment / Story mode / Compact)
  await page.getByRole("tab", { name: "Summary", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  for (const mode of ["Story mode", "Compact"]) {
    const btn = page.getByRole("button", { name: mode, exact: true }).first();
    if (await btn.count().then((c) => c > 0).catch(() => false)) {
      await btn.click().catch(() => {});
      await shoot(page, `uw-t6-memo-${mode.toLowerCase().replace(/\s+/g, "")}`, `memo ${mode}`);
    }
  }

  // The "Why this rating?" + "View evidence" drawers.
  for (const [label, file] of [["Why this rating?", "uw-t7-why"], ["View evidence", "uw-t8-evidence-drawer"]] as const) {
    const link = page.getByText(label, { exact: false }).first();
    if (await link.count().then((c) => c > 0).catch(() => false)) {
      await link.click().catch(() => {});
      await page.waitForTimeout(1000);
      await shoot(page, file, `${label} drawer`);
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  await browser.close();
  console.log(`\nDone. → ${OUT}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
