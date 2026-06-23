// POST /api/onboarding/welcome — sends the trial welcome email right after
// signup. Called from the signup page once auth.signUp succeeds (the org is
// created by the handle_new_user trigger; email confirmation may still be
// pending, so this runs unauthenticated with just email + name).
//
// Rate-limited per email to blunt abuse of an unauthenticated send endpoint.
// No-ops silently if Resend isn't configured.

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/resend";
import { welcomeEmail } from "@/lib/email/onboarding";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureServer } from "@/lib/analytics/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    name?: string | null;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }

  const rl = await checkRateLimit(`welcome:${email}`, 2, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: true, throttled: true });
  }

  const { subject, html, text } = welcomeEmail(body.name ?? null);
  await sendEmail({ to: email, subject, html, text });
  void captureServer(email, "signup_submitted", { source: "signup_form" });

  return NextResponse.json({ ok: true });
}
