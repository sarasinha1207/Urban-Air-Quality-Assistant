import { z } from "zod";
import { UpstreamError } from "./errors";
import { sanitizeText } from "./sanitize";

const UPSTREAM_TIMEOUT_MS = 5_000;
const REVALIDATE_SECONDS = 900;
const WHO_PM25_DAILY_GUIDELINE = 15;

export interface AqiCategory {
  /** 0 (good) to 5 (hazardous). */
  level: 0 | 1 | 2 | 3 | 4 | 5;
  label: string;
  /** Shape glyph so the level is never conveyed by colour alone. */
  symbol: string;
  /** Highest US AQI value that belongs to this category. */
  max: number;
}

/** US EPA AQI bands, ordered from cleanest to most polluted. */
export const AQI_CATEGORIES: readonly AqiCategory[] = [
  { level: 0, label: "Good", symbol: "✓", max: 50 },
  { level: 1, label: "Moderate", symbol: "●", max: 100 },
  { level: 2, label: "Unhealthy for sensitive groups", symbol: "▲", max: 150 },
  { level: 3, label: "Unhealthy", symbol: "◆", max: 200 },
  { level: 4, label: "Very unhealthy", symbol: "■", max: 300 },
  { level: 5, label: "Hazardous", symbol: "✖", max: 500 },
];

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

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

const geocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        country: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .optional(),
});

const nominatimSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
    address: z
      .object({
        country_code: z.string().optional(),
        postcode: z.string().optional(),
        city: z.string().optional(),
        town: z.string().optional(),
        village: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
      })
      .optional(),
  }),
);

const airQualitySchema = z.object({
  current: z.object({
    time: z.string(),
    us_aqi: z.number(),
    pm2_5: z.number(),
    pm10: z.number().nullable(),
  }),
});

/**
 * Maps a US AQI value to its EPA category.
 * @param usAqi - US AQI value (0 and up).
 * @returns The matching category.
 */
export function categorize(usAqi: number): AqiCategory {
  return AQI_CATEGORIES.find((category) => usAqi <= category.max) ?? AQI_CATEGORIES[5]!;
}

/** Fetches JSON with a hard timeout and edge caching, then validates it against `schema`. */
async function fetchJson<T>(url: URL, schema: z.ZodType<T>, headers?: HeadersInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch {
    throw new UpstreamError(`Request to ${url.hostname} failed or timed out`);
  }
  if (!response.ok) throw new UpstreamError(`${url.hostname} responded with ${response.status}`);

  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new UpstreamError(`${url.hostname} returned an unexpected payload`);
  return parsed.data;
}

/**
 * Resolves a city name or postal code to coordinates. Open-Meteo answers city names and US ZIP
 * codes; any other query containing a digit (e.g. an Indian PIN) falls back to OpenStreetMap.
 * @param query - Already-validated free-text location.
 * @param country - Optional ISO 3166-1 alpha-2 code that limits the search to one country.
 * @returns The best match, or `null` when nothing matches.
 * @throws {UpstreamError} When a geocoding service fails.
 */
export async function geocode(query: string, country?: string): Promise<Place | null> {
  return (
    (await geocodeWithOpenMeteo(query, country)) ??
    (/\d/.test(query) ? geocodePostcode(query, country) : null)
  );
}

/**
 * Postal codes repeat across countries (110001 is in India, China and Singapore), so a code with no
 * country is only accepted when every match is in the same country; otherwise the user must pick one.
 */
async function geocodePostcode(query: string, country?: string): Promise<Place | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "5",
    addressdetails: "1",
    "accept-language": "en",
    ...(country && { countrycodes: country.toLowerCase() }),
  }).toString();

  // Nominatim's usage policy requires an identifying User-Agent.
  const matches = await fetchJson(url, nominatimSchema, {
    "User-Agent": "UrbanAirQualityAssistant/1.0",
  });
  const first = matches[0];
  if (!first || new Set(matches.map((m) => m.address?.country_code)).size > 1) return null;
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { name: sanitizeText(postcodeLabel(first), 80), latitude, longitude };
}

/** "600001, Chennai, Tamil Nadu, India": short and readable, unlike OpenStreetMap's full address. */
function postcodeLabel({ address, display_name }: z.infer<typeof nominatimSchema>[number]): string {
  const parts = [
    address?.postcode,
    address?.city ?? address?.town ?? address?.village,
    address?.state,
    address?.country,
  ].filter(Boolean);
  return parts.length > 1 ? parts.join(", ") : display_name;
}

async function geocodeWithOpenMeteo(query: string, country?: string): Promise<Place | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: query,
    count: "1",
    language: "en",
    format: "json",
    ...(country && { countryCode: country }),
  }).toString();

  const match = (await fetchJson(url, geocodeSchema)).results?.[0];
  if (!match) return null;
  const label = match.country ? `${match.name}, ${match.country}` : match.name;
  return { name: sanitizeText(label, 80), latitude: match.latitude, longitude: match.longitude };
}

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
    whoMultiple: Math.round((current.pm2_5 / WHO_PM25_DAILY_GUIDELINE) * 10) / 10,
    category: categorize(current.us_aqi),
    observedAt: current.time,
  };
}
