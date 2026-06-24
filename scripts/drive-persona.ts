// Pixel-drive the LIVE prod app (app.pulseclose.com) as a seeded test user and
// screenshot each key screen for the UX review. The test users + their data
// live in the prod Supabase, and prod points at that same DB, so no local dev
// server is needed.
//
// Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' PERSONA=underwriter \
//   npx tsx scripts/drive-persona.ts
//
// Screenshots land in ./ux-review/<persona>/<NN-label>.png (full page, desktop;
// plus a mobile shot of the dashboard + one detail page).

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";
const PERSONA = process.env.PERSONA ?? "underwriter";

// Per-persona screen lists. {label, path}. Validation IDs are the seeded rows.
const SCREENS: Record<string, Array<{ label: string; path: string; mobile?: boolean }>> = {
  underwriter: [
    { label: "dashboard", path: "/dashboard", mobile: true },
    { label: "validation-clean", path: "/dashboard/validations/11111111-1111-4111-8111-111111111111", mobile: true },
    { label: "validation-flagged", path: "/dashboard/validations/22222222-2222-4222-8222-222222222222" },
    { label: "evaluate", path: "/dashboard/evaluate" },
    { label: "evaluate-investors", path: "/dashboard/evaluate/investors" },
    { label: "activity", path: "/dashboard/activity" },
    { label: "settings", path: "/dashboard/settings" },
    { label: "usage", path: "/dashboard/usage" },
  ],
  solo: [
    { label: "dashboard", path: "/dashboard", mobile: true },
    { label: "validation", path: "/dashboard/validations/33333333-3333-4333-8333-333333333333", mobile: true },
    { label: "evaluate-empty", path: "/dashboard/evaluate" },
    { label: "new-validation", path: "/dashboard/new" },
  ],
  fund: [
    { label: "dashboard-empty", path: "/dashboard", mobile: true },
    { label: "evaluate-empty", path: "/dashboard/evaluate" },
    { label: "settings", path: "/dashboard/settings" },
  ],
};

async function main() {
  const screens = SCREENS[PERSONA];
  if (!screens) throw new Error(`Unknown PERSONA ${PERSONA}`);
  const outDir = `ux-review/${PERSONA}`;
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  console.log(`Logged in as ${EMAIL}; at ${page.url()}`);

  let n = 1;
  for (const s of screens) {
    const num = String(n).padStart(2, "0");
    try {
      await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle", timeout: 30000 });
      // Let client components hydrate + any polling settle.
      await page.waitForTimeout(2500);
      const file = `${outDir}/${num}-${s.label}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ✓ ${file}  (${s.path})`);

      if (s.mobile) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(800);
        const mfile = `${outDir}/${num}-${s.label}-mobile.png`;
        await page.screenshot({ path: mfile, fullPage: true });
        console.log(`  ✓ ${mfile}`);
        await page.setViewportSize({ width: 1440, height: 900 });
      }
    } catch (err) {
      console.warn(`  ✗ ${s.path}: ${(err as Error).message}`);
    }
    n++;
  }

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
