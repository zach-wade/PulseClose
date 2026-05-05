// Publish blog posts from wordpress/content/posts/*.md to WordPress.
// Idempotent — upserts by slug. Default status is `draft` so the user
// reviews on WP admin before promoting to `publish`.
//
// Run:
//   npx tsx wordpress/scripts/publish-blog.ts            # all posts as draft
//   npx tsx wordpress/scripts/publish-blog.ts --publish  # all posts as publish
//   npx tsx wordpress/scripts/publish-blog.ts <slug>     # one post by filename slug
//
// Markdown handling is intentionally tiny — H1/H2/H3, paragraphs,
// bold/italic, horizontal rules, bullet lists. No GFM tables, no code
// blocks. Add a real markdown lib (marked/remark) only when the
// content engine outgrows this.

import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { upsertPostBySlug, type PostStatus } from "./wp-client";

const POSTS_DIR = resolve(process.cwd(), "wordpress/content/posts");
const AUTHOR_BYLINE =
  "Methodology authored by Zach Wade, Wade Intel — operator-led lender tech methodology firm. Validated against production borrower-validation runs at Insignia Capital Corp.";
const PRODUCT_CTA = `
<aside style="margin:48px 0;padding:24px;border-left:4px solid #2563eb;background:#f8fafc;">
<p style="margin:0 0 8px;font-weight:600;color:#0f172a;">Run this in seconds, not hours.</p>
<p style="margin:0 0 12px;color:#475569;font-size:14px;">PulseClose runs entity, track record, GC, litigation, and sanctions checks in parallel and produces a single risk memo per borrower. Built by Wade Intel.</p>
<p style="margin:0;"><a href="https://app.pulseclose.com/signup" style="color:#2563eb;font-weight:600;">Try PulseClose →</a></p>
</aside>
`;

interface ParsedPost {
  slug: string;
  title: string;
  body: string; // markdown without the H1
}

function parsePost(filename: string, raw: string): ParsedPost {
  const slug = filename.replace(/\.md$/, "");
  const lines = raw.split("\n");
  // First H1 is the title; everything after is the body.
  const h1Idx = lines.findIndex((l) => /^# /.test(l));
  if (h1Idx < 0) {
    throw new Error(`${filename}: no H1 title found`);
  }
  const title = lines[h1Idx].replace(/^# /, "").trim();
  const body = lines.slice(h1Idx + 1).join("\n").trim();
  return { slug, title, body };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tiny markdown-to-HTML. Handles paragraphs, H2/H3, bold, italic, hr,
// bullet lists, and links. Order matters — block-level first, then
// inline within each block.
function renderMarkdown(md: string): string {
  const blocks = md.split(/\n{2,}/);
  const out: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    if (/^---+$/.test(block)) {
      out.push('<hr style="margin:32px 0;border:0;border-top:1px solid #e2e8f0;" />');
      continue;
    }

    if (/^### /.test(block)) {
      out.push(`<h3 style="font-size:20px;font-weight:600;color:#0f172a;margin-top:32px;">${inline(block.replace(/^### /, ""))}</h3>`);
      continue;
    }
    if (/^## /.test(block)) {
      out.push(`<h2 style="font-size:24px;font-weight:700;color:#0f172a;margin-top:40px;">${inline(block.replace(/^## /, ""))}</h2>`);
      continue;
    }

    // Bullet list — every line starts with "- " or "* "
    if (block.split("\n").every((l) => /^[-*]\s/.test(l.trim()))) {
      const items = block
        .split("\n")
        .map((l) => l.replace(/^[-*]\s/, "").trim())
        .map((l) => `<li style="margin:6px 0;">${inline(l)}</li>`)
        .join("");
      out.push(`<ul style="padding-left:24px;color:#334155;">${items}</ul>`);
      continue;
    }

    // Default — paragraph
    out.push(`<p style="margin:16px 0;color:#334155;line-height:1.7;">${inline(block.replace(/\n/g, " "))}</p>`);
  }

  return out.join("\n");
}

function inline(s: string): string {
  // Escape first, then layer markdown features back in.
  let html = escapeHtml(s);
  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;">$1</a>');
  // Bold: **x**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic: *x*  (don't catch ** here because we already stripped above)
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  return html;
}

function buildPostHtml(post: ParsedPost): string {
  const today = new Date().toISOString().slice(0, 10);
  const bylineBlock = `<p style="margin:0 0 24px;color:#64748b;font-size:13px;">${escapeHtml(AUTHOR_BYLINE)} <span style="color:#94a3b8;">· Last reviewed ${today}</span></p>`;
  return [bylineBlock, renderMarkdown(post.body), PRODUCT_CTA].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const wantPublish = args.includes("--publish");
  const targetSlug = args.find((a) => !a.startsWith("--"));
  const status: PostStatus = wantPublish ? "publish" : "draft";

  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const targets = targetSlug
    ? files.filter((f) => f.replace(/\.md$/, "") === targetSlug)
    : files;
  if (targets.length === 0) {
    console.error(`No posts matched. Available: ${files.join(", ")}`);
    process.exit(1);
  }

  console.log(`Publishing ${targets.length} post(s) as status=${status}...`);
  for (const filename of targets) {
    const raw = readFileSync(resolve(POSTS_DIR, filename), "utf-8");
    const post = parsePost(filename, raw);
    const content = buildPostHtml(post);
    const result = await upsertPostBySlug({
      slug: post.slug,
      title: post.title,
      content,
      status,
    });
    console.log(
      `  ${result.created ? "CREATED" : "UPDATED"} ${post.slug} → ${result.post.link}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
