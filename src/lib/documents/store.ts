// Universal document storage helper. Uploads a file to Supabase storage
// (the `documents` bucket created by 00017) and inserts a row into the
// `documents` table.
//
// Every feature that handles user uploads (borrower share-link, lender
// doc ingest, photo verification, bank statements, investor PDFs, generated
// handoff/methodology PDFs) goes through this function. No per-feature
// file tables, no scattered storage calls.

import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentPurpose =
  | "borrower_doc_intake"
  | "borrower_share_upload"
  | "photo_verification"
  | "bank_statement"
  | "investor_pdf"
  | "handoff_artifact"
  | "inbox_submission"
  | "borrower_capital_summary"
  | "risk_methodology"
  | "other";

export type RelatedEntityType =
  | "borrower"
  | "property"
  | "validation"
  | "investor"
  | "monitor_run"
  | "deal_evaluation";

export interface StoreDocumentInput {
  orgId: string;
  uploadedByUserId: string | null;
  shareToken?: string | null;
  buffer: Buffer | ArrayBuffer | Uint8Array;
  mimeType: string;
  fileSizeBytes: number;
  originalFilename?: string | null;
  purpose: DocumentPurpose;
  relatedEntityType?: RelatedEntityType | null;
  relatedEntityId?: string | null;
  // Privacy-sensitive defaults (bank_statement → 90 days). Pass null to
  // override (e.g. a handoff_artifact lives forever).
  expiresAt?: Date | null;
}

export interface StoredDocument {
  id: string;
  storage_path: string;
}

const BUCKET = "documents";

const DEFAULT_EXPIRY_DAYS: Partial<Record<DocumentPurpose, number>> = {
  bank_statement: 90,
  inbox_submission: 30,  // delete forwarded emails after 30d
};

function pickExpiresAt(input: StoreDocumentInput): Date | null {
  if (input.expiresAt !== undefined) return input.expiresAt;
  const days = DEFAULT_EXPIRY_DAYS[input.purpose];
  if (!days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function buildStoragePath(input: StoreDocumentInput, documentId: string): string {
  // org_id/purpose/yyyy-mm-dd/document_id_filename.ext
  const date = new Date().toISOString().slice(0, 10);
  const safeName = (input.originalFilename ?? "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
  return `${input.orgId}/${input.purpose}/${date}/${documentId}_${safeName}`;
}

/**
 * Upload + record a document. Returns the inserted row's id and storage path.
 * On any failure, the partial state is cleaned up so callers don't leak
 * orphan storage objects or DB rows.
 */
export async function storeDocument(
  supabase: SupabaseClient,
  input: StoreDocumentInput,
): Promise<StoredDocument> {
  // Pre-allocate an id so the storage path can include it (idempotent under retry).
  const { data: idRow, error: idErr } = await supabase
    .from("documents")
    .insert({
      org_id: input.orgId,
      uploaded_by_user_id: input.uploadedByUserId,
      share_token: input.shareToken ?? null,
      storage_bucket: BUCKET,
      storage_path: "pending",  // overwritten below
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      original_filename: input.originalFilename ?? null,
      purpose: input.purpose,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      expires_at: pickExpiresAt(input)?.toISOString() ?? null,
    })
    .select("id")
    .single();

  if (idErr || !idRow) {
    throw new Error(`storeDocument: row insert failed — ${idErr?.message ?? "unknown"}`);
  }

  const storagePath = buildStoragePath(input, idRow.id);

  // Upload to storage. The DOM Blob type wants BlobPart (ArrayBuffer, an
  // ArrayBufferView<ArrayBuffer>, etc.). Node's Buffer / SharedArrayBuffer
  // don't match strictly under strict TS lib settings, so coerce through
  // unknown — runtime is fine, types just over-narrow.
  const body = new Blob([input.buffer as unknown as BlobPart], { type: input.mimeType });

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, body, {
      contentType: input.mimeType,
      upsert: false,
    });

  if (uploadErr) {
    // Roll back the row insert — orphan rows confuse storage RLS.
    await supabase.from("documents").delete().eq("id", idRow.id);
    throw new Error(`storeDocument: storage upload failed — ${uploadErr.message}`);
  }

  // Patch storage_path with the real value
  const { error: patchErr } = await supabase
    .from("documents")
    .update({ storage_path: storagePath })
    .eq("id", idRow.id);

  if (patchErr) {
    // Best-effort cleanup
    await supabase.storage.from(BUCKET).remove([storagePath]);
    await supabase.from("documents").delete().eq("id", idRow.id);
    throw new Error(`storeDocument: path update failed — ${patchErr.message}`);
  }

  return { id: idRow.id, storage_path: storagePath };
}

/**
 * Generate a short-lived signed URL for downloading a stored document.
 * RLS still gates whether the caller's session can read the documents row;
 * the signed URL bypasses object-level RLS for the lifetime of the URL.
 */
export async function getDocumentDownloadUrl(
  supabase: SupabaseClient,
  documentId: string,
  expirySeconds = 60,
): Promise<string | null> {
  const { data: doc, error: rowErr } = await supabase
    .from("documents")
    .select("storage_bucket, storage_path")
    .eq("id", documentId)
    .single();
  if (rowErr || !doc) return null;

  const { data, error } = await supabase.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, expirySeconds);

  if (error || !data) return null;
  return data.signedUrl;
}
