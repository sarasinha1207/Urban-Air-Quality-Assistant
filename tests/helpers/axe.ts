import axe from "axe-core";
import { expect } from "vitest";

/**
 * Runs axe-core on a rendered tree and fails with a readable list of violations.
 * Colour contrast is skipped here because jsdom has no layout engine; it is verified by
 * tests/contrast.test.ts (token pairs) and the Lighthouse accessibility audit (rendered page).
 */
export async function expectNoA11yViolations(container: Element) {
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
