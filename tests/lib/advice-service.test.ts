// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/schemas";
import { advice, profile, snapshot } from "../fixtures";

const geocode = vi.hoisted(() => vi.fn());
const fetchSnapshot = vi.hoisted(() => vi.fn());
const generateAdvice = vi.hoisted(() => vi.fn());

vi.mock("@/lib/aqi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/aqi")>()),
  geocode,
  fetchSnapshot,
}));
vi.mock("@/lib/gemini", () => ({ generateAdvice }));

const place = { name: "Delhi, India", latitude: 28.6, longitude: 77.2 };
let getAdvice: typeof import("@/lib/advice-service").getAdvice;
// Re-imported after each module reset so `instanceof` checks see the same class the service threw.
let errors: typeof import("@/lib/errors");

beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  geocode.mockReset().mockResolvedValue(place);
  fetchSnapshot.mockReset().mockResolvedValue(snapshot);
  generateAdvice.mockReset().mockResolvedValue(advice);
  ({ getAdvice } = await import("@/lib/advice-service"));
  errors = await import("@/lib/errors");
});

describe("getAdvice", () => {
  it("returns AI advice with the live snapshot", async () => {
    await expect(getAdvice(profile)).resolves.toEqual({
      placeName: "Delhi, India",
      snapshot,
      advice,
      source: "ai",
      notices: [],
    });
    expect(generateAdvice).toHaveBeenCalledWith(profile, "Delhi, India", snapshot);
  });

  it("skips geocoding for device coordinates", async () => {
    const coords: Profile = { ...profile, location: { kind: "coords", latitude: 1, longitude: 2 } };
    const result = await getAdvice(coords);
    expect(geocode).not.toHaveBeenCalled();
    expect(fetchSnapshot).toHaveBeenCalledWith(1, 2);
    expect(result.placeName).toBe("Your location");
  });

  it("caches AI answers for the same household, place and pollution band", async () => {
    await getAdvice(profile);
    const second = await getAdvice(profile);
    expect(generateAdvice).toHaveBeenCalledTimes(1);
    expect(second.source).toBe("ai");
  });

  it("does not share cached answers between places", async () => {
    await getAdvice(profile);
    geocode.mockResolvedValue({ ...place, name: "Lahore, Pakistan" });
    await getAdvice(profile);
    expect(generateAdvice).toHaveBeenCalledTimes(2);
  });

  it("still advises when the air-quality service fails", async () => {
    fetchSnapshot.mockRejectedValue(new errors.UpstreamError("down"));
    const result = await getAdvice(profile);
    expect(result.snapshot).toBeNull();
    expect(result.source).toBe("ai");
    expect(result.notices[0]).toContain("Live air-quality data is unavailable");
    expect(generateAdvice).toHaveBeenCalledWith(profile, "Delhi, India", null);
  });

  it("falls back to rule-based advice when Gemini fails, and does not cache it", async () => {
    generateAdvice.mockRejectedValue(new Error("quota"));
    const result = await getAdvice(profile);
    expect(result.source).toBe("fallback");
    expect(result.notices[0]).toContain("AI assistant is unavailable");
    expect(result.advice.routine.length).toBeGreaterThanOrEqual(3);

    generateAdvice.mockResolvedValue(advice);
    expect((await getAdvice(profile)).source).toBe("ai");
  });

  it("logs a non-Error rejection without crashing", async () => {
    generateAdvice.mockRejectedValue("boom");
    expect((await getAdvice(profile)).source).toBe("fallback");
  });

  it("throws LocationNotFoundError for an unknown place", async () => {
    geocode.mockResolvedValue(null);
    await expect(getAdvice(profile)).rejects.toBeInstanceOf(errors.LocationNotFoundError);
  });

  it("throws UpstreamError when the geocoder fails", async () => {
    geocode.mockRejectedValue(new Error("network"));
    await expect(getAdvice(profile)).rejects.toBeInstanceOf(errors.UpstreamError);
  });
});
