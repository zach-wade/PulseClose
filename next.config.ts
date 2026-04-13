import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: "build-folio",
  project: "pulseclose",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
