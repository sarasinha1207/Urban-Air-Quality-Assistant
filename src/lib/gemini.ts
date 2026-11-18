import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";
import type { AirSnapshot } from "./aqi";
import { buildChatInstruction, buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt";
import { adviceSchema, type Advice, type ChatRequest, type Profile } from "./schemas";

/**
 * Models tried in order. Stable models come first and "latest" aliases follow, because a preview or
 * alias model can be overloaded (503) or retired (404) while a stable one keeps answering.
 * Override with GEMINI_MODELS (comma-separated).
 */
const DEFAULT_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
];
/** A model that failed is skipped for this long, so later requests do not wait on it again. */
const COOLDOWN_MS = 60_000;
const ATTEMPT_TIMEOUT_MS = 15_000;
/** Total time spent across all models; keeps the route inside its serverless time limit. */
const TOTAL_BUDGET_MS = 25_000;
const MAX_REPLY_CHARS = 2_000;

const coolingUntil = new Map<string, number>();

const responseJsonSchema = z.toJSONSchema(adviceSchema);
delete responseJsonSchema.$schema;

/** Server-only client; the key is read here and nowhere else. */
function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  // The SDK defaults to API v1, which rejects system instructions and does not know the "latest"
  // model aliases; v1beta supports both.
  return new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });
}

/** Configured models that are not cooling down; if every one is cooling, all are tried anyway. */
function modelsToTry(now: number): string[] {
  const configured = (process.env.GEMINI_MODELS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const all = configured.length > 0 ? configured : DEFAULT_MODELS;
  const ready = all.filter((model) => (coolingUntil.get(model) ?? 0) <= now);
  return ready.length > 0 ? ready : all;
}

/**
 * Gemini sometimes double-escapes non-ASCII characters (a literal `µ` instead of `µ`).
 * In raw JSON the double escape is `\\u00b5`; in plain text it is `µ`.
 */
const repairJsonEscapes = (text: string) => text.replace(/\\\\u([0-9a-fA-F]{4})/g, "\\u$1");
const decodeEscapes = (text: string) =>
  text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/** Safe label for logs: error class and HTTP status only, never messages that could echo input. */
function describe(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  const name = error instanceof Error ? error.name : "UnknownError";
  return typeof status === "number" ? `${name} ${status}` : name;
}

/**
 * Calls Gemini, moving to the next model when one is exhausted, overloaded, retired, slow, or
 * returns something `parse` rejects. Only Gemini models are used.
 * @param contents - The conversation or prompt.
 * @param config - Generation settings (the abort signal is added per attempt).
 * @param parse - Turns the reply text into the result, throwing if it is unusable.
 * @returns The first valid result.
 * @throws The last error when every model fails or the time budget runs out.
 */
async function generateWithFallback<T>(
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  config: GenerateContentConfig,
  parse: (text: string | undefined) => T,
): Promise<T> {
  const ai = client();
  const started = Date.now();
  let lastError: unknown = new Error("No Gemini model available");

  for (const model of modelsToTry(started)) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
    if (remaining <= 0) break;

    let text: string | undefined;
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...config,
          // Turning thinking off makes 2.5 Flash about 2-3x faster; other models reject the setting.
          ...(model.startsWith("gemini-2.5-flash") && { thinkingConfig: { thinkingBudget: 0 } }),
          abortSignal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
        },
      });
      text = response.text;
    } catch (error) {
      lastError = error;
      coolingUntil.set(model, Date.now() + COOLDOWN_MS);
      console.error(`Gemini model ${model} failed (${describe(error)}); trying the next one`);
      continue;
    }

    try {
      return parse(text);
    } catch (error) {
      lastError = error;
      console.error(`Gemini model ${model} gave an unusable reply; trying the next one`);
    }
  }
  throw lastError;
}

/**
 * Asks Gemini for a personalised plan and validates the reply against the advice schema.
 * Runs on the server only: the API key never leaves this process.
 * @param profile - Validated household profile.
 * @param placeName - Sanitised place name.
 * @param snapshot - Live air readings, or `null` when unavailable.
 * @returns Schema-valid advice.
 * @throws When the key is missing or every model fails.
 */
export async function generateAdvice(
  profile: Profile,
  placeName: string,
  snapshot: AirSnapshot | null,
): Promise<Advice> {
  return generateWithFallback(
    buildUserPrompt(profile, placeName, snapshot),
    {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema,
      temperature: 0.4,
    },
    (text) => adviceSchema.parse(JSON.parse(repairJsonEscapes(text ?? ""))),
  );
}

/**
 * Answers one chat turn. Instructions go in `systemInstruction`; the user's words stay in `contents`.
 * @param request - Validated chat request.
 * @returns A plain-text reply, capped in length.
 * @throws When the key is missing or every model fails.
 */
export async function generateChatReply({ messages, context }: ChatRequest): Promise<string> {
  return generateWithFallback(
    messages.map(({ role, content }) => ({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: content }],
    })),
    { systemInstruction: buildChatInstruction(context), temperature: 0.5 },
    (text) => {
      const reply = text?.trim();
      if (!reply) throw new Error("Empty reply from Gemini");
      return decodeEscapes(reply).slice(0, MAX_REPLY_CHARS);
    },
  );
}
