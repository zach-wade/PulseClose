// Match disambiguation for name-based screening (litigation + sanctions).
//
// WHY THIS EXISTS — the trust-killer.
// CourtListener and OpenSanctions are *name* searches. A common name like
// "Mark Morrison" returns 20 federal dockets and an OFAC "potential match"
// that belong to many different people. Surfacing those as a "hit" — or
// letting them fire a tier-dropping risk factor — is exactly the false
// positive Noah killed the auto-score over (calibration loan 10228). His
// rule: a single false positive destroys trust.
//
// THE HONEST RULE this module enforces:
//   A name match with NO corroborating second identifier (DOB, address, or a
//   distinctive/uncommon name) can never exceed "possible — review." We never
//   call it a "hit." When one name yields many dispersed matches, we say so:
//   "N possible matches — review; name appears common."
//
// This is deliberately conservative. We would rather under-claim a match and
// route it to human review than assert a confirmed hit on thin evidence. The
// deterministic engine and the human decide; this layer just refuses to lie
// about confidence. (ROADMAP principle 8: tokenize-and-set, never substring.)

export type MatchConfidence = "confirmed" | "probable" | "possible" | "weak";

export type NameMatch = "exact" | "strong" | "partial" | "none";

export interface SubjectIdentity {
  /** The borrower / guarantor / entity name we searched. */
  fullName: string;
  /** States the subject is known to operate in (operating state + property
   *  states). Used as weak jurisdiction corroboration when present. */
  knownStates?: string[];
  /** ISO date (YYYY-MM-DD). Future: from doc-ingest. A DOB agreement is the
   *  strongest single corroborator. */
  dob?: string | null;
  /** Known addresses. Future: from doc-ingest. */
  knownAddresses?: string[];
}

export interface CandidateIdentity {
  /** The party / list-entry name the vendor returned. */
  name: string;
  /** Two-letter state for the candidate's jurisdiction (court state, entity
   *  country/state). Null when unknown — which is the common case today. */
  jurisdictionState?: string | null;
  dob?: string | null;
  address?: string | null;
  /** Vendor-provided fuzzy similarity 0..1 (OpenSanctions `score`). Null for
   *  vendors that don't provide one (CourtListener). */
  vendorScore?: number | null;
}

export interface DisambiguationResult {
  confidence: MatchConfidence;
  nameMatch: NameMatch;
  /** True when the subject name is low-specificity (e.g. two common tokens
   *  with no middle name / suffix). Drives the "name appears common" copy. */
  nameIsCommon: boolean;
  /** Identifiers that independently agree: "dob", "address", "jurisdiction". */
  corroborating: string[];
  /** Human-readable reasons for the confidence call. */
  reasons: string[];
  /** confidence !== "confirmed" → a human must verify before acting. */
  reviewRequired: boolean;
}

export interface GroupScore {
  results: DisambiguationResult[];
  /** Highest confidence across the group (drives badge tone). */
  highestConfidence: MatchConfidence;
  /** Many name-only matches across multiple jurisdictions → the name is
   *  almost certainly shared by many people. Caps the whole group at
   *  "possible" and changes the copy. */
  commonNameLikely: boolean;
  /** Count of matches that require human review (everything but "confirmed"). */
  reviewCount: number;
  /** UI-ready summary, e.g. "20 possible matches — review (name appears
   *  common across 7 jurisdictions)". Never the word "hit". */
  summary: string;
}

// ── Name tokenization ──────────────────────────────────────────────────────

// Personal name suffixes — dropped from token comparison but counted as a
// specificity signal (a "Jr"/"III" makes the identity more distinctive).
const PERSONAL_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

// Entity suffixes — dropped so "Newgate Holdings LLC" matches "Newgate
// Holdings". Kept local (not imported) so this module stays dependency-free
// and the lists can diverge by purpose.
const ENTITY_SUFFIXES = new Set([
  "llc", "inc", "incorporated", "corp", "corporation", "co", "company",
  "lp", "llp", "llp", "ltd", "limited", "trust", "holdings", "group",
  "partners", "capital", "properties", "realty", "homes", "ventures",
]);

// A small, deliberately-indicative (NOT exhaustive) set of high-frequency US
// given names and surnames. This is a *booster* for the common-name signal,
// not the safety mechanism — the real safety is "no corroborating identifier
// → capped at possible," which holds regardless of whether a name is on this
// list. Census top-frequency names.
const COMMON_GIVEN = new Set([
  "james", "john", "robert", "michael", "william", "david", "richard",
  "joseph", "thomas", "charles", "christopher", "daniel", "matthew", "mark",
  "donald", "steven", "paul", "andrew", "joshua", "kenneth", "kevin", "brian",
  "george", "mary", "patricia", "jennifer", "linda", "elizabeth", "barbara",
  "susan", "jessica", "sarah", "karen", "lisa", "nancy", "maria", "anna",
]);
const COMMON_SURNAME = new Set([
  "smith", "johnson", "williams", "brown", "jones", "garcia", "miller",
  "davis", "rodriguez", "martinez", "hernandez", "lopez", "gonzalez", "wilson",
  "anderson", "thomas", "taylor", "moore", "jackson", "martin", "lee", "perez",
  "thompson", "white", "harris", "sanchez", "clark", "ramirez", "lewis",
  "robinson", "walker", "young", "allen", "king", "wright", "scott", "torres",
  "nguyen", "hill", "green", "morrison", "morris", "murphy", "rivera",
]);

interface ParsedName {
  /** Lowercased significant tokens, original order, suffixes removed. */
  tokens: string[];
  hasSuffix: boolean;
  /** A standalone middle name or initial (more than first+last). */
  hasMiddle: boolean;
  isEntity: boolean;
}

function parseName(raw: string, treatAsEntity = false): ParsedName {
  const lowered = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let hasSuffix = false;
  const tokens: string[] = [];
  for (const t of lowered) {
    if (PERSONAL_SUFFIXES.has(t)) {
      hasSuffix = true;
      continue;
    }
    if (treatAsEntity && ENTITY_SUFFIXES.has(t)) continue;
    tokens.push(t);
  }
  // A bare single-letter token between first and last is a middle initial.
  const hasMiddle = tokens.length >= 3;
  return { tokens, hasSuffix, hasMiddle, isEntity: treatAsEntity };
}

function tokenSet(tokens: string[]): Set<string> {
  return new Set(tokens);
}

/** Is this name low-specificity — i.e. likely shared by many people? */
export function isLikelyCommonName(raw: string): boolean {
  const { tokens, hasSuffix, hasMiddle } = parseName(raw);
  // Distinctive structure (a middle name/initial or a generational suffix)
  // makes even common parts specific enough to lean on.
  if (hasSuffix || hasMiddle) return false;
  if (tokens.length === 0) return true;
  // A single token (mononym) is unusable for disambiguation → treat common.
  if (tokens.length === 1) return true;
  const [first, ...rest] = tokens;
  const last = rest[rest.length - 1];
  // Two-token "given surname" where BOTH parts are high-frequency → common.
  if (tokens.length === 2) {
    return COMMON_GIVEN.has(first) || COMMON_SURNAME.has(last);
  }
  return false;
}

/** Strength of the name overlap, set-based (never substring). */
export function nameMatchStrength(
  subject: string,
  candidate: string,
  treatAsEntity = false,
): NameMatch {
  const s = parseName(subject, treatAsEntity);
  const c = parseName(candidate, treatAsEntity);
  if (s.tokens.length === 0 || c.tokens.length === 0) return "none";

  const ss = tokenSet(s.tokens);
  const cs = tokenSet(c.tokens);

  // Surname must be present on both sides for any non-none match. For people
  // we use the last token; for entities we require the core token set overlap.
  const sLast = s.tokens[s.tokens.length - 1];
  const cHasSurname = cs.has(sLast);

  const subjectInCandidate = [...ss].every((t) => cs.has(t));
  const candidateInSubject = [...cs].every((t) => ss.has(t));

  if (subjectInCandidate && candidateInSubject) return "exact";
  // Subject fully contained in candidate (candidate adds tokens). This is only
  // a "strong" match if the extra tokens are plausibly MIDDLE names — i.e. the
  // candidate doesn't carry a DIFFERENT leading first name. "Mark Morrison" ⊂
  // "Mark Allen Morrison" is strong (added middle); "Mark Morrison" ⊂ "Paul
  // Mark Morrison" is NOT — Paul is a different person whose middle name is
  // Mark. (Calibration: CourtListener returns many such captions for a common
  // surname.) Entities don't have this first-name semantics, so skip them.
  if (subjectInCandidate && cHasSurname) {
    if (treatAsEntity) return "strong";
    const sFirst = s.tokens[0];
    const firstIdxInC = c.tokens.indexOf(sFirst);
    // Any candidate token positioned BEFORE the subject's first name that the
    // subject doesn't have is a distinct leading given name → different person.
    const hasDifferentLeadingGiven =
      firstIdxInC > 0 &&
      c.tokens.slice(0, firstIdxInC).some((t) => t !== sLast && !ss.has(t));
    return hasDifferentLeadingGiven ? "partial" : "strong";
  }
  // Surname + at least one given token shared, but not full containment.
  const sharedGiven = [...ss].filter((t) => t !== sLast && cs.has(t)).length;
  if (cHasSurname && sharedGiven >= 1) return "partial";
  return "none";
}

function statesAgree(subject: SubjectIdentity, candidate: CandidateIdentity): boolean {
  const cs = candidate.jurisdictionState?.toUpperCase().trim();
  if (!cs) return false;
  return (subject.knownStates ?? []).some((s) => s.toUpperCase().trim() === cs);
}

function dobsAgree(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

function addressesAgree(subject: SubjectIdentity, candidate: CandidateIdentity): boolean {
  const ca = candidate.address?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!ca) return false;
  return (subject.knownAddresses ?? []).some((s) => {
    const norm = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    // Either contains the other's normalized form — addresses are messier
    // than names so a containment check is acceptable here.
    return norm && (norm.includes(ca) || ca.includes(norm));
  });
}

/**
 * Score one candidate against the subject. The whole point: a name-only match
 * is capped at "possible" no matter how good the name overlap, because a name
 * alone can't distinguish two people. Confidence rises only with a second,
 * independent identifier.
 */
export function scoreMatch(
  subject: SubjectIdentity,
  candidate: CandidateIdentity,
  opts: { entity?: boolean } = {},
): DisambiguationResult {
  const treatAsEntity = opts.entity ?? false;
  const nameMatch = nameMatchStrength(subject.fullName, candidate.name, treatAsEntity);
  const nameIsCommon = !treatAsEntity && isLikelyCommonName(subject.fullName);
  const reasons: string[] = [];
  const corroborating: string[] = [];

  if (dobsAgree(subject.dob, candidate.dob)) corroborating.push("dob");
  if (addressesAgree(subject, candidate)) corroborating.push("address");
  if (statesAgree(subject, candidate)) corroborating.push("jurisdiction");

  // Vendor fuzzy score, when present, sharpens the name read for entities and
  // distinctive names — but never substitutes for a corroborating identifier.
  const vendorScore = candidate.vendorScore ?? null;

  let confidence: MatchConfidence;

  if (nameMatch === "none") {
    confidence = "weak";
    reasons.push("Name does not match — surname or given names differ.");
  } else if (nameMatch === "partial") {
    confidence = "weak";
    reasons.push("Only a partial name match (surname + one given name).");
  } else {
    // exact or strong name match. Now the second-identifier gate decides.
    const hasStrongCorroborator =
      corroborating.includes("dob") || corroborating.includes("address");

    if (hasStrongCorroborator) {
      confidence = "confirmed";
      reasons.push(
        `${nameMatch === "exact" ? "Exact" : "Strong"} name match corroborated by ${corroborating
          .filter((c) => c === "dob" || c === "address")
          .join(" + ")}.`,
      );
    } else if (treatAsEntity && nameMatch === "exact" && (vendorScore ?? 0) >= 0.9) {
      // Entity names are far more distinctive than personal names; an exact
      // token-set match on a company is meaningfully stronger.
      confidence = "probable";
      reasons.push("Exact entity-name match (high-distinctiveness).");
    } else if (!nameIsCommon && nameMatch === "exact" && corroborating.includes("jurisdiction")) {
      confidence = "probable";
      reasons.push("Exact match on a distinctive name in a known jurisdiction.");
    } else if (!nameIsCommon && nameMatch === "exact") {
      confidence = "possible";
      reasons.push("Exact match on a distinctive name, but no second identifier (DOB/address) to confirm.");
    } else {
      confidence = "possible";
      reasons.push(
        nameIsCommon
          ? "Name-only match on a common name — likely one of many people sharing it. No DOB/address to disambiguate."
          : "Name-only match — no DOB/address to confirm this is the same party.",
      );
    }
  }

  return {
    confidence,
    nameMatch,
    nameIsCommon,
    corroborating,
    reasons,
    reviewRequired: confidence !== "confirmed",
  };
}

/**
 * Score a group of candidates that all came from ONE subject-name query, and
 * apply the dispersion cap: many name-only matches across multiple
 * jurisdictions is itself evidence the name is shared by many people, so cap
 * the whole group at "possible" and say so. This is what turns "20 federal
 * hits" into "20 possible matches — review (name appears common)".
 */
export function scoreMatchGroup(
  subject: SubjectIdentity,
  candidates: CandidateIdentity[],
  opts: { entity?: boolean; kind?: string } = {},
): GroupScore {
  const results = candidates.map((c) => scoreMatch(subject, c, opts));

  const distinctJurisdictions = new Set(
    candidates.map((c) => c.jurisdictionState?.toUpperCase().trim()).filter(Boolean),
  ).size;

  // "Many" name-only matches → the name is being shared. Threshold of 3 keeps
  // us from over-firing on a borrower with two genuine cases.
  const nameOnlyMatches = results.filter(
    (r) => r.reviewRequired && (r.nameMatch === "exact" || r.nameMatch === "strong"),
  ).length;
  const commonNameLikely =
    isLikelyCommonName(subject.fullName) ||
    (nameOnlyMatches >= 3 && distinctJurisdictions >= 2) ||
    nameOnlyMatches >= 5;

  // Apply the cap: nothing in a common-name group may claim more than possible
  // unless it carries a strong corroborator (DOB/address).
  if (commonNameLikely) {
    for (const r of results) {
      const strongCorroborated =
        r.corroborating.includes("dob") || r.corroborating.includes("address");
      if (!strongCorroborated && (r.confidence === "confirmed" || r.confidence === "probable")) {
        r.confidence = "possible";
        r.reviewRequired = true;
        r.nameIsCommon = true;
        r.reasons.push("Capped at possible: this name appears common across many matches.");
      }
    }
  }

  const order: MatchConfidence[] = ["confirmed", "probable", "possible", "weak"];
  let highestConfidence: MatchConfidence = "weak";
  for (const r of results) {
    if (order.indexOf(r.confidence) < order.indexOf(highestConfidence)) {
      highestConfidence = r.confidence;
    }
  }

  const reviewCount = results.filter((r) => r.reviewRequired && r.nameMatch !== "none").length;
  const kind = opts.kind ?? "match";

  let summary: string;
  if (reviewCount === 0) {
    summary = "No matches require review.";
  } else if (highestConfidence === "confirmed") {
    summary = `${reviewCount} ${pluralize(kind, reviewCount)} — at least one confirmed by a second identifier; review.`;
  } else {
    const commonNote = commonNameLikely
      ? distinctJurisdictions >= 2
        ? ` (name appears common across ${distinctJurisdictions} jurisdictions)`
        : " (name appears common)"
      : "";
    summary = `${reviewCount} possible ${pluralize(kind, reviewCount)} — review${commonNote}.`;
  }

  return { results, highestConfidence, commonNameLikely, reviewCount, summary };
}

function pluralize(word: string, n: number): string {
  if (n === 1) return word;
  return /(?:s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
}

/** UI label for a single confidence level. Never the word "hit". */
export function confidenceLabel(c: MatchConfidence): string {
  switch (c) {
    case "confirmed":
      return "Confirmed match";
    case "probable":
      return "Probable match — review";
    case "possible":
      return "Possible match — review";
    case "weak":
      return "Weak / unlikely";
  }
}
