// POST /api/ingest/borrower-doc — accepts a PDF, Excel, or CSV file and
// returns suggested validation form fields parsed by Claude. Lets the
// lender skip the form fill on doc-driven intake (Noah's "drop
// form-fill UX" direction per ROADMAP).

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiDisabledError, requireAiEnabled } from "@/lib/ai/check-enabled";
import { scrubPii } from "@/lib/ai/redact-pii";

export const maxDuration = 60;

// Vercel App Router caps request bodies at 4.5MB by default; values
// above that are unreachable. See upload-photo route for the path to
// raise this (signed direct-to-Supabase upload).
const MAX_BYTES = 4 * 1024 * 1024;
const SUPPORTED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

interface IngestResult {
  borrower_name: string | null;
  borrower_entity_name: string | null;
  entity_state: string | null;
  guarantor_name: string | null;
  gc_name: string | null;
  gc_license_number: string | null;
  gc_state: string | null;
  property_addresses: string[];
  notes: string | null;
}

const PROMPT = `You are extracting borrower-validation fields from a lender intake document. Pull the following fields and return JSON exactly matching this shape:

{
  "borrower_name": "string | null",          // Individual principal / guarantor — typically a person
  "borrower_entity_name": "string | null",   // The borrowing LLC / Corp / Trust
  "entity_state": "string | null",           // 2-letter state where the entity is registered (e.g. "CA")
  "guarantor_name": "string | null",         // Personal guarantor if different from borrower
  "gc_name": "string | null",                // General contractor name if specified
  "gc_license_number": "string | null",
  "gc_state": "string | null",
  "property_addresses": ["string", ...],     // Subject + collateral / track-record addresses listed in the doc
  "notes": "string | null"                   // Anything else worth flagging — loan amount, rehab budget, narrative
}

Rules:
- Return only fields you can confidently extract. Use null for missing fields, [] for missing addresses.
- entity_state must be the 2-letter postal code, uppercase.
- Don't invent data. If the doc has just an entity name with no obvious individual borrower, set borrower_name to null.
- property_addresses: include up to 50 addresses (downstream verifier caps at 50). Prefer current/active holdings + recent flips; truncate older entries if the doc lists more.
- Keep the "notes" field under 200 characters.
- Return JSON only. No prose, no markdown fences.`;

async function pdfToContentBlock(buffer: Buffer): Promise<Anthropic.Messages.DocumentBlockParam> {
  return {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: buffer.toString("base64"),
    },
  };
}

async function spreadsheetToText(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  // Cast to silence the Buffer<ArrayBufferLike> vs Buffer mismatch from
  // exceljs's older type defs.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const lines: string[] = [];
  wb.eachSheet((sheet) => {
    lines.push(`=== Sheet: ${sheet.name} ===`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v == null) cells.push("");
        else if (typeof v === "object" && "text" in v) cells.push(String((v as { text: unknown }).text ?? ""));
        else cells.push(String(v));
      });
      lines.push(cells.join("\t"));
    });
    lines.push("");
  });
  return lines.join("\n");
}

function csvToText(buffer: Buffer): string {
  // No CSV library — pass-through. Claude handles delimited text well.
  return buffer.toString("utf-8");
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`ingest:${profile.org_id}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI ingestion not configured" }, { status: 503 });
  }

  try {
    await requireAiEnabled(profile.org_id);
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
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  }
  if (file.type && !SUPPORTED.has(file.type) && !file.name.match(/\.(pdf|xlsx?|csv|txt)$/i)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || file.name}` }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isExcel = /\.xlsx?$/i.test(file.name) || file.type.includes("spreadsheet") || file.type.includes("ms-excel");
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  const isText = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let userContent: Anthropic.Messages.ContentBlockParam[];
  if (isPdf) {
    // PDFs ship as base64 to Claude's native PDF support; pre-extracting
    // text would lose table layout that drives address parsing. The
    // strict-mode answer here is the per-org AI toggle, not regex scrub.
    userContent = [
      await pdfToContentBlock(buffer),
      { type: "text", text: PROMPT },
    ];
  } else if (isExcel) {
    const raw = await spreadsheetToText(buffer);
    const { text, counts } = scrubPii(raw);
    if (counts.ssn || counts.phone || counts.email) {
      console.info(`[ingest] PII redacted from xlsx: ssn=${counts.ssn} phone=${counts.phone} email=${counts.email}`);
    }
    userContent = [{ type: "text", text: `Spreadsheet contents:\n\n${text}\n\n${PROMPT}` }];
  } else if (isCsv || isText) {
    const raw = csvToText(buffer);
    const { text, counts } = scrubPii(raw);
    if (counts.ssn || counts.phone || counts.email) {
      console.info(`[ingest] PII redacted from csv/txt: ssn=${counts.ssn} phone=${counts.phone} email=${counts.email}`);
    }
    userContent = [{ type: "text", text: `Document contents:\n\n${text}\n\n${PROMPT}` }];
  } else {
    return NextResponse.json({ error: "Unsupported file format" }, { status: 415 });
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      // 4096 fits ~50 addresses + the rest of the shape comfortably.
      // Was 1024 — too tight for real intake xlsxs (Truong's has 50+ rows
      // across Active/Track-Record/Re-Writes sheets) which cut JSON
      // mid-array and surfaced as "Could not parse extraction response".
      max_tokens: 4096,
      messages: [{ role: "user", content: userContent }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const stopReason = response.stop_reason;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Borrower doc ingest — no JSON match", {
        stopReason,
        textLength: text.length,
        textPreview: text.slice(0, 500),
      });
      return NextResponse.json(
        {
          error: stopReason === "max_tokens"
            ? "Document too large — Claude truncated the response. Try a smaller subset of the file or fill the form manually."
            : "Could not parse extraction response",
          raw: text,
          stop_reason: stopReason,
        },
        { status: 502 },
      );
    }
    let parsed: IngestResult;
    try {
      parsed = JSON.parse(jsonMatch[0]) as IngestResult;
    } catch (parseErr) {
      console.error("Borrower doc ingest — JSON parse failed", {
        stopReason,
        textLength: text.length,
        parseErr: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return NextResponse.json(
        {
          error: stopReason === "max_tokens"
            ? "Document too large — Claude truncated the response. Try a smaller subset of the file or fill the form manually."
            : "Could not parse extraction response (invalid JSON)",
          raw: text,
          stop_reason: stopReason,
        },
        { status: 502 },
      );
    }
    // Normalize state codes
    if (parsed.entity_state) parsed.entity_state = parsed.entity_state.toUpperCase().slice(0, 2);
    if (parsed.gc_state) parsed.gc_state = parsed.gc_state.toUpperCase().slice(0, 2);
    // Defensively cap addresses at 50 (downstream verifier limit) so a
    // long extraction doesn't blow past MAX_ADDRESSES on the next leg.
    if (Array.isArray(parsed.property_addresses) && parsed.property_addresses.length > 50) {
      parsed.property_addresses = parsed.property_addresses.slice(0, 50);
    }
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Borrower doc ingest failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}
