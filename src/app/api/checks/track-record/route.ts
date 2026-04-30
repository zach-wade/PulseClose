import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { getAdapter, getPropertyDataSource } from "@/lib/adapters";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  upsertBorrower,
  upsertEntity,
  upsertProperty,
  upsertLender,
} from "@/lib/domain/upsert";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";

export const maxDuration = 60;

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`checks:${profile.org_id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const supabase = createAdminClient();

  const body = await request.json();
  const { borrower_name, entity_name, state } = body;

  if (!borrower_name) {
    return NextResponse.json(
      { error: "borrower_name is required" },
      { status: 400 },
    );
  }

  const adapter = getAdapter();

  try {
    const results = await adapter.searchProperties({
      borrower_name,
      entity_name: entity_name || undefined,
      state: state || undefined,
    });

    // Resolve borrower + entity to domain rows so the lightweight validation
    // row (and downstream track_record_entries) wire into the same domain
    // graph that /api/validations uses.
    const primaryBorrowerId = await upsertBorrower(supabase, profile.org_id, borrower_name);
    const primaryEntityId = entity_name
      ? await upsertEntity(supabase, profile.org_id, {
          displayName: entity_name,
          state: state || null,
        })
      : null;

    // Create a lightweight validation record for FK
    const { data: validation } = await supabase
      .from("borrower_validations")
      .insert({
        org_id: profile.org_id,
        borrower_name,
        borrower_entity_name: entity_name || borrower_name,
        overall_status: "pending",
        confidence_score: 0,
        created_by: profile.id,
        primary_borrower_id: primaryBorrowerId,
        primary_entity_id: primaryEntityId,
      })
      .select("id")
      .single();

    if (validation && results.length > 0) {
      const enriched = await Promise.all(
        results.map(async (p) => {
          const raw = (p.raw_response ?? {}) as Record<string, unknown>;
          const city = typeof raw.city === "string" ? raw.city : null;
          const stateField = typeof raw.state === "string" ? raw.state : null;
          const zip = typeof raw.zipCode === "string" ? raw.zipCode : null;
          const modelValue = typeof raw.modelValue === "number" ? raw.modelValue : null;
          const lenderName = typeof raw.lenderName === "string" ? raw.lenderName : null;

          const propertyId = await upsertProperty(supabase, profile.org_id, {
            addressDisplay: p.property_address,
            city,
            state: stateField,
            zip,
            latestAvm: modelValue,
            latestAvmCheckAt: modelValue !== null ? new Date().toISOString() : null,
          });

          const lenderId = lenderName
            ? await upsertLender(supabase, profile.org_id, { displayName: lenderName })
            : null;

          let ownershipId: string | null = null;
          if (propertyId) {
            const { data: ownership } = await supabase
              .from("property_ownership")
              .insert({
                property_id: propertyId,
                owning_entity_id: primaryEntityId,
                owning_borrower_id: primaryBorrowerId,
                acquired_at: p.acquisition_date,
                disposed_at: p.disposition_date,
                acquisition_price: p.acquisition_price,
                disposition_price: p.disposition_price,
                lender_id: lenderId,
                lender_name_observed: lenderName,
                source: p.source.toLowerCase().includes("realie") || p.source.toLowerCase().includes("regrid") ? "deed" : "inferred",
                confidence: "medium",
              })
              .select("id")
              .single();
            ownershipId = ownership?.id ?? null;
          }

          return { p, propertyId, lenderId, ownershipId };
        }),
      );

      await insertOrThrow(
        supabase.from("track_record_entries").insert(
          enriched.map(({ p, propertyId, lenderId, ownershipId }) => ({
            validation_id: validation.id,
            org_id: profile.org_id,
            property_address: p.property_address,
            acquisition_date: p.acquisition_date,
            disposition_date: p.disposition_date,
            acquisition_price: p.acquisition_price,
            disposition_price: p.disposition_price,
            rehab_cost: null,
            project_type: p.project_type,
            outcome: p.outcome,
            hold_months: p.hold_months,
            profit: p.profit,
            source: p.source,
            confidence: "medium",
            verified: false,
            raw_response: p.raw_response,
            property_id: propertyId,
            owning_entity_id: primaryEntityId,
            owning_borrower_id: primaryBorrowerId,
            lender_id: lenderId,
            active_ownership_id: p.disposition_date ? null : ownershipId,
          })),
        ),
        `track_record_entries insert (validation_id=${validation.id}, count=${enriched.length})`,
      );

      const dataSource = getPropertyDataSource();
      await supabase.from("usage_records").insert({
        org_id: profile.org_id,
        validation_id: validation.id,
        check_type: "property_search",
        data_source: dataSource,
        cost_cents: dataSource === "stub" ? 0 : 1500,
        response_status: "success",
      });
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: "Property search failed", details: String(err) },
      { status: 500 },
    );
  }
}
