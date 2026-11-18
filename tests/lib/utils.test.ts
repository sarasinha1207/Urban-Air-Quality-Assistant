import { describe, expect, it } from "vitest";
import { TtlCache } from "@/lib/cache";
import { buildCsp } from "@/lib/csp";
import { optionValues } from "@/lib/options";
import { buildUserPrompt, SYSTEM_INSTRUCTION } from "@/lib/prompt";
import { createRateLimiter } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { profile, snapshot } from "../fixtures";

describe("TtlCache", () => {
  it("returns values until they expire", () => {
    const cache = new TtlCache<string>(1000, 10);
    cache.set("a", "x", 0);
    expect(cache.get("a", 999)).toBe("x");
    expect(cache.get("a", 1000)).toBeUndefined();
    expect(cache.get("missing", 0)).toBeUndefined();
  });

  it("evicts the oldest entry when full but keeps updates in place", () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("b", 3, 0);
    expect(cache.get("a", 1)).toBe(1);
    cache.set("c", 4, 0);
    expect(cache.get("a", 1)).toBeUndefined();
    expect(cache.get("b", 1)).toBe(3);
    expect(cache.get("c", 1)).toBe(4);
  });
});

describe("createRateLimiter", () => {
  it("blocks after the limit and reports when to retry", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 1000).allowed).toBe(true);
    expect(limiter.check("ip", 2000)).toEqual({ allowed: false, retryAfterSeconds: 58 });
  });

  it("tracks keys separately and resets after the window", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 500).allowed).toBe(false);
    expect(limiter.check("a", 1000).allowed).toBe(true);
  });
});

describe("sanitizeText", () => {
  it("removes markup, quotes and control characters and bounds the length", () => {
    expect(sanitizeText('  <b>Hi</b>\n"there"\u0000 {x}  ', 50)).toBe("b Hi /b there x");
    expect(sanitizeText("abcdef", 3)).toBe("abc");
  });
});

describe("buildCsp", () => {
  it("is strict in production", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'nonce-abc'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("allows what Next dev tooling needs in development", () => {
    const csp = buildCsp("abc", true);
    expect(csp).toContain("'unsafe-eval'");
    // A nonce would make browsers ignore 'unsafe-inline', so dev styles carry no nonce.
    expect(csp).toContain("style-src 'self' 'unsafe-inline';");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("prompt", () => {
  it("puts untrusted data in a delimited block and never in the system instruction", () => {
    const prompt = buildUserPrompt(profile, "Delhi", snapshot);
    expect(prompt.startsWith("<user_data>")).toBe(true);
    expect(prompt).toContain('"pm25MultipleOfWhoDailyGuideline":12');
    expect(SYSTEM_INSTRUCTION).toContain("<user_data>");
  });
});

describe("optionValues", () => {
  it("extracts values in order", () => {
    expect(optionValues([{ value: "a" }, { value: "b" }] as const)).toEqual(["a", "b"]);
  });
});
