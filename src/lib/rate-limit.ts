// Rate limiter for API routes.
//
// Two modes:
//   1. Upstash Redis REST when UPSTASH_REDIS_REST_URL +
//      UPSTASH_REDIS_REST_TOKEN are configured. This is the production
//      mode — works correctly across the N Vercel lambdas behind the
//      load balancer.
//   2. In-memory sliding window when env vars are absent. This is the
//      local-dev / preview-deploy fallback. Per-process so on Vercel
//      under burst the effective limit is N × configured (audit M4).
//
// API is async in both modes. Fixed-window in Redis (cheap; one INCR +
// optional EXPIRE per request) is good enough for our anti-abuse use
// case — sliding-window precision was overkill.
//
// To switch on Upstash: create a Redis database at upstash.com (the
// global tier is fine), add UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN to Vercel env vars, redeploy. No code change.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_ENABLED = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

let warnedFallback = false;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key (e.g., org_id or share token).
 * @param key       Unique identifier for the rate limit bucket
 * @param limit     Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds (default 60s)
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000,
): Promise<RateLimitResult> {
  if (UPSTASH_ENABLED) {
    try {
      return await checkRateLimitRedis(key, limit, windowMs);
    } catch (err) {
      // Network blip or Upstash down — fail open with the in-memory
      // fallback rather than 5xx every protected route. The lambda-local
      // counter is per-process but we'd rather rate-limit imperfectly
      // than not at all.
      console.warn("[rate-limit] Redis check failed, falling back to memory:", err);
      return checkRateLimitMemory(key, limit, windowMs);
    }
  }
  if (!warnedFallback) {
    warnedFallback = true;
    console.info(
      "[rate-limit] UPSTASH_REDIS_REST_* not set — using per-lambda in-memory store. Effective limit will be N × configured under load.",
    );
  }
  return checkRateLimitMemory(key, limit, windowMs);
}

// ── Upstash Redis REST path ──────────────────────────────────────────────

interface UpstashResult<T> {
  result?: T;
  error?: string;
}

// One pipeline call: INCR key; PEXPIRE key windowMs (only on first hit).
// Upstash's REST `pipeline` endpoint runs these atomically in order. The
// PEXPIRE result is discarded — we only care about the count.
async function pipeline(commands: Array<Array<string | number>>): Promise<unknown[]> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) {
    throw new Error(`Upstash ${res.status}: ${await res.text()}`);
  }
  const out = (await res.json()) as UpstashResult<unknown>[];
  return out.map((r) => {
    if (r.error) throw new Error(`Upstash command error: ${r.error}`);
    return r.result;
  });
}

async function checkRateLimitRedis(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  // Window-bucketed key so each window starts fresh without needing a
  // delete. Floor of (now / windowMs) bucketizes time into windowMs
  // slots; key includes the bucket id so the previous slot's counter
  // doesn't leak in.
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const redisKey = `rl:${key}:${bucket}`;
  const ttlMs = windowMs + 1000; // slack so the key outlives its window

  const [countRaw] = await pipeline([
    ["INCR", redisKey],
    ["PEXPIRE", redisKey, ttlMs],
  ]);
  const count = typeof countRaw === "number" ? countRaw : Number(countRaw);

  const resetAt = (bucket + 1) * windowMs;
  if (count > limit) {
    return { allowed: false, remaining: 0, resetAt };
  }
  return { allowed: true, remaining: Math.max(0, limit - count), resetAt };
}

// ── In-memory fallback (sliding window) ──────────────────────────────────

interface MemoryEntry {
  timestamps: number[];
}
const memoryStore = new Map<string, MemoryEntry>();
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function memoryCleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [k, entry] of memoryStore) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) memoryStore.delete(k);
  }
}

function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  memoryCleanup(windowMs);
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    memoryStore.set(key, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.timestamps[0] + windowMs,
    };
  }
  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetAt: now + windowMs,
  };
}
