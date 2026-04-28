// POST /api/track-record/verify
// Trust-but-verify: borrower (or analyst on their behalf) submits addresses
// they claim to have owned. We hit Realie's address lookup for each, walk
// the deed transfer chain, and classify whether the borrower/entity actually
// appears in the chain. Returns verified flips with hold + profit when
// the deed chain shows a sold property.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { lookupPropertyByAddress, RealieError } from "@/lib/adapters/realie";
import { extractRealieDetails } from "@/lib/adapters/extract";

export const maxDuration = 60;

const MAX_ADDRESSES = 50;

interface VerifyBody {
  validation_id: string;
  addresses: string[];
  state?: string; // optional; falls back to entity_state of the validation
}

interface ResolvedAddress {
  street: string;
  state: string;
}

// Pull the state out of "123 Main St, Sunnyvale, CA 94089" → "CA"
function parseAddressForState(input: string, fallbackState?: string): ResolvedAddress {
  const trimmed = input.trim();
  const stateMatch = trimmed.match(/[,\s]\s*([A-Z]{2})\s*\d{5}?/);
  const state = stateMatch?.[1] ?? fallbackState ?? "";
  // Strip city/state/zip from the end so Realie's address param gets just
  // the street line.
  const street = trimmed
    .replace(/,\s*[A-Z]{2}\s*\d{5}.*$/, "")
    .replace(/,\s*[^,]+,\s*[A-Z]{2}.*$/, "")
    .trim();
  return { street, state };
}

function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[.,;:'"()/\\&]/g, " ")
    .replace(/\b(llc|inc|incorporated|corp|corporation|ltd|limited|lp|llp|trust|company|co)\b\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Whitespace-stripped equality is forgiving for "KIMAN TRUONG" vs "KIM AN TRUONG".
function isPersonMatch(deedName: string | null | undefined, claimed: string): boolean {
  if (!deedName || !claimed) return false;
  const a = deedName.toLowerCase().replace(/\s+/g, "");
  const b = claimed.toLowerCase().replace(/\s+/g, "");
  if (a === b) return true;
  // For people, also accept substring match (handles middle names, suffixes)
  return a.includes(b) || b.includes(a);
}

function isEntityMatch(deedName: string | null | undefined, claimed: string): boolean {
  const a = normalizeName(deedName);
  const b = normalizeName(claimed);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
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
  match_status: "owned_and_sold" | "owned_and_held" | "never_owned" | "not_found";
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
  // extractRealieDetails sorts descending; analysis is easier ascending.
  transfers.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return -1;
    if (!b.date) return 1;
    return a.date.localeCompare(b.date);
  });

  const currentOwner = (raw.ownerName as string) ?? null;
  const resolvedAddress = ((raw.addressFull as string) ?? (raw.address as string) ?? null);

  // Walk transfers chronologically. First time the borrower/entity shows
  // up as grantee = acquisition. Any later transfer where they're grantor
  // = disposition.
  let acquisition: typeof transfers[number] | null = null;
  let disposition: typeof transfers[number] | null = null;
  for (const t of transfers) {
    const granteeMatch = isAnyMatch(t.grantee, borrowerName, entityName);
    const grantorMatch = isAnyMatch(t.grantor, borrowerName, entityName);
    if (granteeMatch && !acquisition) acquisition = t;
    if (acquisition && grantorMatch) disposition = t;
  }

  const ownsCurrently = isAnyMatch(currentOwner, borrowerName, entityName);

  // Treat the main deed (transferDate/transferPrice on the property root)
  // as a transfer too — Realie sometimes only has the most recent recording
  // as a top-level field with prior history empty.
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

  let match_status: ClassifyResult["match_status"];
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

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Each address is one Realie credit. Limit to keep usage predictable.
  const rl = checkRateLimit(`verify:${profile.org_id}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  const body = (await request.json()) as VerifyBody;
  if (!body.validation_id || !Array.isArray(body.addresses)) {
    return NextResponse.json(
      { error: "validation_id and addresses[] required" },
      { status: 400 },
    );
  }
  if (body.addresses.length === 0) {
    return NextResponse.json({ error: "Submit at least one address" }, { status: 400 });
  }
  if (body.addresses.length > MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ADDRESSES} addresses per request` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Verify the validation exists and belongs to this org
  const { data: validation, error: vErr } = await supabase
    .from("borrower_validations")
    .select("id, org_id, borrower_name, borrower_entity_name")
    .eq("id", body.validation_id)
    .eq("org_id", profile.org_id)
    .single();

  if (vErr || !validation) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  const realieKey = process.env.REALIE_API_KEY;
  if (!realieKey) {
    return NextResponse.json(
      { error: "Address verification requires Realie API key (not configured)" },
      { status: 503 },
    );
  }

  // Look up entity_state from the entity_check (most reliable source of state)
  const { data: entityCheck } = await supabase
    .from("entity_checks")
    .select("state")
    .eq("validation_id", validation.id)
    .order("check_date", { ascending: false })
    .limit(1)
    .single();
  const fallbackState = body.state ?? entityCheck?.state ?? "";

  const verified: Array<{
    submitted_address: string;
    resolved_address: string | null;
    match_status: ClassifyResult["match_status"];
    acquisition_date: string | null;
    acquisition_price: number | null;
    disposition_date: string | null;
    disposition_price: number | null;
    hold_months: number | null;
    profit: number | null;
    current_owner: string | null;
    grantor_chain: ClassifyResult["grantor_chain"];
    error?: string;
  }> = [];

  for (const submitted of body.addresses) {
    const { street, state } = parseAddressForState(submitted, fallbackState);
    if (!street || !state) {
      verified.push({
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
        error: "Could not parse street + state from the input",
      });
      continue;
    }
    try {
      const { rawProperty } = await lookupPropertyByAddress(street, state, realieKey);
      const result = classify(
        rawProperty,
        validation.borrower_name,
        validation.borrower_entity_name,
      );
      verified.push({
        submitted_address: submitted,
        ...result,
      });
    } catch (err) {
      verified.push({
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

  // Persist
  await supabase
    .from("verified_flips")
    .delete()
    .eq("validation_id", validation.id);

  await supabase.from("verified_flips").insert(
    verified.map((v) => ({
      validation_id: validation.id,
      submitted_address: v.submitted_address,
      resolved_address: v.resolved_address,
      match_status: v.match_status,
      acquisition_date: v.acquisition_date,
      acquisition_price: v.acquisition_price,
      disposition_date: v.disposition_date,
      disposition_price: v.disposition_price,
      hold_months: v.hold_months,
      profit: v.profit,
      current_owner: v.current_owner,
      grantor_chain: v.grantor_chain,
      source: "Realie",
      raw_response: v.error ? { _error: true, _message: v.error } : null,
    })),
  );

  // Log usage
  await supabase.from("usage_records").insert(
    verified.map(() => ({
      org_id: profile.org_id,
      validation_id: validation.id,
      check_type: "address_verify",
      data_source: "realie",
      cost_cents: 50, // ~$0.50 per Realie address lookup
      response_status: "success" as const,
    })),
  );

  // Summary stats
  const summary = {
    submitted: verified.length,
    owned_and_sold: verified.filter((v) => v.match_status === "owned_and_sold").length,
    owned_and_held: verified.filter((v) => v.match_status === "owned_and_held").length,
    never_owned: verified.filter((v) => v.match_status === "never_owned").length,
    not_found: verified.filter((v) => v.match_status === "not_found").length,
    realized_profit: verified
      .filter((v) => v.match_status === "owned_and_sold" && v.profit != null)
      .reduce((sum, v) => sum + (v.profit ?? 0), 0),
  };

  return NextResponse.json({ verified, summary });
}
