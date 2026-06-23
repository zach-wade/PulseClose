"use client";

// Initializes PostHog once and captures a pageview on each route change.
// Mounted in the root layout. Renders nothing; no-ops without a configured key.

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPosthog, trackPageview } from "@/lib/analytics/client";

export function PostHogProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initPosthog();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const qs = searchParams?.toString();
    trackPageview(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams]);

  return null;
}
