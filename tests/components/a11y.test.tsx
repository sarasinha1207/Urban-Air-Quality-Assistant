import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, vi } from "vitest";
import { AqiBadge } from "@/components/AqiBadge";
import Home from "@/app/page";
import { AQI_CATEGORIES } from "@/lib/air-quality";
import { adviceResponse } from "../fixtures";
import { expectNoA11yViolations } from "../helpers/axe";

afterEach(() => vi.unstubAllGlobals());

async function submitFrom(container: HTMLElement) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("City or ZIP code"), "Delhi");
  await user.click(screen.getByRole("button", { name: /get my clean-air plan/i }));
  return container;
}

describe("accessibility (axe-core)", () => {
  it("the empty page has no violations", async () => {
    const { container } = render(<Home />);
    await expectNoA11yViolations(container);
  });

  it("the page with a full plan has no violations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(adviceResponse))));
    const { container } = render(<Home />);
    await submitFrom(container);
    await screen.findByRole("heading", { name: /today.s air snapshot/i });
    await expectNoA11yViolations(container);
  });

  it("the page with an error has no violations", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: "Nope." } }), { status: 404 }),
        ),
    );
    const { container } = render(<Home />);
    await submitFrom(container);
    await screen.findByRole("alert");
    await expectNoA11yViolations(container);
  });

  it.each(AQI_CATEGORIES)("the AQI badge for level $level has no violations", async (category) => {
    const { container } = render(<AqiBadge aqi={100} category={category} />);
    await expectNoA11yViolations(container);
  });
});
