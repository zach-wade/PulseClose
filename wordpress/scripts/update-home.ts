// Updates the WordPress home page with correct PulseClose borrower validation content.
// Run: npx tsx wordpress/scripts/update-home.ts

import { upsertPageBySlug } from "./wp-client";

const homeContent = `
<!-- Hero Section -->
<div style="text-align:center;padding:80px 20px 60px;background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:#fff;margin:-20px -20px 0;">
<h1 style="font-size:48px;font-weight:800;margin-bottom:16px;line-height:1.1;">Validate Borrowers in Minutes,<br/>Not Days.</h1>
<p style="font-size:20px;color:#94a3b8;max-width:640px;margin:0 auto 32px;line-height:1.6;">PulseClose automates entity verification, track record validation, contractor licensing, and litigation screening for bridge lenders. One report, every borrower.</p>
<a href="https://app.pulseclose.com/signup" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;margin-right:12px;">Start Free Trial</a>
<a href="https://app.pulseclose.com/login" style="display:inline-block;background:transparent;color:#93c5fd;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;border:1px solid #3b82f6;">Sign In</a>
</div>

<!-- Trust Bar -->
<div style="text-align:center;padding:40px 20px;background:#f8fafc;">
<p style="font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Automated borrower validation for private &amp; bridge lenders</p>
<div style="display:flex;justify-content:center;gap:48px;margin-top:20px;flex-wrap:wrap;">
<div><span style="font-size:28px;font-weight:800;color:#0f172a;">50</span><span style="font-size:14px;color:#64748b;display:block;">State SOS Coverage</span></div>
<div><span style="font-size:28px;font-weight:800;color:#0f172a;">4</span><span style="font-size:14px;color:#64748b;display:block;">Validation Checks</span></div>
<div><span style="font-size:28px;font-weight:800;color:#0f172a;">&lt;2 min</span><span style="font-size:14px;color:#64748b;display:block;">Per Borrower</span></div>
</div>
</div>

<!-- Problem Section -->
<div style="max-width:960px;margin:0 auto;padding:60px 20px;">
<div style="text-align:center;margin-bottom:48px;">
<h2 style="font-size:36px;font-weight:700;color:#0f172a;margin-bottom:12px;">Borrower due diligence shouldn't take all day</h2>
<p style="font-size:18px;color:#64748b;max-width:600px;margin:0 auto;">Your analysts are running manual SOS lookups, cross-referencing property records in spreadsheets, and Googling contractor licenses. PulseClose does it in one click.</p>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">
<div style="text-align:center;padding:24px;">
<div style="font-size:32px;margin-bottom:12px;color:#ef4444;">X</div>
<p style="font-size:14px;color:#64748b;">Manual SOS lookups across multiple state websites</p>
</div>
<div style="text-align:center;padding:24px;">
<div style="font-size:32px;margin-bottom:12px;color:#ef4444;">X</div>
<p style="font-size:14px;color:#64748b;">Borrower-submitted track records with no verification</p>
</div>
<div style="text-align:center;padding:24px;">
<div style="font-size:32px;margin-bottom:12px;color:#ef4444;">X</div>
<p style="font-size:14px;color:#64748b;">No systematic litigation or contractor screening</p>
</div>
</div>
</div>

<!-- Features Grid -->
<div style="max-width:1080px;margin:0 auto;padding:0 20px 60px;">
<div style="text-align:center;margin-bottom:48px;">
<h2 style="font-size:36px;font-weight:700;color:#0f172a;margin-bottom:12px;">Four checks. One report. Every borrower.</h2>
</div>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:32px;">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
<div style="width:48px;height:48px;background:#dbeafe;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:20px;font-weight:700;color:#2563eb;">SOS</div>
<h3 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">Entity Validation</h3>
<p style="font-size:14px;color:#64748b;line-height:1.6;">Secretary of State lookup across all 50 states. Verify entity status, formation date, registered agent, and flag dissolved or suspended entities before you fund.</p>
</div>
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
<div style="width:48px;height:48px;background:#d1fae5;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:20px;font-weight:700;color:#059669;">TR</div>
<h3 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">Track Record Verification</h3>
<p style="font-size:14px;color:#64748b;line-height:1.6;">Automated property record search by owner name. See what your borrower actually owns, acquisition prices, and sale history. Classify experience tiers 1-4 based on completed projects.</p>
</div>
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
<div style="width:48px;height:48px;background:#ffedd5;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:20px;font-weight:700;color:#d97706;">GC</div>
<h3 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">GC License Validation</h3>
<p style="font-size:14px;color:#64748b;line-height:1.6;">Verify general contractor licenses for rehab and ground-up loans. Check license status, classification, expiration, disciplinary actions, and workers' comp coverage.</p>
</div>
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
<div style="width:48px;height:48px;background:#f3e8ff;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:20px;font-weight:700;color:#7c3aed;">LIT</div>
<h3 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">Litigation Screening</h3>
<p style="font-size:14px;color:#64748b;line-height:1.6;">Federal court docket search for bankruptcies and lawsuits against the borrower or their entities. Flag active cases and prior proceedings before committing capital.</p>
</div>
</div>
</div>

<!-- How It Works -->
<div style="background:#f8fafc;padding:60px 20px;">
<div style="max-width:960px;margin:0 auto;">
<div style="text-align:center;margin-bottom:48px;">
<h2 style="font-size:36px;font-weight:700;color:#0f172a;margin-bottom:12px;">How it works</h2>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:32px;">
<div style="text-align:center;">
<div style="width:48px;height:48px;background:#2563eb;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#fff;font-weight:700;">1</div>
<h3 style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:8px;">Enter borrower details</h3>
<p style="font-size:14px;color:#64748b;">Name, entity, state of formation. Add a GC if it's a rehab or ground-up deal.</p>
</div>
<div style="text-align:center;">
<div style="width:48px;height:48px;background:#2563eb;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#fff;font-weight:700;">2</div>
<h3 style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:8px;">PulseClose runs all checks</h3>
<p style="font-size:14px;color:#64748b;">Entity, track record, litigation, and GC validation run in parallel. Results in under 2 minutes.</p>
</div>
<div style="text-align:center;">
<div style="width:48px;height:48px;background:#2563eb;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#fff;font-weight:700;">3</div>
<h3 style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:8px;">Review the validation report</h3>
<p style="font-size:14px;color:#64748b;">Structured report with confidence scores, flags, experience tier, and AI analysis. Share with your credit committee.</p>
</div>
</div>
</div>
</div>

<!-- Pricing Section -->
<div style="padding:60px 20px;">
<div style="max-width:1080px;margin:0 auto;">
<div style="text-align:center;margin-bottom:48px;">
<h2 style="font-size:36px;font-weight:700;color:#0f172a;margin-bottom:12px;">Simple, usage-based pricing</h2>
<p style="font-size:18px;color:#64748b;">Start with 3 free validations. No credit card required.</p>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
<h3 style="font-size:14px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Starter</h3>
<div style="margin:16px 0;"><span style="font-size:36px;font-weight:800;color:#0f172a;">$299</span><span style="color:#64748b;">/mo</span></div>
<p style="font-size:13px;color:#94a3b8;margin-bottom:24px;">For small shops running a handful of deals per month.</p>
<ul style="list-style:none;padding:0;margin:0;">
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; 25 validations/month</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; All 4 check types</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; AI risk analysis</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Up to 3 users</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Email support</li>
</ul>
</div>
<div style="background:#fff;border:2px solid #2563eb;border-radius:12px;padding:32px;position:relative;">
<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#2563eb;color:#fff;padding:4px 16px;border-radius:20px;font-size:12px;font-weight:600;">MOST POPULAR</div>
<h3 style="font-size:14px;font-weight:600;color:#2563eb;text-transform:uppercase;letter-spacing:1px;">Professional</h3>
<div style="margin:16px 0;"><span style="font-size:36px;font-weight:800;color:#0f172a;">$499</span><span style="color:#64748b;">/mo</span></div>
<p style="font-size:13px;color:#94a3b8;margin-bottom:24px;">For active lenders with a steady pipeline of bridge deals.</p>
<ul style="list-style:none;padding:0;margin:0;">
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; 100 validations/month</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Everything in Starter</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; PDF report export</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Up to 10 users</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Priority support</li>
</ul>
</div>
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
<h3 style="font-size:14px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;">Enterprise</h3>
<div style="margin:16px 0;"><span style="font-size:36px;font-weight:800;color:#0f172a;">$799</span><span style="color:#64748b;">/mo</span></div>
<p style="font-size:13px;color:#94a3b8;margin-bottom:24px;">For high-volume lenders and correspondent platforms.</p>
<ul style="list-style:none;padding:0;margin:0;">
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Unlimited validations</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Everything in Professional</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Continuous monitoring</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Unlimited users</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; API access + integrations</li>
<li style="padding:6px 0;font-size:14px;color:#475569;">&#10003; Dedicated account manager</li>
</ul>
</div>
</div>
</div>
</div>

<!-- CTA Section -->
<div style="text-align:center;padding:80px 20px;background:#0f172a;color:#fff;">
<h2 style="font-size:36px;font-weight:700;margin-bottom:16px;">Stop funding blind. Start validating.</h2>
<p style="font-size:18px;color:#94a3b8;max-width:500px;margin:0 auto 32px;">Run your first borrower validation in under 2 minutes. Entity, track record, litigation, and GC checks in a single report.</p>
<a href="https://app.pulseclose.com/signup" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">Start Your Free Trial</a>
<p style="font-size:13px;color:#64748b;margin-top:16px;">3 free validations &middot; No credit card required &middot; Cancel anytime</p>
</div>

<!-- Footer -->
<div style="padding:40px 20px;text-align:center;background:#f8fafc;border-top:1px solid #e2e8f0;">
<p style="font-size:14px;color:#64748b;">&copy; 2026 PulseClose. All rights reserved.</p>
<p style="font-size:13px;color:#94a3b8;margin-top:8px;">
<a href="https://app.pulseclose.com/login" style="color:#64748b;text-decoration:none;">Sign In</a> &middot;
<a href="https://app.pulseclose.com/signup" style="color:#64748b;text-decoration:none;">Sign Up</a> &middot;
<a href="mailto:hello@pulseclose.com" style="color:#64748b;text-decoration:none;">Contact</a>
</p>
</div>
`.trim();

async function main() {
  console.log("Updating home page...");
  const { page, created } = await upsertPageBySlug({
    slug: "home",
    title: "PulseClose — Automated Borrower Validation for Bridge Lenders",
    content: homeContent,
    status: "publish",
  });
  console.log(`${created ? "Created" : "Updated"} home page (id: ${page.id})`);
  console.log(`Live at: ${page.link}`);
}

main().catch(console.error);
