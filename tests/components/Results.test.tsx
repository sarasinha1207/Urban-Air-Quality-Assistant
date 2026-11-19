import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AqiBadge } from "@/components/AqiBadge";
import Results from "@/components/Results";
import { AQI_CATEGORIES } from "@/lib/air-quality";
import { adviceResponse, snapshot } from "../fixtures";

describe("Results", () => {
  it("shows the snapshot and every required section with an impact per suggestion", () => {
    render(<Results data={adviceResponse} />);

    const snapshotSection = screen.getByRole("region", { name: /today.s air snapshot/i });
    expect(within(snapshotSection).getByText("AQI 312")).toBeInTheDocument();
    expect(within(snapshotSection).getByText("Hazardous")).toBeInTheDocument();
    expect(within(snapshotSection).getByText("180.4 µg/m³")).toBeInTheDocument();
    expect(within(snapshotSection).getByText("12× the limit")).toBeInTheDocument();
    expect(within(snapshotSection).getByText("Delhi, India")).toBeInTheDocument();

    for (const name of [
      "Low-Emission Daily Routine",
      "Indoor Air Hacks",
      "Sustainable Alternatives",
    ]) {
      const section = screen.getByRole("region", { name });
      expect(within(section).getAllByText(/your impact:/i)).toHaveLength(3);
    }
    expect(screen.getByText(/plan written by gemini ai/i)).toBeInTheDocument();
    expect(screen.getByText(/rough estimates/i)).toBeInTheDocument();
  });

  it("handles missing live data, notices, missing PM10 and the fallback source", () => {
    render(
      <Results
        data={{ ...adviceResponse, snapshot: null, source: "fallback", notices: ["Heads up."] }}
      />,
    );
    expect(screen.getByText("Heads up.")).toBeInTheDocument();
    expect(screen.getByText(/live readings are unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/built-in smog guidance/i)).toBeInTheDocument();
  });

  it("omits PM10 when it is not reported", () => {
    render(<Results data={{ ...adviceResponse, snapshot: { ...snapshot, pm10: null } }} />);
    expect(screen.queryByText("PM10")).not.toBeInTheDocument();
  });
});

describe("AqiBadge", () => {
  it.each(AQI_CATEGORIES)(
    "conveys level $level with words and a hidden shape glyph",
    (category) => {
      render(<AqiBadge aqi={42} category={category} />);
      expect(screen.getByText(category.label)).toBeInTheDocument();
      expect(screen.getByText("AQI 42")).toBeInTheDocument();
      expect(screen.getByText(category.symbol)).toHaveAttribute("aria-hidden", "true");
    },
  );
});
