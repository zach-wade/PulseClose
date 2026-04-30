// POST /api/share/[token]/verify
// Public, token-based endpoint for borrowers to self-submit flip
// addresses without logging in. Validates the share token, runs the
// same verifyAddresses helper, persists the results.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyAddresses, MAX_ADDRESSES } from "@/lib/track-record/verify-core";
import { upsertProperty } from "@/lib/domain/upsert";

export const maxDuration = 60;

interface ShareVerifyBody {
  addresses: string[];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid share token" }, { status: 400 });
  }

  // Per-token rate limit so a single share link can't be hammered.
  const rl = checkRateLimit(`share:${token}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute" },
      { status: 429 },
    );
  }

  const body = (await request.json()) as ShareVerifyBody;
  if (!Array.isArray(body.addresses) || body.addresses.length === 0) {
    return NextResponse.json({ error: "Submit at least one address" }, { status: 400 });
  }
  if (body.addresses.length > MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ADDRESSES} addresses per request` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: validation, error: vErr } = await supabase
    .from("borrower_validations")
    .select("id, org_id, borrower_name, borrower_entity_name, primary_borrower_id, primary_entity_id")
    .eq("share_token", token)
    .single();

  if (vErr || !validation) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const realieKey = process.env.REALIE_API_KEY;
  if (!realieKey) {
    return NextResponse.json(
      { error: "Address verification is unavailable right now" },
      { status: 503 },
    );
  }

  const { data: entityCheck } = await supabase
    .from("entity_checks")
    .select("state")
    .eq("validation_id", validation.id)
    .order("check_date", { ascending: false })
    .limit(1)
    .single();

  const verified = await verifyAddresses({
    borrower_name: validation.borrower_name,
    entity_name: validation.borrower_entity_name,
    fallback_state: entityCheck?.state ?? "",
    addresses: body.addresses,
    realie_key: realieKey,
  });

  await supabase.from("verified_flips").delete().eq("validation_id", validation.id);

  // Resolve each verified address to a property_id so the verified_flip
  // row joins back into the domain layer. Use resolved_address (Realie's
  // canonical form) when available, else the borrower's submitted text.
  const verifiedWithFKs = await Promise.all(
    verified.map(async (v) => {
      const address = v.resolved_address ?? v.submitted_address;
      const propertyId = address
        ? await upsertProperty(supabase, validation.org_id, { addressDisplay: address })
        : null;
      return { v, propertyId };
    }),
  );

  await supabase.from("verified_flips").insert(
    verifiedWithFKs.map(({ v, propertyId }) => ({
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
      source: "Realie (borrower-submitted via share link)",
      raw_response: v.error ? { _error: true, _message: v.error } : null,
      property_id: propertyId,
      owning_entity_id: validation.primary_entity_id,
      owning_borrower_id: validation.primary_borrower_id,
    })),
  );

  await supabase.from("usage_records").insert(
    verified.map(() => ({
      org_id: validation.org_id,
      validation_id: validation.id,
      check_type: "address_verify_share",
      data_source: "realie",
      cost_cents: 50,
      response_status: "success" as const,
    })),
  );

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
