// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural rules that protect secrets and keep the browser/server split honest. They read the
 * source tree, so a change that breaks a rule fails CI.
 */

const SRC = "src";

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const FILES = sourceFiles().map((path) => ({
  path: relative(".", path).split("\\").join("/"),
  text: readFileSync(path, "utf8"),
}));

const filesWhere = (test: (text: string, path: string) => boolean) =>
  FILES.filter(({ text, path }) => test(text, path)).map(({ path }) => path);

/** Lines of code only: comments may mention the rules they describe. */
const codeOf = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

describe("secrets and environment", () => {
  it("reads process.env only in config.ts", () => {
    expect(filesWhere((text) => /process\.env/.test(codeOf(text)))).toEqual(["src/lib/config.ts"]);
  });

  it("never exposes a variable to the browser with a NEXT_PUBLIC_ name", () => {
    expect(filesWhere((text) => text.includes("NEXT_PUBLIC_"))).toEqual([]);
  });
});

describe("browser and server separation", () => {
  const SERVER_ONLY =
    /from "(@\/lib|\.\.?\/lib|\.)\/(config|gemini|rate-limit|http|api-guard|upstream|advice-service|model-failover)"/;

  it("keeps client components away from server-only modules (type imports are fine)", () => {
    const offenders = filesWhere((text) => {
      if (!text.startsWith('"use client"')) return false;
      return text.split("\n").some((line) => SERVER_ONLY.test(line) && !/^import type/.test(line));
    });
    expect(offenders).toEqual([]);
  });

  it("lets components import only browser-safe lib modules (no Zod or server code in the bundle)", () => {
    const ALLOWED = new Set(["limits", "options", "aqi-levels"]);
    const valueImports = FILES.filter(({ path }) => path.startsWith("src/components/")).flatMap(
      ({ text, path }) =>
        [...text.matchAll(/^import (?!type)[^;]*? from "@\/lib\/([\w-]+)"/gm)].map(
          (match) => `${path} -> ${match[1]}`,
        ),
    );
    const forbidden = valueImports.filter((entry) => !ALLOWED.has(entry.split("-> ")[1] ?? ""));
    expect(forbidden).toEqual([]);
  });

  it("calls only its own API from the browser", () => {
    const urls = FILES.filter(({ path }) => path.startsWith("src/components/")).flatMap(
      ({ text }) => [...text.matchAll(/fetch\(\s*"([^"]+)"/g)].map((match) => match[1] ?? ""),
    );
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.startsWith("/api/"))).toBe(true);
  });
});

describe("unsafe patterns", () => {
  it.each([
    ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
    ["eval", /\beval\s*\(/],
    ["new Function", /new Function\s*\(/],
    ["innerHTML", /\.innerHTML\s*=/],
    ["document.write", /document\.write\s*\(/],
  ])("does not use %s", (_label, pattern) => {
    expect(filesWhere((text) => pattern.test(codeOf(text)))).toEqual([]);
  });
});

describe("outbound requests", () => {
  it("only the allow-listed helper calls fetch directly on the server", () => {
    const callers = filesWhere(
      (text, path) => /\bfetch\(/.test(codeOf(text)) && !path.startsWith("src/components/"),
    );
    expect(callers).toEqual(["src/lib/upstream.ts"]);
  });

  it("puts a timeout on the helper and on the shared rate-limit store (which uses an injected fetch)", () => {
    for (const path of ["src/lib/rate-limit.ts", "src/lib/upstream.ts"]) {
      const text = FILES.find((file) => file.path === path)?.text ?? "";
      expect(text).toContain("AbortSignal.timeout");
    }
  });
});
