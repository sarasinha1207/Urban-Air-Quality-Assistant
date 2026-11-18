interface RateLimitOptions {
  /** Maximum requests allowed per key within one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (only meaningful when `allowed` is false). */
  retryAfterSeconds: number;
}

/**
 * Creates a fixed-window rate limiter keyed by an arbitrary string (here: client IP).
 *
 * shortcut: state lives in this server instance's memory, so the limit is per warm serverless
 * instance, not global; swap the Map for Upstash Redis or Vercel KV if strict global limits matter.
 * @param options - Limit and window size.
 * @returns An object whose `check` records a hit and reports whether it is allowed.
 */
export function createRateLimiter({ limit, windowMs }: RateLimitOptions) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);

      const current = windows.get(key);
      if (!current) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (current.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
      }
      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
