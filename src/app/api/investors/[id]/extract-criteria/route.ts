// POST /api/investors/[id]/extract-criteria — A1.
// Accepts a PDF (and only a PDF for v1 — fund underwriting guidelines
// arrive as PDFs in practice; xlsx/csv would extend the same shape).
// Stores the file via the universal documents helper, calls Claude,
// persists the raw extraction in investor_criteria_extractions, and
// returns the proposed rows for the modal preview. The actual save
// (supersede + insert into investor_criteria) happens in the sibling
// route POST /api/investors/[id]/criteria/from-extraction once the user
// accepts.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiDisabledError, requireAiEnabled } from "@/lib/ai/check-enabled";
import { storeDocument } from "@/lib/documents/store";
import { extractInvestorCriteriaFromPdf } from "@/lib/investors/extract";
import { emitActivity } from "@/lib/events/emit";

export const maxDuration = 60;

// Vercel App Router caps request bodies at 4.5MB by default; investor
// PDFs above that need to be split or routed via signed direct-to-
// Supabase upload (not implemented yet — track in pickup.md if it
// becomes a real constraint).
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`investor-extract:${profile.org_id}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI extraction not configured" },
      { status: 503 },
    );
  }

  // Per-org strict-mode toggle — first new Claude consumer post-bundle.
  // If this fires, returns 503 with code AI_DISABLED so the modal can
  // show "AI is off — paste criteria into the textarea instead".
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

  const supabase = createAdminClient();

  // Confirm investor belongs to caller's org (RLS would block the insert
  // anyway but a 404 reads cleaner than a 500).
  const { data: investor } = await supabase
    .from("investors")
    .select("id, display_name")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!investor) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
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
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json(
      { error: "PDF only for v1. Convert your guidelines to PDF and try again." },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Persist the file BEFORE the Claude call so a Claude failure still
  // leaves an auditable upload (lender can re-extract without re-uploading).
  let stored;
  try {
    stored = await storeDocument(supabase, {
      orgId: profile.org_id,
      uploadedByUserId: profile.id,
      buffer,
      mimeType: "application/pdf",
      fileSizeBytes: buffer.length,
      originalFilename: file.name,
      purpose: "investor_pdf",
      relatedEntityType: "investor",
      relatedEntityId: investor.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Document storage failed" },
      { status: 500 },
    );
  }

  let extraction;
  try {
    extraction = await extractInvestorCriteriaFromPdf(
      process.env.ANTHROPIC_API_KEY,
      buffer,
    );
  } catch (err) {
    console.error("Investor PDF extraction failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 },
    );
  }

  if (extraction.rows.length === 0) {
    // Persist the failure trace so we can debug from logs.
    await supabase.from("investor_criteria_extractions").insert({
      investor_id: investor.id,
      org_id: profile.org_id,
      document_id: stored.id,
      raw_extraction: { raw_text: extraction.raw_text, rows: [] },
      claude_model: extraction.model,
      input_tokens: extraction.input_tokens,
      output_tokens: extraction.output_tokens,
      stop_reason: extraction.stop_reason,
    });
    return NextResponse.json(
      {
        error:
          extraction.stop_reason === "max_tokens"
            ? "Document too large — Claude truncated the response. Try a smaller PDF or split the guidelines doc."
            : "Could not extract criteria from this document. Try a different PDF or paste the criteria manually.",
        stop_reason: extraction.stop_reason,
      },
      { status: 422 },
    );
  }

  const { data: extractionRow, error: extractionErr } = await supabase
    .from("investor_criteria_extractions")
    .insert({
      investor_id: investor.id,
      org_id: profile.org_id,
      document_id: stored.id,
      raw_extraction: { rows: extraction.rows },
      claude_model: extraction.model,
      input_tokens: extraction.input_tokens,
      output_tokens: extraction.output_tokens,
      stop_reason: extraction.stop_reason,
    })
    .select("id")
    .single();
  if (extractionErr || !extractionRow) {
    return NextResponse.json(
      { error: extractionErr?.message ?? "Failed to persist extraction" },
      { status: 500 },
    );
  }

  // Activity emission is best-effort. The extraction is the main artifact.
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "extracted_investor_criteria",
    subjectType: "investor",
    subjectId: investor.id,
    metadata: {
      extraction_id: extractionRow.id,
      document_id: stored.id,
      row_count: extraction.rows.length,
      stop_reason: extraction.stop_reason,
      model: extraction.model,
      stage: "extracted",
    },
  });

  return NextResponse.json({
    extraction_id: extractionRow.id,
    document_id: stored.id,
    rows: extraction.rows,
    stop_reason: extraction.stop_reason,
    model: extraction.model,
  });
}
