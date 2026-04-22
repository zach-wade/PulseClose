// Updates all WordPress pages with correct PulseClose borrower validation content.
// Run: npx tsx wordpress/scripts/update-all-pages.ts

import { upsertPageBySlug } from "./wp-client";

const pages: { slug: string; title: string; content: string }[] = [
  {
    slug: "features",
    title: "Features — PulseClose Borrower Validation",
    content: `
<!-- Hero -->
<div style="text-align:center;padding:80px 20px 40px;background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:#fff;margin:-20px -20px 0;">
<h1 style="font-size:44px;font-weight:800;margin-bottom:16px;">Four checks. One report.<br/>Every borrower.</h1>
<p style="font-size:18px;color:#94a3b8;max-width:600px;margin:0 auto;">PulseClose runs entity, track record, litigation, and contractor validation in parallel. Results in under 2 minutes.</p>
</div>

<!-- Entity Validation -->
<div style="max-width:960px;margin:0 auto;padding:60px 20px;">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-bottom:64px;">
<div>
<div style="font-size:14px;font-weight:600;color:#2563eb;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Entity Validation</div>
<h2 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:16px;">Secretary of State lookup across all 50 states</h2>
<p style="font-size:16px;color:#64748b;line-height:1.7;">Instantly verify that your borrower's entity is active and in good standing. PulseClose checks formation date, registered agent, entity type, and flags dissolved, suspended, or recently-formed entities that could indicate risk.</p>
<ul style="margin-top:16px;padding-left:20px;">
<li style="font-size:14px;color:#475569;padding:4px 0;">Active/suspended/dissolved status</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Formation date and registered agent</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Foreign entity detection</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Name match confidence scoring</li>
</ul>
</div>
<div style="background:#f1f5f9;border-radius:12px;padding:32px;text-align:center;">
<div style="font-size:64px;font-weight:800;color:#2563eb;">50</div>
<div style="font-size:16px;color:#64748b;">States covered</div>
</div>
</div>

<!-- Track Record -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-bottom:64px;">
<div style="background:#f0fdf4;border-radius:12px;padding:32px;text-align:center;order:1;">
<div style="font-size:64px;font-weight:800;color:#059669;">25+</div>
<div style="font-size:16px;color:#64748b;">Properties per search</div>
</div>
<div style="order:2;">
<div style="font-size:14px;font-weight:600;color:#059669;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Track Record Verification</div>
<h2 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:16px;">Verify what your borrower actually owns</h2>
<p style="font-size:16px;color:#64748b;line-height:1.7;">Stop trusting borrower-submitted spreadsheets. PulseClose searches property records by owner name to find real acquisitions, sale prices, and transaction history. Automatically classify borrowers into experience tiers 1-4 based on completed projects.</p>
<ul style="margin-top:16px;padding-left:20px;">
<li style="font-size:14px;color:#475569;padding:4px 0;">Owner-name property search nationwide</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Sale prices and transaction dates</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Sale history enrichment per property</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Experience tier classification (1-4)</li>
</ul>
</div>
</div>

<!-- Litigation -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-bottom:64px;">
<div>
<div style="font-size:14px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Litigation Screening</div>
<h2 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:16px;">Federal court records, checked automatically</h2>
<p style="font-size:16px;color:#64748b;line-height:1.7;">Search federal court dockets for bankruptcies and lawsuits involving the borrower or their entities. Active cases are flagged before you commit capital. No more manual PACER searches.</p>
<ul style="margin-top:16px;padding-left:20px;">
<li style="font-size:14px;color:#475569;padding:4px 0;">Bankruptcy case search</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Federal lawsuit screening</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Entity + personal name search</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Active vs. terminated case status</li>
</ul>
</div>
<div style="background:#f5f3ff;border-radius:12px;padding:32px;text-align:center;">
<div style="font-size:64px;font-weight:800;color:#7c3aed;">2</div>
<div style="font-size:16px;color:#64748b;">Search types (bankruptcy + lawsuits)</div>
</div>
</div>

<!-- GC Validation -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-bottom:64px;">
<div style="background:#fff7ed;border-radius:12px;padding:32px;text-align:center;order:1;">
<div style="font-size:48px;font-weight:800;color:#d97706;">CSLB</div>
<div style="font-size:16px;color:#64748b;">CA license lookup</div>
</div>
<div style="order:2;">
<div style="font-size:14px;font-weight:600;color:#d97706;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">GC License Validation</div>
<h2 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:16px;">Contractor license checks for rehab and ground-up deals</h2>
<p style="font-size:16px;color:#64748b;line-height:1.7;">For construction loans, verify the general contractor's license is active and in good standing. PulseClose checks license status, classification, expiration, disciplinary history, and workers' compensation coverage.</p>
<ul style="margin-top:16px;padding-left:20px;">
<li style="font-size:14px;color:#475569;padding:4px 0;">License status and classification</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Expiration date tracking</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Disciplinary action history</li>
<li style="font-size:14px;color:#475569;padding:4px 0;">Workers' comp insurance verification</li>
</ul>
</div>
</div>
</div>

<!-- AI Analysis -->
<div style="background:#f8fafc;padding:60px 20px;">
<div style="max-width:960px;margin:0 auto;text-align:center;">
<div style="font-size:14px;font-weight:600;color:#0f172a;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">AI Risk Analysis</div>
<h2 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:16px;">AI-generated risk summary with every report</h2>
<p style="font-size:16px;color:#64748b;max-width:600px;margin:0 auto;line-height:1.7;">After all checks complete, PulseClose generates a structured risk analysis covering entity health, track record depth, litigation exposure, and contractor risk. Share the report with your credit committee.</p>
</div>
</div>

<!-- CTA -->
<div style="text-align:center;padding:60px 20px;background:#0f172a;color:#fff;">
<h2 style="font-size:32px;font-weight:700;margin-bottom:16px;">See it in action</h2>
<p style="font-size:16px;color:#94a3b8;margin-bottom:24px;">Run your first borrower validation in under 2 minutes.</p>
<a href="https://app.pulseclose.com/signup" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">Start Free Trial</a>
</div>
`.trim(),
  },

  {
    slug: "pricing",
    title: "Pricing — PulseClose",
    content: `
<!-- Hero -->
<div style="text-align:center;padding:80px 20px 40px;background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:#fff;margin:-20px -20px 0;">
<h1 style="font-size:44px;font-weight:800;margin-bottom:16px;">Simple, usage-based pricing</h1>
<p style="font-size:18px;color:#94a3b8;">Start with 3 free validations. No credit card required.</p>
</div>

<!-- Pricing Grid -->
<div style="max-width:1080px;margin:0 auto;padding:60px 20px;">
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">

<!-- Starter -->
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
<div style="margin-top:24px;"><a href="https://app.pulseclose.com/signup" style="display:block;text-align:center;background:#f1f5f9;color:#0f172a;padding:12px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Get Started</a></div>
</div>

<!-- Professional -->
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
<div style="margin-top:24px;"><a href="https://app.pulseclose.com/signup" style="display:block;text-align:center;background:#2563eb;color:#fff;padding:12px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Get Started</a></div>
</div>

<!-- Enterprise -->
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
<div style="margin-top:24px;"><a href="https://app.pulseclose.com/signup" style="display:block;text-align:center;background:#f1f5f9;color:#0f172a;padding:12px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Get Started</a></div>
</div>

</div>
</div>

<!-- FAQ -->
<div style="max-width:720px;margin:0 auto;padding:0 20px 60px;">
<h2 style="font-size:28px;font-weight:700;color:#0f172a;text-align:center;margin-bottom:32px;">Frequently asked questions</h2>

<div style="border-top:1px solid #e2e8f0;padding:20px 0;">
<h3 style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:8px;">What counts as a validation?</h3>
<p style="font-size:14px;color:#64748b;line-height:1.6;">One validation = one borrower run through all applicable checks (entity, track record, litigation, GC). Individual checks on the standalone pages also count toward your monthly limit.</p>
</div>

<div style="border-top:1px solid #e2e8f0;padding:20px 0;">
<h3 style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:8px;">Can I try it before subscribing?</h3>
<p style="font-size:14px;color:#64748b;line-height:1.6;">Yes. Every account gets 3 free validations with no credit card required. Run real borrowers through the system before you commit.</p>
</div>

<div style="border-top:1px solid #e2e8f0;padding:20px 0;">
<h3 style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:8px;">Do you offer annual pricing?</h3>
<p style="font-size:14px;color:#64748b;line-height:1.6;">Yes. Annual plans save 20% compared to monthly billing. You can switch to annual from your account settings at any time.</p>
</div>

<div style="border-top:1px solid #e2e8f0;padding:20px 0;">
<h3 style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:8px;">What data sources do you use?</h3>
<p style="font-size:14px;color:#64748b;line-height:1.6;">Entity checks pull from Secretary of State records via Cobalt Intelligence. Track record uses Regrid parcel data with ATTOM sale history enrichment. Litigation searches federal court dockets via CourtListener. GC validation checks the California CSLB.</p>
</div>
<div style="border-top:1px solid #e2e8f0;"></div>
</div>

<!-- CTA -->
<div style="text-align:center;padding:60px 20px;background:#0f172a;color:#fff;">
<h2 style="font-size:32px;font-weight:700;margin-bottom:16px;">Start validating borrowers today</h2>
<p style="font-size:16px;color:#94a3b8;margin-bottom:24px;">3 free validations. No credit card. Cancel anytime.</p>
<a href="https://app.pulseclose.com/signup" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">Start Free Trial</a>
</div>
`.trim(),
  },

  {
    slug: "about",
    title: "About — PulseClose",
    content: `
<!-- Hero -->
<div style="text-align:center;padding:80px 20px 40px;background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:#fff;margin:-20px -20px 0;">
<h1 style="font-size:44px;font-weight:800;margin-bottom:16px;">Built for bridge lenders,<br/>by bridge lenders.</h1>
<p style="font-size:18px;color:#94a3b8;max-width:600px;margin:0 auto;">PulseClose exists because borrower due diligence in private lending is broken. We're fixing it.</p>
</div>

<!-- Story -->
<div style="max-width:720px;margin:0 auto;padding:60px 20px;">
<h2 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:16px;">The problem we solve</h2>
<p style="font-size:16px;color:#64748b;line-height:1.8;margin-bottom:24px;">Bridge lenders fund fast, but borrower validation hasn't kept up. Your analysts spend hours running manual SOS lookups across state websites, cross-referencing borrower-submitted track records against public property data, Googling contractor licenses, and searching PACER for litigation history. It's slow, inconsistent, and error-prone.</p>
<p style="font-size:16px;color:#64748b;line-height:1.8;margin-bottom:24px;">PulseClose automates all of it. Enter a borrower's name and entity, and get a structured validation report in under 2 minutes. Entity status, property ownership, sale history, litigation screening, and contractor license checks. All verified against primary sources, not borrower self-reporting.</p>

<h2 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:16px;margin-top:48px;">What we believe</h2>
<div style="border-left:3px solid #2563eb;padding-left:20px;margin-bottom:24px;">
<p style="font-size:16px;color:#475569;line-height:1.7;"><strong>Verification beats trust.</strong> Borrower-submitted track records are a starting point, not the answer. Real property records and court data are the source of truth.</p>
</div>
<div style="border-left:3px solid #2563eb;padding-left:20px;margin-bottom:24px;">
<p style="font-size:16px;color:#475569;line-height:1.7;"><strong>Speed matters.</strong> Bridge lending moves fast. If validation takes days, it doesn't get done. Under 2 minutes means it actually gets used on every deal.</p>
</div>
<div style="border-left:3px solid #2563eb;padding-left:20px;margin-bottom:24px;">
<p style="font-size:16px;color:#475569;line-height:1.7;"><strong>Lending-specific, not generic.</strong> We don't sell a platform that does everything for everyone. PulseClose does one thing — borrower validation for bridge lenders — and does it well.</p>
</div>

<h2 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:16px;margin-top:48px;">Contact</h2>
<p style="font-size:16px;color:#64748b;line-height:1.8;">Have questions or want to see PulseClose in action? Reach us at <a href="mailto:hello@pulseclose.com" style="color:#2563eb;text-decoration:none;">hello@pulseclose.com</a>.</p>
</div>

<!-- CTA -->
<div style="text-align:center;padding:60px 20px;background:#0f172a;color:#fff;">
<h2 style="font-size:32px;font-weight:700;margin-bottom:16px;">Ready to validate smarter?</h2>
<p style="font-size:16px;color:#94a3b8;margin-bottom:24px;">3 free validations. No credit card required.</p>
<a href="https://app.pulseclose.com/signup" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">Start Free Trial</a>
</div>
`.trim(),
  },

  {
    slug: "demo",
    title: "Request Demo — PulseClose",
    content: `
<!-- Hero -->
<div style="text-align:center;padding:80px 20px 40px;background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:#fff;margin:-20px -20px 0;">
<h1 style="font-size:44px;font-weight:800;margin-bottom:16px;">See PulseClose in action</h1>
<p style="font-size:18px;color:#94a3b8;max-width:600px;margin:0 auto;">Walk through a live borrower validation with your own deal data. 15 minutes, no slides.</p>
</div>

<!-- Content -->
<div style="max-width:720px;margin:0 auto;padding:60px 20px;">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;">

<!-- Left: what you'll see -->
<div>
<h2 style="font-size:24px;font-weight:700;color:#0f172a;margin-bottom:20px;">What we'll cover</h2>
<ul style="list-style:none;padding:0;">
<li style="padding:10px 0;font-size:15px;color:#475569;border-bottom:1px solid #f1f5f9;">&#10003; Live entity lookup on a real borrower</li>
<li style="padding:10px 0;font-size:15px;color:#475569;border-bottom:1px solid #f1f5f9;">&#10003; Track record search with property records</li>
<li style="padding:10px 0;font-size:15px;color:#475569;border-bottom:1px solid #f1f5f9;">&#10003; Litigation screening results</li>
<li style="padding:10px 0;font-size:15px;color:#475569;border-bottom:1px solid #f1f5f9;">&#10003; GC license validation</li>
<li style="padding:10px 0;font-size:15px;color:#475569;border-bottom:1px solid #f1f5f9;">&#10003; AI risk analysis walkthrough</li>
<li style="padding:10px 0;font-size:15px;color:#475569;">&#10003; Usage metering and billing setup</li>
</ul>
</div>

<!-- Right: CTA -->
<div>
<h2 style="font-size:24px;font-weight:700;color:#0f172a;margin-bottom:20px;">Get in touch</h2>
<p style="font-size:15px;color:#64748b;line-height:1.7;margin-bottom:24px;">Email us to schedule a 15-minute walkthrough. We'll use your borrower data so you see real results, not a canned demo.</p>
<a href="mailto:hello@pulseclose.com?subject=PulseClose%20Demo%20Request" style="display:block;text-align:center;background:#2563eb;color:#fff;padding:14px 24px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;margin-bottom:16px;">Email hello@pulseclose.com</a>
<p style="font-size:14px;color:#94a3b8;text-align:center;">Or try it yourself right now:</p>
<a href="https://app.pulseclose.com/signup" style="display:block;text-align:center;background:#f1f5f9;color:#0f172a;padding:14px 24px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;margin-top:8px;">Start Free Trial (3 validations free)</a>
</div>

</div>
</div>
`.trim(),
  },
];

async function main() {
  for (const page of pages) {
    console.log(`Updating ${page.slug}...`);
    const { page: wp, created } = await upsertPageBySlug({
      slug: page.slug,
      title: page.title,
      content: page.content,
      status: "publish",
    });
    console.log(`  ${created ? "Created" : "Updated"} (id: ${wp.id}) — ${wp.link}`);
  }
  console.log("\nAll pages updated.");
}

main().catch(console.error);
