/**
 * Every environment variable the app reads, in one place, so secrets and settings are validated
 * once and no other module touches `process.env`.
 */

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Gemini models tried in order. Probed with the project key, the first three answered a full plan in
 * 2 to 4 s and were the most reliable; the "latest" aliases are fast when up but often return 503, so
 * they come last. Models that took over 15 s or hung are left out.
 */
export const DEFAULT_GEMINI_MODELS: readonly string[] = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
];

/** Model names become part of an API URL, so only plain model identifiers are accepted. */
const MODEL_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

/**
 * Reads the Gemini API key.
 * @param env - Environment to read (defaults to the process environment).
 * @returns The key.
 * @throws When the key is missing, so a misconfigured deployment fails loudly and early.
 */
export function geminiApiKey(env: Env = process.env): string {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

/**
 * Reads the ordered model list. `GEMINI_MODELS` overrides the defaults; names that are not plain
 * model identifiers are ignored, and the defaults apply if none remain.
 * @param env - Environment to read (defaults to the process environment).
 * @returns Model names in the order they should be tried.
 */
export function geminiModels(env: Env = process.env): readonly string[] {
  const configured = (env.GEMINI_MODELS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => MODEL_NAME_PATTERN.test(name));
  return configured.length > 0 ? configured : DEFAULT_GEMINI_MODELS;
}

/**
 * Whether the app runs under `next dev`, where the framework's tooling needs a looser policy.
 * @param env - Environment to read (defaults to the process environment).
 */
export function isDevelopment(env: Env = process.env): boolean {
  return env.NODE_ENV === "development";
}

/** Connection details of the optional shared rate-limit store (Upstash Redis or Vercel KV). */
export interface RedisConfig {
  url: string;
  token: string;
}

/**
 * Reads the optional Redis REST credentials used for global rate limiting.
 * @param env - Environment to read (defaults to the process environment).
 * @returns The credentials, or `null` when none are set and per-instance limiting applies.
 */
export function redisConfig(env: Env = process.env): RedisConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token || !url.startsWith("https://")) return null;
  return { url: url.replace(/\/+$/, ""), token };
}
