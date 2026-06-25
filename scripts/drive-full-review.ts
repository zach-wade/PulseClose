// Plan B (full sweep) — capture EVERY top-level screen + the remaining validation
// detail tabs + the handoff view, on real data, for the end-to-end UX review.
// Complements drive-real-loan.ts (intake+detail) and drive-loan-tabs.ts
// (Evidence/Deal). Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-full-review.ts

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/real-loan";

// The real validation just created for 286-virginia (deed-verified track record).
const VID = "273b1810-caff-4051-a52b-f6d5e34a8095";

// Every top-level nav destination + utility screen.
const NAV: Array<{ label: string; path: string }> = [
  { label: "nav-01-borrowers-dashboard", path: "/dashboard" },
  { label: "nav-02-deals-evaluate", path: "/dashboard/evaluate" },
  { label: "nav-03-capital-investors", path: "/dashboard/evaluate/investors" },
  { label: "nav-04-mandate-console", path: "/dashboard/capital/mandates" },
  { label: "nav-05-book-portfolio", path: "/dashboard/portfolio" },
  { label: "nav-06-activity", path: "/dashboard/activity" },
  { label: "nav-07-usage", path: "/dashboard/usage" },
  { label: "nav-08-settings", path: "/dashboard/settings" },
  { label: "nav-09-compare", path: "/dashboard/compare" },
  { label: "detail-handoff-view", path: `/handoff/${VID}` },
  { label: "detail-risk-methodology", path: `/validations/${VID}/risk-methodology` },
];

async function shoot(page: Page, file: string, note = "") {
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  console.log(`  ✓ ${file}.png${note ? ` — ${note}` : ""}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2000);
  console.log(`Logged in; at ${page.url()}`);

  for (const s of NAV) {
    try {
      await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle", timeout: 40000 });
      await shoot(page, s.label, s.path);
    } catch (err) {
      console.warn(`  ✗ ${s.path}: ${(err as Error).message}`);
    }
  }

  // Validation detail — remaining tabs (Summary/Evidence/Deal captured earlier).
  await page.goto(`${BASE}/dashboard/validations/${VID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  for (const tab of ["Hand off", "Book"]) {
    try {
      await page.getByRole("tab", { name: tab }).click({ timeout: 8000 });
      await shoot(page, `detail-tab-${tab.replace(/\s+/g, "-").toLowerCase()}`);
    } catch (err) {
      console.warn(`  ✗ ${tab} tab: ${(err as Error).message}`);
    }
  }

  await browser.close();
  console.log(`\nDone. Screenshots in ./${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
