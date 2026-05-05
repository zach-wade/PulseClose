// Publish state SOS lookup guides from
// wordpress/content/guides/sos-states.ts to WordPress as nested pages
// under /guides/sos-lookup/[state]. Each page renders FAQPage schema
// with explicit Q-A blocks scoped to common bridge-lender queries
// ("How do I look up an LLC in [state]?", "What does Forfeited
// Existence mean in [state]?") so AI engines (Google AIO, Perplexity,
// ChatGPT) can cite them as the primary source.
//
// Run:
//   npx tsx wordpress/scripts/publish-guides.ts            # all states as draft
//   npx tsx wordpress/scripts/publish-guides.ts --publish  # all as publish
//   npx tsx wordpress/scripts/publish-guides.ts <slug>     # one state

import {
  upsertPageBySlug,
  getPageBySlug,
  type PostStatus,
} from "./wp-client";
import { SOS_STATES, type SOSStateData } from "../content/guides/sos-states";

const GUIDES_PARENT_SLUG = "guides";
const GUIDES_PARENT_TITLE = "Bridge Lender Guides";
const SOS_PARENT_SLUG = "sos-lookup";
const SOS_PARENT_TITLE = "Secretary of State Entity Search by State";
const AUTHOR_BYLINE =
  "Methodology authored by Zach Wade, Wade Intel — operator-led lender tech methodology firm. State-specific procedures validated against production validation runs at Insignia Capital Corp.";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFaqSchema(state: SOSStateData): string {
  // Q-A pairs designed for the queries bridge lenders actually run.
  // Direct 40-90 word answers per the GEO playbook.
  const faqs = [
    {
      q: `How do I look up an LLC or corporation in ${state.name}?`,
      a: `Use ${state.sosPortalName} (${state.sosPortalUrl}). ${state.onlineAvailability}. Search by entity name to confirm the entity exists, view its current status, formation date, registered agent, and filing history. ${state.processingTime}.`,
    },
    {
      q: `What entity statuses should bridge lenders watch for in ${state.name}?`,
      a:
        "Active/Good Standing means the entity can legally transact business. Suspended, Forfeited, Revoked, or Dissolved statuses indicate the entity cannot legally hold title or sign loan documents — these are hard stops for any bridge loan. Re-instatement is sometimes possible but adds time and risk.",
    },
    {
      q: `What data is available from the ${state.name} ${state.sosPortalName}?`,
      a:
        state.dataAvailable.join(". ") +
        ". " +
        "All free, no account required for basic searches.",
    },
    {
      q: `What are the common ${state.name} SOS gotchas for lenders?`,
      a:
        state.gotchas
          .slice(0, 2)
          .join(" ") + " See the full guide for the rest.",
    },
  ];
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

function buildStepsHtml(state: SOSStateData): string {
  const items = state.steps
    .map((s, i) => `<li style="margin:8px 0;color:#334155;line-height:1.7;"><span style="font-weight:600;color:#0f172a;">Step ${i + 1}.</span> ${escapeHtml(s)}</li>`)
    .join("");
  return `<ol style="padding-left:24px;list-style:none;">${items}</ol>`;
}

function buildGotchasHtml(state: SOSStateData): string {
  const items = state.gotchas
    .map((g) => `<li style="margin:6px 0;color:#475569;line-height:1.7;">${escapeHtml(g)}</li>`)
    .join("");
  return `<ul style="padding-left:24px;color:#475569;">${items}</ul>`;
}

function buildEntityTypesHtml(state: SOSStateData): string {
  return state.entityTypes
    .map((t) => `<span style="display:inline-block;padding:2px 8px;background:#e2e8f0;border-radius:4px;font-size:12px;color:#0f172a;margin-right:6px;">${escapeHtml(t)}</span>`)
    .join("");
}

function buildStateHtml(state: SOSStateData): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${buildFaqSchema(state)}
<p style="margin:0 0 24px;color:#64748b;font-size:13px;">${escapeHtml(AUTHOR_BYLINE)} <span style="color:#94a3b8;">· Last reviewed ${today}</span></p>

<h2 style="font-size:24px;font-weight:700;color:#0f172a;">How do I look up an LLC or corporation in ${escapeHtml(state.name)}?</h2>
<p style="margin:8px 0 16px;color:#334155;line-height:1.7;font-size:17px;">Use <a href="${escapeHtml(state.sosPortalUrl)}" style="color:#2563eb;font-weight:600;">${escapeHtml(state.sosPortalName)}</a>. ${escapeHtml(state.onlineAvailability)}. ${escapeHtml(state.processingTime)} processing.</p>
<p style="margin:0 0 24px;">${buildEntityTypesHtml(state)}</p>

<h3 style="font-size:18px;font-weight:600;color:#0f172a;margin-top:32px;">Step-by-step lookup</h3>
${buildStepsHtml(state)}

<h3 style="font-size:18px;font-weight:600;color:#0f172a;margin-top:32px;">What data the ${escapeHtml(state.sosPortalName)} returns</h3>
<ul style="padding-left:24px;color:#334155;">
${state.dataAvailable.map((d) => `<li style="margin:6px 0;">${escapeHtml(d)}</li>`).join("")}
</ul>

<h3 style="font-size:18px;font-weight:600;color:#0f172a;margin-top:32px;">${escapeHtml(state.name)} gotchas for lenders</h3>
${buildGotchasHtml(state)}

<aside style="margin:48px 0;padding:24px;border-left:4px solid #2563eb;background:#f8fafc;">
<p style="margin:0 0 8px;font-weight:600;color:#0f172a;">Skip the per-state ritual.</p>
<p style="margin:0 0 12px;color:#475569;font-size:14px;">PulseClose runs SOS validation across all 50 states automatically — entity status, formation date, registered agent, and filing history pulled in seconds. ${escapeHtml(state.name)} included by default.</p>
<p style="margin:0;"><a href="https://app.pulseclose.com/signup" style="color:#2563eb;font-weight:600;">Try PulseClose →</a></p>
</aside>`;
}

async function ensureParentPages(): Promise<{ guidesId: number; sosId: number }> {
  // /guides/
  let guidesPage = await getPageBySlug(GUIDES_PARENT_SLUG);
  if (!guidesPage) {
    const intro = `<p style="margin:0 0 24px;color:#475569;font-size:17px;">Practical playbooks for bridge lenders. State-by-state Secretary of State search procedures, contractor license verification, lien research — published by Wade Intel as primary-source references for the bridge-lending niche.</p>`;
    const r = await upsertPageBySlug({
      slug: GUIDES_PARENT_SLUG,
      title: GUIDES_PARENT_TITLE,
      content: intro,
      status: "publish",
    });
    guidesPage = r.page;
  }

  // /guides/sos-lookup/
  let sosPage = await getPageBySlug(SOS_PARENT_SLUG);
  if (!sosPage) {
    const links = SOS_STATES.map(
      (s) => `<li style="margin:6px 0;"><a href="/guides/${SOS_PARENT_SLUG}/${s.slug}/" style="color:#2563eb;">${s.name}</a></li>`,
    ).join("");
    const intro = `<p style="margin:0 0 24px;color:#475569;font-size:17px;">State-by-state procedures for bridge lenders running SOS entity validation. Use these when you need to verify a borrower's LLC, corporation, or LP in a specific state. PulseClose automates this across all 50 states — these guides are for when you need the manual process.</p>
<ul style="padding-left:24px;color:#334155;">${links}</ul>`;
    const r = await upsertPageBySlug({
      slug: SOS_PARENT_SLUG,
      title: SOS_PARENT_TITLE,
      content: intro,
      status: "publish",
      parent: guidesPage.id,
    });
    sosPage = r.page;
  }

  return { guidesId: guidesPage.id, sosId: sosPage.id };
}

async function main() {
  const args = process.argv.slice(2);
  const wantPublish = args.includes("--publish");
  const targetSlug = args.find((a) => !a.startsWith("--"));
  const status: PostStatus = wantPublish ? "publish" : "draft";

  const targets = targetSlug
    ? SOS_STATES.filter((s) => s.slug === targetSlug)
    : SOS_STATES;
  if (targets.length === 0) {
    console.error(
      `No state guides matched. Available: ${SOS_STATES.map((s) => s.slug).join(", ")}`,
    );
    process.exit(1);
  }

  const { sosId } = await ensureParentPages();
  console.log(`Parent /guides/sos-lookup/ page id=${sosId}`);
  console.log(`Publishing ${targets.length} state guide(s) as status=${status}...`);

  for (const state of targets) {
    const html = buildStateHtml(state);
    const result = await upsertPageBySlug({
      slug: state.slug,
      title: `${state.name} Secretary of State Entity Search: Guide for Bridge Lenders`,
      content: html,
      status,
      parent: sosId,
    });
    console.log(
      `  ${result.created ? "CREATED" : "UPDATED"} /guides/sos-lookup/${state.slug} → ${result.page.link}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
