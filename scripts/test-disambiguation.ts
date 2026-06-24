// Unit checks for the screening disambiguation layer. Pure, no network.
// Run: npx tsx scripts/test-disambiguation.ts
//
// The anchor case is calibration loan 10228 ("Mark Morrison"): 20 federal
// dockets + an OFAC potential_match with zero disambiguation. This must NEVER
// come back as a confirmed hit, and the group must read "possible — review".

import {
  scoreMatch,
  scoreMatchGroup,
  isLikelyCommonName,
  nameMatchStrength,
  type SubjectIdentity,
  type CandidateIdentity,
} from "../src/lib/screening/disambiguation";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n── name specificity ──");
check("'Mark Morrison' is common", isLikelyCommonName("Mark Morrison"));
check("'John Smith' is common", isLikelyCommonName("John Smith"));
check("'Maria Garcia' is common", isLikelyCommonName("Maria Garcia"));
check("'Zachariah Wadsworth' is NOT common", !isLikelyCommonName("Zachariah Wadsworth"));
check("'Mark Morrison Jr' is NOT common (suffix adds specificity)", !isLikelyCommonName("Mark Morrison Jr"));
check("'Mark Allen Morrison' is NOT common (middle name)", !isLikelyCommonName("Mark Allen Morrison"));

console.log("\n── name match strength ──");
check("exact: 'Mark Morrison' vs 'Mark Morrison'", nameMatchStrength("Mark Morrison", "Mark Morrison") === "exact");
check("strong: subject ⊂ candidate w/ middle", nameMatchStrength("Mark Morrison", "Mark Allen Morrison") === "strong");
check("exact via reorder 'Morrison, Mark'", nameMatchStrength("Mark Morrison", "Morrison, Mark") === "exact");
check("none: different surname", nameMatchStrength("Mark Morrison", "Mark Stevenson") === "none");
check("partial: surname + 1 given of 2", nameMatchStrength("Mark Allen Morrison", "Mark Morrison") === "exact" || nameMatchStrength("Mark Allen Morrison", "Mark Morrison") === "partial");

console.log("\n── single common-name match (the trust-killer) ──");
const subject: SubjectIdentity = { fullName: "Mark Morrison", knownStates: ["CA"] };
const bareMatch: CandidateIdentity = { name: "Mark Morrison", jurisdictionState: null };
const r1 = scoreMatch(subject, bareMatch);
check("name-only common name → 'possible', NOT confirmed/probable", r1.confidence === "possible", `got ${r1.confidence}`);
check("name-only common name → reviewRequired", r1.reviewRequired);
check("flagged nameIsCommon", r1.nameIsCommon);

console.log("\n── corroborating identifiers raise confidence ──");
const withDob = scoreMatch(
  { fullName: "Mark Morrison", dob: "1975-04-12" },
  { name: "Mark Morrison", dob: "1975-04-12" },
);
check("exact name + matching DOB → confirmed", withDob.confidence === "confirmed", `got ${withDob.confidence}`);
const distinctiveExact = scoreMatch(
  { fullName: "Zachariah Wadsworth" },
  { name: "Zachariah Wadsworth" },
);
check("distinctive exact name, no 2nd id → 'possible' (still review)", distinctiveExact.confidence === "possible", `got ${distinctiveExact.confidence}`);

console.log("\n── group dispersion cap (20 federal dockets) ──");
const twentyHits: CandidateIdentity[] = Array.from({ length: 20 }, (_, i) => ({
  name: "Mark Morrison",
  jurisdictionState: ["CA", "NY", "TX", "FL", "IL", "WA", "OH"][i % 7],
}));
const group = scoreMatchGroup(subject, twentyHits, { kind: "case" });
check("group highestConfidence is 'possible' (no false confirmed)", group.highestConfidence === "possible", `got ${group.highestConfidence}`);
check("group flagged commonNameLikely", group.commonNameLikely);
check("group reviewCount === 20", group.reviewCount === 20, `got ${group.reviewCount}`);
check("summary says 'possible' + 'review', never 'hit'", /possible/i.test(group.summary) && /review/i.test(group.summary) && !/hit/i.test(group.summary), group.summary);
console.log(`     summary → "${group.summary}"`);

console.log("\n── a genuine confirmed match survives the cap ──");
const mixed: CandidateIdentity[] = [
  { name: "Mark Morrison", dob: "1975-04-12", jurisdictionState: "CA" },
  ...Array.from({ length: 6 }, () => ({ name: "Mark Morrison", jurisdictionState: "TX" })),
];
const mixedGroup = scoreMatchGroup({ fullName: "Mark Morrison", dob: "1975-04-12" }, mixed, { kind: "case" });
check("DOB-corroborated match stays 'confirmed' despite common name", mixedGroup.highestConfidence === "confirmed", `got ${mixedGroup.highestConfidence}`);

console.log("\n── entity-name matches are more distinctive ──");
const entity = scoreMatch(
  { fullName: "Newgate Holdings LLC" },
  { name: "Newgate Holdings LLC", vendorScore: 0.95 },
  { entity: true },
);
check("exact entity match w/ high vendor score → 'probable'", entity.confidence === "probable", `got ${entity.confidence}`);

console.log(`\n${"═".repeat(50)}`);
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
