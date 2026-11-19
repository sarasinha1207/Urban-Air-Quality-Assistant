// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { categorize, fetchSnapshot } from "@/lib/air-quality";
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
