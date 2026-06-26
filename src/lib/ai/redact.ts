// Pre-prompt-build redaction for the AI risk memo. Real PII (borrower /
// entity / guarantor names, registered agent, property addresses, lender
// names, GC name, litigation party names, sanctions match names) is
// replaced with [[TOKEN]] placeholders before the prompt is sent to
// Claude. The parsed response is walked and unredacted before storage.
//
// Why pre-prompt-build vs. post-process: Claude never sees real PII for
// the memo path, so even a hypothetical future caching / training leak
// can't surface borrower data through this path. The doc-ingest path
// can't redact extraction targets and falls back to the per-org toggle
// (check-enabled.ts) plus regex-based scrub (redact-pii.ts).
//
// Token format is [[UPPER_SNAKE]] — collision-safe with normal intake
// content. After unredaction we scan for any leftover [[…]] patterns
// (findLeftoverTokens) so caller can log a warning if the model
// corrupted a token mid-stream.

export interface RedactionEntry {
  token: string;
  real: string;
}

export interface RedactionMap {
  entries: RedactionEntry[];
}

export interface RedactionInput {
  borrower_name: string;
  entity_name: string;
  guarantor_name: string | null;
  registered_agent: string | null;
  property_addresses: string[];
  lender_names: string[];
  gc_name: string | null;
  litigation_entity_names: string[];
  sanctions_match_names: string[];
}

// Reals shorter than this are skipped — common 1-2 char tokens (state
// codes, "LLC") would over-match across the prompt.
const MIN_REAL_LENGTH = 3;

// Entity / lender legal suffix that commonly appears stripped in
// downstream narrative ("TT Investment Properties" vs the registered
// "TT Investment Properties, LLC"). Mirrors the canonical-name dedup
// list in src/lib/domain/upsert.ts; if you extend that list, extend
// this one too — divergence creates a redaction gap.
const ENTITY_SUFFIX_RE =
  /,?\s+(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Co\.?|Company|LP|L\.P\.|LLP|Ltd\.?|Limited|Trust)\s*$/i;

function entityVariants(name: string): string[] {
  const out = [name];
  const stripped = name.replace(ENTITY_SUFFIX_RE, "").trim();
  if (stripped && stripped !== name && stripped.length >= MIN_REAL_LENGTH) {
    out.push(stripped);
  }
  return out;
}

function addressVariants(addr: string): string[] {
  // Factor explanations and Realie narrative often cite just the street
  // line ("1310 Rosalia Ave") rather than the full ", City, ST ZIP"
  // form. Without the street alias, the partial form leaks past the
  // forward replace.
  const out = [addr];
  const street = addr.split(",")[0].trim();
  if (street && street !== addr && street.length >= MIN_REAL_LENGTH) {
    out.push(street);
  }
  return out;
}

export function buildRedactionMap(input: RedactionInput): RedactionMap {
  const entries: RedactionEntry[] = [];
  const seen = new Set<string>();

  // Multiple reals can map to the same token (e.g. an address's full
  // form + street-only form both unredact to the full address — the
  // last write wins on collision, so order matters: full first).
  function add(token: string, real: string | null | undefined) {
    if (!real) return;
    const trimmed = real.trim();
    if (trimmed.length < MIN_REAL_LENGTH) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    entries.push({ token, real: trimmed });
  }

  add("[[BORROWER]]", input.borrower_name);
  entityVariants(input.entity_name).forEach((v) => add("[[ENTITY]]", v));
  add("[[GUARANTOR]]", input.guarantor_name);
  add("[[REG_AGENT]]", input.registered_agent);
  if (input.gc_name) entityVariants(input.gc_name).forEach((v) => add("[[GC]]", v));
  input.property_addresses.forEach((a, i) => {
    const token = `[[PROPERTY_${i + 1}]]`;
    addressVariants(a).forEach((v) => add(token, v));
  });
  input.lender_names.forEach((n, i) => {
    const token = `[[LENDER_${i + 1}]]`;
    entityVariants(n).forEach((v) => add(token, v));
  });
  input.litigation_entity_names.forEach((n, i) => {
    const token = `[[LIT_PARTY_${i + 1}]]`;
    entityVariants(n).forEach((v) => add(token, v));
  });
  input.sanctions_match_names.forEach((n, i) =>
    add(`[[SANCTIONS_MATCH_${i + 1}]]`, n),
  );
  return { entries };
}

const ALPHANUM = /[A-Za-z0-9]/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Forward replace — apply to the constructed prompt before sending.
// Sort longest-first so "Kim An Truong" wins over "Kim An" when both
// happen to be in the map.
export function redact(text: string, map: RedactionMap): string {
  if (map.entries.length === 0) return text;
  const sorted = [...map.entries].sort((a, b) => b.real.length - a.real.length);
  const parts = sorted.map((e) => {
    const left = ALPHANUM.test(e.real[0]) ? "\\b" : "";
    const right = ALPHANUM.test(e.real[e.real.length - 1]) ? "\\b" : "";
    return `${left}${escapeRegex(e.real)}${right}`;
  });
  const re = new RegExp(parts.join("|"), "g");
  const byReal = new Map(sorted.map((e) => [e.real, e.token]));
  return text.replace(re, (m) => byReal.get(m) ?? m);
}

const TOKEN_RE = /\[\[[A-Z_0-9]+\]\]/g;

// Token → real lookup. When the same token has multiple aliases (e.g.
// [[PROPERTY_1]] = full + street form), the FIRST entry wins so the
// canonical/longest form is what the unredacted memo shows.
function buildByToken(map: RedactionMap): Map<string, string> {
  const byToken = new Map<string, string>();
  for (const e of map.entries) {
    if (!byToken.has(e.token)) byToken.set(e.token, e.real);
  }
  return byToken;
}

export function unredactString(text: string, map: RedactionMap): string {
  const byToken = buildByToken(map);
  return text.replace(TOKEN_RE, (m) => byToken.get(m) ?? genericForToken(m) ?? m);
}

// Generic human-readable fallback for a KNOWN placeholder the model emitted but
// our map can't resolve — e.g. an individual borrower has no entity, so nothing
// registers [[ENTITY]], yet the model can produce it by analogy to the other
// tokens in the prompt. Shipping "[[ENTITY]]" to an investor is worse than a
// neutral noun, so we substitute one. Truly-unknown tokens (truncation / typos)
// return null and stay literal, so findLeftoverTokens still flags them.
export function genericForToken(token: string): string | null {
  const base = token.replace(/^\[\[|\]\]$/g, "").replace(/_\d+$/, "");
  switch (base) {
    case "BORROWER": return "the borrower";
    case "ENTITY": return "the borrowing entity";
    case "GUARANTOR": return "the guarantor";
    case "REG_AGENT": return "the registered agent";
    case "GC": return "the general contractor";
    case "PROPERTY": return "the property";
    case "LENDER": return "the lender";
    case "LIT_PARTY": return "the named party";
    case "SANCTIONS_MATCH": return "the screened name";
    default: return null;
  }
}

// Walk a parsed JSON object and unredact every string leaf.
export function unredactObject<T>(obj: T, map: RedactionMap): T {
  const byToken = buildByToken(map);
  function walk(v: unknown): unknown {
    if (typeof v === "string") {
      return v.replace(TOKEN_RE, (m) => byToken.get(m) ?? genericForToken(m) ?? m);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  }
  return walk(obj) as T;
}

// Safety scan — any [[FOO]] still in the unredacted output means the
// model emitted a token name that wasn't in our map (truncation, typo,
// hallucination). Caller should log and decide whether to ship anyway.
export function findLeftoverTokens(obj: unknown): string[] {
  const found: string[] = [];
  function walk(v: unknown) {
    if (typeof v === "string") {
      const matches = v.match(TOKEN_RE);
      if (matches) found.push(...matches);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  }
  walk(obj);
  return found;
}
