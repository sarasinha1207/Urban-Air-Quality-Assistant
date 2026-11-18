// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { categorize, fetchSnapshot, geocode } from "@/lib/aqi";
import { UpstreamError } from "@/lib/errors";

function mockFetch(body: unknown, init: ResponseInit = { status: 200 }) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("categorize", () => {
  it.each([
    [0, "Good", 0],
    [50, "Good", 0],
    [51, "Moderate", 1],
    [100, "Moderate", 1],
    [150, "Unhealthy for sensitive groups", 2],
    [151, "Unhealthy", 3],
    [201, "Very unhealthy", 4],
    [300, "Very unhealthy", 4],
    [301, "Hazardous", 5],
    [999, "Hazardous", 5],
  ])("maps AQI %i to %s", (aqi, label, level) => {
    expect(categorize(aqi)).toMatchObject({ label, level });
  });
});

describe("geocode", () => {
  it("returns the first match with a sanitised name", async () => {
    const fetchMock = mockFetch({
      results: [{ name: 'Del<hi>"', country: "India", latitude: 28.6, longitude: 77.2 }],
    });
    await expect(geocode("Delhi")).resolves.toEqual({
      name: "Del hi , India",
      latitude: 28.6,
      longitude: 77.2,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("name=Delhi");
  });

  it("omits a missing country", async () => {
    mockFetch({ results: [{ name: "Delhi", latitude: 1, longitude: 2 }] });
    expect((await geocode("Delhi"))?.name).toBe("Delhi");
  });

  it("returns null when nothing matches", async () => {
    mockFetch({});
    await expect(geocode("Nowhereville")).resolves.toBeNull();
  });

  describe("postal codes Open-Meteo does not know", () => {
    const delhi = {
      lat: "28.6291",
      lon: "77.2190",
      display_name: "110001, New Delhi, Delhi, India",
      address: { country_code: "in" },
    };

    /** Open-Meteo finds nothing, then Nominatim answers. */
    function mockPostcodeLookup(matches: unknown[]) {
      const fn = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(matches), { status: 200 }));
      vi.stubGlobal("fetch", fn);
      return fn;
    }

    it("falls back to OpenStreetMap when the query has a digit", async () => {
      const fetchMock = mockPostcodeLookup([delhi]);
      await expect(geocode("110001, India")).resolves.toEqual({
        name: "110001, New Delhi, Delhi, India",
        latitude: 28.6291,
        longitude: 77.219,
      });
      const [url, init] = fetchMock.mock.calls[1] ?? [];
      expect(String(url)).toContain("nominatim.openstreetmap.org");
      expect(init.headers["User-Agent"]).toContain("UrbanAirQualityAssistant");
    });

    it("accepts several matches when they are all in one country", async () => {
      mockPostcodeLookup([delhi, { ...delhi, lat: "28.7" }]);
      expect((await geocode("110001"))?.latitude).toBe(28.6291);
    });

    it("returns null when the code exists in several countries", async () => {
      mockPostcodeLookup([delhi, { ...delhi, address: { country_code: "cn" } }]);
      await expect(geocode("110001")).resolves.toBeNull();
    });

    it("returns null for no matches or unusable coordinates", async () => {
      mockPostcodeLookup([]);
      await expect(geocode("999999")).resolves.toBeNull();
      mockPostcodeLookup([{ ...delhi, lat: "north" }]);
      await expect(geocode("110001, India")).resolves.toBeNull();
    });

    it("does not call OpenStreetMap for a plain city name", async () => {
      const fetchMock = mockFetch({});
      await expect(geocode("Nowhereville")).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("throws UpstreamError on an HTTP error", async () => {
    mockFetch({}, { status: 500 });
    await expect(geocode("Delhi")).rejects.toBeInstanceOf(UpstreamError);
  });

  it("throws UpstreamError on a network failure or timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    await expect(geocode("Delhi")).rejects.toBeInstanceOf(UpstreamError);
  });

  it("throws UpstreamError on an unexpected payload", async () => {
    mockFetch({ results: [{ name: 5 }] });
    await expect(geocode("Delhi")).rejects.toBeInstanceOf(UpstreamError);
  });

  it("throws UpstreamError when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    await expect(geocode("Delhi")).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("fetchSnapshot", () => {
  it("builds a categorised snapshot with the WHO multiple", async () => {
    const fetchMock = mockFetch({
      current: { time: "2026-11-18T08:00", us_aqi: 180, pm2_5: 30, pm10: 55 },
    });
    await expect(fetchSnapshot(28.6, 77.2)).resolves.toMatchObject({
      usAqi: 180,
      pm25: 30,
      pm10: 55,
      whoMultiple: 2,
      category: { label: "Unhealthy" },
      observedAt: "2026-11-18T08:00",
    });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("latitude=28.6");
    expect(url).toContain("current=us_aqi%2Cpm2_5%2Cpm10");
  });

  it("allows a missing PM10 reading", async () => {
    mockFetch({ current: { time: "t", us_aqi: 10, pm2_5: 3, pm10: null } });
    expect((await fetchSnapshot(0, 0)).pm10).toBeNull();
  });

  it("throws UpstreamError when readings are missing", async () => {
    mockFetch({ current: { time: "t", us_aqi: null, pm2_5: 3, pm10: 1 } });
    await expect(fetchSnapshot(0, 0)).rejects.toBeInstanceOf(UpstreamError);
  });
});
