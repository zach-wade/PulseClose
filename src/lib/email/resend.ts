// Tiny Resend wrapper — fetch-based, no SDK. Returns true on success,
// false on failure (logs the error). Caller decides whether failure to
// notify should fail the run; for monitoring, no — we still want to
// persist the run record even if email is down.

// Accept either name — the Vercel env historically used RESEND_FROM_ADDRESS
// while newer code referenced RESEND_FROM_EMAIL. Honor both so the configured
// sender isn't silently dropped for the default.
const RESEND_FROM =
  process.env.RESEND_FROM_EMAIL ??
  process.env.RESEND_FROM_ADDRESS ??
  "PulseClose <noreply@pulseclose.com>";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping email send");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
      // Audit M3 — without a timeout a Resend outage hangs the request
      // until Vercel kills the function at maxDuration. Match the
      // Slack/Teams/webhook helpers which all use 10s.
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`Resend ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend send failed:", err);
    return false;
  }
}
