// POST /api/share/[token]/extract-addresses — public endpoint gated by
// the share token. Accepts a borrower-uploaded file (PDF / Excel / CSV /
// txt) and uses Claude to extract a list of property addresses. The
// borrower then reviews the list before submitting through the existing
// /verify endpoint.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiDisabledError, requireAiEnabled } from "@/lib/ai/check-enabled";
import { scrubPii } from "@/lib/ai/redact-pii";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

const PROMPT = `Extract every U.S. property address from this document and return a JSON array of strings.

Each string should be a single normalized address with street + city + state + zip when available, e.g. "123 Main St, Sunnyvale, CA 94089". Skip mailing addresses for the borrower or lender — return only subject / collateral / portfolio property addresses.

Return JSON only. No prose, no markdown fences. Format: ["address1", "address2", ...]`;

async function spreadsheetToText(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const lines: string[] = [];
  wb.eachSheet((sheet) => {
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
  });
  return lines.join("\n");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid share token" }, { status: 400 });
  }

  const rl = checkRateLimit(`share-extract:${token}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Address extraction unavailable" }, { status: 503 });
  }

  // Confirm the token is valid (without exposing whose validation it is)
  const supabase = createAdminClient();
  const { data: validation } = await supabase
    .from("borrower_validations")
    .select("id, org_id")
    .eq("share_token", token)
    .maybeSingle();
  if (!validation) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  // The borrower's upload still routes through the LENDER's org policy —
  // if the lender disabled AI extraction, the borrower must paste manually.
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
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isExcel = /\.xlsx?$/i.test(file.name) || file.type.includes("spreadsheet") || file.type.includes("ms-excel");
  const isText = file.type === "text/csv" || file.type === "text/plain" || /\.(csv|txt)$/i.test(file.name);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let userContent: Anthropic.Messages.ContentBlockParam[];
  if (isPdf) {
    // PDFs go to Claude's native PDF support as base64. Pre-redaction
    // would require extracting text first and losing table structure.
    userContent = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      },
      { type: "text", text: PROMPT },
    ];
  } else if (isExcel) {
    const raw = await spreadsheetToText(buffer);
    const { text, counts } = scrubPii(raw);
    if (counts.ssn || counts.phone || counts.email) {
      console.info(`[share-extract] PII redacted from xlsx: ssn=${counts.ssn} phone=${counts.phone} email=${counts.email}`);
    }
    userContent = [{ type: "text", text: `Spreadsheet contents:\n\n${text}\n\n${PROMPT}` }];
  } else if (isText) {
    const { text, counts } = scrubPii(buffer.toString("utf-8"));
    if (counts.ssn || counts.phone || counts.email) {
      console.info(`[share-extract] PII redacted from text: ssn=${counts.ssn} phone=${counts.phone} email=${counts.email}`);
    }
    userContent = [{ type: "text", text: `Document contents:\n\n${text}\n\n${PROMPT}` }];
  } else {
    return NextResponse.json({ error: "Unsupported file format" }, { status: 415 });
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      // 4096 — parity with /api/ingest/borrower-doc. Borrower-uploaded xlsxs
      // can have 50+ addresses; the array of strings is more compact than
      // the full borrower-doc shape but the upper bound is similar.
      max_tokens: 4096,
      messages: [{ role: "user", content: userContent }],
    });
    // ROADMAP principle 11 — explicit truncation check before parse.
    // The doc-ingest bug class (b3bd964) was a max_tokens cutoff that
    // looked like a JSON parse failure; surface the real cause so the
    // borrower sees "split the file" instead of generic "parse_failed".
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json(
        {
          error: "truncated",
          message: "Document too long for one pass — try splitting into smaller files.",
        },
        { status: 422 },
      );
    }
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      // Don't return 200 with empty list — the borrower form silently
      // submitted nothing. 422 lets the UI show "We couldn't read this
      // document — try pasting addresses manually below."
      return NextResponse.json(
        { error: "no_addresses_found", message: "Could not parse addresses from document.", raw: text },
        { status: 422 },
      );
    }
    let arr: unknown;
    try {
      arr = JSON.parse(arrMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "parse_failed", message: "Document parsed but addresses didn't form valid JSON." },
        { status: 422 },
      );
    }
    if (!Array.isArray(arr)) {
      return NextResponse.json(
        { error: "unexpected_shape", message: "Address extraction returned a non-list shape." },
        { status: 422 },
      );
    }
    const addresses = (arr as unknown[]).map((s) => String(s).trim()).filter(Boolean);
    if (addresses.length === 0) {
      return NextResponse.json(
        { error: "empty_list", message: "No addresses found in the document." },
        { status: 422 },
      );
    }
    return NextResponse.json({ addresses });
  } catch (err) {
    console.error("Share-link address extraction failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 },
    );
  }
}
