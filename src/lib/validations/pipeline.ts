// Shared validation pipeline (D6 item 1 extraction).
//
// The full borrower-validation orchestration — domain upserts → create the
// validation → monitor inheritance → run the five pillars in parallel →
// persist the six snapshot tables → compute risk factors + tier → derive
// status/confidence/warnings → update the validation → enrich (AI memo /
// deed-verify) → usage + audit + activity → fire the validation.completed
// webhook.
//
// Extracted from the inline POST /api/validations handler so BOTH the
// session-authed dashboard route and the API-key-authed public route
// (POST /api/public/v1/validations) run the exact same logic. The route
// handlers keep what differs: auth, rate limiting, plan-limit responses,
// and product analytics.
//
// Foreground vs background:
//   * Dashboard route runs the pipeline inline and returns 201 with the
//     result; the heavy enrichment (AI memo / deed verification) is deferred
//     via after() so the response stays snappy. (background = false)
//   * Public route returns 202 immediately and runs the whole pipeline in an
//     after() block; there, enrichment is awaited inline (no nested after()).
//     (background = true)

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAdapter,
  getPropertyDataSource,
  getGCDataSource,
  getSanctionsDataSource,
} from "@/lib/adapters";
import { generateValidationAnalysis } from "@/lib/ai/analysis";
import {
  upsertBorrower,
  upsertEntity,
  upsertProperty,
  upsertLender,
  linkBorrowerToEntity,
} from "@/lib/domain/upsert";
import { recomputeRiskFactorsForValidation } from "@/lib/risk/persist";
import { withErrorLog } from "@/lib/async/with-error-log";
import { emitActivity } from "@/lib/events/emit";
import { materializeLitigationCases } from "@/lib/litigation/materialize";
import { buildGCSummary } from "@/lib/gc/summary";
import { insertOrThrow } from "@/lib/supabase/insert-or-throw";
import { verifyAddresses, MAX_ADDRESSES } from "@/lib/track-record/verify-core";
import { scoreAndPromotePendingRows } from "@/lib/track-record/review";
import { regenerateAiMemoForValidation } from "@/lib/ai/regenerate";
import { dispatchWebhookEvent } from "@/lib/webhooks/deliver";
import { assessValidationMandates } from "@/lib/mandates/assess";
import { lookupContractorFromDb } from "@/lib/gc/lookup";
import { lookupEntityCached } from "@/lib/sos/lookup";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pulseclose.com";

export interface ValidationPipelineInput {
  borrower_name: string;
  borrower_entity_name: string;
  entity_state: string;
  guarantor_name?: string | null;
  gc_name?: string | null;
  gc_license_number?: string | null;
  gc_state?: string | null;
  property_addresses?: unknown;
  /**
   * Borrower date of birth (YYYY-MM-DD), optional. Used ONLY to disambiguate
   * screening matches (the strongest second identifier per OFAC FAQ #5). Passed
   * transiently into the sanctions screen and NOT persisted — it's PII we don't
   * need to store, and it never reaches any AI call.
   */
  borrower_dob?: string | null;
}

export interface RunValidationPipelineOpts {
  supabase: SupabaseClient;
  orgId: string;
  /** User who initiated; null for API-key-created validations. */
  actorUserId: string | null;
  /** Current org check counter, for the usage increment. */
  checksUsed: number;
  /** Await enrichment inline (true) vs defer via after() (false). */
  background?: boolean;
  /**
   * Pre-determined validation id. The async public route generates the id up
   * front so it can return it in the 202 before the pipeline (running in
   * after()) inserts the row.
   */
  presetValidationId?: string;
  input: ValidationPipelineInput;
}

export interface ValidationPipelineResult {
  validation_id: string;
  overall_status: string;
  tier: string;
  experience_tier: number;
  confidence_score: number;
}

export async function runValidationPipeline(
  opts: RunValidationPipelineOpts,
): Promise<ValidationPipelineResult> {
  const { supabase, orgId, actorUserId, checksUsed, background = false, presetValidationId, input } = opts;
  const {
    borrower_name,
    borrower_entity_name,
    entity_state,
    guarantor_name,
    gc_name,
    gc_license_number,
    gc_state,
    property_addresses,
    borrower_dob,
  } = input;

  const addressesToVerify: string[] = Array.isArray(property_addresses)
    ? property_addresses
        .map((a: unknown) => (typeof a === "string" ? a.trim() : ""))
        .filter((a: string) => a.length > 0)
        .slice(0, MAX_ADDRESSES)
    : [];

  // 1. Resolve domain entities and create the validation record.
  const primaryBorrowerId = await upsertBorrower(supabase, orgId, borrower_name);
  const guarantorBorrowerId = guarantor_name
    ? await upsertBorrower(supabase, orgId, guarantor_name)
    : null;
  const primaryEntityId = await upsertEntity(supabase, orgId, {
    displayName: borrower_entity_name,
    state: entity_state,
  });

  const { data: validation, error: createError } = await supabase
    .from("borrower_validations")
    .insert({
      ...(presetValidationId ? { id: presetValidationId } : {}),
      org_id: orgId,
      borrower_name,
      borrower_entity_name,
      guarantor_name: guarantor_name || null,
      overall_status: "pending",
      confidence_score: 0,
      created_by: actorUserId,
      primary_borrower_id: primaryBorrowerId,
      primary_entity_id: primaryEntityId,
      guarantor_borrower_id: guarantorBorrowerId,
    })
    .select()
    .single();

  if (createError || !validation) {
    throw new Error(createError?.message ?? "Failed to create validation");
  }
  const validationId = validation.id as string;

  // Auto-monitor inheritance (borrower template → org default). Best-effort.
  try {
    const { data: borrowerSub } = await supabase
      .from("monitor_subscriptions")
      .select("cadence, notify_emails, critical_only")
      .eq("org_id", orgId)
      .eq("borrower_id", primaryBorrowerId)
      .eq("enabled", true)
      .maybeSingle();

    let inheritanceSource: "borrower" | "org_default" | null = null;
    let cadence = "weekly";
    let notifyEmails: string[] = [];
    let criticalOnly = false;

    if (borrowerSub) {
      inheritanceSource = "borrower";
      cadence = borrowerSub.cadence ?? "weekly";
      notifyEmails = borrowerSub.notify_emails ?? [];
      criticalOnly = borrowerSub.critical_only ?? false;
    } else {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("monitor_new_validations_by_default")
        .eq("id", orgId)
        .single();
      if (orgRow?.monitor_new_validations_by_default) inheritanceSource = "org_default";
    }

    if (inheritanceSource) {
      const { data: newSub } = await supabase
        .from("monitor_subscriptions")
        .insert({
          validation_id: validationId,
          org_id: orgId,
          enabled: true,
          cadence,
          notify_emails: notifyEmails,
          critical_only: criticalOnly,
          next_run_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (newSub) {
        void emitActivity(supabase, {
          orgId,
          actorUserId,
          verb: "subscribed_to_monitor",
          subjectType: "validation",
          subjectId: validationId,
          metadata: {
            subscription_id: newSub.id,
            inherited_from_borrower: inheritanceSource === "borrower",
            inherited_from_org_default: inheritanceSource === "org_default",
            borrower_id: primaryBorrowerId,
          },
        });
      }
    }
  } catch (err) {
    console.warn(
      `[pipeline] monitor inheritance failed (validation=${validationId}):`,
      err instanceof Error ? err.message : String(err),
    );
  }

  const adapter = getAdapter();

  // Borrower's known states — entity + GC state plus any 2-letter state token
  // trailing a supplied property address ("…, Santa Rosa, CA 95404"). Passed
  // to litigation + sanctions disambiguation as weak jurisdiction
  // corroboration. Best-effort; absent states just mean no jurisdiction boost.
  const US_STATE = /\b([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/;
  const knownStates = [
    ...new Set(
      [
        entity_state,
        gc_state,
        ...addressesToVerify.map((a) => US_STATE.exec(a.trim())?.[1] ?? null),
      ].filter((s): s is string => Boolean(s) && /^[A-Za-z]{2}$/.test(s as string)),
    ),
  ].map((s) => s.toUpperCase());

  try {
    // First wave: entity, properties, litigation, GC in parallel; sanctions
    // after so officers/agent from the entity filing are included.
    // GC: try the ingested contractor_licenses table first (WA/OR/FL bulk data,
    // + any CA rows), then fall back to the CSLB scrape (CA) / not_automated.
    const resolveGc = async () => {
      if (!gc_name && !gc_license_number) return null;
      const gcReq = {
        gc_name: gc_name ?? "",
        license_number: gc_license_number ?? undefined,
        state: gc_state || entity_state,
      };
      const fromDb = await lookupContractorFromDb(supabase, gcReq);
      if (fromDb) return fromDb;
      return gc_name ? adapter.lookupGC(gcReq) : null;
    };

    const [entityResult, properties, litigationResults, gcResult] = await Promise.all([
      // DB-first: hits the shared sos_entities cache / bulk-ingested rows before
      // paying Cobalt (de-rent, #1). Caches resolved live results for reuse.
      lookupEntityCached(supabase, adapter, { entity_name: borrower_entity_name, state: entity_state }),
      adapter.searchProperties({ borrower_name, entity_name: borrower_entity_name, state: entity_state }),
      adapter.searchLitigation({ entity_name: borrower_entity_name, borrower_name, known_states: knownStates }),
      resolveGc(),
    ]);

    // Coverage-miss telemetry — a GC was supplied but we couldn't validate its
    // state (no ingested dataset, not CA-scrapeable). Drives data-driven
    // prioritization of which state to ingest next. Fire-and-forget.
    if ((gcResult?.raw_response as { _not_automated?: boolean } | null)?._not_automated) {
      void supabase
        .from("gc_coverage_misses")
        .insert({
          org_id: orgId,
          validation_id: validationId,
          gc_state: (gc_state || entity_state || "").toUpperCase() || null,
          had_license_number: Boolean(gc_license_number),
          gc_name: gc_name || null,
        })
        .then(({ error }) => {
          if (error) console.warn(`[pipeline] gc_coverage_miss log failed:`, error.message);
        });
    }

    const cobaltResults = (entityResult.raw_response as
      | { results?: Array<{ officers?: Array<{ name?: string }> }> }
      | null)?.results;
    const officerNames = (cobaltResults?.[0]?.officers ?? [])
      .map((o) => o.name)
      .filter((n): n is string => Boolean(n));
    const additionalPersons = [
      ...officerNames,
      ...(entityResult.registered_agent ? [entityResult.registered_agent] : []),
    ];

    const sanctionsResult = await adapter.screenSanctions({
      borrower_name,
      entity_name: borrower_entity_name,
      guarantor_name: guarantor_name || undefined,
      additional_persons: additionalPersons,
      known_states: knownStates,
      borrower_dob: borrower_dob || undefined,
    });

    // 3. Entity check + refresh cached SOS state.
    const checkedEntityId = await upsertEntity(supabase, orgId, {
      displayName: entityResult.entity_name,
      state: entityResult.state || entity_state,
      entityType: entityResult.entity_type,
      formationDate: entityResult.formation_date,
      latestSosStatus: entityResult.sos_status,
      latestSosCheckAt: new Date().toISOString(),
      latestRegisteredAgent: entityResult.registered_agent,
    });

    await insertOrThrow(
      supabase.from("entity_checks").insert({
        validation_id: validationId,
        org_id: orgId,
        entity_id: checkedEntityId ?? primaryEntityId,
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
      }),
      `entity_checks insert (validation_id=${validationId})`,
    );

    const linkEntityId = checkedEntityId ?? primaryEntityId;
    if (primaryBorrowerId && linkEntityId) {
      await linkBorrowerToEntity(supabase, primaryBorrowerId, linkEntityId, "other", "user", "medium");
    }
    if (guarantorBorrowerId && linkEntityId) {
      await linkBorrowerToEntity(supabase, guarantorBorrowerId, linkEntityId, "guarantor", "user", "high");
    }

    // 4. Track record entries.
    if (properties.length > 0) {
      const enriched = await Promise.all(
        properties.map(async (p) => {
          const raw = (p.raw_response ?? {}) as Record<string, unknown>;
          const city = typeof raw.city === "string" ? raw.city : null;
          const state = typeof raw.state === "string" ? raw.state : null;
          const zip = typeof raw.zipCode === "string" ? raw.zipCode : null;
          const modelValue = typeof raw.modelValue === "number" ? raw.modelValue : null;
          const lenderName = typeof raw.lenderName === "string" ? raw.lenderName : null;

          const propertyId = await upsertProperty(supabase, orgId, {
            addressDisplay: p.property_address,
            city,
            state,
            zip,
            latestAvm: modelValue,
            latestAvmCheckAt: modelValue !== null ? new Date().toISOString() : null,
          });

          const lenderId = lenderName
            ? await upsertLender(supabase, orgId, { displayName: lenderName })
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
                source:
                  p.source.toLowerCase().includes("realie") || p.source.toLowerCase().includes("regrid")
                    ? "deed"
                    : "inferred",
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
            validation_id: validationId,
            org_id: orgId,
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
            review_status: "pending_review",
          })),
        ),
        `track_record_entries insert (validation_id=${validationId}, count=${enriched.length})`,
      );
    }

    // 5. Litigation checks.
    await insertOrThrow(
      supabase.from("litigation_checks").insert(
        litigationResults.map((l) => ({
          validation_id: validationId,
          org_id: orgId,
          search_type: l.search_type,
          entity_name: l.entity_name,
          result: l.result,
          details: l.details,
          case_number: l.case_number,
          source: l.source,
          confidence: "medium",
          raw_response: l.raw_response,
          target_entity_id: primaryEntityId,
        })),
      ),
      `litigation_checks insert (validation_id=${validationId}, count=${litigationResults.length})`,
    );

    void withErrorLog(`materializeLitigationCases[${validationId}]`, () =>
      materializeLitigationCases(supabase, validationId, orgId),
    );

    // 6. GC validation (if applicable).
    if (gcResult) {
      await insertOrThrow(
        supabase.from("gc_validations").insert({
          validation_id: validationId,
          org_id: orgId,
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
        }),
        `gc_validations insert (validation_id=${validationId})`,
      );
    }

    // 6b. Sanctions / PEP screen.
    await insertOrThrow(
      supabase.from("sanctions_checks").insert({
        validation_id: validationId,
        borrower_name,
        entity_name: borrower_entity_name,
        guarantor_name: guarantor_name || null,
        result: sanctionsResult.result,
        match_count: sanctionsResult.matches.length,
        matches: sanctionsResult.matches,
        sources_searched: sanctionsResult.sources_searched,
        source: sanctionsResult.source,
        // Fold the group-level disambiguation roll-up into raw_response so the
        // UI can render the "name appears common" banner without a new column.
        raw_response: {
          ...(sanctionsResult.raw_response ?? {}),
          _disambiguation: {
            common_name_likely: sanctionsResult.common_name_likely ?? false,
            highest_confidence: sanctionsResult.highest_confidence ?? null,
            review_summary: sanctionsResult.review_summary ?? null,
          },
        },
        primary_borrower_id: primaryBorrowerId,
        primary_entity_id: primaryEntityId,
      }),
      `sanctions_checks insert (validation_id=${validationId})`,
    );

    // 6c. Risk factors + tier.
    const riskResult = await recomputeRiskFactorsForValidation(supabase, validationId);
    const factors = riskResult?.factors ?? [];
    const tier = riskResult?.tier ?? "LOW";

    // 7. Usage records.
    const cobaltKey = process.env.COBALT_INTELLIGENCE_API_KEY;
    const courtListenerToken = process.env.COURTLISTENER_API_TOKEN;
    const propertySource = getPropertyDataSource();
    const sanctionsSource = getSanctionsDataSource();
    const usageRecords = [
      { check_type: "sos_lookup", data_source: cobaltKey ? "cobalt" : "stub", cost_cents: cobaltKey ? 500 : 0 },
      { check_type: "property_search", data_source: propertySource, cost_cents: propertySource === "stub" ? 0 : 1500 },
      { check_type: "litigation_search", data_source: courtListenerToken ? "courtlistener" : "stub", cost_cents: courtListenerToken ? 1000 : 0 },
      { check_type: "sanctions_screen", data_source: sanctionsSource, cost_cents: sanctionsSource === "opensanctions" ? 100 : 0 },
    ];
    if (gc_name) {
      const gcSource = getGCDataSource(gc_state || entity_state, gc_license_number ?? undefined);
      usageRecords.push({ check_type: "gc_lookup", data_source: gcSource, cost_cents: gcSource === "stub" ? 0 : 500 });
    }
    await supabase.from("usage_records").insert(
      usageRecords.map((u) => ({ org_id: orgId, validation_id: validationId, ...u, response_status: "success" })),
    );

    // 8. Status + experience tier + warnings + confidence.
    const projectCount = properties.length;
    const experienceTier = projectCount >= 10 ? 1 : projectCount >= 5 ? 2 : projectCount >= 1 ? 3 : 4;

    const activeLitigation = litigationResults.filter(
      (l) => l.result === "found" && l.raw_response && !(l.raw_response as Record<string, unknown>).date_terminated,
    );
    const dismissedLitigation = litigationResults.filter(
      (l) => l.result === "found" && l.raw_response && !!(l.raw_response as Record<string, unknown>).date_terminated,
    );
    const sanctionsHit = sanctionsResult.result === "potential_match";

    // Finding #13 — a check that could not COMPLETE must never read as, or score
    // as, a clean check. Litigation now emits a "not_run" sentinel on an
    // incomplete screen; entity carries an _error flag; sanctions has its own
    // "not_run". Collect those so we withhold the clean-result confidence bonuses
    // and force the overall status to reflect the incompleteness.
    const litigationIncomplete = litigationResults.some((l) => l.result === "not_run");
    const entityUnavailable = Boolean(
      (entityResult.raw_response as { _error?: boolean } | null)?._error,
    );
    const sanctionsNotRun = sanctionsResult.result === "not_run";

    const inputWarnings: string[] = [];
    if (litigationIncomplete) {
      const note = litigationResults.find((l) => l.result === "not_run")?.details;
      inputWarnings.push(
        note ?? "Litigation screen did not complete (rate-limited or upstream error). Re-run to complete it — do not treat the borrower as litigation-clear.",
      );
    }
    if (entityUnavailable) {
      inputWarnings.push(
        `Entity/SOS lookup for "${entityResult.entity_name}" did not complete (upstream error) — this is not a confirmation the entity is absent. Re-run to verify.`,
      );
    }
    if (sanctionsNotRun) {
      inputWarnings.push(
        "Sanctions/PEP screen did not complete (upstream error). Re-run to complete it — the borrower is not screened-clear.",
      );
    }
    const looksLikeEntity = /\b(LLC|L\.L\.C|Inc|Incorporated|Corp|Corporation|Ltd|Limited|LP|LLP|Trust|Co|Company)\b\.?/i.test(borrower_name);
    if (looksLikeEntity) {
      inputWarnings.push(
        `Borrower "${borrower_name}" appears to be an entity (LLC/Corp/Trust suffix). Bridge loans typically have an individual principal/guarantor — confirm this is correct.`,
      );
    }

    const tokenizeName = (s: string | null | undefined): string[] => {
      if (!s) return [];
      return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
    };
    const namesOverlap = (a: string[], b: string[]): boolean => {
      if (a.length === 0 || b.length === 0) return false;
      const sa = new Set(a);
      const sb = new Set(b);
      const [smaller, larger] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
      if (smaller.size === 1) {
        const [only] = smaller;
        return only.length >= 3 && larger.has(only);
      }
      for (const t of smaller) if (!larger.has(t)) return false;
      return true;
    };
    const borrowerTokens = tokenizeName(borrower_name);
    const guarantorTokens = tokenizeName(guarantor_name);
    const candidateTokenSets = additionalPersons.map(tokenizeName).filter((ts) => ts.length > 0);
    const borrowerLinked =
      borrowerTokens.length === 0 || candidateTokenSets.some((cs) => namesOverlap(cs, borrowerTokens));
    const guarantorLinked =
      guarantorTokens.length === 0 || candidateTokenSets.some((cs) => namesOverlap(cs, guarantorTokens));
    const sosWorked =
      entityResult.sos_status !== "not_found" && !(entityResult.raw_response as { _error?: boolean } | null)?._error;

    if (sosWorked && !looksLikeEntity && !borrowerLinked && !guarantorLinked) {
      inputWarnings.push(
        `Borrower "${borrower_name}"${guarantor_name ? ` (guarantor "${guarantor_name}")` : ""} does not appear in entity "${entityResult.entity_name}" filings (registered agent or officers). Verify the borrower is connected to this entity.`,
      );
    }

    const hasActiveFlags =
      // A 429'd / errored entity lookup is INCOMPLETE, not a hard "not active"
      // flag — it drops to "partial" (incomplete) below, not "flagged" (#21).
      (entityResult.sos_status !== "active" && !entityUnavailable) ||
      activeLitigation.length > 0 ||
      sanctionsHit ||
      (gcResult && gcResult.license_status !== "active");
    // An incomplete check is not a clean result — it can't make a borrower
    // "verified". Treat incompleteness as an info-level reason to drop to
    // "partial" (needs attention / re-run) when nothing more severe is flagged.
    const hasIncompleteChecks = litigationIncomplete || entityUnavailable || sanctionsNotRun;
    const hasInfoFlags =
      entityResult.flags.length > 0 || dismissedLitigation.length > 0 || hasIncompleteChecks;
    const overallStatus = hasActiveFlags ? "flagged" : hasInfoFlags ? "partial" : "verified";

    let confidenceScore = 50;
    if (entityResult.sos_status === "active") confidenceScore += 15;
    if (projectCount >= 10) confidenceScore += 20;
    else if (projectCount >= 5) confidenceScore += 15;
    else if (projectCount >= 1) confidenceScore += 10;
    // Only reward "no litigation" when the screen actually COMPLETED — an
    // incomplete screen is not evidence of a clean borrower (finding #13).
    if (!litigationIncomplete && activeLitigation.length === 0) confidenceScore += 10;
    if (!gcResult || gcResult.license_status === "active") confidenceScore += 5;
    if (sanctionsResult.result === "clear") confidenceScore += 5;
    if (entityResult.sos_status === "suspended" || entityResult.sos_status === "dissolved") confidenceScore -= 20;
    if (activeLitigation.length > 0) confidenceScore -= 15;
    if (sanctionsHit) confidenceScore -= 30;
    confidenceScore = Math.max(10, Math.min(100, confidenceScore));

    // 9. Update the validation record.
    await supabase
      .from("borrower_validations")
      .update({
        overall_status: overallStatus,
        confidence_score: confidenceScore,
        experience_tier: experienceTier,
        input_warnings: inputWarnings,
        property_count: properties.length,
        gc_summary: buildGCSummary(gcResult),
        validation_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", validationId);

    // 10. Enrichment — AI memo / deed verification. Deferred via after() in
    // the foreground (dashboard) path; awaited inline in the background
    // (public API) path so we never nest after() inside after().
    const willVerifyAddresses = addressesToVerify.length > 0 && !!process.env.REALIE_API_KEY;
    const runEnrichment = async () => {
      if (!willVerifyAddresses) {
        if (addressesToVerify.length > 0) {
          // Addresses supplied but no REALIE key — just (re)generate the memo.
          console.warn(
            `[pipeline] property_addresses supplied but REALIE_API_KEY is unset — skipping deed verification (validation_id=${validationId})`,
          );
          await regenerateAiMemoForValidation(supabase, validationId);
          return;
        }
        // No addresses — generate the initial memo from the pillar results.
        const aiAnalysis = await generateValidationAnalysis({
          org_id: orgId,
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
          risk_factors: factors,
          tier,
        });
        if (aiAnalysis) {
          await supabase
            .from("borrower_validations")
            .update({ ai_analysis: aiAnalysis, updated_at: new Date().toISOString() })
            .eq("id", validationId);
        } else {
          console.warn(`AI analysis returned null for validation ${validationId}`);
        }
        return;
      }

      // Deed-verify the supplied addresses, then regenerate the richer memo.
      const realieKey = process.env.REALIE_API_KEY!;
      const verified = await verifyAddresses({
        borrower_name,
        entity_name: borrower_entity_name,
        fallback_state: entity_state,
        addresses: addressesToVerify,
        realie_key: realieKey,
      });
      await supabase.from("verified_flips").delete().eq("validation_id", validationId);
      await insertOrThrow(
        supabase.from("verified_flips").insert(
          verified.map((v) => ({
            validation_id: validationId,
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
        `verified_flips insert at-creation (validation_id=${validationId}, count=${verified.length})`,
      );
      await supabase.from("usage_records").insert(
        verified.map(() => ({
          org_id: orgId,
          validation_id: validationId,
          check_type: "address_verify",
          data_source: "realie",
          cost_cents: 50,
          response_status: "success" as const,
        })),
      );
      await scoreAndPromotePendingRows(supabase, validationId, borrower_name, borrower_entity_name);
      await regenerateAiMemoForValidation(supabase, validationId);
      void emitActivity(supabase, {
        orgId,
        actorUserId,
        verb: "updated",
        subjectType: "validation",
        subjectId: validationId,
        metadata: { addresses_verified: verified.length, source: "intake" },
      });
    };

    if (background) {
      await withErrorLog(`pipeline.enrichment[${validationId}]`, runEnrichment);
    } else {
      after(() => withErrorLog(`pipeline.enrichment[${validationId}]`, runEnrichment));
    }

    // 11. Increment usage counter.
    await supabase
      .from("organizations")
      .update({ checks_used_this_period: (checksUsed || 0) + 1 })
      .eq("id", orgId);

    // 12. Audit log + activity feed.
    await supabase.from("audit_log").insert({
      org_id: orgId,
      user_id: actorUserId,
      action: "validation.created",
      entity_type: "borrower_validation",
      entity_id: validationId,
      details: {
        borrower_name,
        entity_name: borrower_entity_name,
        state: entity_state,
        status: overallStatus,
        checks_run: usageRecords.length,
      },
    });

    void emitActivity(supabase, {
      orgId,
      actorUserId,
      verb: "created",
      subjectType: "validation",
      subjectId: validationId,
      metadata: { borrower_name, entity_name: borrower_entity_name, status: overallStatus },
    });

    // 13. Fire the validation.completed webhook (the pillars + tier are done;
    // the AI memo is an enrichment that may still be generating). Non-blocking
    // in the foreground; awaited in the background path.
    const activeFlagCount = factors.filter(
      (f) => !f.excluded && f.severity !== "none" && f.severity !== "informational",
    ).length;
    const fireWebhook = () =>
      dispatchWebhookEvent(supabase, orgId, "validation.completed", {
        validation_id: validationId,
        borrower_name,
        entity_name: borrower_entity_name,
        guarantor_name: guarantor_name || null,
        overall_status: overallStatus,
        risk_tier: tier,
        experience_tier: experienceTier,
        confidence_score: confidenceScore,
        property_count: properties.length,
        active_flag_count: activeFlagCount,
        detail_url: `${APP_BASE}/dashboard/validations/${validationId}`,
        completed_at: new Date().toISOString(),
      }).then(() => undefined);

    if (background) {
      await withErrorLog(`pipeline.webhook[${validationId}]`, fireWebhook);
    } else {
      after(() => withErrorLog(`pipeline.webhook[${validationId}]`, fireWebhook));
    }

    // 14. Auto-assess against the org's capital-provider mandates (Item 4) —
    // the validation arrives already stamped. Persists mandate_assessments +
    // fires mandate.assessed webhooks. Best-effort; same defer pattern.
    const assessMandates = () =>
      assessValidationMandates(supabase, orgId, validationId).then(() => undefined);
    if (background) {
      await withErrorLog(`pipeline.mandates[${validationId}]`, assessMandates);
    } else {
      after(() => withErrorLog(`pipeline.mandates[${validationId}]`, assessMandates));
    }

    return {
      validation_id: validationId,
      overall_status: overallStatus,
      tier,
      experience_tier: experienceTier,
      confidence_score: confidenceScore,
    };
  } catch (err) {
    // Mark the validation back to pending so a half-run record isn't trusted.
    await supabase
      .from("borrower_validations")
      .update({ overall_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", validationId);
    throw err;
  }
}
