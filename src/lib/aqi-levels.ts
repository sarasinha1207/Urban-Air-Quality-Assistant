/**
 * The US EPA AQI scale as plain data. Kept free of any server code (no Zod, no fetch) so browser
 * components can import it without enlarging the client bundle.
 */

/** Named EPA levels, so comparisons read as words and not bare numbers. */
export const AQI_LEVEL = {
  GOOD: 0,
  MODERATE: 1,
  SENSITIVE: 2,
  UNHEALTHY: 3,
  VERY_UNHEALTHY: 4,
  HAZARDOUS: 5,
} as const;

export type AqiLevel = (typeof AQI_LEVEL)[keyof typeof AQI_LEVEL];

export interface AqiCategory {
  /** 0 (good) to 5 (hazardous). */
  level: AqiLevel;
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

/**
 * Maps a US AQI value to its EPA category.
 * @param usAqi - US AQI value (0 and up).
 * @returns The matching category.
 */
export function categorize(usAqi: number): AqiCategory {
  return (
    AQI_CATEGORIES.find((category) => usAqi <= category.max) ?? AQI_CATEGORIES[AQI_LEVEL.HAZARDOUS]!
  );
}
