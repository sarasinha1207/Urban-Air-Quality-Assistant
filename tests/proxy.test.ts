// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

describe("proxy", () => {
  it("adds a nonce-based CSP and a fresh nonce per request", () => {
    const first = proxy(new NextRequest("http://localhost/"));
    const second = proxy(new NextRequest("http://localhost/"));

    const csp = first.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[\w+/=-]+' 'strict-dynamic'/);
    expect(csp).toContain("default-src 'self'");
    expect(second.headers.get("content-security-policy")).not.toBe(csp);
  });
});
