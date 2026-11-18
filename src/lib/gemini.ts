import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { AirSnapshot } from "./aqi";
import { buildChatInstruction, buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt";
import { adviceSchema, type Advice, type ChatRequest, type Profile } from "./schemas";

/** The "latest" alias tracks the newest stable Flash model; override with GEMINI_MODEL to pin one. */
const DEFAULT_MODEL = "gemini-flash-latest";
const REQUEST_TIMEOUT_MS = 20_000;

const MAX_REPLY_CHARS = 2_000;

const responseJsonSchema = z.toJSONSchema(adviceSchema);
delete responseJsonSchema.$schema;

/** Server-only client; the key is read here and nowhere else. */
function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenAI({ apiKey });
}

const modelName = () => process.env.GEMINI_MODEL || DEFAULT_MODEL;

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
  const response = await client().models.generateContent({
    model: modelName(),
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

/**
 * Answers one chat turn. Instructions go in `systemInstruction`; the user's words stay in `contents`.
 * @param request - Validated chat request.
 * @returns A plain-text reply, capped in length.
 * @throws When the key is missing, the call fails or times out, or the reply is empty.
 */
export async function generateChatReply({ messages, context }: ChatRequest): Promise<string> {
  const response = await client().models.generateContent({
    model: modelName(),
    contents: messages.map(({ role, content }) => ({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: content }],
    })),
    config: {
      systemInstruction: buildChatInstruction(context),
      temperature: 0.5,
      abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  });

  const reply = response.text?.trim();
  if (!reply) throw new Error("Empty reply from Gemini");
  return reply.slice(0, MAX_REPLY_CHARS);
}
