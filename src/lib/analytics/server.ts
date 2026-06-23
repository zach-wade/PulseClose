// Server-side PostHog capture via the HTTP capture API (no posthog-node dep).
// No-ops when NEXT_PUBLIC_POSTHOG_KEY is unset. Fire-and-forget — analytics
// must never block or break a request, so failures are swallowed + logged.

const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  try {
    await fetch(`${HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "pulseclose-server" },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn(`[posthog] server capture failed (${event}):`, err);
  }
}
