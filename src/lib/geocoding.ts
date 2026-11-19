import { z } from "zod";
import { sanitizeText } from "./sanitize";
import { fetchJson } from "./upstream";

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

const MAX_PLACE_NAME_CHARS = 80;

const openMeteoSchema = z.object({
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

type NominatimMatch = z.infer<typeof nominatimSchema>[number];

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

async function geocodeWithOpenMeteo(query: string, country?: string): Promise<Place | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: query,
    count: "1",
    language: "en",
    format: "json",
    ...(country && { countryCode: country }),
  }).toString();

  const match = (await fetchJson(url, openMeteoSchema)).results?.[0];
  if (!match) return null;
  const label = match.country ? `${match.name}, ${match.country}` : match.name;
  return {
    name: sanitizeText(label, MAX_PLACE_NAME_CHARS),
    latitude: match.latitude,
    longitude: match.longitude,
  };
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
  return { name: sanitizeText(postcodeLabel(first), MAX_PLACE_NAME_CHARS), latitude, longitude };
}

/** "600001, Chennai, Tamil Nadu, India": short and readable, unlike OpenStreetMap's full address. */
function postcodeLabel({ address, display_name }: NominatimMatch): string {
  const parts = [
    address?.postcode,
    address?.city ?? address?.town ?? address?.village,
    address?.state,
    address?.country,
  ].filter(Boolean);
  return parts.length > 1 ? parts.join(", ") : display_name;
}
