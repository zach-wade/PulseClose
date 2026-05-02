// Shared trust-but-verify core. Both the authed analyst endpoint
// (/api/track-record/verify) and the public borrower share-link endpoint
// (/api/share/[token]/verify) call into this — keeps logic in one place.

import { lookupPropertyByAddress, RealieError } from "@/lib/adapters/realie";
import { extractRealieDetails } from "@/lib/adapters/extract";

export const MAX_ADDRESSES = 50;

export type MatchStatus =
  | "owned_and_sold"
  | "owned_and_held"
  | "never_owned"
  | "not_found"
  | "pending";

export interface VerifyAddressInput {
  borrower_name: string;
  entity_name: string | null;
  fallback_state: string;
  addresses: string[];
  realie_key: string;
}

export interface VerifyAddressItem {
  submitted_address: string;
  resolved_address: string | null;
  match_status: MatchStatus;
  acquisition_date: string | null;
  acquisition_price: number | null;
  disposition_date: string | null;
  disposition_price: number | null;
  hold_months: number | null;
  profit: number | null;
  current_owner: string | null;
  grantor_chain: { grantor: string; grantee: string; date: string | null; price: number | null }[];
  error?: string;
}

interface ResolvedAddress {
  street: string;
  state: string;
}

function parseAddressForState(input: string, fallbackState?: string): ResolvedAddress {
  const trimmed = input.trim();
  const stateMatch = trimmed.match(/[,\s]\s*([A-Z]{2})\s*\d{5}?/);
  const state = stateMatch?.[1] ?? fallbackState ?? "";
  // Strip the trailing ", City, ST ZIP" envelope. Single regex handles all
  // four variants: with/without city, with/without zip (incl. zip+4).
  // Realie's /public/property/address/ endpoint expects street-only; an
  // earlier two-pass version left the city attached when both city AND
  // state+zip were present (e.g. "1259 ALMADEN AVE, SAN JOSE, CA 95110"
  // → "1259 ALMADEN AVE, SAN JOSE") which Realie 404'd on.
  const street = trimmed
    .replace(/,\s*([^,]+,\s*)?[A-Z]{2}(\s+\d{5}(-\d{4})?)?\s*$/, "")
    .trim();
  return { street, state };
}

// Tokenize a name into lowercase alphanumeric tokens. Handles the format
// drift between Realie ("LASTNAME, FIRSTNAME[-MIDDLE]") and lender input
// ("Firstname Middle Lastname") by ignoring word order entirely. Strips
// punctuation, suffixes (LLC/Inc/etc.), and short noise tokens.
const ENTITY_SUFFIX_TOKENS = new Set([
  "llc", "inc", "incorporated", "corp", "corporation",
  "ltd", "limited", "lp", "llp", "trust", "company", "co",
]);

function tokenize(s: string | null | undefined, opts: { stripEntitySuffixes: boolean }): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .filter((t) => !opts.stripEntitySuffixes || !ENTITY_SUFFIX_TOKENS.has(t));
}

function tokenSetMatch(deedTokens: string[], claimedTokens: string[]): boolean {
  if (deedTokens.length === 0 || claimedTokens.length === 0) return false;
  const deedSet = new Set(deedTokens);
  const claimedSet = new Set(claimedTokens);
  // The shorter set must be entirely contained in the longer set. With 2+
  // tokens this avoids false positives on common surnames; with 1 token
  // we require it to be 3+ chars (so "an" or "jr" alone won't match).
  const [smaller, larger] =
    deedSet.size <= claimedSet.size ? [deedSet, claimedSet] : [claimedSet, deedSet];
  if (smaller.size === 1) {
    const [only] = smaller;
    if (only.length < 3) return false;
    return larger.has(only);
  }
  for (const t of smaller) if (!larger.has(t)) return false;
  return true;
}

function isPersonMatch(deedName: string | null | undefined, claimed: string): boolean {
  if (!deedName || !claimed) return false;
  return tokenSetMatch(
    tokenize(deedName, { stripEntitySuffixes: false }),
    tokenize(claimed, { stripEntitySuffixes: false }),
  );
}

function isEntityMatch(deedName: string | null | undefined, claimed: string): boolean {
  if (!deedName || !claimed) return false;
  return tokenSetMatch(
    tokenize(deedName, { stripEntitySuffixes: true }),
    tokenize(claimed, { stripEntitySuffixes: true }),
  );
}

function isAnyMatch(
  deedName: string | null | undefined,
  borrowerName: string,
  entityName: string | null,
): boolean {
  if (!deedName) return false;
  if (isPersonMatch(deedName, borrowerName)) return true;
  if (entityName && isEntityMatch(deedName, entityName)) return true;
  return false;
}

interface ClassifyResult {
  match_status: MatchStatus;
  acquisition_date: string | null;
  acquisition_price: number | null;
  disposition_date: string | null;
  disposition_price: number | null;
  hold_months: number | null;
  profit: number | null;
  current_owner: string | null;
  grantor_chain: { grantor: string; grantee: string; date: string | null; price: number | null }[];
  resolved_address: string | null;
}

function classify(
  raw: Record<string, unknown> | null,
  borrowerName: string,
  entityName: string | null,
): ClassifyResult {
  if (!raw) {
    return {
      match_status: "not_found",
      acquisition_date: null,
      acquisition_price: null,
      disposition_date: null,
      disposition_price: null,
      hold_months: null,
      profit: null,
      current_owner: null,
      grantor_chain: [],
      resolved_address: null,
    };
  }

  const details = extractRealieDetails(raw);
  const transfers = (details?.transfers ?? []).slice();
  transfers.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return -1;
    if (!b.date) return 1;
    return a.date.localeCompare(b.date);
  });

  const currentOwner = (raw.ownerName as string) ?? null;
  const resolvedAddress = ((raw.addressFull as string) ?? (raw.address as string) ?? null);

  let acquisition: typeof transfers[number] | null = null;
  let disposition: typeof transfers[number] | null = null;
  for (const t of transfers) {
    const granteeMatch = isAnyMatch(t.grantee, borrowerName, entityName);
    const grantorMatch = isAnyMatch(t.grantor, borrowerName, entityName);
    if (granteeMatch && !acquisition) acquisition = t;
    if (acquisition && grantorMatch) disposition = t;
  }

  const ownsCurrently = isAnyMatch(currentOwner, borrowerName, entityName);

  if (!acquisition && ownsCurrently) {
    const mainDate = (raw.transferDate as string) ?? null;
    const mainPrice = (raw.transferPrice as number) ?? null;
    acquisition = {
      grantor: "Unknown",
      grantee: currentOwner ?? "Unknown",
      date: mainDate
        ? mainDate.length === 8
          ? `${mainDate.slice(0, 4)}-${mainDate.slice(4, 6)}-${mainDate.slice(6, 8)}`
          : mainDate.slice(0, 10)
        : null,
      price: typeof mainPrice === "number" && mainPrice > 0 ? mainPrice : null,
    };
  }

  let match_status: MatchStatus;
  if (!acquisition) {
    match_status = "never_owned";
  } else if (disposition || !ownsCurrently) {
    match_status = "owned_and_sold";
  } else {
    match_status = "owned_and_held";
  }

  const acquisition_date = acquisition?.date ?? null;
  const acquisition_price = acquisition?.price ?? null;
  const disposition_date = disposition?.date ?? null;
  const disposition_price = disposition?.price ?? null;

  let hold_months: number | null = null;
  if (acquisition_date) {
    const start = new Date(acquisition_date);
    const end = disposition_date ? new Date(disposition_date) : new Date();
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      hold_months = Math.max(
        0,
        (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth()),
      );
    }
  }

  const profit =
    acquisition_price != null && disposition_price != null
      ? disposition_price - acquisition_price
      : null;

  return {
    match_status,
    acquisition_date,
    acquisition_price,
    disposition_date,
    disposition_price,
    hold_months,
    profit,
    current_owner: currentOwner,
    grantor_chain: transfers,
    resolved_address: resolvedAddress,
  };
}

export async function verifyAddresses(
  input: VerifyAddressInput,
): Promise<VerifyAddressItem[]> {
  const out: VerifyAddressItem[] = [];
  for (const submitted of input.addresses) {
    const { street, state } = parseAddressForState(submitted, input.fallback_state);
    if (!street || !state) {
      out.push({
        submitted_address: submitted,
        resolved_address: null,
        match_status: "not_found",
        acquisition_date: null,
        acquisition_price: null,
        disposition_date: null,
        disposition_price: null,
        hold_months: null,
        profit: null,
        current_owner: null,
        grantor_chain: [],
        error: "Could not parse street + state from input",
      });
      continue;
    }
    try {
      const { rawProperty } = await lookupPropertyByAddress(street, state, input.realie_key);
      const result = classify(rawProperty, input.borrower_name, input.entity_name);
      out.push({ submitted_address: submitted, ...result });
    } catch (err) {
      out.push({
        submitted_address: submitted,
        resolved_address: null,
        match_status: "not_found",
        acquisition_date: null,
        acquisition_price: null,
        disposition_date: null,
        disposition_price: null,
        hold_months: null,
        profit: null,
        current_owner: null,
        grantor_chain: [],
        error: err instanceof RealieError ? err.message : String(err),
      });
    }
  }
  return out;
}
