// Follow-up to drive-real-loan.ts — capture the Evidence (track record) and Deal
// (sizing) tabs of the already-run real validations, without re-running the
// pipeline (reuses the rows just created). Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-loan-tabs.ts

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/real-loan";

const RUNS = [
  { id: "286-virginia", vid: "273b1810-caff-4051-a52b-f6d5e34a8095" },
  { id: "10287-soverns", vid: "9033f679-c890-41d1-bb21-68c942576c4d" },
  { id: "10228-morrison", vid: "048843cf-6773-4ac6-bed0-79ffbce961a4" },
];

async function shoot(page: Page, file: string) {
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  console.log(`  ✓ ${file}.png`);
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

  for (const r of RUNS) {
    console.log(`\n[${r.id}]`);
    await page.goto(`${BASE}/dashboard/validations/${r.vid}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    for (const tab of ["Evidence", "Deal"]) {
      try {
        await page.getByRole("tab", { name: tab }).click({ timeout: 8000 });
        await shoot(page, `${r.id}-tab-${tab.toLowerCase()}`);
      } catch (err) {
        // fall back to a plain text click if the role selector misses
        try {
          await page.click(`text="${tab}"`, { timeout: 5000 });
          await shoot(page, `${r.id}-tab-${tab.toLowerCase()}`);
        } catch {
          console.warn(`  ✗ ${tab} tab: ${(err as Error).message}`);
        }
      }
    }
  }

  await browser.close();
  console.log(`\nDone. Screenshots in ./${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
