// POST /api/share/[token]/extract-bank-statement — public endpoint
// gated by share token. Borrower uploads a bank statement (PDF or
// PDF-rendered image), Claude extracts ending balance / NSF count /
// monthly inflow + outflow / period, persisted to
// bank_statement_summaries with a 90-day expiry per ROADMAP privacy
// posture.
//
// AI privacy bundle: requireAiEnabled gate (per-org), PII scrub for
// any text-derived input. PDFs ride the per-org toggle as a unit
// because pre-extracting text would lose the column structure.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiDisabledError, requireAiEnabled } from "@/lib/ai/check-enabled";
import { scrubPii } from "@/lib/ai/redact-pii";

export const maxDuration = 60;
const MAX_BYTES = 15 * 1024 * 1024;

const PROMPT = `Extract a structured summary from this bank statement. Return JSON only — no prose, no markdown fences.

Numbers in DOLLARS (not cents). Dates as ISO YYYY-MM-DD. Use null for any field you cannot confidently extract.

{
  "ending_balance": <number | null>,
  "avg_daily_balance": <number | null>,
  "monthly_inflow": <number | null>,        // sum of credits during the period
  "monthly_outflow": <number | null>,        // sum of debits during the period (positive number)
  "nsf_count": <integer | null>,             // count of NSF / overdraft / returned-item events
  "statement_period_start": "<YYYY-MM-DD or null>",
  "statement_period_end":   "<YYYY-MM-DD or null>"
}

If multiple statements appear concatenated, pick the most recent. Treat any account holder name as PII — do NOT echo it back.`;

interface Extracted {
  ending_balance: number | null;
  avg_daily_balance: number | null;
  monthly_inflow: number | null;
  monthly_outflow: number | null;
  nsf_count: number | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  return null;
}
function asDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid share token" }, { status: 400 });
  }

  const rl = checkRateLimit(`share-bank:${token}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Bank statement parsing unavailable" },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, org_id")
    .eq("share_token", token)
    .maybeSingle();
  if (!validation) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  try {
    await requireAiEnabled(validation.org_id);
  } catch (err) {
    if (err instanceof AiDisabledError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 503 },
      );
    }
    throw err;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText = file.type === "text/csv" || file.type === "text/plain" || /\.(csv|txt)$/i.test(file.name);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let userContent: Anthropic.Messages.ContentBlockParam[];
  if (isPdf) {
    userContent = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      },
      { type: "text", text: PROMPT },
    ];
  } else if (isText) {
    const { text, counts } = scrubPii(buffer.toString("utf-8"));
    if (counts.ssn || counts.phone || counts.email) {
      console.info(
        `[bank-statement] PII redacted from text: ssn=${counts.ssn} phone=${counts.phone} email=${counts.email}`,
      );
    }
    userContent = [{ type: "text", text: `Statement contents:\n\n${text}\n\n${PROMPT}` }];
  } else {
    return NextResponse.json(
      { error: "Unsupported file format — upload a PDF or CSV/text statement." },
      { status: 415 },
    );
  }

  let parsed: Extracted;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [{ role: "user", content: userContent }],
    });
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json(
        {
          error: "truncated",
          message: "Document too large — Claude truncated. Try a single statement at a time.",
        },
        { status: 422 },
      );
    }
    inputTokens = response.usage?.input_tokens ?? null;
    outputTokens = response.usage?.output_tokens ?? null;

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (!objMatch) {
      return NextResponse.json(
        { error: "no_summary_found", message: "Could not parse a summary from the document." },
        { status: 422 },
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(objMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "parse_failed", message: "Summary didn't form valid JSON." },
        { status: 422 },
      );
    }
    const r = (raw ?? {}) as Record<string, unknown>;
    parsed = {
      ending_balance: asNum(r.ending_balance),
      avg_daily_balance: asNum(r.avg_daily_balance),
      monthly_inflow: asNum(r.monthly_inflow),
      monthly_outflow: asNum(r.monthly_outflow),
      nsf_count: asInt(r.nsf_count),
      statement_period_start: asDate(r.statement_period_start),
      statement_period_end: asDate(r.statement_period_end),
    };
  } catch (err) {
    console.error("Bank statement extraction failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 },
    );
  }

  // Persist as cents for integer arithmetic; numbers stay null when
  // unextractable.
  const { data: row, error } = await supabase
    .from("bank_statement_summaries")
    .insert({
      validation_id: validation.id,
      org_id: validation.org_id,
      ending_balance_cents:
        parsed.ending_balance != null ? Math.round(parsed.ending_balance * 100) : null,
      avg_daily_balance_cents:
        parsed.avg_daily_balance != null ? Math.round(parsed.avg_daily_balance * 100) : null,
      monthly_inflow_cents:
        parsed.monthly_inflow != null ? Math.round(parsed.monthly_inflow * 100) : null,
      monthly_outflow_cents:
        parsed.monthly_outflow != null ? Math.round(parsed.monthly_outflow * 100) : null,
      nsf_count: parsed.nsf_count,
      statement_period_start: parsed.statement_period_start,
      statement_period_end: parsed.statement_period_end,
      raw_extraction: parsed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    summary_id: row.id,
    summary: parsed,
  });
}
