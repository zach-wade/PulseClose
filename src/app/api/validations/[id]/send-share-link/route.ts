// POST /api/validations/[id]/send-share-link
// Generates (or reuses) a share token, then emails the borrower the URL
// via Resend. Closes G3.2 — until this shipped, the lender had to copy
// the link out of the UI and paste it into their own email client; the
// share-link mechanism existed but had no outbound CTA.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/get-user-profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/resend";
import { emitActivity } from "@/lib/events/emit";
import { randomBytes } from "crypto";

interface SendBody {
  recipient_email: string;
  recipient_name?: string;
  custom_message?: string;
}

// Loose email regex — same shape as handoff body validation. Anything stricter
// rejects valid edge cases (apostrophes, plus-tags). Resend rejects truly
// invalid addresses on send.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate-limit per-org so a malicious key doesn't spam borrowers via Resend.
  const rl = checkRateLimit(`send-share-link:${profile.org_id}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  const body = (await request.json()) as SendBody;
  const recipient = (body.recipient_email ?? "").trim();
  if (!recipient || !EMAIL_RE.test(recipient)) {
    return NextResponse.json(
      { error: "Valid recipient_email required" },
      { status: 400 },
    );
  }

  const customMessage = (body.custom_message ?? "").trim().slice(0, 1000);
  const recipientName = (body.recipient_name ?? "").trim().slice(0, 200);

  const supabase = createAdminClient();

  const { data: validation, error: vErr } = await supabase
    .from("borrower_validations")
    .select("id, org_id, borrower_name, borrower_entity_name, share_token")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .single();

  if (vErr || !validation) {
    return NextResponse.json({ error: "Validation not found" }, { status: 404 });
  }

  // Fetch the sender's display name for the email signature. Prefer the
  // user metadata that the auth flow already populates; fall back to email.
  const { data: senderRow } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("id", profile.id)
    .maybeSingle();
  const senderDisplayName =
    senderRow?.full_name?.trim() || senderRow?.email?.split("@")[0] || "your lender";

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.org_id)
    .maybeSingle();
  const orgName = orgRow?.name?.trim() || senderDisplayName;

  // Reuse existing token or mint a new one — same logic as the share-token
  // endpoint, inlined so we don't have a second round-trip.
  let token = validation.share_token;
  if (!token) {
    token = randomBytes(16).toString("hex");
    const { error: tokenErr } = await supabase
      .from("borrower_validations")
      .update({ share_token: token })
      .eq("id", validation.id);
    if (tokenErr) {
      return NextResponse.json({ error: tokenErr.message }, { status: 500 });
    }
  }

  // App URL — prefer explicit env var, fall back to request origin.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  const shareUrl = `${appUrl}/share/${token}`;

  const borrowerLabel = validation.borrower_entity_name
    ? `${validation.borrower_name} / ${validation.borrower_entity_name}`
    : validation.borrower_name;

  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const customBlock = customMessage
    ? `<p style="margin: 0 0 16px;">${escapeHtml(customMessage).replace(/\n/g, "<br>")}</p>`
    : "";
  const customText = customMessage ? `\n\n${customMessage}\n` : "";

  const subject = `${orgName} — please verify your property history`;
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <p style="margin: 0 0 16px;">${greeting}</p>
  <p style="margin: 0 0 16px;">
    ${escapeHtml(senderDisplayName)} at ${escapeHtml(orgName)} is reviewing
    a loan application connected to <strong>${escapeHtml(borrowerLabel)}</strong>
    and has asked you to confirm the property history on file.
  </p>
  <p style="margin: 0 0 16px;">
    Open the secure link below and submit the addresses you've owned or flipped.
    No login required — the link is private and tied to this loan.
  </p>
  ${customBlock}
  <p style="margin: 24px 0;">
    <a href="${shareUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">
      Submit your property list →
    </a>
  </p>
  <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
    Or paste this URL into your browser:
  </p>
  <p style="margin: 0 0 24px; color: #64748b; font-size: 13px; word-break: break-all;">
    ${shareUrl}
  </p>
  <p style="margin: 0; color: #94a3b8; font-size: 12px;">
    Sent via PulseClose on behalf of ${escapeHtml(orgName)}. If you weren't expecting this, you can safely ignore it.
  </p>
</body></html>`;

  const text = `${greeting}

${senderDisplayName} at ${orgName} is reviewing a loan application connected to ${borrowerLabel} and has asked you to confirm the property history on file.

Open the secure link below and submit the addresses you've owned or flipped. No login required — the link is private and tied to this loan.${customText}

${shareUrl}

Sent via PulseClose on behalf of ${orgName}.`;

  const sent = await sendEmail({ to: recipient, subject, html, text });
  if (!sent) {
    // sendEmail logs the underlying error. Surface a generic message so we
    // don't leak Resend internals to the lender.
    return NextResponse.json(
      { error: "Email failed to send. Check Resend configuration or copy the link manually." },
      { status: 502 },
    );
  }

  // Activity event so this shows up in the (forthcoming) feed (B5) and any
  // existing audit query.
  void emitActivity(supabase, {
    orgId: profile.org_id,
    actorUserId: profile.id,
    verb: "sent_share_link",
    subjectType: "validation",
    subjectId: validation.id,
    metadata: {
      recipient_email: recipient,
      borrower_name: validation.borrower_name,
    },
  });

  return NextResponse.json({ ok: true, share_url: shareUrl });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
