// Asserts computeVerdict() against the three mockup states (docs/mockups/
// detail-redesign.html) + the Achilles 429 bug. Run: npx tsx scripts/verify-verdict.ts
import { computeVerdict, type VerdictSource } from "../src/lib/validation/verdict";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const clean = {
  track_record: [{ outcome: "completed" }, { outcome: "completed" }, { outcome: "completed" }, { outcome: "completed" }],
  litigation_checks: [{ result: "clear" }],
  gc_validations: [],
  sanctions_checks: [{ result: "clear", matches: [], match_count: 0 }],
};

// ── STATE 1 — Achilles: entity 429 ⇒ Needs review (the bug fix) ──────────────
console.log("\nSTATE 1 — Achilles (entity 429)");
{
  const src: VerdictSource = {
    entity_checks: [{ state: "CA", sos_status: "not_found", flags: [], raw_response: { _error: true } }],
    ...clean,
    tier: "LOW",
  };
  const v = computeVerdict(src);
  check("verdict is needs_review (NOT verified)", v.state === "needs_review", v.state);
  check("entity pillar is incomplete", v.pillars[0].status === "incomplete", v.pillars[0].status);
  check("entity sub-label names the error", /CA/.test(v.pillars[0].subLabel ?? ""), v.pillars[0].subLabel ?? "null");
  check("counterfactual mentions re-run", /re-run/i.test(v.counterfactual ?? ""), v.counterfactual ?? "null");
  check("other pillars stay verified", v.pillars[2].status === "verified" && v.pillars[4].status === "verified");
}

// ── STATE 2 — Westbrook: all clean ⇒ Verified · LOW ──────────────────────────
console.log("\nSTATE 2 — Westbrook (all clean)");
{
  const src: VerdictSource = {
    entity_checks: [{ state: "CA", sos_status: "active", flags: [], raw_response: {} }],
    ...clean,
    gc_validations: [{ license_status: "active" }],
    tier: "LOW",
    mandate: "meets",
  };
  const v = computeVerdict(src);
  check("verdict is verified", v.state === "verified", v.state);
  check("headline carries tier", v.headline === "Verified · LOW risk", v.headline);
  check("all five pillars verified", v.pillars.every((p) => p.status === "verified"));
  check("no counterfactual", v.counterfactual === null);
  check("reason mentions corroborated properties", /corroborated/.test(v.reason), v.reason);
}

// ── STATE 3 — Mark Morrison: no entity + active litigation ⇒ Flagged ─────────
console.log("\nSTATE 3 — Mark Morrison (flagged)");
{
  const src: VerdictSource = {
    entity_checks: [],
    track_record: [{ outcome: "completed" }, { outcome: "completed" }, { outcome: "completed" }],
    litigation_checks: [
      { result: "found", raw_response: { _disambiguation: { confidence: "confirmed" } } },
    ],
    gc_validations: [],
    sanctions_checks: [{ result: "clear", matches: [], match_count: 0 }],
    tier: "HIGH",
    mandate: "does_not_meet",
  };
  const v = computeVerdict(src);
  check("verdict is flagged", v.state === "flagged", v.state);
  check("entity pillar is not_applicable (absent ≠ flag)", v.pillars[0].status === "not_applicable", v.pillars[0].status);
  check("litigation pillar is flagged", v.pillars[2].status === "flagged", v.pillars[2].status);
  check("counterfactual mentions the active case", /active case/i.test(v.counterfactual ?? ""), v.counterfactual ?? "null");
}

// ── Disambiguation guards — name-only matches must NOT flag ───────────────────
console.log("\nGUARD — name-only litigation/sanctions stay clean");
{
  const src: VerdictSource = {
    entity_checks: [{ state: "TX", sos_status: "active", flags: [], raw_response: {} }],
    track_record: [{ outcome: "completed" }],
    litigation_checks: [{ result: "found", raw_response: { _disambiguation: { confidence: "possible" } } }],
    gc_validations: [],
    sanctions_checks: [{ result: "potential_match", matches: [{ confidence: "possible" }], match_count: 1 }],
    tier: "LOW",
  };
  const v = computeVerdict(src);
  check("possible litigation does NOT flag", v.pillars[2].status === "verified", v.pillars[2].status);
  check("possible sanctions does NOT flag", v.pillars[4].status === "verified", v.pillars[4].status);
  check("sanctions sub-label flags it for review", /possible/.test(v.pillars[4].subLabel ?? ""), v.pillars[4].subLabel ?? "null");
  check("overall verdict is verified", v.state === "verified", v.state);
}

// ── GUARD — sanctions not_run ⇒ needs_review ─────────────────────────────────
console.log("\nGUARD — sanctions not_run ⇒ needs_review");
{
  const src: VerdictSource = {
    entity_checks: [{ state: "TX", sos_status: "active", flags: [], raw_response: {} }],
    track_record: [{ outcome: "completed" }],
    litigation_checks: [{ result: "clear" }],
    gc_validations: [],
    sanctions_checks: [{ result: "not_run", matches: [], match_count: 0 }],
    tier: "LOW",
  };
  const v = computeVerdict(src);
  check("verdict is needs_review", v.state === "needs_review", v.state);
  check("sanctions pillar is incomplete", v.pillars[4].status === "incomplete", v.pillars[4].status);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
