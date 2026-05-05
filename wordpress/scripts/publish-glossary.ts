// Publish glossary terms from wordpress/content/glossary/terms.ts to
// WordPress as child pages under a parent "Glossary" page. Each term
// renders with FAQPage schema so AI engines (Google AI Overviews,
// Perplexity, ChatGPT) cite it as a primary-source definition. This is
// the GEO/AEO play — see docs/DISTRIBUTION-STRATEGY.md for the
// full playbook.
//
// Run:
//   npx tsx wordpress/scripts/publish-glossary.ts            # all terms as draft
//   npx tsx wordpress/scripts/publish-glossary.ts --publish  # all terms as publish
//   npx tsx wordpress/scripts/publish-glossary.ts <slug>     # one term

import { upsertPageBySlug, getPageBySlug, type PostStatus } from "./wp-client";
import { GLOSSARY_TERMS, type GlossaryTerm } from "../content/glossary/terms";

const PARENT_SLUG = "glossary";
const PARENT_TITLE = "Bridge Lending Glossary";
const AUTHOR_BYLINE =
  "Methodology authored by Zach Wade, Wade Intel — operator-led lender tech methodology firm. Definitions validated against production borrower-validation runs at Insignia Capital Corp.";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function buildFaqSchema(term: GlossaryTerm): string {
  // FAQPage schema is the highest-CTR structured-data shape for AI
  // citations as of 2026. Each Q-A is a self-contained answer block —
  // 40-word direct definition is the format LLMs prefer.
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What is ${term.term}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: term.definition,
        },
      },
      {
        "@type": "Question",
        name: `Why does ${term.term} matter to bridge lenders?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: term.whyItMatters,
        },
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(faq)}</script>`;
}

function relatedLinks(term: GlossaryTerm): string {
  if (!term.relatedTerms?.length) return "";
  const links = term.relatedTerms
    .map((slug) => {
      const t = GLOSSARY_TERMS.find((x) => x.slug === slug);
      const label = t ? t.term : slug;
      return `<a href="/glossary/${slug}/" style="color:#2563eb;">${escapeHtml(label)}</a>`;
    })
    .join(", ");
  return `<p style="margin:24px 0 0;color:#64748b;font-size:13px;"><strong style="color:#475569;">Related:</strong> ${links}</p>`;
}

function buildTermHtml(term: GlossaryTerm, parentId: number): {
  html: string;
  parentId: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  const example = term.example
    ? `<h3 style="font-size:18px;font-weight:600;color:#0f172a;margin-top:32px;">Example</h3>
<p style="margin:8px 0;color:#334155;line-height:1.7;">${escapeHtml(term.example)}</p>`
    : "";
  const html = `${buildFaqSchema(term)}
<p style="margin:0 0 24px;color:#64748b;font-size:13px;">${escapeHtml(AUTHOR_BYLINE)} <span style="color:#94a3b8;">· Last reviewed ${today}</span></p>

<h2 style="font-size:24px;font-weight:700;color:#0f172a;">What is ${escapeHtml(term.term)}?</h2>
<p style="margin:8px 0 24px;color:#334155;line-height:1.7;font-size:17px;">${escapeHtml(term.definition)}</p>

<h3 style="font-size:18px;font-weight:600;color:#0f172a;margin-top:32px;">Why it matters to bridge lenders</h3>
<p style="margin:8px 0;color:#334155;line-height:1.7;">${escapeHtml(term.whyItMatters)}</p>

${example}

<aside style="margin:48px 0;padding:24px;border-left:4px solid #2563eb;background:#f8fafc;">
<p style="margin:0 0 8px;font-weight:600;color:#0f172a;">${escapeHtml(term.ctaText)}</p>
<p style="margin:0 0 12px;color:#475569;font-size:14px;">PulseClose handles ${escapeHtml(term.ctaFeature)} as part of the standard borrower-validation flow.</p>
<p style="margin:0;"><a href="https://app.pulseclose.com/signup" style="color:#2563eb;font-weight:600;">Try PulseClose →</a></p>
</aside>
${relatedLinks(term)}`;
  return { html, parentId };
}

async function ensureParentPage(): Promise<number> {
  const existing = await getPageBySlug(PARENT_SLUG);
  if (existing) return existing.id;
  const intro = `<p style="margin:0 0 24px;color:#475569;font-size:17px;">A working glossary of the terms bridge lenders use when validating borrowers — entity status, track record signals, lien terminology, and contractor-licensing concepts. Maintained by Wade Intel as a primary-source reference.</p>
<p style="margin:0;color:#64748b;">Looking to automate this work? <a href="https://app.pulseclose.com/signup" style="color:#2563eb;font-weight:600;">Try PulseClose</a> — borrower validation in one report.</p>`;
  const result = await upsertPageBySlug({
    slug: PARENT_SLUG,
    title: PARENT_TITLE,
    content: intro,
    status: "publish",
  });
  return result.page.id;
}

async function main() {
  const args = process.argv.slice(2);
  const wantPublish = args.includes("--publish");
  const targetSlug = args.find((a) => !a.startsWith("--"));
  const status: PostStatus = wantPublish ? "publish" : "draft";

  const targets = targetSlug
    ? GLOSSARY_TERMS.filter((t) => t.slug === targetSlug)
    : GLOSSARY_TERMS;
  if (targets.length === 0) {
    console.error(
      `No glossary terms matched. Available: ${GLOSSARY_TERMS.map((t) => t.slug).join(", ")}`,
    );
    process.exit(1);
  }

  const parentId = await ensureParentPage();
  console.log(`Parent /glossary/ page id=${parentId}`);
  console.log(`Publishing ${targets.length} term(s) as status=${status}...`);

  for (const term of targets) {
    const { html } = buildTermHtml(term, parentId);
    const result = await upsertPageBySlug({
      slug: term.slug,
      title: `${term.term} | Bridge Lending Glossary`,
      content: html,
      status,
      parent: parentId,
    });
    console.log(
      `  ${result.created ? "CREATED" : "UPDATED"} /glossary/${term.slug} → ${result.page.link}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
