import { createHash } from "node:crypto";
import { fetchSnapshot, geocode, type AirSnapshot } from "./aqi";
import { TtlCache } from "./cache";
import { LocationNotFoundError, UpstreamError } from "./errors";
import { buildFallbackAdvice } from "./fallback";
import { generateAdvice } from "./gemini";
import { householdOf, type Advice, type Profile } from "./schemas";

export interface AdviceResponse {
  placeName: string;
  /** `null` when the air-quality service was unavailable. */
  snapshot: AirSnapshot | null;
  advice: Advice;
  /** "ai" when Gemini wrote the plan, "fallback" when the rule-based plan was used. */
  source: "ai" | "fallback";
  /** Plain-language messages about anything degraded. */
  notices: string[];
}

const AQI_UNAVAILABLE_NOTICE =
  "Live air-quality data is unavailable right now, so this plan is precautionary.";
const AI_UNAVAILABLE_NOTICE =
  "The AI assistant is unavailable right now, so this plan comes from our built-in smog guidance.";

const AI_CACHE_TTL_MS = 15 * 60 * 1000;
const aiCache = new TtlCache<Advice>(AI_CACHE_TTL_MS, 200);

/** Identical households in the same place and pollution band share one cached answer. */
function cacheKey(profile: Profile, placeName: string, snapshot: AirSnapshot | null): string {
  const household = householdOf(profile);
  const band = snapshot ? `${snapshot.category.level}:${Math.round(snapshot.pm25 / 10)}` : "none";
  return createHash("sha256").update(JSON.stringify({ household, placeName, band })).digest("hex");
}

async function resolvePlace(location: Profile["location"]) {
  if (location.kind === "coords") {
    return { name: "Your location", latitude: location.latitude, longitude: location.longitude };
  }
  const place = await geocode(location.query, location.country).catch(() => {
    throw new UpstreamError("The location service is unavailable");
  });
  if (!place) throw new LocationNotFoundError(location.query);
  return place;
}

/**
 * Orchestrates one request: locate, read live air data, ask Gemini, and degrade gracefully.
 * @param profile - Validated household profile.
 * @returns The plan plus the snapshot, its source and any degradation notices.
 * @throws {LocationNotFoundError} When the place cannot be found.
 * @throws {UpstreamError} When the geocoder is down (no location, no plan).
 */
export async function getAdvice(profile: Profile): Promise<AdviceResponse> {
  const place = await resolvePlace(profile.location);
  const notices: string[] = [];

  const snapshot = await fetchSnapshot(place.latitude, place.longitude).catch(() => {
    notices.push(AQI_UNAVAILABLE_NOTICE);
    return null;
  });

  const key = cacheKey(profile, place.name, snapshot);
  const cached = aiCache.get(key);
  if (cached) return { placeName: place.name, snapshot, advice: cached, source: "ai", notices };

  try {
    const advice = await generateAdvice(profile, place.name, snapshot);
    aiCache.set(key, advice);
    return { placeName: place.name, snapshot, advice, source: "ai", notices };
  } catch (error) {
    console.error(
      "Gemini unavailable, using fallback:",
      error instanceof Error ? error.name : error,
    );
    notices.push(AI_UNAVAILABLE_NOTICE);
    return {
      placeName: place.name,
      snapshot,
      advice: buildFallbackAdvice(profile, snapshot),
      source: "fallback",
      notices,
    };
  }
}
