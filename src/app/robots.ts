import type { MetadataRoute } from "next";

// app.pulseclose.com is the authenticated product, NOT the marketing site.
// All public/marketing content lives at pulseclose.com (WordPress).
// Disallow all crawlers — there's nothing here for them to index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
