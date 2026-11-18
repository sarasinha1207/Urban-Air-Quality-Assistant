import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { AirSnapshot } from "./aqi";
import { buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt";
import { adviceSchema, type Advice, type Profile } from "./schemas";

/** The "latest" alias tracks the newest stable Flash model; override with GEMINI_MODEL to pin one. */
const DEFAULT_MODEL = "gemini-flash-latest";
const REQUEST_TIMEOUT_MS = 20_000;

const responseJsonSchema = z.toJSONSchema(adviceSchema);
delete responseJsonSchema.$schema;

/**
 * Asks Gemini for a personalised plan and validates the reply against the advice schema.
 * Runs on the server only: the API key never leaves this process.
 * @param profile - Validated household profile.
 * @param placeName - Sanitised place name.
 * @param snapshot - Live air readings, or `null` when unavailable.
 * @returns Schema-valid advice.
 * @throws When the key is missing, the call fails or times out, or the reply is not valid advice.
 */
export async function generateAdvice(
  profile: Profile,
  placeName: string,
  snapshot: AirSnapshot | null,
): Promise<Advice> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const response = await new GoogleGenAI({ apiKey }).models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contents: buildUserPrompt(profile, placeName, snapshot),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema,
      temperature: 0.4,
      abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  });

  return adviceSchema.parse(JSON.parse(response.text ?? ""));
}
