// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { guardJsonPost } from "@/lib/api-guard";
import { createRateLimiter, memoryStore } from "@/lib/rate-limit";

const schema = z.strictObject({ name: z.string().min(2, "Name is too short.") });

function setup(limit = 5) {
  const limiter = createRateLimiter({
    name: "guard",
    limit,
    windowMs: 60_000,
    store: memoryStore(),
  });
  return (body: unknown, headers: Record<string, string> = {}, maxBytes = 200) =>
    guardJsonPost(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      { limiter, maxBytes, schema },
    );
}

describe("guardJsonPost", () => {
  it("returns the validated data for a good request", async () => {
    expect(await setup()({ name: "Delhi" })).toEqual({ ok: true, data: { name: "Delhi" } });
  });

  it("rejects cross-site requests before spending any rate-limit allowance", async () => {
    const guard = setup(1);
    const blocked = await guard({ name: "Delhi" }, { "sec-fetch-site": "cross-site" });
    expect(blocked.ok === false && blocked.response.status).toBe(403);
    expect((await guard({ name: "Delhi" })).ok).toBe(true);
  });

  it("rate-limits, with a Retry-After header", async () => {
    const guard = setup(1);
    await guard({ name: "Delhi" });
    const limited = await guard({ name: "Delhi" });
    expect(limited.ok === false && limited.response.status).toBe(429);
    expect(
      limited.ok === false && Number(limited.response.headers.get("retry-after")),
    ).toBeGreaterThan(0);
  });

  it.each([
    ["an unsupported content type", { name: "Delhi" }, { "content-type": "text/plain" }, 415],
    ["malformed JSON", "{nope", {}, 400],
    ["an oversized body", { name: "x".repeat(500) }, {}, 413],
  ])("passes through the body error for %s", async (_label, body, headers, status) => {
    const result = await setup()(body, headers);
    expect(result.ok === false && result.response.status).toBe(status);
  });

  it("reports the first validation message and never calls the handler's data path", async () => {
    const result = await setup()({ name: "D" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(await result.response.json()).toEqual({
        error: { code: "invalid_input", message: "Name is too short." },
      });
    }
  });

  it("uses a generic message if a schema reports a failure without any issue", async () => {
    const silent = { safeParse: () => ({ success: false, error: { issues: [] } }) };
    const result = await guardJsonPost(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      {
        limiter: createRateLimiter({ name: "g3", limit: 9, windowMs: 1000, store: memoryStore() }),
        maxBytes: 100,
        schema: silent as unknown as z.ZodType<unknown>,
      },
    );
    expect(result.ok === false && (await result.response.json()).error.message).toBe(
      "Invalid input.",
    );
  });

  it("falls back to a generic message when the schema gives none", async () => {
    const guard = (body: unknown) =>
      guardJsonPost(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        {
          limiter: createRateLimiter({
            name: "g2",
            limit: 9,
            windowMs: 1000,
            store: memoryStore(),
          }),
          maxBytes: 100,
          schema: z.never(),
        },
      );
    const result = await guard({});
    expect(result.ok === false && (await result.response.json()).error.code).toBe("invalid_input");
  });
});
