// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimiter,
  defaultStore,
  memoryStore,
  redisStore,
  withFallback,
} from "@/lib/rate-limit";

const redisConfig = { url: "https://redis.example.com", token: "secret-token" };
const redisReply = (count: number, ttl: number) =>
  new Response(JSON.stringify([{ result: count }, { result: 1 }, { result: ttl }]), {
    status: 200,
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createRateLimiter", () => {
  const limiter = (limit: number, windowMs: number) =>
    createRateLimiter({ name: "test", limit, windowMs, store: memoryStore() });

  it("blocks after the limit and reports when to retry", async () => {
    const limited = limiter(2, 60_000);
    expect((await limited.check("ip", 0)).allowed).toBe(true);
    expect((await limited.check("ip", 1000)).allowed).toBe(true);
    expect(await limited.check("ip", 2000)).toEqual({ allowed: false, retryAfterSeconds: 58 });
  });

  it("tracks callers separately and resets after the window", async () => {
    const limited = limiter(1, 1000);
    expect((await limited.check("a", 0)).allowed).toBe(true);
    expect((await limited.check("b", 0)).allowed).toBe(true);
    expect((await limited.check("a", 500)).allowed).toBe(false);
    expect((await limited.check("a", 1000)).allowed).toBe(true);
  });

  it("keeps routes apart and never hands a raw IP address to the store", async () => {
    const hit = vi.fn().mockResolvedValue({ count: 1, resetAt: 1 });
    await createRateLimiter({ name: "advice", limit: 1, windowMs: 1, store: { hit } }).check(
      "203.0.113.9",
      0,
    );
    const key = hit.mock.calls[0]?.[0] as string;
    expect(key).toMatch(/^rl:advice:[0-9a-f]{32}$/);
    expect(key).not.toContain("203.0.113.9");
  });
});

describe("memoryStore", () => {
  it("sweeps expired windows once many callers have been seen", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5_001; i++) await store.hit(`caller-${i}`, 10, 0);
    // A sweep while every window is still open removes nothing.
    expect(await store.hit("alive", 10, 5)).toEqual({ count: 1, resetAt: 15 });
    expect(await store.hit("caller-0", 10, 5)).toEqual({ count: 2, resetAt: 10 });
    // The sweep runs on this call; the expired window for caller-0 starts afresh.
    expect(await store.hit("caller-0", 10, 100)).toEqual({ count: 1, resetAt: 110 });
  });
});

describe("redisStore", () => {
  it("counts through one pipelined REST call with the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(redisReply(3, 42_000));
    const result = await redisStore(redisConfig, fetchMock).hit("k", 60_000, 1_000);

    expect(result).toEqual({ count: 3, resetAt: 43_000 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://redis.example.com/pipeline");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body)).toEqual([
      ["INCR", "k"],
      ["PEXPIRE", "k", 60_000, "NX"],
      ["PTTL", "k"],
    ]);
  });

  it("uses the full window when the key has no expiry yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(redisReply(1, -1));
    expect(await redisStore(redisConfig, fetchMock).hit("k", 60_000, 0)).toEqual({
      count: 1,
      resetAt: 60_000,
    });
  });

  it.each([
    ["an HTTP error", new Response("no", { status: 500 })],
    ["a malformed reply", new Response(JSON.stringify([{ result: "x" }]), { status: 200 })],
  ])("throws on %s", async (_label, response) => {
    const fetchMock = vi.fn().mockResolvedValue(response);
    await expect(redisStore(redisConfig, fetchMock).hit("k", 1, 0)).rejects.toThrow();
  });
});

describe("withFallback", () => {
  it("uses the primary store while it works", async () => {
    const primary = { hit: vi.fn().mockResolvedValue({ count: 1, resetAt: 5 }) };
    const fallback = { hit: vi.fn() };
    await withFallback(primary, fallback).hit("k", 1, 0);
    expect(fallback.hit).not.toHaveBeenCalled();
  });

  it("falls back to the second store, logging only the error name", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const primary = { hit: vi.fn().mockRejectedValue(new TypeError("secret-token leaked")) };
    const fallback = { hit: vi.fn().mockResolvedValue({ count: 2, resetAt: 9 }) };

    expect(await withFallback(primary, fallback).hit("k", 1, 0)).toEqual({ count: 2, resetAt: 9 });
    expect(log.mock.calls.flat().join(" ")).toContain("TypeError");
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret-token");

    primary.hit.mockRejectedValue("not an error object");
    await withFallback(primary, fallback).hit("k", 1, 0);
    log.mockRestore();
  });
});

describe("defaultStore", () => {
  it("is shared (Redis) when credentials are set, and in-memory otherwise", async () => {
    const fetchMock = vi.fn().mockResolvedValue(redisReply(1, 1000));
    vi.stubGlobal("fetch", fetchMock);

    await defaultStore().hit("k", 1000, 0);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    await defaultStore().hit("k", 1000, 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
