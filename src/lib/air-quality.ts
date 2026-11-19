import { z } from "zod";
import { categorize, type AqiCategory } from "./aqi-levels";
import { fetchJson } from "./upstream";

// Re-exported so server code and tests keep one place to import the whole air-quality model from.
export { AQI_CATEGORIES, AQI_LEVEL, categorize } from "./aqi-levels";
export type { AqiCategory, AqiLevel } from "./aqi-levels";

/** WHO 24-hour PM2.5 guideline in µg/m³. */
export const WHO_PM25_DAILY_GUIDELINE = 15;
const ONE_DECIMAL = 10;

/** Live air readings for a place, already validated and categorised. */
export interface AirSnapshot {
  usAqi: number;
  pm25: number;
  pm10: number | null;
  /** PM2.5 as a multiple of the WHO 24-hour guideline (15 µg/m³), one decimal. */
  whoMultiple: number;
  category: AqiCategory;
  observedAt: string;
}

const airQualitySchema = z.object({
  current: z.object({
    time: z.string(),
    us_aqi: z.number(),
    pm2_5: z.number(),
    pm10: z.number().nullable(),
  }),
});

/**
 * Fetches current AQI and particulate readings from the keyless Open-Meteo Air Quality API.
 * @param latitude - Latitude in degrees.
 * @param longitude - Longitude in degrees.
 * @returns A validated, categorised snapshot.
 * @throws {UpstreamError} When the service fails or returns unusable data.
 */
export async function fetchSnapshot(latitude: number, longitude: number): Promise<AirSnapshot> {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "us_aqi,pm2_5,pm10",
    timezone: "auto",
  }).toString();

  const { current } = await fetchJson(url, airQualitySchema);
  return {
    usAqi: current.us_aqi,
    pm25: current.pm2_5,
    pm10: current.pm10,
    whoMultiple: Math.round((current.pm2_5 / WHO_PM25_DAILY_GUIDELINE) * ONE_DECIMAL) / ONE_DECIMAL,
    category: categorize(current.us_aqi),
    observedAt: current.time,
  };
}
