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

export interface ValidationAnalysis {
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

  const prompt = `You are a senior credit analyst at a bridge lending firm. Analyze this borrower validation data and produce a structured risk assessment.

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
${input.litigation_results.map((l) => `${l.search_type}: ${l.result}${l.result === "found" ? ` — ${l.details ?? "No details"} (Case: ${l.case_number ?? "N/A"})` : ""}`).join("\n")}
Note: Coverage is federal only (bankruptcy + federal civil). State-court matters (mechanic's liens, contract disputes, most foreclosures) are not searched. Treat dismissed/terminated cases as informational, not as active risk.

${sanctionsBlock}

${verifiedBlock}

--- GC VALIDATION ---
${input.gc_result ? `Contractor: ${input.gc_result.gc_name}
License Status: ${input.gc_result.license_status}
State: ${input.gc_result.license_state}
Classification: ${input.gc_result.license_classification ?? "Unknown"}
Insurance Verified: ${input.gc_result.insurance_verified ? "Yes" : "No"}
Disciplinary Actions: ${input.gc_result.disciplinary_actions.length > 0 ? input.gc_result.disciplinary_actions.join("; ") : "None"}` : "No GC provided for this validation."}

Respond with a JSON object matching this exact structure:
{
  "summary": "2-3 sentence executive summary that references the deterministic tier (${input.tier}) and the named factors that drove it. Reference real numbers — portfolio size, LTV, hold periods, entity status, sanctions result, and any active litigation. Do NOT cite missing flip history as a risk; that data was not searched.",
  "risk_rating": "${tierWord}",
  "pillar_assessments": {
    "entity": "1-2 sentences on entity validation findings",
    "track_record": "1-2 sentences on the CURRENT PORTFOLIO. Reference value, equity, LTV, hold periods, lender concentration. If completed-flip history was not searched, state that explicitly rather than treating it as a negative.",
    "litigation": "1-2 sentences on litigation screening. Distinguish active vs dismissed/terminated. Note federal-only coverage.",
    "gc": "1-2 sentences on GC validation, or null if no GC was provided",
    "sanctions": "1-2 sentences on sanctions/PEP screening result, or null if not run"
  },
  "flags": ["Array of specific risk flags. Only include items grounded in the data. Do NOT include 'no completed projects' or 'no flip history' — those are data-scope limits, not borrower risks."],
  "recommendations": ["Array of specific next steps or conditions. If flip history is needed for underwriting, recommend the borrower submit a list of past addresses for deed verification."]
}

Use bridge lending terminology naturally. Be direct and specific — no buzzwords. Reference actual numbers and findings from the data.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from the response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("AI analysis did not return valid JSON");
      return null;
    }

    const analysis = JSON.parse(jsonMatch[0]) as ValidationAnalysis;
    // Hard-overwrite risk_rating with the deterministic tier so the AI
    // can never accidentally publish a tier that disagrees with the
    // factor math, even if the prompt instruction is ignored.
    analysis.risk_rating = tierWord as ValidationAnalysis["risk_rating"];
    return analysis;
  } catch (err) {
    console.error("AI analysis generation failed:", err);
    return null;
  }
}
