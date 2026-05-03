// Pre-call PII scrub for any text content sent to Claude. Strips genuine
// secrets that aren't extraction targets — SSN, phone, email — while
// LEAVING borrower / entity names, property addresses, loan amounts, and
// dates intact (those are what the LLM is being asked to extract).
//
// Scope: text-derived inputs only (xlsx, csv, txt). PDFs ship as base64
// blobs to Claude's native PDF support and would lose table structure if
// pre-extracted; for strict-mode tenants the per-org toggle in
// check-enabled.ts is the answer (turn AI off entirely). See ROADMAP
// principle 11 — this is the truncation-class defense for PII.
//
// What we deliberately don't try to detect:
//   - Bank/routing numbers — collide with loan amounts and parcel IDs.
//   - DOB — generic date detection would maul transaction dates.
//   - Driver's license — varies state by state; high false-positive risk.
//   - 9-digit SSN without dashes — collides with zip+4 and parcel IDs.

export interface PiiCounts {
  ssn: number;
  phone: number;
  email: number;
}

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
// US phone: optional +1, optional area-code parens, separators are space /
// dash / dot / nothing. Anchored to digit boundaries so we don't chew into
// loan amounts ("$1,234,567" stays put).
const PHONE_RE = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function scrubPii(input: string): { text: string; counts: PiiCounts } {
  let ssn = 0;
  let phone = 0;
  let email = 0;
  let text = input.replace(SSN_RE, () => {
    ssn++;
    return "[SSN_REDACTED]";
  });
  text = text.replace(EMAIL_RE, () => {
    email++;
    return "[EMAIL_REDACTED]";
  });
  // Phone last so it doesn't gobble the digit run inside an email's local
  // part on the rare edge where someone writes 4155551212@example.com.
  text = text.replace(PHONE_RE, () => {
    phone++;
    return "[PHONE_REDACTED]";
  });
  return { text, counts: { ssn, phone, email } };
}
