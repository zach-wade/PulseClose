// POST /api/track-record/verify
// Authed analyst endpoint for trust-but-verify. Borrower share-link
// endpoint (/api/share/[token]/verify) calls the same verifyAddresses
// helper but skips auth and uses the token to find the validation.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyAddresses, MAX_ADDRESSES } from "@/lib/track-record/verify-core";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";

export const maxDuration = 60;

interface VerifyBody {
  validation_id: string;
  addresses: string[];
  state?: string;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`verify:${profile.org_id}`, 10, 60_000);
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
      { error: "Address verification requires Realie API key" },
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
    fallback_state: body.state ?? entityCheck?.state ?? "",
    addresses: body.addresses,
    realie_key: realieKey,
  });

  // Replace prior results for this validation.
  await supabase.from("verified_flips").delete().eq("validation_id", validation.id);
  await insertOrThrow(
    supabase.from("verified_flips").insert(
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
    ),
    `verified_flips insert (validation_id=${validation.id}, count=${verified.length})`,
  );

  await supabase.from("usage_records").insert(
    verified.map(() => ({
      org_id: profile.org_id,
      validation_id: validation.id,
      check_type: "address_verify",
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
