import Anthropic from "@anthropic-ai/sdk";
import type {
  SOSLookupResult,
  PropertyRecord,
  LitigationRecord,
  GCLookupResult,
  SanctionsScreenResult,
} from "@/lib/adapters/types";
import { extractRealieDetails } from "@/lib/adapters/extract";
import type { RiskFactor, Tier } from "@/lib/risk/factors";
import { humanizeFactorKey } from "@/lib/risk/factors";
import { isAiEnabled } from "@/lib/ai/check-enabled";
import {
  buildRedactionMap,
  redact,
  unredactObject,
  findLeftoverTokens,
} from "@/lib/ai/redact";

// v1 shape — preserved for legacy reads. Old validations keep this forever;
// new validations write v2 below. Dual-renderer in
// src/components/dashboard/ai-memo.tsx handles both.
export interface ValidationAnalysisV1 {
  schema_version?: 1;
  summary: string;
  // Tier is set deterministically from risk_factors, not by the AI. This
  // field is populated from the computed tier so existing UI keeps working;
  // the AI is told to NOT pick the tier and to never disagree with it.
  risk_rating: "low" | "medium" | "high";
  pillar_assessments: {
    entity: string;
    track_record: string;
    litigation: string;
    gc: string | null;
    sanctions: string | null;
  };
  flags: string[];
  recommendations: string[];
}

// v2 shape — Story Mode. Structured narrative blocks so the UI renders a
// scrollable opener → strengths → risks (severity callouts) → recommendations
// instead of a paragraph wall. The handoff PDF reuses these blocks with
// page-break-inside rules.
export interface ValidationAnalysisV2 {
  schema_version: 2;
  summary: string;
  risk_rating: "low" | "medium" | "high";  // server-overwritten
  pillar_assessments: {
    entity: string;
    track_record: string;
    litigation: string;
    gc: string | null;
    sanctions: string | null;
  };
  strengths: { title: string; narrative: string }[];
  risks: {
    factor_key: string;
    severity: "critical" | "moderate" | "minor" | "informational";
    narrative: string;
  }[];
  recommendations: {
    priority: "must" | "should" | "consider";
    narrative: string;
  }[];
}

// Default = v2 for new code. Reads of historical rows must accept either.
export type ValidationAnalysis = ValidationAnalysisV2;

export interface VerifiedFlipForAI {
  submitted_address: string;
  resolved_address: string | null;
  match_status: "owned_and_sold" | "owned_and_held" | "never_owned" | "not_found";
  hold_months: number | null;
  profit: number | null;
  acquisition_price: number | null;
  disposition_price: number | null;
}

interface AnalysisInput {
  org_id: string;
  borrower_name: string;
  entity_name: string;
  guarantor_name: string | null;
  entity_result: SOSLookupResult;
  properties: PropertyRecord[];
  litigation_results: LitigationRecord[];
  gc_result: GCLookupResult | null;
  sanctions_result: SanctionsScreenResult | null;
  experience_tier: number;
  overall_status: string;
  confidence_score: number;
  risk_factors: RiskFactor[];
  tier: Tier;
  verified_flips?: VerifiedFlipForAI[];
}

export async function generateValidationAnalysis(
  input: AnalysisInput,
): Promise<ValidationAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set — skipping AI analysis");
    return null;
  }

  // Per-org strict-mode toggle. Returning null is the same path as a key
  // miss — callers already guard on null and skip the ai_analysis update,
  // so the validation lands without a memo (factors + tier still compute
  // deterministically). UI shows "AI memo disabled for this organization".
  if (!(await isAiEnabled(input.org_id))) {
    return null;
  }

  const client = new Anthropic({ apiKey });

  // Compute portfolio metrics from Realie raw_response (the rich-data adapter).
  // We can only see CURRENT holdings, not historical flips — be explicit about
  // that gap in the prompt so the AI doesn't penalize the borrower for our
  // missing data.
  let portfolioValue = 0;
  let totalEquity = 0;
  let totalLienBalance = 0;
  let ltvSum = 0;
  let ltvCount = 0;
  let longestHoldMonths = 0;
  let foreclosureCount = 0;
  const lenders = new Set<string>();

  for (const p of input.properties) {
    const realie = extractRealieDetails(p.raw_response);
    if (realie?.modelValue) portfolioValue += realie.modelValue;
    if (realie?.equityEstimate) totalEquity += realie.equityEstimate;
    if (realie?.totalLienBalance) totalLienBalance += realie.totalLienBalance;
    if (realie?.ltvCurrent != null) {
      ltvSum += realie.ltvCurrent;
      ltvCount++;
    }
    if (realie?.lenderName) lenders.add(realie.lenderName);
    if (realie?.forecloseCode) foreclosureCount++;
    if (p.hold_months && p.hold_months > longestHoldMonths) {
      longestHoldMonths = p.hold_months;
    }
  }

  // Realie returns LTV as a percentage already (e.g. 45.1 means 45.1%),
  // not as a decimal. Don't multiply by 100 — that gave the AI memo
  // 4,512.7% on KIM AN TRUONG's portfolio in an earlier run.
  const avgLtvPct = ltvCount > 0 ? ltvSum / ltvCount : null;
  const lenderList = [...lenders];
  const completedSales = input.properties.filter((p) => p.outcome === "completed").length;
  const distressed = input.properties.filter(
    (p) => p.outcome === "distressed" || p.outcome === "foreclosed",
  ).length;

  // Verified-flip block — the borrower-submitted addresses ran through
  // deed-chain verification. When present, this is the most reliable
  // track-record signal we have (better than the current-portfolio AVM
  // snapshot) — surface it explicitly so the memo references it.
  const flips = input.verified_flips ?? [];
  const verifiedSold = flips.filter((f) => f.match_status === "owned_and_sold");
  const verifiedHeld = flips.filter((f) => f.match_status === "owned_and_held");
  const neverOwned = flips.filter((f) => f.match_status === "never_owned");
  const notFound = flips.filter((f) => f.match_status === "not_found");
  const realizedProfit = verifiedSold
    .filter((f) => f.profit != null)
    .reduce((sum, f) => sum + (f.profit ?? 0), 0);
  const verifiedBlock = flips.length > 0
    ? `--- VERIFIED TRACK RECORD (borrower-submitted, deed-chain confirmed) ---
Submitted: ${flips.length} addresses
Confirmed sold: ${verifiedSold.length}
Confirmed held: ${verifiedHeld.length}
Never owned: ${neverOwned.length}
Not found: ${notFound.length}
Realized profit on confirmed sales: ${realizedProfit !== 0 ? `$${Math.round(realizedProfit).toLocaleString()}` : "Not available"}
This data IS reliable flip-history (verified against deeds). Reference it in the track-record narrative when present.`
    : "";

  // Risk factor block — the deterministic tier is computed from these,
  // so the AI must explain them rather than re-rate. Excluded factors
  // (e.g., extended_hold on a primary residence) are listed but flagged
  // as excluded so the narrative reflects the override.
  const factorBlock = input.risk_factors.length > 0
    ? input.risk_factors
        .map((f) => {
          const status = f.excluded
            ? `excluded${f.exclusion_reason ? ` — ${f.exclusion_reason}` : ""}`
            : `severity: ${f.severity}`;
          return `- ${humanizeFactorKey(f.factor_key)} (${status}): ${f.explanation}`;
        })
        .join("\n")
    : "(no factors flagged)";

  const sanctionsBlock = input.sanctions_result
    ? `--- SANCTIONS / PEP SCREENING ---
Result: ${input.sanctions_result.result === "clear" ? "Clear (no matches)" : "POTENTIAL MATCH"}
Sources Searched: ${input.sanctions_result.sources_searched.join(", ")}
${input.sanctions_result.matches.length > 0
  ? `Matches:\n${input.sanctions_result.matches
      .map(
        (m) =>
          `- ${m.matched_name} (${m.list_name}) — score ${(m.score * 100).toFixed(0)}%${m.programs.length > 0 ? `, programs: ${m.programs.join(", ")}` : ""}`,
      )
      .join("\n")}`
  : ""}`
    : "--- SANCTIONS / PEP SCREENING ---\nNot run.";

  const tierWord = input.tier.toLowerCase();

  // Build the PII redaction map BEFORE constructing the prompt. Real
  // names / addresses / lender labels in the prompt and in the parsed
  // response get tokenized → sent → unredacted. Claude never sees the
  // real PII for the memo path.
  const redactionMap = buildRedactionMap({
    borrower_name: input.borrower_name,
    entity_name: input.entity_name,
    guarantor_name: input.guarantor_name,
    registered_agent: input.entity_result.registered_agent,
    property_addresses: [
      ...input.properties.map((p) => p.property_address),
      ...flips.map((f) => f.submitted_address),
      ...flips
        .map((f) => f.resolved_address)
        .filter((a): a is string => !!a),
    ],
    lender_names: lenderList,
    gc_name: input.gc_result?.gc_name ?? null,
    litigation_entity_names: input.litigation_results.map((l) => l.entity_name),
    sanctions_match_names:
      input.sanctions_result?.matches.map((m) => m.matched_name) ?? [],
  });

  const prompt = `You are a senior credit analyst at a bridge lending firm. Analyze this borrower validation data and produce a structured risk assessment.

PRIVACY TOKENS — preserve verbatim.
Borrower / entity / property / lender / GC / litigation party / sanctions
match identifiers in the data below have been replaced with bracketed
tokens like [[BORROWER]], [[ENTITY]], [[PROPERTY_1]], [[LENDER_2]],
etc. Use the EXACT token strings in your narrative — do not paraphrase
("the borrower"), do not invent names, do not omit the brackets. Anything
not surrounded by [[ ]] is real and should also be cited verbatim
(amounts, percentages, dates, factor keys).

CRITICAL INSTRUCTION — risk tier is NOT yours to set.
The risk tier is computed deterministically from the named factors below
and has already been assigned: ${input.tier}. Do NOT disagree with it,
re-rank it, or argue against it. Your job is to explain the factors in
narrative form so the lender understands the WHY behind the tier. The
"risk_rating" field in your JSON output must be exactly "${tierWord}".

DETERMINISTIC RISK FACTORS:
${factorBlock}

BORROWER: ${input.borrower_name}
ENTITY: ${input.entity_name}${input.guarantor_name ? `\nGUARANTOR: ${input.guarantor_name}` : ""}

--- ENTITY VALIDATION ---
SOS Status: ${input.entity_result.sos_status}
State: ${input.entity_result.state}
Entity Type: ${input.entity_result.entity_type ?? "Unknown"}
Formation Date: ${input.entity_result.formation_date ?? "Unknown"}
Last Filing: ${input.entity_result.last_filing_date ?? "Unknown"}
Registered Agent: ${input.entity_result.registered_agent ?? "Unknown"}
Flags: ${input.entity_result.flags.length > 0 ? input.entity_result.flags.join("; ") : "None"}

--- CURRENT PORTFOLIO (deeded properties owned right now) ---
IMPORTANT DATA SCOPE: This is current ownership only — properties the borrower owned and SOLD in the past (completed flips) are NOT visible to PulseClose without a deed-history vendor. Do NOT cite "zero completed projects" or "no realized profit" as a risk factor — that data was not searched. Treat the portfolio below as a snapshot of present holdings, not an all-time track record.

Properties Owned Now: ${input.properties.length}
Estimated Portfolio Value: ${portfolioValue > 0 ? `$${Math.round(portfolioValue).toLocaleString()}` : "Not available"}
Total Equity: ${totalEquity > 0 ? `$${Math.round(totalEquity).toLocaleString()}` : "Not available"}
Total Lien Balance: ${totalLienBalance > 0 ? `$${Math.round(totalLienBalance).toLocaleString()}` : "Not available"}
Avg Current LTV: ${avgLtvPct != null ? `${avgLtvPct.toFixed(1)}%` : "Not available"}
Longest Current Hold: ${longestHoldMonths > 0 ? `${longestHoldMonths} months` : "Unknown"}
Distinct Lenders: ${lenderList.length > 0 ? `${lenderList.length} (${lenderList.slice(0, 3).join(", ")}${lenderList.length > 3 ? ", ..." : ""})` : "Unknown"}
Properties in Foreclosure/Distress: ${foreclosureCount}
Project Types Inferred: ${[...new Set(input.properties.map((p) => p.project_type))].join(", ") || "None"}
Verified Completed Sales (in dataset): ${completedSales}${completedSales === 0 ? " — note: this is not a flip count, see scope note above" : ""}
Other Distressed/Foreclosed: ${distressed}
Experience Tier (visible portfolio only): ${input.experience_tier} (1=10+ properties, 2=5-9, 3=1-4, 4=none visible)

--- LITIGATION SCREENING (federal courts via CourtListener) ---
${input.litigation_results.map((l) => `${l.search_type}: ${l.result}${l.result === "found" ? ` — ${l.details ?? "No details"} (Case: ${l.case_number ?? "N/A"})` : l.result === "not_run" ? ` — ${l.details ?? "screen did not complete"}` : ""}`).join("\n")}
Note: Coverage is federal only (bankruptcy + federal civil). State-court matters (mechanic's liens, contract disputes, most foreclosures) are not searched. Treat dismissed/terminated cases as informational, not as active risk. IMPORTANT: if any line shows "not_run", that screen did NOT complete — do not state the borrower is litigation-clear; say the litigation screen is incomplete and must be re-run.

${sanctionsBlock}

${verifiedBlock}

--- GC VALIDATION ---
${input.gc_result ? `Contractor: ${input.gc_result.gc_name}
License Status: ${input.gc_result.license_status}
State: ${input.gc_result.license_state}
Classification: ${input.gc_result.license_classification ?? "Unknown"}
Insurance Verified: ${input.gc_result.insurance_verified ? "Yes" : "No"}
Disciplinary Actions: ${input.gc_result.disciplinary_actions.length > 0 ? input.gc_result.disciplinary_actions.join("; ") : "None"}` : "No GC provided for this validation."}

Respond with a JSON object matching this exact structure (Story Mode v2):
{
  "schema_version": 2,
  "summary": "2-3 sentence executive summary that references the deterministic tier (${input.tier}) and the headline factors that drove it. Reference real numbers — portfolio size, LTV, hold periods, entity status, sanctions result, active litigation. Do NOT cite missing flip history as a risk.",
  "risk_rating": "${tierWord}",
  "pillar_assessments": {
    "entity": "1-2 sentences on entity validation findings",
    "track_record": "1-2 sentences on the CURRENT PORTFOLIO. Reference value, equity, LTV, hold periods, lender concentration. If completed-flip history was not searched, state that explicitly rather than treating it as a negative.",
    "litigation": "1-2 sentences on litigation screening. Distinguish active vs dismissed/terminated. Note federal-only coverage.",
    "gc": "1-2 sentences on GC validation, or null if no GC was provided",
    "sanctions": "1-2 sentences on sanctions/PEP screening result, or null if not run"
  },
  "strengths": [
    {
      "title": "Short headline (e.g. 'Active entity standing' or 'Strong portfolio liquidity')",
      "narrative": "1-2 sentences explaining the strength with specific data points"
    }
  ],
  "risks": [
    {
      "factor_key": "MUST be one of the deterministic factor_keys listed above (entity_status, active_fed_litigation, dismissed_litigation, sanctions_hit, gc_license_issue, extended_hold, lender_concentration, address_consistency, foreclosure_distress, market_outlier, market_outlier_unavailable). Use the literal key, not a label.",
      "severity": "critical | moderate | minor | informational — copy verbatim from the deterministic factors block above",
      "narrative": "1-2 sentence narrative for this risk grounded in the data, calling out specific properties / cases / lenders using their bracketed tokens (e.g. [[PROPERTY_1]], [[LENDER_2]]) where relevant"
    }
  ],
  "recommendations": [
    {
      "priority": "must | should | consider",
      "narrative": "Specific next step or condition. If flip history is needed, recommend deed verification via the borrower share-link."
    }
  ]
}

Rules for the structured output:
- Only emit a "risks" entry for a factor that's in the deterministic block above and is NOT excluded. Skip excluded factors — the override has already neutralized them.
- "strengths" should be 2-4 entries minimum when the borrower has any positive signals (active entity, clean sanctions, low LTV, long-tenure portfolio, etc.). Don't pad with platitudes.
- "recommendations" priority: "must" = blocker, "should" = expected before close, "consider" = optional polish.

Use bridge lending terminology naturally. Be direct and specific — no buzzwords. Reference actual numbers and findings from the data.`;

  // Forward-redact the prompt as the last step before send. The real PII
  // never leaves this process — Claude only sees [[TOKEN]] placeholders.
  const redactedPrompt = redact(prompt, redactionMap);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      // 4096 fits a Story Mode v2 memo with 5+ risks, 4+ strengths, 5+
      // recommendations comfortably. Was 2048 — borderline for portfolios
      // with many risk factors; same Claude truncation class as the
      // doc-ingest bug (b3bd964). Bumped defensively before it bites.
      max_tokens: 4096,
      messages: [{ role: "user", content: redactedPrompt }],
    });

    // ROADMAP principle 11 — explicit truncation check. A `max_tokens`
    // stop_reason produces broken JSON (trailing keys cut off) that the
    // regex below would happily match and then fail at JSON.parse. Catch
    // the truncation here and surface a null memo so the route falls back
    // to "memo unavailable" instead of persisting garbage.
    if (response.stop_reason === "max_tokens") {
      console.error(
        "AI analysis truncated at max_tokens — increase the budget or cut the input",
      );
      return null;
    }

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from the response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("AI analysis did not return valid JSON");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as ValidationAnalysisV2;
    // Reverse-redact every string in the parsed object before any
    // downstream processing. This is the boundary where placeholders go
    // back to real names.
    const analysis = unredactObject(parsed, redactionMap);
    // Safety: if Claude truncated or paraphrased a token mid-stream, the
    // unredacted object will still contain [[…]] patterns. Log them so
    // we can audit, but ship the memo anyway — a single weird placeholder
    // beats a blank memo.
    const leftover = findLeftoverTokens(analysis);
    if (leftover.length > 0) {
      console.warn(
        `AI memo unredaction left ${leftover.length} unmapped token(s):`,
        Array.from(new Set(leftover)).slice(0, 10),
      );
    }
    // Hard-overwrite risk_rating with the deterministic tier so the AI
    // can never accidentally publish a tier that disagrees with the
    // factor math, even if the prompt instruction is ignored.
    analysis.risk_rating = tierWord as ValidationAnalysisV2["risk_rating"];
    // Stamp schema_version=2 server-side in case the model omits it.
    analysis.schema_version = 2;
    // Defensive defaults — old-shape fall-throughs (Claude omits the new
    // arrays under load) shouldn't break the UI. Empty arrays render as
    // "no notable strengths/risks" placeholders.
    if (!Array.isArray(analysis.strengths)) analysis.strengths = [];
    if (!Array.isArray(analysis.risks)) analysis.risks = [];
    if (!Array.isArray(analysis.recommendations)) analysis.recommendations = [];
    // Defensive: coerce any out-of-enum severity to "minor" so a single bad
    // value can't blank the entire memo (the v2 schema parse is strict).
    const allowed = new Set(["critical", "moderate", "minor", "informational"]);
    analysis.risks = analysis.risks.map((r) =>
      allowed.has(r.severity) ? r : { ...r, severity: "minor" },
    );
    return analysis;
  } catch (err) {
    console.error("AI analysis generation failed:", err);
    return null;
  }
}
