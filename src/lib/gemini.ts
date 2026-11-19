import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";
import type { AirSnapshot } from "./air-quality";
import { geminiApiKey, geminiModels } from "./config";
import { describeError } from "./errors";
import { LIMITS } from "./limits";
import { createFailover, UnusableReplyError } from "./model-failover";
import { buildChatInstruction, buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt";
import { cleanModelText } from "./sanitize";
import { adviceSchema, type Advice, type ChatRequest, type Profile } from "./schemas";

type Contents = Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];

/** How many rejected fields a log line names; enough to diagnose, never the reply text. */
const MAX_LOGGED_ISSUES = 3;

/** Shared by every request in this server instance, so a failing model is skipped for later ones. */
const failover = createFailover();

const responseJsonSchema = z.toJSONSchema(adviceSchema);
delete responseJsonSchema.$schema;

/** Server-only client; the key is read through `config` and never leaves this process. */
function client(): GoogleGenAI {
  // The SDK defaults to API v1, which rejects system instructions and does not know the "latest"
  // model aliases; v1beta supports both.
  return new GoogleGenAI({ apiKey: geminiApiKey(), httpOptions: { apiVersion: "v1beta" } });
}

/**
 * Gemini sometimes double-escapes non-ASCII characters (a literal `µ` instead of `µ`).
 * In raw JSON the double escape is `\\u00b5`; in plain text it is `µ`.
 */
const repairJsonEscapes = (text: string) => text.replace(/\\\\u([0-9a-fA-F]{4})/g, "\\u$1");
const decodeEscapes = (text: string) =>
  text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/** Why a reply was rejected, as field paths only: never the reply text, which echoes user input. */
function describeRejection(error: unknown): string {
  if (!(error instanceof z.ZodError)) return describeError(error);
  return error.issues
    .slice(0, MAX_LOGGED_ISSUES)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.code}`)
    .join("; ");
}

/** Turning thinking off makes 2.5 Flash about 2-3x faster; other models reject the setting. */
function generationConfigFor(model: string, base: GenerateContentConfig): GenerateContentConfig {
  return model.startsWith("gemini-2.5-flash")
    ? { ...base, thinkingConfig: { thinkingBudget: 0 } }
    : base;
}

/**
 * Calls Gemini through the shared failover, which moves to the next model when one is exhausted,
 * overloaded, retired or slow. Only Gemini models are used.
 * @param contents - The conversation or prompt.
 * @param config - Generation settings.
 * @param parse - Turns the reply text into the result, throwing if it is unusable.
 * @returns The first valid result.
 * @throws The last error when every model fails or the time budget runs out.
 */
async function generateWithFallback<T>(
  contents: Contents,
  config: GenerateContentConfig,
  parse: (text: string | undefined) => T,
): Promise<T> {
  const ai = client();
  return failover.run(geminiModels(), async (model, signal) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { ...generationConfigFor(model, config), abortSignal: signal },
    });
    try {
      return parse(response.text);
    } catch (error) {
      console.error(`Model ${model} gave an unusable reply (${describeRejection(error)})`);
      throw new UnusableReplyError(error);
    }
  });
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
      return cleanModelText(decodeEscapes(reply)).slice(0, LIMITS.chat.assistantMessageMax);
    },
  );
}
