// AI judgment layer (Module 6 — AI UW Copilot risk read) — PulseClose port.
//
// Claude reads the sizing engine's numbers through Damon's deal-eval framework
// (sponsor / economics / market / structure / exit + deal-killers) plus the
// Wade Intel 5-concept lens and returns a structured risk read + a sizing
// stance. The AI narrates and judges deal STRUCTURE; it never picks the loan
// amount — the deterministic engine does (same discipline as the risk memo,
// where the deterministic tier overrides the AI rating).
//
// Privacy harness (CLAUDE.md cross-cutting principle 12 — every Claude
// consumer goes through it):
//   1. isAiEnabled(orgId) gate — fails CLOSED.
//   2. scrubPii() on the freeform qualitative context (SSN / phone / email).
//   3. token-redact known borrower / entity / property strings out of the
//      facts block before send; unredact the parsed response.
//   4. max_tokens 4096 + stop_reason truncation guard (principle 11).
//   5. Zod-validate the parsed JSON before persistence (a malformed model
//      response can't poison the column).
//
// Reasoning-heavy (deal-killer detection) → Opus 4.8.

import Anthropic from "@anthropic-ai/sdk";
import { isAiEnabled, AiDisabledError } from "@/lib/ai/check-enabled";
import { scrubPii } from "@/lib/ai/redact-pii";
import {
  buildRedactionMap,
  redact,
  unredactObject,
  findLeftoverTokens,
} from "@/lib/ai/redact";
import { parseUwJudgmentV1 } from "@/lib/schemas/jsonb";
import type { SizingInputs, SizingResult } from "./sizing";
import type { DealContext, JudgmentResult } from "./types";
import { buildFactsBlock } from "./facts";
import { getMacroContext } from "@/lib/macro/fred";

const DEFAULT_MODEL = "claude-opus-4-8";

const PROMPT = `You are an experienced bridge / CRE credit officer underwriting a value-add bridge loan. \
You have a completed loan-sizing analysis from a deterministic engine. Judge the deal the way a \
seasoned lender would, using TWO lenses:

1. The deal-eval framework — assess each of: sponsor, economics, market, structure, exit. For each, \
give a 1-2 sentence read, a severity (strength | neutral | concern | dealkiller), and any specific \
flags. Then list explicit DEAL-KILLERS separately (things that, by themselves, should kill or \
fundamentally re-structure the deal).
2. The Wade Intel 5-concept lens — read the deal as Subject (what the loan IS), Conditions (states \
required to advance), Tasks, Events, and Decisions (the human judgment gates). Keep this tight.

RULES:
- Use ONLY the figures provided for any number — never invent financials, values, or rates.
- The binding constraint is the story of the deal — name what it implies about leverage and risk.
- Sponsor and market are qualitative: assess them ONLY from the provided context. If a field says \
NOT PROVIDED, say so plainly and treat the missing diligence as itself a flag (you cannot clear a \
deal on a sponsor you know nothing about). Do not invent a track record, a market, or a thesis.
- If a MACRO CONTEXT block is present, use its regime + indicators to inform the market and exit \
dimensions (rate path, refinance/takeout availability, exit-cap and for-sale risk) and reference the \
regime explicitly in the memo. The macro figures are deterministic context — cite them, don't \
override or re-estimate them; if absent, don't speculate about the macro environment.
- Be a skeptic on deal-killers: thin development spread, going-in negative leverage (in-place debt \
yield or DSCR too low), exit-cap optimism (exit cap below going-in cap), ARV-dependence, or an \
unverifiable sponsor are the usual suspects — flag them when the numbers show them.
- Be concise and direct. No filler, no disclaimers, no "as an AI". The reader is a decision-maker.
- Some names may appear as [[TOKEN]] placeholders (e.g. [[BORROWER]], [[PROPERTY_1]]). Treat them \
as opaque identifiers and echo them verbatim where you reference that entity — do not guess the \
real name.
- Set the recommendation stance honestly: "pass" if a real deal-killer stands, \
"pursue-with-conditions" if flags are curable, "pursue" only if the deal is genuinely clean.

Return ONLY a JSON object (no markdown, no prose outside the JSON) with EXACTLY this shape:
{
  "headline": "one-line verdict",
  "framework": [
    { "dimension": "sponsor|economics|market|structure|exit", "severity": "strength|neutral|concern|dealkiller", "read": "1-2 sentences", "flags": ["..."] }
  ],
  "dealKillers": ["explicit kill flags, [] if none"],
  "fiveConcept": "the 5-concept lens read in 2-4 sentences",
  "recommendation": { "stance": "pursue|pursue-with-conditions|pass", "rationale": "1-2 sentences" },
  "memo": "a 4-8 sentence partner memo: the deal in a line, the binding constraint and what it means, the one or two things that most drive the decision, and the recommendation"
}
Include all five framework dimensions exactly once.

Here is the analysis:

{facts}`;

export interface JudgeUnderwritingArgs {
  orgId: string;
  inputs: SizingInputs;
  sizing: SizingResult;
  context?: DealContext;
  // Known PII strings to token-redact out of the facts block before send.
  redactNames?: {
    borrower_name?: string | null;
    entity_name?: string | null;
    property_address?: string | null;
  };
  model?: string;
}

// Returns the validated, unredacted judgment, or null on a recoverable failure
// (truncation / no JSON / schema mismatch) — the route maps null to a friendly
// "judgment unavailable, try again". Throws AiDisabledError when the org has AI
// turned off so the route can return AI_DISABLED.
export async function judgeUnderwriting(
  args: JudgeUnderwritingArgs,
): Promise<JudgmentResult | null> {
  if (!(await isAiEnabled(args.orgId))) throw new AiDisabledError();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set — skipping underwriting judgment");
    return null;
  }

  // Scrub SSN / phone / email from freeform lender context before it reaches
  // the facts block (these are not judgment targets).
  const scrubbedContext: DealContext | undefined = args.context
    ? {
        sponsor: args.context.sponsor ? scrubPii(args.context.sponsor).text : undefined,
        market: args.context.market ? scrubPii(args.context.market).text : undefined,
        businessPlan: args.context.businessPlan
          ? scrubPii(args.context.businessPlan).text
          : undefined,
        notes: args.context.notes ? scrubPii(args.context.notes).text : undefined,
      }
    : undefined;

  // Token-redact known borrower / entity / property strings out of the facts
  // block. Empty/short values are skipped by buildRedactionMap.
  const redactionMap = buildRedactionMap({
    borrower_name: args.redactNames?.borrower_name ?? "",
    entity_name: args.redactNames?.entity_name ?? "",
    guarantor_name: null,
    registered_agent: null,
    property_addresses: args.redactNames?.property_address
      ? [args.redactNames.property_address]
      : [],
    lender_names: [],
    gc_name: null,
    litigation_entity_names: [],
    sanctions_match_names: [],
  });

  // Macro overlay (FRED) — best-effort, non-PII, deterministic. Null when no
  // FRED_API_KEY or the fetch fails; the judgment then runs without it.
  const macro = await getMacroContext();

  const facts = buildFactsBlock(args.inputs, args.sizing, scrubbedContext, macro);
  const redactedPrompt = redact(PROMPT.replace("{facts}", facts), redactionMap);

  const client = new Anthropic({ apiKey });
  const model = args.model ?? DEFAULT_MODEL;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: redactedPrompt }],
    });

    // Truncation guard (principle 11) — a max_tokens stop produces broken JSON.
    if (response.stop_reason === "max_tokens") {
      console.error("Underwriting judgment truncated at max_tokens");
      return null;
    }

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Underwriting judgment did not return JSON");
      return null;
    }

    const rawParsed = JSON.parse(jsonMatch[0]);
    // Stamp model + schema_version before Zod validation (the model isn't asked
    // to emit them; they're ours to set).
    const { data: validated, error } = parseUwJudgmentV1({
      ...rawParsed,
      schema_version: 1,
      model: response.model,
    });
    if (error || !validated) {
      console.error("Underwriting judgment failed schema validation:", error?.message);
      return null;
    }

    // Reverse-redact every string leaf back to real names before returning.
    const unredacted = unredactObject(validated, redactionMap);
    const leftover = findLeftoverTokens(unredacted);
    if (leftover.length > 0) {
      console.warn(
        `Underwriting judgment left ${leftover.length} unmapped token(s):`,
        Array.from(new Set(leftover)).slice(0, 10),
      );
    }
    // Attach the deterministic macro overlay AFTER redaction (it carries no PII /
    // tokens) so the UI can show the indicator table as drill-down evidence
    // behind the memo's regime read.
    const result = unredacted as JudgmentResult;
    result.macro = macro;
    return result;
  } catch (err) {
    console.error("Underwriting judgment call failed:", err);
    return null;
  }
}
