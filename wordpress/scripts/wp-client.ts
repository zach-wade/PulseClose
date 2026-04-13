// Reusable WordPress REST API client.
// Uses Application Passwords for auth (Basic Auth header).
// Run with: tsx wordpress/scripts/<script-name>.ts

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from repo root
config({ path: resolve(process.cwd(), ".env.local") });

const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

if (!WP_URL || !WP_USER || !WP_APP_PASSWORD) {
  throw new Error(
    "Missing WordPress credentials. Set WP_URL, WP_USER, WP_APP_PASSWORD in .env.local",
  );
}

const authHeader =
  "Basic " + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");

export type PostStatus = "publish" | "draft" | "pending" | "private";

export interface WPPage {
  id: number;
  date: string;
  modified: string;
  slug: string;
  status: PostStatus;
  title: { rendered: string; raw?: string };
  content: { rendered: string; raw?: string };
  excerpt: { rendered: string; raw?: string };
  parent: number;
  link: string;
}

export interface WPPost extends WPPage {
  categories: number[];
  tags: number[];
}

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
}

interface PageInput {
  title: string;
  content: string;
  slug?: string;
  status?: PostStatus;
  parent?: number;
  excerpt?: string;
  meta?: Record<string, unknown>;
}

async function wpFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${WP_URL}/wp-json/wp/v2${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `WP ${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}\n${body}`,
    );
  }

  return res.json() as Promise<T>;
}

// ====== Pages ======

export async function listPages(opts: { perPage?: number; status?: string; parent?: number } = {}): Promise<WPPage[]> {
  const params = new URLSearchParams({
    per_page: String(opts.perPage ?? 100),
    status: opts.status ?? "any",
    context: "edit",
  });
  if (opts.parent !== undefined) params.set("parent", String(opts.parent));
  return wpFetch<WPPage[]>(`/pages?${params}`);
}

export async function getPageBySlug(slug: string): Promise<WPPage | null> {
  const params = new URLSearchParams({ slug, status: "any", context: "edit" });
  const pages = await wpFetch<WPPage[]>(`/pages?${params}`);
  return pages[0] ?? null;
}

export async function createPage(input: PageInput): Promise<WPPage> {
  return wpFetch<WPPage>("/pages", {
    method: "POST",
    body: JSON.stringify({ status: "draft", ...input }),
  });
}

export async function updatePage(id: number, input: Partial<PageInput>): Promise<WPPage> {
  return wpFetch<WPPage>(`/pages/${id}`, {
    method: "POST", // WP accepts POST for updates
    body: JSON.stringify(input),
  });
}

export async function upsertPageBySlug(input: PageInput & { slug: string }): Promise<{ page: WPPage; created: boolean }> {
  const existing = await getPageBySlug(input.slug);
  if (existing) {
    const page = await updatePage(existing.id, input);
    return { page, created: false };
  }
  const page = await createPage(input);
  return { page, created: true };
}

// ====== Posts ======

export async function listPosts(opts: { perPage?: number; status?: string } = {}): Promise<WPPost[]> {
  const params = new URLSearchParams({
    per_page: String(opts.perPage ?? 100),
    status: opts.status ?? "any",
    context: "edit",
  });
  return wpFetch<WPPost[]>(`/posts?${params}`);
}

export async function getPostBySlug(slug: string): Promise<WPPost | null> {
  const params = new URLSearchParams({ slug, status: "any", context: "edit" });
  const posts = await wpFetch<WPPost[]>(`/posts?${params}`);
  return posts[0] ?? null;
}

interface PostInput extends PageInput {
  categories?: number[];
  tags?: number[];
}

export async function createPost(input: PostInput): Promise<WPPost> {
  return wpFetch<WPPost>("/posts", {
    method: "POST",
    body: JSON.stringify({ status: "draft", ...input }),
  });
}

export async function updatePost(id: number, input: Partial<PostInput>): Promise<WPPost> {
  return wpFetch<WPPost>(`/posts/${id}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function upsertPostBySlug(input: PostInput & { slug: string }): Promise<{ post: WPPost; created: boolean }> {
  const existing = await getPostBySlug(input.slug);
  if (existing) {
    const post = await updatePost(existing.id, input);
    return { post, created: false };
  }
  const post = await createPost(input);
  return { post, created: true };
}

// ====== Categories ======

export async function listCategories(): Promise<WPCategory[]> {
  return wpFetch<WPCategory[]>("/categories?per_page=100");
}

export async function getCategoryBySlug(slug: string): Promise<WPCategory | null> {
  const cats = await wpFetch<WPCategory[]>(`/categories?slug=${slug}`);
  return cats[0] ?? null;
}

export async function upsertCategoryBySlug(name: string, slug: string, parent = 0): Promise<WPCategory> {
  const existing = await getCategoryBySlug(slug);
  if (existing) return existing;
  return wpFetch<WPCategory>("/categories", {
    method: "POST",
    body: JSON.stringify({ name, slug, parent }),
  });
}

// ====== Convenience ======

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
