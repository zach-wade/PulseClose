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

export function buildRedactionMap(input: RedactionInput): RedactionMap {
  const entries: RedactionEntry[] = [];
  const seen = new Set<string>();

  function add(token: string, real: string | null | undefined) {
    if (!real) return;
    const trimmed = real.trim();
    if (trimmed.length < MIN_REAL_LENGTH) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    entries.push({ token, real: trimmed });
  }

  add("[[BORROWER]]", input.borrower_name);
  add("[[ENTITY]]", input.entity_name);
  add("[[GUARANTOR]]", input.guarantor_name);
  add("[[REG_AGENT]]", input.registered_agent);
  add("[[GC]]", input.gc_name);
  input.property_addresses.forEach((a, i) => add(`[[PROPERTY_${i + 1}]]`, a));
  input.lender_names.forEach((n, i) => add(`[[LENDER_${i + 1}]]`, n));
  input.litigation_entity_names.forEach((n, i) =>
    add(`[[LIT_PARTY_${i + 1}]]`, n),
  );
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

export function unredactString(text: string, map: RedactionMap): string {
  if (map.entries.length === 0) return text;
  const byToken = new Map(map.entries.map((e) => [e.token, e.real]));
  return text.replace(TOKEN_RE, (m) => byToken.get(m) ?? m);
}

// Walk a parsed JSON object and unredact every string leaf.
export function unredactObject<T>(obj: T, map: RedactionMap): T {
  if (map.entries.length === 0) return obj;
  const byToken = new Map(map.entries.map((e) => [e.token, e.real]));
  function walk(v: unknown): unknown {
    if (typeof v === "string") {
      return v.replace(TOKEN_RE, (m) => byToken.get(m) ?? m);
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
