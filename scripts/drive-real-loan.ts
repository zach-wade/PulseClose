// Plan B — walk a REAL loan through the LIVE product end-to-end and screenshot
// every screen, so we see the actual customer experience on real data (NOT the
// seeded Westbrook demo). Drives prod (app.pulseclose.com) as the underwriter
// test org: intake (/dashboard/new) → submit → the live pipeline runs → the
// validation detail page renders the real pillar results.
//
// This fires REAL vendor calls (Cobalt/Realie/RentCast/CourtListener/OFAC) and
// writes real rows under the test org — that's the point: it's the product
// running a real loan, the way a customer would.
//
// Run:
//   EMAIL=uw@test.pulseclose.com PASSWORD='Test1234!' npx tsx scripts/drive-real-loan.ts
//
// Screenshots land in ./ux-review/real-loan/<NN-loan-screen>.png

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "https://app.pulseclose.com";
const EMAIL = process.env.EMAIL ?? "uw@test.pulseclose.com";
const PASSWORD = process.env.PASSWORD ?? "Test1234!";

interface RunLoan {
  id: string;
  why: string; // what this loan is meant to exercise in the UI
  borrowerName: string;
  guarantorName?: string;
  entityName: string;
  entityState: string;
  dob?: string;
  addresses: string[];
  gcName?: string;
  gcState?: string;
}

// Real loans from the golden set, chosen to span the experience:
const LOANS: RunLoan[] = [
  {
    id: "286-virginia",
    why: "Happy path on real data: active SOS entity + a deed-verified track-record flip ($830k→$1.75M) + clean distinctive-name screening + construction.",
    borrowerName: "Nik Kafetzopoulos",
    guarantorName: "Nik Kafetzopoulos",
    entityName: "Achilles Properties LLC",
    entityState: "CA",
    addresses: ["286 Virginia Pl, Costa Mesa, CA 92627"],
  },
  {
    id: "10287-soverns",
    why: "Non-CA (MA) distinctive-name luxury SFR — tests cross-state entity + clean screening + the deed-verify on a non-disclosure-ish state.",
    borrowerName: "Christopher Soverns",
    guarantorName: "Christopher Soverns",
    entityName: "14 Trapps Pond LLC",
    entityState: "MA",
    addresses: ["14 Trapps Pond Rd, Edgartown, MA 02539"],
  },
  {
    id: "10228-morrison",
    why: "Common-name DISAMBIGUATION showcase: how 'possible — review' / 'unlikely' litigation badges + collapsed exclusion-list sanctions RENDER. (Entity = borrower name reflects the real 'vesting LLC not captured' gap → SOS not_found.)",
    borrowerName: "Mark Morrison",
    guarantorName: "Mark Morrison",
    entityName: "Mark Morrison",
    entityState: "CA",
    addresses: ["2290 Newgate Ct, Santa Rosa, CA 95404"],
  },
];

const OUT = "ux-review/real-loan";

async function shoot(page: Page, file: string, note: string) {
  await page.waitForTimeout(2200); // hydrate + polling settle
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  console.log(`  ✓ ${file}.png — ${note}`);
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2000);
  console.log(`Logged in as ${EMAIL}; at ${page.url()}`);
}

async function runLoan(page: Page, loan: RunLoan, idx: number) {
  const n = String(idx).padStart(2, "0");
  console.log(`\n[${loan.id}] ${loan.why}`);

  // ── Intake ──
  await page.goto(`${BASE}/dashboard/new`, { waitUntil: "networkidle" });
  await page.fill("#borrowerName", loan.borrowerName);
  if (loan.guarantorName) await page.fill("#guarantorName", loan.guarantorName);
  if (loan.dob) await page.fill("#borrowerDob", loan.dob);
  await page.fill("#entityName", loan.entityName);
  await page.selectOption("#entityState", loan.entityState); // it's a <select>
  await page.fill("textarea", loan.addresses.join("\n"));
  if (loan.gcName) await page.fill("#gcName", loan.gcName);
  if (loan.gcState) await page.fill("#gcState", loan.gcState);
  await shoot(page, `${n}-${loan.id}-1-intake`, "intake form filled");

  // ── Submit → the live pipeline runs synchronously, then redirects to detail ──
  console.log(`  … submitting; waiting for the live pipeline (vendors) to finish`);
  const before = page.url();
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL("**/dashboard/validations/**", { timeout: 150000 });
  } catch {
    console.warn(`  ✗ did not redirect from ${before} within 150s — capturing current state`);
  }
  await page.waitForTimeout(3000);
  const detailUrl = page.url();
  console.log(`  → detail: ${detailUrl}`);
  await shoot(page, `${n}-${loan.id}-2-detail`, "validation detail (all pillars, real data)");

  return detailUrl;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();

  await login(page);

  for (let i = 0; i < LOANS.length; i++) {
    try {
      await runLoan(page, LOANS[i], i + 1);
    } catch (err) {
      console.warn(`  ✗ ${LOANS[i].id} failed: ${(err as Error).message}`);
    }
    // Space the runs so Cobalt's shared rate limit recovers between loans —
    // verifies the entity pillar resolves cleanly when not hammered (#19).
    if (i < LOANS.length - 1) await page.waitForTimeout(20000);
  }

  // ── Evaluate / underwrite surface (deal stepper landing) ──
  try {
    await page.goto(`${BASE}/dashboard/evaluate`, { waitUntil: "networkidle" });
    await shoot(page, "99-evaluate", "evaluate / underwrite stepper landing");
  } catch (err) {
    console.warn(`  ✗ evaluate: ${(err as Error).message}`);
  }

  await browser.close();
  console.log(`\nDone. Screenshots in ./${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
