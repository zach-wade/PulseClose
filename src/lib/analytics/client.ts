// Client-side PostHog. No-ops entirely when NEXT_PUBLIC_POSTHOG_KEY is unset,
// so the app runs identically with or without analytics configured (the key
// is set in Vercel env when ready). Used for pageviews/autocapture + a few
// explicit funnel events.

import posthog from "posthog-js";

let initialized = false;

export function initPosthog() {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: false, // we capture manually on route change
    capture_pageleave: true,
  });
  initialized = true;
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

export function trackPageview(path: string) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture("$pageview", { $current_url: path });
}
