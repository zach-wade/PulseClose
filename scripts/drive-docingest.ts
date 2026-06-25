// Task 1 — test doc-ingest on REAL ICC packages end-to-end through the live UI,
// capturing the raw /api/ingest/borrower-doc response (the full extraction) so we
// can judge quality + size limits. Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-docingest.ts

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/real-loan";
const HOME = os.homedir();

const FILES = [
  { label: "905-lbj-pdf-3.3M", path: `${HOME}/Downloads/905 N Lbj Dr - ICC - Loan App & Disclosures - Signed-1779305204078.pdf` },
  { label: "286-virginia-xlsx-5.3M", path: `${HOME}/code/clients/consulting/clients/insignia-capital/data/286 Virginia Pl - ICC - Loan Request.xlsx` },
];

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await ctx.newPage();
  await login(page);

  for (const f of FILES) {
    console.log(`\n=== ${f.label} ===`);
    await page.goto(`${BASE}/dashboard/new`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Capture the ingest API response for this upload.
    const respPromise = page
      .waitForResponse((r) => r.url().includes("/api/ingest/borrower-doc"), { timeout: 90000 })
      .catch(() => null);

    await page.setInputFiles('input[type="file"]', f.path).catch((e) => {
      console.log(`  setInputFiles error: ${(e as Error).message}`);
    });

    const resp = await respPromise;
    if (!resp) {
      console.log("  no ingest response captured");
      continue;
    }
    console.log(`  HTTP ${resp.status()}`);
    let body: unknown = null;
    try { body = await resp.json(); } catch { body = await resp.text().catch(() => "<unreadable>"); }
    console.log("  response:", JSON.stringify(body, null, 2));

    // Let the form pre-fill, then screenshot + read back the populated fields.
    await page.waitForTimeout(2500);
    const fields = {
      borrowerName: await page.inputValue("#borrowerName").catch(() => ""),
      guarantorName: await page.inputValue("#guarantorName").catch(() => ""),
      entityName: await page.inputValue("#entityName").catch(() => ""),
      entityState: await page.inputValue("#entityState").catch(() => ""),
      gcName: await page.inputValue("#gcName").catch(() => ""),
      addresses: await page.inputValue("textarea").catch(() => ""),
    };
    console.log("  form pre-filled:", JSON.stringify(fields));
    await page.screenshot({ path: `${OUT}/docingest-${f.label}.png`, fullPage: true });
    console.log(`  ✓ docingest-${f.label}.png`);
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
