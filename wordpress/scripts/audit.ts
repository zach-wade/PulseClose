// Audit existing WordPress site: list all pages and posts, save snapshot.
// Run with: npx tsx wordpress/scripts/audit.ts

import { writeFileSync } from "fs";
import { resolve } from "path";
import { listPages, listPosts, listCategories, stripHtml, type WPPage, type WPPost } from "./wp-client";

interface PageSnapshot {
  id: number;
  slug: string;
  title: string;
  status: string;
  parent: number;
  link: string;
  contentLength: number;
  contentExcerpt: string;
  contentHtml: string;
  modified: string;
}

function snapshotPage(p: WPPage): PageSnapshot {
  const text = stripHtml(p.content.rendered);
  return {
    id: p.id,
    slug: p.slug,
    title: stripHtml(p.title.rendered),
    status: p.status,
    parent: p.parent,
    link: p.link,
    contentLength: text.length,
    contentExcerpt: text.slice(0, 500),
    contentHtml: p.content.rendered,
    modified: p.modified,
  };
}

async function main() {
  console.log("Auditing WordPress site at pulseclose.com...\n");

  const [pages, posts, cats] = await Promise.all([
    listPages(),
    listPosts(),
    listCategories(),
  ]);

  console.log(`Found ${pages.length} pages, ${posts.length} posts, ${cats.length} categories\n`);

  console.log("=== PAGES ===");
  for (const p of pages.sort((a, b) => a.id - b.id)) {
    const text = stripHtml(p.content.rendered);
    console.log(`[${p.id}] ${stripHtml(p.title.rendered)} (/${p.slug})`);
    console.log(`  Status: ${p.status}, Parent: ${p.parent}, Length: ${text.length} chars`);
    console.log(`  Excerpt: ${text.slice(0, 200)}...`);
    console.log();
  }

  console.log("=== POSTS ===");
  if (posts.length === 0) {
    console.log("(none)\n");
  } else {
    for (const p of posts) {
      console.log(`[${p.id}] ${stripHtml(p.title.rendered)} (/${p.slug})`);
    }
    console.log();
  }

  console.log("=== CATEGORIES ===");
  for (const c of cats) {
    console.log(`[${c.id}] ${c.name} (${c.slug}) — ${c.count} posts`);
  }

  // Save snapshots
  const pageSnapshots = pages.map(snapshotPage);
  const postSnapshots = posts.map((p): PageSnapshot & { categories: number[] } => ({
    ...snapshotPage(p),
    categories: (p as WPPost).categories,
  }));

  const outDir = resolve(process.cwd(), "wordpress/audit");
  writeFileSync(
    resolve(outDir, "pages-snapshot.json"),
    JSON.stringify(pageSnapshots, null, 2),
  );
  writeFileSync(
    resolve(outDir, "posts-snapshot.json"),
    JSON.stringify(postSnapshots, null, 2),
  );
  writeFileSync(
    resolve(outDir, "categories-snapshot.json"),
    JSON.stringify(cats, null, 2),
  );

  console.log(`\nSnapshots saved to wordpress/audit/`);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
