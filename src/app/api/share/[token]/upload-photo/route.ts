// POST /api/share/[token]/upload-photo — borrower uploads a property
// photo. Server extracts EXIF GPS + timestamp + camera model
// (deterministic), runs a Claude vision check on the image, and
// records both verdicts on property_photo_verifications. The photo
// itself goes through the universal documents/storage layer.
//
// Vision check answers ONE question: does this look like a U.S.
// property photo, or is it likely stock / synthetic / unrelated? It
// doesn't try to match the photo to a specific address — that's
// out of scope (would need a geocoding adapter + image-to-address
// search).

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiDisabledError, requireAiEnabled } from "@/lib/ai/check-enabled";
import { storeDocument } from "@/lib/documents/store";
import { extractExif, haversineMeters } from "@/lib/photo/exif";

export const maxDuration = 60;
// Vercel App Router caps request bodies at 4.5MB by default; the in-code
// 15MB previously was unreachable (Vercel rejected first with a confusing
// 413/500). Lowered to a value the platform actually accepts so users get
// a clean error. To raise this we'd switch to signed direct-to-Supabase
// upload — track in pickup.md if real photos start exceeding 4MB.
const MAX_BYTES = 4 * 1024 * 1024;

const PROMPT = `Look at this image. Decide which category it falls into and return JSON only.

Categories:
- plausible_property: a photo of a real U.S. residential or small commercial property exterior or under-construction site
- stock_or_synthetic: stock image, AI-generated, screenshot of a listing site, screenshot of a map
- indoor_only: only the interior of a property (no exterior context — usable but lower-confidence)
- unknown: not enough to tell

Return: {"verdict": "<category>", "notes": "<one short sentence on what you see>"}`;

interface VisionResult {
  verdict: "plausible_property" | "stock_or_synthetic" | "indoor_only" | "unknown";
  notes: string;
}

function asMimeFromExt(name: string, fallback: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return (fallback as "image/jpeg" | "image/png" | "image/webp" | "image/gif") || "image/jpeg";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid share token" }, { status: 400 });
  }

  const rl = await checkRateLimit(`share-photo:${token}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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

  const form = await request.formData();
  const file = form.get("file");
  const propertyIdRaw = (form.get("property_id") as string | null) || null;
  const propertyLatRaw = form.get("property_lat") as string | null;
  const propertyLngRaw = form.get("property_lng") as string | null;
  const propertyLat = propertyLatRaw ? Number(propertyLatRaw) : null;
  const propertyLng = propertyLngRaw ? Number(propertyLngRaw) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  // IDOR defense: the share token authenticates the borrower, but the
  // form-supplied property_id is attacker-controlled. Verify it belongs
  // to the same org as the validation; without this an attacker who
  // guessed a share token could attach photos to a property in another
  // org via the admin client (which bypasses RLS). validation.id stays
  // as the safe default if the supplied property_id doesn't validate.
  let propertyId: string | null = null;
  if (propertyIdRaw) {
    const { data: prop } = await supabase
      .from("properties")
      .select("id")
      .eq("id", propertyIdRaw)
      .eq("org_id", validation.org_id)
      .maybeSingle();
    if (!prop) {
      return NextResponse.json({ error: "Property not in this org" }, { status: 400 });
    }
    propertyId = prop.id;
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  // EXIF — runs offline, no AI gate needed for this step.
  const exif = extractExif(buffer);

  // Persist the photo via the universal documents layer first so we have
  // a document_id even if vision later fails.
  const mediaTypeForStore = asMimeFromExt(file.name, file.type || "image/jpeg");
  const stored = await storeDocument(supabase, {
    orgId: validation.org_id,
    uploadedByUserId: null,
    shareToken: token,
    buffer,
    mimeType: mediaTypeForStore,
    fileSizeBytes: buffer.length,
    originalFilename: file.name,
    purpose: "photo_verification",
    relatedEntityType: propertyId ? "property" : "validation",
    relatedEntityId: propertyId ?? validation.id,
  });

  // AI gate; if disabled we still record the EXIF row + photo (skip
  // vision verdict).
  let vision: VisionResult | null = null;
  let visionInputTokens: number | null = null;
  let visionOutputTokens: number | null = null;
  let aiAvailable = true;
  try {
    await requireAiEnabled(validation.org_id);
  } catch (err) {
    if (err instanceof AiDisabledError) {
      aiAvailable = false;
    } else {
      throw err;
    }
  }

  if (aiAvailable && process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const mediaType = asMimeFromExt(file.name, file.type);
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        // 4096 per ROADMAP principle 11 (truncation defense). The
        // verdict + notes shape is short but giving headroom is cheap.
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      });
      visionInputTokens = response.usage?.input_tokens ?? null;
      visionOutputTokens = response.usage?.output_tokens ?? null;
      // ROADMAP principle 11 — explicit truncation check. The regex
      // pattern below would happily match truncated JSON with the trailing
      // brace cut off; better to surface "model truncated" and skip the
      // verdict than persist a malformed verdict.
      if (response.stop_reason === "max_tokens") {
        console.warn("[upload-photo] vision response truncated; skipping verdict");
      } else {
        const text = response.content[0]?.type === "text" ? response.content[0].text : "";
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            const parsed = JSON.parse(m[0]) as { verdict?: string; notes?: string };
            const verdict = ["plausible_property", "stock_or_synthetic", "indoor_only", "unknown"].includes(
              parsed.verdict ?? "",
            )
              ? (parsed.verdict as VisionResult["verdict"])
              : "unknown";
            vision = {
              verdict,
              notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 500) : "",
            };
          } catch {
            // Truncated-but-not-flagged JSON, malformed model output, etc.
            // Skip the verdict; EXIF + photo still persist.
            console.warn("[upload-photo] vision JSON parse failed");
          }
        }
      }
    } catch (err) {
      console.warn("[upload-photo] vision check failed:", err);
    }
  }

  // Distance from address geocode, if both sides have coordinates.
  let distanceM: number | null = null;
  if (
    exif.lat != null &&
    exif.lng != null &&
    propertyLat != null &&
    propertyLng != null &&
    Number.isFinite(propertyLat) &&
    Number.isFinite(propertyLng)
  ) {
    distanceM = haversineMeters(exif.lat, exif.lng, propertyLat, propertyLng);
  }

  const { data: row, error } = await supabase
    .from("property_photo_verifications")
    .insert({
      validation_id: validation.id,
      property_id: propertyId,
      document_id: stored.id,
      org_id: validation.org_id,
      exif_lat: exif.lat,
      exif_lng: exif.lng,
      exif_timestamp: exif.timestamp,
      exif_camera_model: exif.camera_model,
      vision_verdict: vision?.verdict ?? null,
      vision_notes: vision?.notes ?? null,
      vision_input_tokens: visionInputTokens,
      vision_output_tokens: visionOutputTokens,
      distance_from_property_m: distanceM,
    })
    .select("id, exif_lat, exif_lng, vision_verdict, distance_from_property_m")
    .single<{
      id: string;
      exif_lat: number | null;
      exif_lng: number | null;
      vision_verdict: string | null;
      distance_from_property_m: number | null;
    }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    verification: row,
    document_id: stored.id,
    ai_skipped: !aiAvailable,
  });
}
