import { expect, test, type Page } from "@playwright/test";

const category = { level: 3, label: "Unhealthy", symbol: "◆", max: 200 };
const suggestion = (n: number) => ({
  title: `Tip ${n}`,
  detail: "Do this today.",
  impact: `Cuts exposure by about ${n}0%.`,
});
const planResponse = {
  placeName: "Delhi, India",
  snapshot: {
    usAqi: 180,
    pm25: 30,
    pm10: 55,
    whoMultiple: 2,
    category,
    observedAt: "2026-11-18T08:00",
  },
  advice: {
    snapshotSummary: "Air is unhealthy today.",
    routine: [suggestion(1), suggestion(2), suggestion(3)],
    indoorHacks: [suggestion(4), suggestion(5), suggestion(6)],
    alternatives: [suggestion(7), suggestion(8), suggestion(9)],
  },
  source: "ai",
  notices: [],
};

/** Collects console errors (including CSP violations) and uncaught exceptions. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("a family gets a personalised plan using only the keyboard", async ({ page }) => {
  const errors = trackErrors(page);
  await page.route("**/api/advice", (route) => route.fulfill({ json: planResponse }));
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();

  await page.getByLabel("City or ZIP code").fill("Delhi");
  await page.getByLabel("Children under 12").check();
  await page.getByLabel("Main commute").selectOption("car");
  await page.getByLabel("City or ZIP code").press("Enter");

  await expect(page.getByRole("heading", { name: /today.s air snapshot/i })).toBeVisible();
  await expect(page.getByText("AQI 180")).toBeVisible();
  await expect(page.getByText("Unhealthy", { exact: true })).toBeVisible();
  for (const name of [
    "Low-Emission Daily Routine",
    "Indoor Air Hacks",
    "Sustainable Alternatives",
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByText("Your impact:")).toHaveCount(9);
  await expect(page.getByRole("region", { name: "Your clean-air plan" })).toBeFocused();
  expect(errors).toEqual([]);
});

test("an error is announced and the form stays usable", async ({ page }) => {
  await page.route("**/api/advice", (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "location_not_found", message: "We could not find that place." } },
    }),
  );
  await page.goto("/");
  await page.getByLabel("City or ZIP code").fill("Atlantis");
  await page.getByRole("button", { name: "Get my clean-air plan" }).click();

  // Next's own route announcer is also role="alert", so match on the message.
  await expect(page.getByRole("alert").filter({ hasText: "We could not find" })).toBeVisible();
  await expect(page.getByLabel("City or ZIP code")).toBeEditable();
});

test("the page ships a nonce-based CSP and security headers", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-.+' 'strict-dynamic'/,
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("the floating assistant answers a question and closes with Escape", async ({ page }) => {
  const errors = trackErrors(page);
  await page.route("**/api/chat", (route) =>
    route.fulfill({ json: { reply: "Wear a fitted N95 outdoors." } }),
  );
  await page.goto("/");

  const launcher = page.getByRole("button", { name: "Ask the assistant" });
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Air quality assistant chat" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Your question")).toBeFocused();

  await page.getByLabel("Your question").fill("Which mask should I wear?");
  await page.getByLabel("Your question").press("Enter");
  await expect(dialog.getByText("Wear a fitted N95 outdoors.")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
  expect(errors).toEqual([]);
});

test("the chat API rejects invalid input", async ({ request }) => {
  const response = await request.post("/api/chat", {
    data: { messages: [{ role: "assistant", content: "Hi" }] },
  });
  expect(response.status()).toBe(400);
});

test("the API rejects invalid input without calling any upstream", async ({ request }) => {
  const response = await request.post("/api/advice", { data: { location: "Delhi" } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("invalid_input");
});
