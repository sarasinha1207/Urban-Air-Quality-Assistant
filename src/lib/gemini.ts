import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";
import type { AirSnapshot } from "./aqi";
import { buildChatInstruction, buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt";
import { adviceSchema, type Advice, type ChatRequest, type Profile } from "./schemas";

/**
 * Models tried in order. Probed with the project key, the first three answered a full plan in 2 to
 * 4 s and were the most reliable; the "latest" aliases are fast when up but often return 503, so
 * they come last. Models that took over 15 s or hung are left out.
 * Override with GEMINI_MODELS (comma-separated).
 */
const DEFAULT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
];
/** A model that failed is skipped for this long, so later requests do not wait on it again. */
const COOLDOWN_MS = 20_000;
/** An exhausted quota (429) will not come back within a minute, so wait longer before retrying. */
const QUOTA_COOLDOWN_MS = 5 * 60_000;
const ATTEMPT_TIMEOUT_MS = 8_000;
/** If a model has not answered after this long, start the next one alongside it. */
const HEDGE_MS = 4_000;
/** Overload (503) comes in short bursts, so models that hit it get one more try after this pause. */
const RETRY_DELAY_MS = 1_500;
const MIN_BUDGET_FOR_RETRY_MS = 5_000;
/** Total time spent across all models; keeps the route inside its serverless time limit. */
const TOTAL_BUDGET_MS = 20_000;
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

/** Why a reply was rejected, as field paths only: never the reply text, which echoes user input. */
function why(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.code}`)
      .join("; ");
  }
  return error instanceof Error ? error.name : "unknown";
}

/**
 * Calls Gemini, moving to the next model when one is exhausted, overloaded, retired, or returns
 * something `parse` rejects. If a model has not answered after HEDGE_MS, the next one starts in
 * parallel and the first valid reply wins, so one stalled model cannot hold the user up.
 * Only Gemini models are used.
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
  const queue = modelsToTry(started);
  const cancelLosers = new AbortController();

  async function attempt(model: string): Promise<T> {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
    let text: string | undefined;
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...config,
          // Turning thinking off makes 2.5 Flash about 2-3x faster; other models reject the setting.
          ...(model.startsWith("gemini-2.5-flash") && { thinkingConfig: { thinkingBudget: 0 } }),
          abortSignal: AbortSignal.any([
            cancelLosers.signal,
            AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
          ]),
        },
      });
      text = response.text;
    } catch (error) {
      // A request cancelled because another model already won is not a model failure.
      if (!cancelLosers.signal.aborted) {
        const exhausted = (error as { status?: unknown } | null)?.status === 429;
        coolingUntil.set(model, Date.now() + (exhausted ? QUOTA_COOLDOWN_MS : COOLDOWN_MS));
        console.error(`Gemini model ${model} failed (${describe(error)}); trying the next one`);
      }
      throw error;
    }

    try {
      return parse(text);
    } catch (error) {
      console.error(`Gemini model ${model} gave an unusable reply (${why(error)})`);
      throw error;
    }
  }

  return new Promise<T>((resolve, reject) => {
    let inFlight = 0;
    let settled = false;
    let retried = false;
    const overloaded: string[] = [];
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastError: unknown = new Error("No Gemini model available");

    const launchNext = () => {
      clearTimeout(hedgeTimer);
      if (settled) return;
      const model = queue.shift();
      if (model === undefined || Date.now() - started >= TOTAL_BUDGET_MS) {
        // Nothing left to start: finish once the models still running have failed too.
        if (inFlight > 0) return;
        const timeLeft = TOTAL_BUDGET_MS - (Date.now() - started);
        if (retried || overloaded.length === 0 || timeLeft < MIN_BUDGET_FOR_RETRY_MS) {
          reject(lastError);
          return;
        }
        retried = true;
        queue.push(...overloaded);
        hedgeTimer = setTimeout(launchNext, RETRY_DELAY_MS);
        return;
      }
      inFlight++;
      hedgeTimer = setTimeout(launchNext, HEDGE_MS);
      attempt(model).then(
        (result) => {
          settled = true;
          clearTimeout(hedgeTimer);
          cancelLosers.abort();
          resolve(result);
        },
        (error) => {
          lastError = error;
          if ((error as { status?: unknown } | null)?.status === 503) overloaded.push(model);
          inFlight--;
          launchNext();
        },
      );
    };
    launchNext();
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
      return decodeEscapes(reply).slice(0, MAX_REPLY_CHARS);
    },
  );
}
