// Drive the Evaluate Deal stepper through to the Sizing + Judgment output (the
// underwriting heart) so the end-to-end UX review covers it. Uses the pre-filled
// Terms (a stabilized purchase bridge) and clicks forward. Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-stepper.ts

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/real-loan";

async function shoot(page: Page, file: string, note = "") {
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  console.log(`  ✓ ${file}.png${note ? ` — ${note}` : ""}`);
}

async function clickByText(page: Page, text: string, timeout = 8000): Promise<boolean> {
  try {
    await page.getByRole("button", { name: text }).first().click({ timeout });
    return true;
  } catch {
    try {
      await page.click(`text="${text}"`, { timeout: 4000 });
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2000);

  // Terms → Eligibility. Fill an ARV + rehab so Sizing has a value-add to size.
  await page.goto(`${BASE}/dashboard/evaluate`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // Best-effort enrich the pre-filled form (ids unknown — target by label proximity is fragile,
  // so just proceed with the pre-filled stabilized-bridge values).
  console.log("Terms step:");
  await shoot(page, "stepper-1-terms", "Terms (pre-filled)");

  if (await clickByText(page, "Evaluate against investors")) {
    await page.waitForTimeout(4000);
    console.log("Eligibility step:");
    await shoot(page, "stepper-2-eligibility", "eligibility across investors");

    // Advance to Sizing
    for (const label of ["Size the deal", "Next", "Sizing", "Continue to sizing", "Continue"]) {
      if (await clickByText(page, label, 5000)) {
        await page.waitForTimeout(3500);
        break;
      }
    }
    console.log("Sizing step:");
    await shoot(page, "stepper-3-sizing", "sizing + interest reserve + best-execution");

    // Advance to Judgment
    for (const label of ["Run AI judgment", "Judgment", "Next", "Continue"]) {
      if (await clickByText(page, label, 5000)) {
        await page.waitForTimeout(6000);
        break;
      }
    }
    console.log("Judgment step:");
    await shoot(page, "stepper-4-judgment", "AI UW copilot judgment");
  } else {
    console.warn("  ✗ could not click 'Evaluate against investors'");
  }

  await browser.close();
  console.log(`\nDone. Screenshots in ./${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
