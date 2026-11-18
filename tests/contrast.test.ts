// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Missing colour token --${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const pairs = [...css.matchAll(/--([a-z0-9-]+)-bg:/g)].map((m) => m[1] as string);

describe("WCAG colour contrast of design tokens", () => {
  it("finds every text pair", () => {
    expect(pairs).toEqual(
      expect.arrayContaining(["page", "surface", "muted", "accent", "link", "notice", "danger"]),
    );
    expect(pairs.filter((p) => p.startsWith("aqi-"))).toHaveLength(6);
  });

  it.each(pairs)("%s text meets AA (4.5:1)", (name) => {
    expect(ratio(token(`${name}-bg`), token(`${name}-fg`))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps form borders above the 3:1 non-text minimum on both backgrounds", () => {
    expect(ratio(token("border"), token("surface-bg"))).toBeGreaterThanOrEqual(3);
    expect(ratio(token("border"), token("page-bg"))).toBeGreaterThanOrEqual(3);
  });
});
