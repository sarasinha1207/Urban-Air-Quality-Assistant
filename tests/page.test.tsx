import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("Home page", () => {
  it("has the landmarks, heading, disclaimer and attribution", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Urban Air Quality Assistant" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/not medical advice/i);
    expect(screen.getByRole("link", { name: "Open-Meteo.com" })).toHaveAttribute(
      "href",
      "https://open-meteo.com/",
    );
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main",
    );
  });
});
