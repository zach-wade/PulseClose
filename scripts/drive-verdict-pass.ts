// Visual verification of the verdict-first detail page (UX-REDESIGN §11.3) on
// LIVE prod. The headline assertion is the Achilles fix: a 429'd entity lookup
// must read "Needs review", NEVER "Verified".
//
// Run: EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-verdict-pass.ts
// Shots → ./ux-review/verdict/

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const OUT = "ux-review/verdict";
const ACHILLES = "273b1810-caff-4051-a52b-f6d5e34a8095"; // live Cobalt-429 case

let fails = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${cond ? "" : ` — ${detail ?? ""}`}`);
  if (!cond) fails++;
}

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
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

  // ── Achilles detail — verdict hero ──
  await page.goto(`${BASE}/dashboard/validations/${ACHILLES}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/01-achilles-hero.png` });

  // Deploy freshness — the "Full report" disclosure only exists post-redesign.
  const fullReport = await page.getByText(/Full report/i).count();
  check("deploy is current (Full report disclosure present)", fullReport > 0, "STALE DEPLOY");

  const text = await bodyText(page);

  // THE fix: the verdict must be "Needs review", not "Verified".
  check('verdict hero reads "Needs review"', /Needs review/i.test(text), "hero verdict text missing");
  check(
    'hero does NOT lead with "Verified" (the 429 bug)',
    !/Verified · (LOW|MEDIUM|HIGH)/i.test(text),
    "still shows a Verified headline",
  );

  // Pillar quad — entity incomplete, others present.
  check("entity pillar shown", /Entity \/ SOS/i.test(text), "pillar label missing");
  check('entity reads "Didn\'t complete"', /Didn.?t complete/i.test(text), "incomplete message missing");
  check("counterfactual present", /clears this|Re-run/i.test(text), "no counterfactual");

  // ── Full report disclosure expands ──
  await page.getByText(/Full report/i).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const expanded = await bodyText(page);
  check("report expands to the tabs", /Summary/.test(expanded) && /Evidence/.test(expanded), "tabs not revealed");
  await page.screenshot({ path: `${OUT}/02-achilles-report-open.png`, fullPage: true });

  // ── Dashboard list — verdict chips ──
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const listText = await bodyText(page);
  check("list has a Verdict column", /Verdict/.test(listText), "header not renamed");
  check(
    "list shows verdict chips",
    /(Verified|Needs review|Flagged)/.test(listText),
    "no verdict chip text in the list",
  );
  await page.screenshot({ path: `${OUT}/03-dashboard-list.png` });

  // ── Portfolio — verdict mix ──
  await page.goto(`${BASE}/dashboard/portfolio`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const portText = await bodyText(page);
  check("portfolio H1 is 'Portfolio' (not 'Book')", /Portfolio/.test(portText) && !/\bBook\b/.test(portText), "still says Book");
  // Label is CSS-uppercased ("NEEDS REVIEW") — match case-insensitively.
  check("portfolio shows the verdict mix", /needs review/i.test(portText), "no verdict mix row");
  await page.screenshot({ path: `${OUT}/04-portfolio-mix.png` });

  await browser.close();
  console.log(`\n${fails === 0 ? "✅ verdict pass" : `❌ ${fails} failed`}`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
