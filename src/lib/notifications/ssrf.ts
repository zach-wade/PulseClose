// SSRF defense for outbound webhook URLs (Slack, Teams, generic).
//
// Audit M1: previously the only validation was `url.startsWith("https://")`
// which let a logged-in user register http://169.254.169.254/ (AWS
// metadata), https://localhost:8080/, or any RFC1918 host. The dispatch
// path then dutifully POSTed to that URL, exfiltrating notification
// content + giving the requester a server-side fetch primitive against
// internal services.
//
// We check at two boundaries:
//   1. notification_preferences POST — reject obviously-bad shapes early.
//   2. dispatch time — re-resolve and re-check (DNS rebinding defense).
// Both call `assertSafePublicUrl` below.
//
// Allow-by-default for arbitrary public hosts is correct here — the
// product point is "send a notification to YOUR Slack" and we don't want
// to maintain an allow-list. The danger is internal targets, which we
// enumerate explicitly.

import { lookup } from "node:dns/promises";

export class UnsafeWebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeWebhookUrlError";
  }
}

/**
 * Throws UnsafeWebhookUrlError if the URL is malformed, non-HTTPS, or
 * resolves to a private/link-local/loopback/CGNAT address. Otherwise
 * resolves cleanly.
 */
export async function assertSafePublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeWebhookUrlError("Webhook URL is malformed");
  }
  if (parsed.protocol !== "https:") {
    throw new UnsafeWebhookUrlError("Webhook URL must use https://");
  }
  // Strip default port + userinfo edge cases — URL parser already
  // handles these but reject userinfo explicitly to avoid auth-stuffing.
  if (parsed.username || parsed.password) {
    throw new UnsafeWebhookUrlError("Webhook URL must not contain credentials");
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new UnsafeWebhookUrlError("Webhook URL has no hostname");
  }

  // Reject literal IPv4/IPv6 in private/loopback/link-local ranges
  // before DNS lookup. DNS resolution is also done so a hostname that
  // resolves into one of these ranges is caught too.
  if (isPrivateLiteral(hostname)) {
    throw new UnsafeWebhookUrlError("Webhook URL points at a non-public address");
  }

  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeWebhookUrlError("Webhook URL hostname did not resolve");
  }
  if (addrs.length === 0) {
    throw new UnsafeWebhookUrlError("Webhook URL hostname did not resolve");
  }
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new UnsafeWebhookUrlError(
        "Webhook URL resolves to a non-public address",
      );
    }
  }
}

// True if the input string is itself a literal IP in a non-public range.
// Hostnames return false; they need DNS resolution before checking.
function isPrivateLiteral(host: string): boolean {
  // Strip [v6] brackets if present.
  const h = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) return isPrivateIPv4(h);
  if (h.includes(":")) return isPrivateIPv6(h);
  return false;
}

function isPrivateAddress(addr: string): boolean {
  if (addr.includes(":")) return isPrivateIPv6(addr);
  return isPrivateIPv4(addr);
}

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // Malformed — reject defensively.
    return true;
  }
  const [a, b] = parts;
  // 0.0.0.0/8 — "this" network
  if (a === 0) return true;
  // 10.0.0.0/8 — RFC1918
  if (a === 10) return true;
  // 100.64.0.0/10 — CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local (incl. AWS/GCP metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 — IETF protocol assignments
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  // 192.168.0.0/16 — RFC1918
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 — benchmark
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 — multicast
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 — reserved
  if (a >= 240) return true;
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  // ::1 loopback
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  // :: unspecified
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;
  // fc00::/7 — unique local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  // fe80::/10 — link-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  // ff00::/8 — multicast
  if (/^ff[0-9a-f]{2}:/.test(lower)) return true;
  // ::ffff:ipv4 — IPv4-mapped; check the v4 portion
  const v4mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]);
  return false;
}
