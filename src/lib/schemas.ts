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
import { LIMITS } from "./limits";

/** Letters, digits, spaces and basic punctuation only: no markup, quotes or control characters. */
const LOCATION_PATTERN = /^[\p{L}\p{N}\s,.'-]+$/u;

const locationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("query"),
    query: z
      .string()
      .trim()
      .min(
        LIMITS.location.min,
        `Enter at least ${LIMITS.location.min} characters for the city or ZIP code.`,
      )
      .max(LIMITS.location.max, `Location must be ${LIMITS.location.max} characters or fewer.`)
      .regex(LOCATION_PATTERN, "Location may only contain letters, numbers, spaces and , . ' -"),
    /** Narrows the search; omitted means any country. */
    country: z.enum(optionValues(COUNTRY_OPTIONS)).optional(),
  }),
  z.strictObject({
    kind: z.literal("coords"),
    latitude: z.number().min(-LIMITS.latitude).max(LIMITS.latitude),
    longitude: z.number().min(-LIMITS.longitude).max(LIMITS.longitude),
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
  title: text(LIMITS.suggestion.titleMax),
  detail: text(LIMITS.suggestion.detailMax),
  // Rejects vague claims: every impact must carry a number or range. A regex (not a refine) is
  // used so it is also sent to Gemini as a JSON-schema `pattern` and constrains the output.
  impact: text(LIMITS.suggestion.impactMax).regex(/\d/, "Impact must be quantified."),
});

const suggestionList = z
  .array(suggestionSchema)
  .min(LIMITS.suggestion.perListMin)
  .max(LIMITS.suggestion.perListMax);

/** The structure Gemini must return. Also used to build the JSON schema sent to the model. */
export const adviceSchema = z.strictObject({
  snapshotSummary: text(LIMITS.summaryMax),
  routine: suggestionList,
  indoorHacks: suggestionList,
  alternatives: suggestionList,
});

/** A chat request: the recent conversation plus the reading currently shown on the dashboard. */
export const chatSchema = z
  .strictObject({
    messages: z
      .array(
        z.discriminatedUnion("role", [
          z.strictObject({
            role: z.literal("user"),
            content: z
              .string()
              .trim()
              .min(1, "Type a question first.")
              .max(
                LIMITS.chat.userMessageMax,
                `Keep questions under ${LIMITS.chat.userMessageMax} characters.`,
              ),
          }),
          // The assistant's earlier replies are sent back as history, and can be much longer.
          z.strictObject({
            role: z.literal("assistant"),
            content: z.string().trim().min(1).max(LIMITS.chat.assistantMessageMax),
          }),
        ]),
      )
      .min(1)
      .max(LIMITS.chat.historyMax),
    context: z
      .strictObject({
        placeName: z.string().trim().max(LIMITS.location.max).regex(LOCATION_PATTERN),
        usAqi: z.number().min(0).max(LIMITS.maxAqi),
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
