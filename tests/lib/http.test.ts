// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { describeError, httpStatusOf } from "@/lib/errors";
import { enforceRateLimit, errorResponse, readJsonBody, rejectCrossSite } from "@/lib/http";

const request = (headers: Record<string, string> = {}, body?: BodyInit) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

describe("errorResponse", () => {
  it("returns the shared error shape and is never cached", async () => {
    const response = errorResponse(418, "teapot", "No.", { "X-Extra": "1" });
    expect(response.status).toBe(418);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-extra")).toBe("1");
    expect(await response.json()).toEqual({ error: { code: "teapot", message: "No." } });
  });
});

describe("rejectCrossSite", () => {
  it("blocks requests a browser marks as cross-site", async () => {
    const blocked = rejectCrossSite(request({ "sec-fetch-site": "cross-site" }));
    expect(blocked?.status).toBe(403);
    expect((await blocked?.json())?.error.code).toBe("forbidden");
  });

  it.each(["same-origin", "same-site", "none"])("allows %s", (value) => {
    expect(rejectCrossSite(request({ "sec-fetch-site": value }))).toBeNull();
  });

  it("allows callers that send no fetch metadata (curl, server-to-server, tests)", () => {
    expect(rejectCrossSite(request())).toBeNull();
  });
});

describe("enforceRateLimit", () => {
  const limiterFor = (allowed: boolean) => {
    const check = vi.fn().mockResolvedValue({ allowed, retryAfterSeconds: 7 });
    return { limiter: { check }, check };
  };

  it("identifies the caller by the most trustworthy forwarded address", async () => {
    const { limiter, check } = limiterFor(true);
    const cases: [Record<string, string>, string][] = [
      [
        {
          "x-vercel-forwarded-for": "1.1.1.1",
          "x-real-ip": "2.2.2.2",
          "x-forwarded-for": "3.3.3.3",
        },
        "1.1.1.1",
      ],
      [{ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }, "2.2.2.2"],
      [{ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }, "3.3.3.3"],
      [{}, "unknown"],
    ];
    for (const [headers, expected] of cases) {
      expect(await enforceRateLimit(limiter, request(headers))).toBeNull();
      expect(check).toHaveBeenLastCalledWith(expected);
    }
  });

  it("returns 429 with Retry-After when over the limit", async () => {
    const response = await enforceRateLimit(limiterFor(false).limiter, request());
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("7");
  });
});

describe("readJsonBody", () => {
  const read = (headers: Record<string, string>, body: BodyInit | undefined, max = 100) =>
    readJsonBody(request(headers, body), max);

  it("parses a valid JSON body", async () => {
    expect(await read({}, '{"a":1}')).toEqual({ ok: true, body: { a: 1 } });
  });

  it("rejects other content types with 415", async () => {
    const result = await read({ "content-type": "text/plain" }, "{}");
    expect(result.ok === false && result.response.status).toBe(415);
  });

  it("rejects malformed JSON, and an empty body, with 400", async () => {
    for (const body of ["{nope", undefined]) {
      const result = await read({}, body);
      expect(result.ok === false && result.response.status).toBe(400);
    }
  });

  it("rejects a declared length over the cap without reading the body", async () => {
    const text = vi.spyOn(Request.prototype, "text");
    const result = await read({ "content-length": "5000" }, "{}");
    expect(result.ok === false && result.response.status).toBe(413);
    expect(text).not.toHaveBeenCalled();
    text.mockRestore();
  });

  it("stops reading an oversized body, even one that does not declare its length", async () => {
    const result = await read({}, JSON.stringify({ pad: "x".repeat(500) }));
    expect(result.ok === false && result.response.status).toBe(413);
  });

  it("counts bytes, not characters: multi-byte text can exceed the cap", async () => {
    // 40 characters but 120 bytes in UTF-8.
    const result = await read({}, JSON.stringify({ t: "€".repeat(33) }), 100);
    expect(result.ok === false && result.response.status).toBe(413);
  });
});

describe("error helpers", () => {
  it("read an HTTP status only when it is a number", () => {
    expect(httpStatusOf(Object.assign(new Error("x"), { status: 429 }))).toBe(429);
    expect(httpStatusOf({ status: "429" })).toBeUndefined();
    expect(httpStatusOf(null)).toBeUndefined();
    expect(httpStatusOf("boom")).toBeUndefined();
  });

  it("describe errors by class and status, never by message", () => {
    const error = Object.assign(new TypeError("secret detail"), { status: 503 });
    expect(describeError(error)).toBe("TypeError 503");
    expect(describeError(new RangeError("x"))).toBe("RangeError");
    expect(describeError("weird")).toBe("UnknownError");
  });
});
