import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_MODELS,
  geminiApiKey,
  geminiModels,
  isDevelopment,
  redisConfig,
} from "@/lib/config";

describe("geminiApiKey", () => {
  it("returns the key, and fails loudly when it is missing or empty", () => {
    expect(geminiApiKey({ GEMINI_API_KEY: "abc" })).toBe("abc");
    expect(() => geminiApiKey({})).toThrow("GEMINI_API_KEY");
    expect(() => geminiApiKey({ GEMINI_API_KEY: "" })).toThrow("GEMINI_API_KEY");
  });
});

describe("geminiModels", () => {
  it("uses the defaults when nothing is configured", () => {
    expect(geminiModels({})).toEqual(DEFAULT_GEMINI_MODELS);
    expect(geminiModels({ GEMINI_MODELS: " , " })).toEqual(DEFAULT_GEMINI_MODELS);
  });

  it("uses the configured models in order, trimming blanks", () => {
    expect(geminiModels({ GEMINI_MODELS: " gemini-a , ,gemini-b " })).toEqual([
      "gemini-a",
      "gemini-b",
    ]);
  });

  it.each(["../models", "gemini-a?key=1", "gemini a", "Gemini-A", "-gemini", "a".repeat(65)])(
    "ignores %j because it is not a plain model name",
    (name) => {
      expect(geminiModels({ GEMINI_MODELS: `${name},gemini-ok` })).toEqual(["gemini-ok"]);
      expect(geminiModels({ GEMINI_MODELS: name })).toEqual(DEFAULT_GEMINI_MODELS);
    },
  );
});

describe("isDevelopment", () => {
  it("is true only under next dev", () => {
    expect(isDevelopment({ NODE_ENV: "development" })).toBe(true);
    expect(isDevelopment({ NODE_ENV: "production" })).toBe(false);
    expect(isDevelopment({})).toBe(false);
  });
});

describe("redisConfig", () => {
  it("is null unless both the URL and the token are set", () => {
    expect(redisConfig({})).toBeNull();
    expect(redisConfig({ UPSTASH_REDIS_REST_URL: "https://r.example.com" })).toBeNull();
    expect(redisConfig({ UPSTASH_REDIS_REST_TOKEN: "t" })).toBeNull();
  });

  it("reads Upstash or Vercel KV variable names and trims trailing slashes", () => {
    expect(
      redisConfig({
        UPSTASH_REDIS_REST_URL: "https://r.example.com//",
        UPSTASH_REDIS_REST_TOKEN: "t",
      }),
    ).toEqual({ url: "https://r.example.com", token: "t" });
    expect(
      redisConfig({ KV_REST_API_URL: "https://kv.example.com", KV_REST_API_TOKEN: "k" }),
    ).toEqual({ url: "https://kv.example.com", token: "k" });
  });

  it("refuses a non-HTTPS URL so the token is never sent in clear text", () => {
    expect(
      redisConfig({
        UPSTASH_REDIS_REST_URL: "http://r.example.com",
        UPSTASH_REDIS_REST_TOKEN: "t",
      }),
    ).toBeNull();
  });
});
