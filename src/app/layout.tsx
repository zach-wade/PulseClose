import type { Metadata } from "next";
import { Suspense } from "react";
// Use the locally-bundled geist package instead of next/font/google. The
// Google Fonts fetch in `next build` is non-deterministic on Vercel's build
// box — it intermittently fails with "Failed to fetch `Geist Mono` from Google
// Fonts" and breaks the deploy on otherwise-identical code. geist ships the
// font files in the package, so the build never touches the network. The
// exported CSS variables (--font-geist-sans / --font-geist-mono) are identical,
// so globals.css and the className below are unchanged.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PostHogProvider } from "@/components/posthog-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseClose",
  description: "PulseClose — borrower validation product login.",
  // app.pulseclose.com is the authenticated product. Marketing lives at pulseclose.com.
  robots: {
    index: false,
    follow: false,
  },
  // Explicit icon refs override the (now-deleted) legacy favicon.ico
  // and force browsers off any cached version they had. Bump the ?v=
  // suffix when the SVG changes to bust caches again.
  icons: {
    icon: [
      { url: "/icon.svg?v=2", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.svg?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <PostHogProvider />
        </Suspense>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
