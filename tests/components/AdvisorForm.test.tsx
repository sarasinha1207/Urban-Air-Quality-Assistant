import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdvisorForm from "@/components/AdvisorForm";
import { adviceResponse } from "../fixtures";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(json(adviceResponse));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "geolocation");
});

function setup() {
  const user = userEvent.setup();
  render(<AdvisorForm />);
  return {
    user,
    submit: () => user.click(screen.getByRole("button", { name: /get my clean-air plan/i })),
  };
}

describe("AdvisorForm", () => {
  it("renders labelled controls and an empty state", () => {
    setup();
    for (const label of [
      "City or ZIP code",
      "Children under 12",
      "Adults over 65",
      "Asthma or another lung condition",
      "Main commute",
      "Home type",
      "Cooking fuel",
      "Heating fuel",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(/your personalised plan will appear here/i)).toBeInTheDocument();
  });

  it("does not submit without a location", async () => {
    const { submit } = setup();
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the household profile and shows the plan, moving focus to it", async () => {
    const { user, submit } = setup();
    await user.type(screen.getByLabelText("City or ZIP code"), "Delhi");
    await user.click(screen.getByLabelText("Children under 12"));
    await user.click(screen.getByLabelText("Asthma or another lung condition"));
    await user.selectOptions(screen.getByLabelText("Main commute"), "car");
    await submit();

    expect(
      await screen.findByRole("heading", { name: /today.s air snapshot/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/your impact:/i)).toHaveLength(9);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      location: { kind: "query", query: "Delhi" },
      hasChildren: true,
      hasElderly: false,
      conditions: ["respiratory"],
      commute: "car",
      home: "apartment",
      cookingFuel: "lpg_or_gas",
      heatingFuel: "electric",
    });
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Your clean-air plan" })).toHaveFocus(),
    );
  });

  it("shows a loading status and ignores a second submit while loading", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const { user, submit } = setup();
    await user.type(screen.getByLabelText("City or ZIP code"), "Delhi");
    await submit();

    expect(await screen.findByText(/reading live air data/i)).toBeInTheDocument();
    const busy = screen.getByRole("button", { name: /building your plan/i });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await user.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolve(json(adviceResponse));
    expect(
      await screen.findByRole("heading", { name: /today.s air snapshot/i }),
    ).toBeInTheDocument();
  });

  it("announces the server's error message", async () => {
    fetchMock.mockResolvedValue(
      json({ error: { code: "location_not_found", message: "No such place." } }, 404),
    );
    const { user, submit } = setup();
    await user.type(screen.getByLabelText("City or ZIP code"), "Atlantis");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("No such place.");
  });

  it("falls back to a generic message for non-JSON failures", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    const { user, submit } = setup();
    await user.type(screen.getByLabelText("City or ZIP code"), "Delhi");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("explains network failures", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { user, submit } = setup();
    await user.type(screen.getByLabelText("City or ZIP code"), "Delhi");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Network problem");
  });

  describe("device location", () => {
    function stubGeolocation(
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => void,
    ) {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition },
      });
    }

    it("uses rounded coordinates instead of typed text", async () => {
      stubGeolocation((ok) =>
        ok({ coords: { latitude: 28.61394, longitude: 77.20902 } } as GeolocationPosition),
      );
      const { user, submit } = setup();
      await user.click(screen.getByRole("button", { name: /use my location/i }));
      expect(screen.getByText(/using your device location/i)).toBeInTheDocument();
      expect(screen.getByLabelText("City or ZIP code")).not.toBeRequired();

      await submit();
      await screen.findByRole("heading", { name: /today.s air snapshot/i });
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).location).toEqual({
        kind: "coords",
        latitude: 28.61,
        longitude: 77.21,
      });
    });

    it("explains when permission is denied", async () => {
      stubGeolocation((_ok, fail) => fail({} as GeolocationPositionError));
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: /use my location/i }));
      expect(screen.getByText(/could not get your location/i)).toBeInTheDocument();
    });

    it("explains when the browser has no geolocation", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: /use my location/i }));
      expect(screen.getByText(/does not support location/i)).toBeInTheDocument();
    });
  });
});
