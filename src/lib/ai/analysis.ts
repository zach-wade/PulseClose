import Anthropic from "@anthropic-ai/sdk";
import type {
  SOSLookupResult,
  PropertyRecord,
  LitigationRecord,
  GCLookupResult,
} from "@/lib/adapters/types";

export interface ValidationAnalysis {
  summary: string;
  risk_rating: "low" | "medium" | "high";
  pillar_assessments: {
    entity: string;
    track_record: string;
    litigation: string;
    gc: string | null;
  };
  flags: string[];
  recommendations: string[];
}

interface AnalysisInput {
  borrower_name: string;
  entity_name: string;
  guarantor_name: string | null;
  entity_result: SOSLookupResult;
  properties: PropertyRecord[];
  litigation_results: LitigationRecord[];
  gc_result: GCLookupResult | null;
  experience_tier: number;
  overall_status: string;
  confidence_score: number;
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

  const completedProjects = input.properties.filter(
    (p) => p.outcome === "completed",
  );
  const totalProfit = completedProjects.reduce(
    (sum, p) => sum + (p.profit ?? 0),
    0,
  );
  const prompt = `You are a senior credit analyst at a bridge lending firm. Analyze this borrower validation data and produce a structured risk assessment.

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

--- TRACK RECORD ---
Total Properties: ${input.properties.length}
Completed Projects: ${completedProjects.length}
Total Profit: $${totalProfit.toLocaleString()}
Experience Tier: ${input.experience_tier} (1=most experienced, 4=no track record)
Project Types: ${[...new Set(input.properties.map((p) => p.project_type))].join(", ") || "None"}
Distressed/Foreclosed: ${input.properties.filter((p) => p.outcome === "distressed" || p.outcome === "foreclosed").length}

--- LITIGATION SCREENING ---
${input.litigation_results.map((l) => `${l.search_type}: ${l.result}${l.result === "found" ? ` — ${l.details ?? "No details"} (Case: ${l.case_number ?? "N/A"})` : ""}`).join("\n")}

--- GC VALIDATION ---
${input.gc_result ? `Contractor: ${input.gc_result.gc_name}
License Status: ${input.gc_result.license_status}
State: ${input.gc_result.license_state}
Classification: ${input.gc_result.license_classification ?? "Unknown"}
Insurance Verified: ${input.gc_result.insurance_verified ? "Yes" : "No"}
Disciplinary Actions: ${input.gc_result.disciplinary_actions.length > 0 ? input.gc_result.disciplinary_actions.join("; ") : "None"}` : "No GC provided for this validation."}

Respond with a JSON object matching this exact structure:
{
  "summary": "2-3 sentence executive summary of the borrower's risk profile. Be specific and reference actual data points.",
  "risk_rating": "low" | "medium" | "high",
  "pillar_assessments": {
    "entity": "1-2 sentences on the entity validation findings",
    "track_record": "1-2 sentences on track record and experience",
    "litigation": "1-2 sentences on litigation screening results",
    "gc": "1-2 sentences on GC validation, or null if no GC was provided"
  },
  "flags": ["Array of specific risk flags or concerns, if any"],
  "recommendations": ["Array of specific next steps or conditions to consider"]
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
    return analysis;
  } catch (err) {
    console.error("AI analysis generation failed:", err);
    return null;
  }
}
