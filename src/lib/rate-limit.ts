import { createHash } from "node:crypto";
import { redisConfig, type RedisConfig } from "./config";

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (only meaningful when `allowed` is false). */
  retryAfterSeconds: number;
}

/** Counts hits per key inside a fixed window; implementations decide where the counts live. */
export interface RateLimitStore {
  /**
   * Records one hit.
   * @param key - Opaque caller key.
   * @param windowMs - Window length; the window starts at the first hit.
   * @param now - Current time in milliseconds.
   * @returns The hits so far in this window and when the window ends.
   */
  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
}

const MAX_TRACKED_KEYS = 5_000;
const REDIS_TIMEOUT_MS = 1_500;
/** Hex characters of the hashed caller kept in a key: 128 bits, ample to avoid collisions. */
const KEY_HASH_HEX_CHARS = 32;

/** Counts in this instance's memory: free and fast, but not shared between serverless instances. */
export function memoryStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, windowMs, now) {
      // Sweep expired windows only when the map grows, so a normal hit stays O(1).
      if (windows.size > MAX_TRACKED_KEYS) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      }
      let current = windows.get(key);
      if (!current || current.resetAt <= now) {
        current = { count: 0, resetAt: now + windowMs };
        windows.set(key, current);
      }
      current.count += 1;
      return { ...current };
    },
  };
}

/**
 * Counts in Redis through its REST API (Upstash or Vercel KV), so the limit holds across every
 * serverless instance. One pipelined request increments the counter, starts the expiry on the first
 * hit and reads the time left.
 * @param config - REST URL and token.
 * @param fetchImpl - Injected for tests.
 */
export function redisStore(config: RedisConfig, fetchImpl: typeof fetch = fetch): RateLimitStore {
  return {
    async hit(key, windowMs, now) {
      const response = await fetchImpl(`${config.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", key],
          ["PEXPIRE", key, windowMs, "NX"],
          ["PTTL", key],
        ]),
        signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Redis responded with ${response.status}`);
      const [count, , ttl] = ((await response.json()) as { result?: unknown }[]).map((r) =>
        Number(r.result),
      );
      if (!Number.isFinite(count) || !Number.isFinite(ttl)) throw new Error("Bad Redis reply");
      return { count: count as number, resetAt: now + (ttl && ttl > 0 ? ttl : windowMs) };
    },
  };
}

/**
 * Uses `primary`, and `fallback` whenever the primary fails, so an outage of the shared store never
 * blocks real users: limiting degrades to per-instance instead of failing.
 * @param primary - Preferred store.
 * @param fallback - Store used when the primary throws.
 */
export function withFallback(primary: RateLimitStore, fallback: RateLimitStore): RateLimitStore {
  return {
    async hit(key, windowMs, now) {
      try {
        return await primary.hit(key, windowMs, now);
      } catch (error) {
        console.error(
          "Shared rate limit unavailable:",
          error instanceof Error ? error.name : error,
        );
        return fallback.hit(key, windowMs, now);
      }
    },
  };
}

/** The shared store when Redis credentials are configured, otherwise this instance's memory. */
export function defaultStore(): RateLimitStore {
  const redis = redisConfig();
  return redis ? withFallback(redisStore(redis), memoryStore()) : memoryStore();
}

interface RateLimitOptions {
  /** Short name of the protected route; keeps each route's counters apart. */
  name: string;
  /** Maximum requests allowed per key within one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Where counts live. */
  store?: RateLimitStore;
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * Creates a fixed-window rate limiter keyed by caller (here: client IP). Keys are hashed before
 * they reach any store, so no raw IP address is ever kept.
 * @param options - Route name, limit, window and store.
 * @returns An object whose `check` records a hit and reports whether it is allowed.
 */
export function createRateLimiter({
  name,
  limit,
  windowMs,
  store = defaultStore(),
}: RateLimitOptions) {
  return {
    async check(caller: string, now = Date.now()): Promise<RateLimitResult> {
      const key = `rl:${name}:${createHash("sha256").update(caller).digest("hex").slice(0, KEY_HASH_HEX_CHARS)}`;
      const { count, resetAt } = await store.hit(key, windowMs, now);
      if (count <= limit) return { allowed: true, retryAfterSeconds: 0 };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
    },
  };
}
