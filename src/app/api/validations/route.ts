import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import {
  getAdapter,
  getPropertyDataSource,
  getGCDataSource,
  getSanctionsDataSource,
} from "@/lib/adapters";
import { generateValidationAnalysis } from "@/lib/ai/analysis";
import { getCheckLimit } from "@/lib/stripe/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Allow up to 60s for vendor API calls + AI analysis
export const maxDuration = 60;

// GET /api/validations — list all validations for the user's org
export async function GET() {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: validations, error } = await supabase
    .from("borrower_validations")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(validations);
}

// POST /api/validations — create a new validation and run all checks
export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 validations per minute per org
  const rl = checkRateLimit(`validations:${profile.org_id}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before running another validation.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const supabase = createAdminClient();

  const body = await request.json();
  const {
    borrower_name,
    borrower_entity_name,
    entity_state,
    guarantor_name,
    gc_name,
    gc_license_number,
    gc_state,
  } = body;

  // Check plan limits
  const { data: org } = await supabase
    .from("organizations")
    .select("plan, checks_used_this_period, stripe_subscription_id")
    .eq("id", profile.org_id)
    .single();

  const plan = org?.plan ?? "starter";
  const checksUsed = org?.checks_used_this_period ?? 0;
  const checkLimit = getCheckLimit(plan);

  // Free tier gets 3 checks to try the product, paid plans get their limit
  const effectiveLimit = org?.stripe_subscription_id ? checkLimit : 3;

  if (checksUsed >= effectiveLimit) {
    return NextResponse.json(
      {
        error: org?.stripe_subscription_id
          ? `Plan limit reached (${checkLimit} checks/month). Upgrade your plan for more.`
          : "Free trial limit reached (3 checks). Subscribe to continue.",
        code: "PLAN_LIMIT_REACHED",
      },
      { status: 403 },
    );
  }

  if (!borrower_name || !borrower_entity_name || !entity_state) {
    return NextResponse.json(
      { error: "borrower_name, borrower_entity_name, and entity_state are required" },
      { status: 400 },
    );
  }

  // 1. Create the validation record (pending)
  const { data: validation, error: createError } = await supabase
    .from("borrower_validations")
    .insert({
      org_id: profile.org_id,
      borrower_name,
      borrower_entity_name,
      guarantor_name: guarantor_name || null,
      overall_status: "pending",
      confidence_score: 0,
      created_by: profile.id,
    })
    .select()
    .single();

  if (createError || !validation) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create validation" },
      { status: 500 },
    );
  }

  // 2. Run all checks in parallel via adapter
  const adapter = getAdapter();

  try {
    const [entityResult, properties, litigationResults, gcResult, sanctionsResult] =
      await Promise.all([
        adapter.lookupEntity({
          entity_name: borrower_entity_name,
          state: entity_state,
        }),
        adapter.searchProperties({
          borrower_name,
          entity_name: borrower_entity_name,
          state: entity_state,
        }),
        adapter.searchLitigation({
          entity_name: borrower_entity_name,
          borrower_name,
        }),
        gc_name
          ? adapter.lookupGC({
              gc_name,
              license_number: gc_license_number,
              state: gc_state || entity_state,
            })
          : Promise.resolve(null),
        adapter.screenSanctions({
          borrower_name,
          entity_name: borrower_entity_name,
          guarantor_name: guarantor_name || undefined,
        }),
      ]);

    // 3. Store entity check
    await supabase.from("entity_checks").insert({
      validation_id: validation.id,
      entity_name: entityResult.entity_name,
      state: entityResult.state,
      entity_type: entityResult.entity_type,
      sos_status: entityResult.sos_status,
      formation_date: entityResult.formation_date,
      last_filing_date: entityResult.last_filing_date,
      registered_agent: entityResult.registered_agent,
      source_url: entityResult.source_url,
      confidence: entityResult.sos_status === "not_found" ? "low" : "medium",
      flags: entityResult.flags,
      raw_response: entityResult.raw_response,
    });

    // 4. Store track record entries
    if (properties.length > 0) {
      await supabase.from("track_record_entries").insert(
        properties.map((p) => ({
          validation_id: validation.id,
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
        })),
      );
    }

    // 5. Store litigation checks
    await supabase.from("litigation_checks").insert(
      litigationResults.map((l) => ({
        validation_id: validation.id,
        search_type: l.search_type,
        entity_name: l.entity_name,
        result: l.result,
        details: l.details,
        case_number: l.case_number,
        source: l.source,
        confidence: "medium",
        raw_response: l.raw_response,
      })),
    );

    // 6. Store GC validation (if applicable)
    if (gcResult) {
      await supabase.from("gc_validations").insert({
        validation_id: validation.id,
        gc_name: gcResult.gc_name,
        license_number: gcResult.license_number,
        license_state: gcResult.license_state,
        license_status: gcResult.license_status,
        license_classification: gcResult.license_classification,
        expiration_date: gcResult.expiration_date,
        disciplinary_actions: gcResult.disciplinary_actions,
        related_party_flag: false,
        insurance_verified: gcResult.insurance_verified,
        source_url: gcResult.source_url,
        confidence: "medium",
        raw_response: gcResult.raw_response,
      });
    }

    // 6b. Store sanctions / PEP screen
    await supabase.from("sanctions_checks").insert({
      validation_id: validation.id,
      borrower_name,
      entity_name: borrower_entity_name,
      guarantor_name: guarantor_name || null,
      result: sanctionsResult.result,
      match_count: sanctionsResult.matches.length,
      matches: sanctionsResult.matches,
      sources_searched: sanctionsResult.sources_searched,
      source: sanctionsResult.source,
      raw_response: sanctionsResult.raw_response,
    });

    // 7. Log usage records
    const cobaltKey = process.env.COBALT_INTELLIGENCE_API_KEY;
    const courtListenerToken = process.env.COURTLISTENER_API_TOKEN;
    const propertySource = getPropertyDataSource();
    const sanctionsSource = getSanctionsDataSource();
    const usageRecords = [
      { check_type: "sos_lookup", data_source: cobaltKey ? "cobalt" : "stub", cost_cents: cobaltKey ? 500 : 0 },
      { check_type: "property_search", data_source: propertySource, cost_cents: propertySource === "stub" ? 0 : 1500 },
      { check_type: "litigation_search", data_source: courtListenerToken ? "courtlistener" : "stub", cost_cents: courtListenerToken ? 1000 : 0 },
      // Sanctions: OpenSanctions ~$0.01 per query (free trial), OFAC direct = free
      { check_type: "sanctions_screen", data_source: sanctionsSource, cost_cents: sanctionsSource === "opensanctions" ? 100 : 0 },
    ];
    if (gc_name) {
      const gcSource = getGCDataSource(gc_state || entity_state, gc_license_number);
      usageRecords.push({
        check_type: "gc_lookup",
        data_source: gcSource,
        cost_cents: gcSource === "stub" ? 0 : 500,
      });
    }
    await supabase.from("usage_records").insert(
      usageRecords.map((u) => ({
        org_id: profile.org_id,
        validation_id: validation.id,
        ...u,
        response_status: "success",
      })),
    );

    // 8. Calculate overall status and experience tier.
    // Tier reflects size of CURRENT VISIBLE PORTFOLIO, not all-time flips —
    // historical sales aren't searched (deed APIs would be needed). The AI
    // memo is told to interpret it that way too.
    const projectCount = properties.length;
    const experienceTier =
      projectCount >= 10
        ? 1
        : projectCount >= 5
          ? 2
          : projectCount >= 1
            ? 3
            : 4;

    // Distinguish active litigation from dismissed/terminated
    const activeLitigation = litigationResults.filter(
      (l) => l.result === "found" && l.raw_response &&
        !(l.raw_response as Record<string, unknown>).date_terminated,
    );
    const dismissedLitigation = litigationResults.filter(
      (l) => l.result === "found" && l.raw_response &&
        !!(l.raw_response as Record<string, unknown>).date_terminated,
    );

    const sanctionsHit = sanctionsResult.result === "potential_match";

    const hasActiveFlags =
      entityResult.sos_status !== "active" ||
      activeLitigation.length > 0 ||
      sanctionsHit ||
      (gcResult && gcResult.license_status !== "active");

    const hasInfoFlags =
      entityResult.flags.length > 0 ||
      dismissedLitigation.length > 0;

    const overallStatus = hasActiveFlags
      ? "flagged"
      : hasInfoFlags
        ? "partial"
        : "verified";

    // Calculate confidence from actual signals instead of hardcoding
    let confidenceScore = 50; // base
    if (entityResult.sos_status === "active") confidenceScore += 15;
    if (projectCount >= 10) confidenceScore += 20;
    else if (projectCount >= 5) confidenceScore += 15;
    else if (projectCount >= 1) confidenceScore += 10;
    if (activeLitigation.length === 0) confidenceScore += 10;
    if (!gcResult || gcResult.license_status === "active") confidenceScore += 5;
    if (sanctionsResult.result === "clear") confidenceScore += 5;
    if (entityResult.sos_status === "suspended" || entityResult.sos_status === "dissolved") confidenceScore -= 20;
    if (activeLitigation.length > 0) confidenceScore -= 15;
    if (sanctionsHit) confidenceScore -= 30; // sanctions hit is a major flag
    confidenceScore = Math.max(10, Math.min(100, confidenceScore));

    // 9. Update the validation record with check results immediately
    await supabase
      .from("borrower_validations")
      .update({
        overall_status: overallStatus,
        confidence_score: confidenceScore,
        experience_tier: experienceTier,
        validation_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", validation.id);

    // 10. Generate AI analysis after the response is sent. `after()` keeps
    // the work alive in Vercel serverless past the response — a plain
    // fire-and-forget promise was getting killed when the function returned,
    // which is why some validations were missing AI memos.
    const validationId = validation.id;
    after(async () => {
      try {
        const aiAnalysis = await generateValidationAnalysis({
          borrower_name,
          entity_name: borrower_entity_name,
          guarantor_name: guarantor_name || null,
          entity_result: entityResult,
          properties,
          litigation_results: litigationResults,
          gc_result: gcResult,
          sanctions_result: sanctionsResult,
          experience_tier: experienceTier,
          overall_status: overallStatus,
          confidence_score: confidenceScore,
        });
        if (aiAnalysis) {
          await supabase
            .from("borrower_validations")
            .update({
              ai_analysis: aiAnalysis,
              updated_at: new Date().toISOString(),
            })
            .eq("id", validationId);
        } else {
          console.warn(`AI analysis returned null for validation ${validationId}`);
        }
      } catch (err) {
        console.error(`AI analysis failed for validation ${validationId}:`, err);
      }
    });

    // 11. Increment usage counter
    await supabase
      .from("organizations")
      .update({ checks_used_this_period: (checksUsed || 0) + 1 })
      .eq("id", profile.org_id);

    // 12. Audit log
    await supabase.from("audit_log").insert({
      org_id: profile.org_id,
      user_id: profile.id,
      action: "validation.created",
      entity_type: "borrower_validation",
      entity_id: validation.id,
      details: {
        borrower_name,
        entity_name: borrower_entity_name,
        state: entity_state,
        status: overallStatus,
        checks_run: usageRecords.length,
      },
    });

    return NextResponse.json(
      { id: validation.id, status: overallStatus },
      { status: 201 },
    );
  } catch (err) {
    // Mark validation as failed
    await supabase
      .from("borrower_validations")
      .update({ overall_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", validation.id);

    return NextResponse.json(
      { error: "Validation checks failed", details: String(err) },
      { status: 500 },
    );
  }
}
