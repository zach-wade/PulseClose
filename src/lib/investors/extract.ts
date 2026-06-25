// Claude prompt + parse for A1 — investor criteria PDF parser. Mirrors
// the doc-ingest pattern (src/app/api/ingest/borrower-doc/route.ts):
// max_tokens 4096, stop_reason "max_tokens" handling, JSON match +
// defensive parse.
//
// Why this lives in src/lib/investors/ instead of inline in the route:
// the prompt + parse are reused by future enhancements (xlsx ingest,
// re-extract from history) and shouldn't be coupled to one HTTP handler.

import Anthropic from "@anthropic-ai/sdk";

export const INVESTOR_EXTRACT_MODEL = "claude-sonnet-4-6";

// Known criteria keys the engine actually consumes. Lifted from
// src/lib/schemas/jsonb.ts criteriaShapeByKey — keep in sync if that
// list grows. Unknown keys still get persisted (forward-compat) but the
// prompt steers toward these so Claude doesn't invent random labels.
const KNOWN_KEYS = [
  "loan_types",
  "property_types",
  "excluded_property_types",
  "allowed_states",
  "excluded_states",
  "allowed_occupancy",
  "min_loan_amount",
  "max_loan_amount",
  "min_fico",
  "min_experience",
  "max_ltv",
  "max_ltc",
  "max_ltarv",
  "rural_allowed",
  "leverage_matrix",
  "rate_adjusters",
] as const;

const PROMPT = `You are extracting bridge-lending fund / investor underwriting guidelines from a PDF.

Return a JSON array of criteria rows, one per gate or pricing dimension you can find. Schema:

[
  { "criteria_key": "<string>", "criteria_value": <any>, "confidence": "high" | "medium" | "low" },
  ...
]

Use these criteria_key values where they apply (other keys are allowed but unknown ones won't influence eligibility math):

- loan_types               array of strings ("bridge", "fix_flip", "ground_up", "rental_dscr", ...)
- property_types           array of strings ("sfr", "2_4_unit", "small_multifamily", "condo", "townhouse", "mixed_use", ...)
- excluded_property_types  array of strings (e.g. ["mobile_home", "land"])
- allowed_states           array of 2-letter state codes
- excluded_states          array of 2-letter state codes
- allowed_occupancy        array of strings ("non_owner_occupied", "owner_occupied")
- min_loan_amount          number (USD)
- max_loan_amount          number (USD)
- min_fico                 integer 300-850
- min_experience           integer (number of completed projects)
- max_ltv                  decimal 0-1 (e.g. 0.80 for 80% LTV)
- max_ltc                  decimal 0-1
- max_ltarv                decimal 0-1
- rural_allowed            boolean
- leverage_matrix          array of tier objects, each:
    { "loan_type": null | string, "property_type": null | string,
      "min_fico": int|null, "max_fico": int|null,
      "min_experience": int, "max_experience": int|null,
      "max_ltv": decimal|null, "max_ltc": decimal|null, "max_ltarv": decimal|null,
      "base_rate_bps": int, "base_points_bps": int, "sort_order": int }
- rate_adjusters           array of adjuster objects, each:
    { "name": string,
      "condition": { "field": string, "op": "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"between"|"in"|"not_in"|"is_true"|"is_false",
                     "value"?: any, "value_max"?: number },
      "rate_bps": int, "points_bps": int,
      "ltv_adjustment_pct": number, "ltc_adjustment_pct": number,
      "stackable"?: boolean }

Rules:
- Use decimals 0-1 for ratios (max_ltv, max_ltc, max_ltarv). NEVER percentages.
- Use basis points (bps) for rate / points (e.g. 9.25% rate → 925, 2 points → 200).
- Confidence:
  - "high" — the doc explicitly states the value with no ambiguity.
  - "medium" — the value is implied or you had to interpret a range.
  - "low" — you guessed from a generic statement; reviewer should check.
- If a value is absent from the doc, OMIT THE ROW (don't emit nulls or defaults).
- If a state list says "all states except X, Y" emit excluded_states with [X, Y]. If it says "X, Y, Z only", emit allowed_states.
- Return JSON only. No prose, no markdown fences.`;

export interface ExtractedCriterion {
  criteria_key: string;
  criteria_value: unknown;
  confidence?: "high" | "medium" | "low";
  // The known_key flag lets the UI surface "this row will affect
  // eligibility math" vs "this row is informational only".
  known_key?: boolean;
}

export interface ExtractionResult {
  rows: ExtractedCriterion[];
  raw_text: string;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string;
}

export async function extractInvestorCriteriaFromPdf(
  apiKey: string,
  pdfBuffer: Buffer,
): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: INVESTOR_EXTRACT_MODEL,
    // Investor PDFs commonly carry 20+ rows once leverage_matrix +
    // rate_adjusters are unpacked. Same Claude truncation class as
    // doc-ingest (b3bd964) — bumped defensively.
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const stopReason = response.stop_reason;
  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;

  // ROADMAP principle 11 — short-circuit on max_tokens. A truncated array
  // would still match the regex below but JSON.parse blows up; even when
  // it parses, the last row is missing fields. Caller sees an empty list
  // + the stop_reason in metadata so the UI can show "PDF too long, try
  // splitting" instead of "we extracted 0 criteria from your 80-page
  // term sheet."
  if (stopReason === "max_tokens") {
    return {
      rows: [],
      raw_text: text,
      stop_reason: stopReason,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: INVESTOR_EXTRACT_MODEL,
    };
  }

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (!arrMatch) {
    return {
      rows: [],
      raw_text: text,
      stop_reason: stopReason,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: INVESTOR_EXTRACT_MODEL,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrMatch[0]);
  } catch {
    return {
      rows: [],
      raw_text: text,
      stop_reason: stopReason,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: INVESTOR_EXTRACT_MODEL,
    };
  }

  const rows: ExtractedCriterion[] = Array.isArray(parsed)
    ? (parsed as ExtractedCriterion[])
        .filter(
          (r) =>
            r &&
            typeof r === "object" &&
            typeof r.criteria_key === "string" &&
            r.criteria_value !== undefined,
        )
        .map((r) => ({
          criteria_key: r.criteria_key,
          criteria_value: r.criteria_value,
          confidence: r.confidence,
          known_key: (KNOWN_KEYS as readonly string[]).includes(r.criteria_key),
        }))
    : [];

  return {
    rows,
    raw_text: text,
    stop_reason: stopReason,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    model: INVESTOR_EXTRACT_MODEL,
  };
}
