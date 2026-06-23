// Onboarding / trial lifecycle emails. Plain, branded, text-first HTML — these
// go to lenders, not consumers, so they read like a competent operator wrote
// them, not a growth team. Each returns {subject, html, text} for sendEmail().

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pulseclose.com";

function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0F172A;line-height:1.55">
  <p style="font-size:18px;font-weight:700;margin:0 0 16px">Pulse<span style="color:#3B82F6">Close</span></p>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
  <p style="font-size:12px;color:#64748b;margin:0">PulseClose — borrower validation &amp; underwriting for bridge lenders.</p>
</div>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${href}" style="background:#3B82F6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block">${label}</a></p>`;
}

export function welcomeEmail(name: string | null): { subject: string; html: string; text: string } {
  const hi = name ? `Hi ${name},` : "Hi,";
  return {
    subject: "Welcome to PulseClose — run your first deal",
    html: shell(
      `<p>${hi}</p>
       <p>Your PulseClose trial is live — <strong>14 days, up to 50 checks, no card</strong>. Enough room to run real deals, not a demo.</p>
       <p>The fastest way to see the value: paste a borrower + entity (or upload a track-record sheet) and run a validation. In ~60 seconds you'll get entity, track-record, litigation, and sanctions screening scored into one tier'd record.</p>
       ${button(`${APP_URL}/dashboard/new`, "Run your first validation")}
       <p>When you're ready to size a deal, the Evaluate tab compares it across your investors and the Underwriting Workbench sizes the loan and flags the deal-killers.</p>
       <p>Reply to this email if anything's unclear — a real person reads it.</p>`,
    ),
    text: `${hi}\n\nYour PulseClose trial is live — 14 days, up to 50 checks, no card.\n\nRun your first validation: ${APP_URL}/dashboard/new\n\nReply to this email if anything's unclear.`,
  };
}

export function trialEndingEmail(
  name: string | null,
  daysLeft: number,
): { subject: string; html: string; text: string } {
  const hi = name ? `Hi ${name},` : "Hi,";
  const d = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
  return {
    subject: `Your PulseClose trial ends in ${d}`,
    html: shell(
      `<p>${hi}</p>
       <p>Your free trial ends in <strong>${d}</strong>. To keep running validations and underwriting without interruption, pick a plan — it takes a minute and your data carries over.</p>
       ${button(`${APP_URL}/dashboard/settings`, "Choose a plan")}
       <p>Questions about volume or a fund-level plan? Just reply.</p>`,
    ),
    text: `${hi}\n\nYour PulseClose free trial ends in ${d}. Choose a plan to keep going: ${APP_URL}/dashboard/settings\n\nReply with any questions.`,
  };
}

export function trialEndedEmail(name: string | null): { subject: string; html: string; text: string } {
  const hi = name ? `Hi ${name},` : "Hi,";
  return {
    subject: "Your PulseClose trial has ended",
    html: shell(
      `<p>${hi}</p>
       <p>Your free trial has ended. Your account and everything you ran are still here — subscribe whenever you're ready and you pick right back up.</p>
       ${button(`${APP_URL}/dashboard/settings`, "Reactivate with a plan")}
       <p>If PulseClose wasn't the right fit, I'd genuinely value a one-line reply on why — it makes the product better.</p>`,
    ),
    text: `${hi}\n\nYour PulseClose free trial has ended. Your data is saved — subscribe to pick back up: ${APP_URL}/dashboard/settings`,
  };
}
