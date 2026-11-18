import { z } from "zod";
import {
  COMMUTE_OPTIONS,
  CONDITION_OPTIONS,
  COOKING_FUEL_OPTIONS,
  COUNTRY_OPTIONS,
  HEATING_FUEL_OPTIONS,
  HOME_OPTIONS,
  optionValues,
} from "./options";

/** Letters, digits, spaces and basic punctuation only: no markup, quotes or control characters. */
const LOCATION_PATTERN = /^[\p{L}\p{N}\s,.'-]+$/u;

const locationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("query"),
    query: z
      .string()
      .trim()
      .min(2, "Enter at least 2 characters for the city or ZIP code.")
      .max(80, "Location must be 80 characters or fewer.")
      .regex(LOCATION_PATTERN, "Location may only contain letters, numbers, spaces and , . ' -"),
    /** Narrows the search; omitted means any country. */
    country: z.enum(optionValues(COUNTRY_OPTIONS)).optional(),
  }),
  z.strictObject({
    kind: z.literal("coords"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
]);

/** Everything the user tells us. Closed enums plus one pattern-checked string keep injection surface tiny. */
export const profileSchema = z.strictObject({
  location: locationSchema,
  hasChildren: z.boolean(),
  hasElderly: z.boolean(),
  conditions: z.array(z.enum(optionValues(CONDITION_OPTIONS))).max(CONDITION_OPTIONS.length),
  commute: z.enum(optionValues(COMMUTE_OPTIONS)),
  home: z.enum(optionValues(HOME_OPTIONS)),
  cookingFuel: z.enum(optionValues(COOKING_FUEL_OPTIONS)),
  heatingFuel: z.enum(optionValues(HEATING_FUEL_OPTIONS)),
});

const text = (max: number) => z.string().trim().min(1).max(max);

const suggestionSchema = z.strictObject({
  title: text(80),
  detail: text(200),
  // Rejects vague claims: every impact must carry a number or range.
  impact: text(120).refine((value) => /\d/.test(value), "Impact must be quantified."),
});

const suggestionList = z.array(suggestionSchema).min(3).max(5);

/** The structure Gemini must return. Also used to build the JSON schema sent to the model. */
export const adviceSchema = z.strictObject({
  snapshotSummary: text(300),
  routine: suggestionList,
  indoorHacks: suggestionList,
  alternatives: suggestionList,
});

/** A chat request: the recent conversation plus the reading currently shown on the dashboard. */
export const chatSchema = z
  .strictObject({
    messages: z
      .array(
        z.strictObject({
          role: z.enum(["user", "assistant"]),
          content: z
            .string()
            .trim()
            .min(1, "Type a question first.")
            .max(500, "Keep questions under 500 characters."),
        }),
      )
      .min(1)
      .max(8),
    context: z
      .strictObject({
        placeName: z.string().trim().max(80).regex(LOCATION_PATTERN),
        usAqi: z.number().min(0).max(500),
      })
      .optional(),
  })
  .refine(
    ({ messages }) => messages[0]?.role === "user" && messages.at(-1)?.role === "user",
    "The conversation must start and end with a user message.",
  );

export type Profile = z.infer<typeof profileSchema>;
export type ChatRequest = z.infer<typeof chatSchema>;

/**
 * The lifestyle part of a profile (everything except the location), used in prompts and cache keys.
 * @param profile - Validated household profile.
 * @returns The profile without its location.
 */
export function householdOf(profile: Profile) {
  const { hasChildren, hasElderly, conditions, commute, home, cookingFuel, heatingFuel } = profile;
  return { hasChildren, hasElderly, conditions, commute, home, cookingFuel, heatingFuel };
}
export type Advice = z.infer<typeof adviceSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
