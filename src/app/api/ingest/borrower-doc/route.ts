// POST /api/ingest/borrower-doc — accepts a PDF, Excel, or CSV file and
// returns suggested validation form fields parsed by Claude. Lets the
// lender skip the form fill on doc-driven intake (Noah's "drop
// form-fill UX" direction per ROADMAP).

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiDisabledError, requireAiEnabled } from "@/lib/ai/check-enabled";
import { scrubPii } from "@/lib/ai/redact-pii";

export const maxDuration = 60;

// Two upload paths:
//  - Multipart (legacy / small files): the file rides in the request body,
//    which Vercel caps at ~4.5MB — so MULTIPART_MAX stays under that.
//  - storage_path (direct-to-Supabase): the browser uploads straight to the
//    documents bucket (bounded by the bucket's 50MB limit, not Vercel), then
//    sends just the path here. The server reads it via the admin client. This
//    is how real ICC packages (5–8MB) + appraisals get in (finding #26).
const MULTIPART_MAX = 4 * 1024 * 1024;
// Claude's PDF request cap is 32MB; base64 inflates ~33%, so guard the raw
// buffer well under that. xlsx/csv convert to text, so size is irrelevant there.
const CLAUDE_PDF_MAX = 24 * 1024 * 1024;
const STORAGE_BUCKET = "documents";
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
  // Underwriting values from the loan package / pro-forma. These are
  // appraisal/package data that is NEVER pullable from an API (calibration
  // hard boundary) — ingesting them here is the only way to pre-fill the
  // sizing workbench instead of re-keying. Numbers in plain USD (no $/commas).
  loan_amount: number | null;
  purchase_price: number | null;   // acquisition / land cost
  as_is_value: number | null;      // appraised as-is (refi) if distinct from purchase
  arv: number | null;              // after-repair / completed value
  rehab_budget: number | null;     // construction / renovation budget
  fico: number | null;
  property_type: string | null;    // sfr | condo | multifamily | mixed_use | land | other
  loan_purpose: string | null;     // purchase | refinance | construction | bridge
  notes: string | null;
}

const PROMPT = `You are extracting loan-intake fields from a lender's borrower package (loan request, 1003, pro-forma, or track-record sheet). Pull the following fields and return JSON exactly matching this shape:

{
  "borrower_name": "string | null",          // Individual principal / guarantor — typically a person
  "borrower_entity_name": "string | null",   // The borrowing LLC / Corp / Trust (the vesting entity)
  "entity_state": "string | null",           // 2-letter state where the entity is registered (e.g. "CA")
  "guarantor_name": "string | null",         // Personal guarantor if different from borrower
  "gc_name": "string | null",                // General contractor name if specified
  "gc_license_number": "string | null",
  "gc_state": "string | null",
  "property_addresses": ["string", ...],     // Subject + collateral / track-record addresses listed in the doc
  "loan_amount": number | null,              // Requested / proposed loan amount, USD
  "purchase_price": number | null,           // Acquisition or land cost (cost basis), USD
  "as_is_value": number | null,              // Appraised AS-IS value (refinance), USD — null if same as purchase
  "arv": number | null,                      // After-repair / completed / exit value, USD
  "rehab_budget": number | null,             // Construction or renovation budget, USD
  "fico": number | null,                     // Borrower credit score (a single number, e.g. 731)
  "property_type": "string | null",          // one of: sfr | condo | multifamily | mixed_use | land | other
  "loan_purpose": "string | null",           // one of: purchase | refinance | construction | bridge
  "notes": "string | null"                   // Anything else worth flagging in <200 chars
}

Rules:
- Return only fields you can confidently extract. Use null for missing fields, [] for missing addresses.
- entity_state must be the 2-letter postal code, uppercase.
- All monetary fields are PLAIN NUMBERS in USD — no "$", no commas, no text. E.g. 4239490 not "$4,239,490".
- fico is a single integer; if a range like "740+" appears, use the floor (740).
- property_type / loan_purpose must be one of the listed lowercase values, else null.
- Don't invent data. If the doc has just an entity name with no obvious individual borrower, set borrower_name to null.
- property_addresses: include up to 50 addresses (downstream verifier caps at 50). Prefer current/active holdings + recent flips; truncate older entries if the doc lists more.
- Do NOT extract Social Security numbers, dates of birth, or other personal identifiers — they are not needed here.
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

  const rl = await checkRateLimit(`ingest:${profile.org_id}`, 10, 60_000);
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

  // Acquire the file via whichever path the client used. JSON body with a
  // storage_path = the direct-to-Supabase upload (real packages); multipart
  // form = the legacy small-file path.
  let buffer: Buffer;
  let fileName: string;
  let fileType: string;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { storage_path?: string; filename?: string; content_type?: string } | null;
    const storagePath = body?.storage_path;
    if (!storagePath) {
      return NextResponse.json({ error: "No storage_path provided" }, { status: 400 });
    }
    // IDOR defense: the path must live under THIS user's ingest prefix. The
    // browser uploads to `ingest-tmp/{user_id}/...`; reject anything else so a
    // user can't point the admin reader at another user's/org's objects.
    if (!storagePath.startsWith(`ingest-tmp/${profile.id}/`)) {
      return NextResponse.json({ error: "Invalid storage path" }, { status: 403 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(storagePath);
    // Read into memory, then delete the temp object immediately — we never need
    // it again, so there's no cleanup to thread through the later return paths.
    void admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    if (error || !data) {
      return NextResponse.json({ error: `Could not read uploaded file: ${error?.message ?? "not found"}` }, { status: 404 });
    }
    buffer = Buffer.from(await data.arrayBuffer());
    fileName = body?.filename ?? "upload";
    fileType = body?.content_type ?? data.type ?? "";
  } else {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MULTIPART_MAX) {
      return NextResponse.json({ error: `File too large for direct upload (max ${MULTIPART_MAX / 1024 / 1024}MB) — use the drop zone, which uploads larger files to storage.` }, { status: 413 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
    fileType = file.type;
  }

  if (fileType && !SUPPORTED.has(fileType) && !fileName.match(/\.(pdf|xlsx?|csv|txt)$/i)) {
    return NextResponse.json({ error: `Unsupported file type: ${fileType || fileName}` }, { status: 415 });
  }

  const isPdf = fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isExcel = /\.xlsx?$/i.test(fileName) || fileType.includes("spreadsheet") || fileType.includes("ms-excel");
  const isCsv = /\.csv$/i.test(fileName) || fileType === "text/csv";
  const isText = fileType === "text/plain" || fileName.toLowerCase().endsWith(".txt");

  // Claude caps PDFs at 32MB/request; guard the raw buffer. (xlsx/csv become
  // text, so they're exempt.)
  if (isPdf && buffer.length > CLAUDE_PDF_MAX) {
    return NextResponse.json(
      { error: `PDF too large for AI extraction (${(buffer.length / 1024 / 1024).toFixed(0)}MB; max ${CLAUDE_PDF_MAX / 1024 / 1024}MB). Split it, or upload the loan-request spreadsheet instead.` },
      { status: 413 },
    );
  }

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
      model: "claude-sonnet-4-6",
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
    // Coerce monetary/numeric fields defensively — Claude occasionally returns
    // "$4,239,490" or "740+" despite the prompt. Strip to a clean number or null.
    const toNum = (v: unknown): number | null => {
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string") {
        const n = Number(v.replace(/[^0-9.]/g, ""));
        return Number.isFinite(n) && n > 0 ? n : null;
      }
      return null;
    };
    parsed.loan_amount = toNum(parsed.loan_amount);
    parsed.purchase_price = toNum(parsed.purchase_price);
    parsed.as_is_value = toNum(parsed.as_is_value);
    parsed.arv = toNum(parsed.arv);
    parsed.rehab_budget = toNum(parsed.rehab_budget);
    parsed.fico = toNum(parsed.fico);
    // Constrain enums to known values (else null) so downstream selects don't break.
    const PROP_TYPES = new Set(["sfr", "condo", "multifamily", "mixed_use", "land", "other"]);
    const PURPOSES = new Set(["purchase", "refinance", "construction", "bridge"]);
    parsed.property_type = parsed.property_type && PROP_TYPES.has(parsed.property_type.toLowerCase())
      ? parsed.property_type.toLowerCase() : null;
    parsed.loan_purpose = parsed.loan_purpose && PURPOSES.has(parsed.loan_purpose.toLowerCase())
      ? parsed.loan_purpose.toLowerCase() : null;
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
