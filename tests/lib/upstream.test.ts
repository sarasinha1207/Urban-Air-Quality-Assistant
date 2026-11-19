// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { UpstreamError } from "@/lib/errors";
import { ALLOWED_UPSTREAM_HOSTS, fetchJson } from "@/lib/upstream";

const schema = z.object({ ok: z.boolean() });
const allowed = new URL("https://geocoding-api.open-meteo.com/v1/search?name=Delhi");

const stubFetch = (response: Response | Error) => {
  const fn = vi.fn();
  if (response instanceof Error) fn.mockRejectedValue(response);
  else fn.mockResolvedValue(response);
  vi.stubGlobal("fetch", fn);
  return fn;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("fetchJson", () => {
  it("returns the validated payload from an allow-listed host", async () => {
    stubFetch(json({ ok: true }));
    expect(await fetchJson(allowed, schema)).toEqual({ ok: true });
  });

  it("refuses redirects, applies a timeout and forwards headers", async () => {
    const fn = stubFetch(json({ ok: true }));
    await fetchJson(allowed, schema, { "User-Agent": "test" });
    const init = fn.mock.calls[0]?.[1];
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({ "User-Agent": "test" });
  });

  it.each([
    ["a host that is not on the allowlist", "https://evil.example.com/steal"],
    ["an internal address", "https://169.254.169.254/latest/meta-data"],
    ["a look-alike host", "https://geocoding-api.open-meteo.com.evil.example.com/"],
    ["plain HTTP", "http://geocoding-api.open-meteo.com/v1/search"],
  ])("never contacts %s", async (_label, url) => {
    const fn = stubFetch(json({ ok: true }));
    await expect(fetchJson(new URL(url), schema)).rejects.toBeInstanceOf(UpstreamError);
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    ["a network failure", new TypeError("fetch failed")],
    ["a timeout", new DOMException("timeout", "TimeoutError")],
    ["a refused redirect", new TypeError("redirect mode is set to error")],
  ])("turns %s into an UpstreamError that does not echo the cause", async (_label, error) => {
    stubFetch(error);
    const failure = await fetchJson(allowed, schema).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(UpstreamError);
    expect((failure as Error).message).not.toContain(error.message);
  });

  it.each([
    ["an HTTP error", json({}, 500)],
    ["an unexpected payload", json({ ok: "yes" })],
    ["a body that is not JSON", new Response("<html>", { status: 200 })],
  ])("rejects %s", async (_label, response) => {
    stubFetch(response);
    await expect(fetchJson(allowed, schema)).rejects.toBeInstanceOf(UpstreamError);
  });

  it("only allows the three services the app uses", () => {
    expect([...ALLOWED_UPSTREAM_HOSTS].sort()).toEqual([
      "air-quality-api.open-meteo.com",
      "geocoding-api.open-meteo.com",
      "nominatim.openstreetmap.org",
    ]);
  });
});
