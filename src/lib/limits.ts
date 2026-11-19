/**
 * Every size and rate limit in one place. The same values bound what the API accepts, what the
 * form allows typing and what Gemini output may contain, so they cannot drift apart.
 */

const SECOND_MS = 1_000;
const SECONDS_PER_MINUTE = 60;
export const MINUTE_MS = SECONDS_PER_MINUTE * SECOND_MS;

export const LIMITS = {
  location: { min: 2, max: 80 },
  latitude: 90,
  longitude: 180,
  chat: {
    userMessageMax: 500,
    assistantMessageMax: 2_000,
    historyMax: 8,
    /** Room for a full history, including earlier assistant replies at their longest. */
    bodyMaxBytes: 32_768,
  },
  advice: { bodyMaxBytes: 2_048 },
  suggestion: { titleMax: 80, detailMax: 200, impactMax: 120, perListMin: 3, perListMax: 5 },
  summaryMax: 300,
  maxAqi: 500,
} as const;

/** Requests allowed per client within one window. */
export const RATE_LIMITS = {
  windowMs: MINUTE_MS,
  advice: 10,
  chat: 20,
} as const;
