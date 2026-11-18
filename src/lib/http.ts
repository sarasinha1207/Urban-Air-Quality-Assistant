import type { createRateLimiter } from "./rate-limit";

/**
 * Builds the JSON error body every API route uses.
 * @param status - HTTP status code.
 * @param code - Stable machine-readable error code.
 * @param message - Safe, user-facing explanation (never internals).
 * @param headers - Optional extra headers.
 */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return Response.json({ error: { code, message } }, { status, headers });
}

/** Vercel sets x-forwarded-for from the real connection, so its first hop identifies the client. */
function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Records a hit for the caller and returns a 429 response when they are over the limit.
 * @param limiter - The route's rate limiter.
 * @param request - Incoming request.
 * @returns A 429 response, or `null` when the request may proceed.
 */
export function enforceRateLimit(
  limiter: ReturnType<typeof createRateLimiter>,
  request: Request,
): Response | null {
  const result = limiter.check(clientKey(request));
  if (result.allowed) return null;
  return errorResponse(429, "rate_limited", "Too many requests. Please wait a moment.", {
    "Retry-After": String(result.retryAfterSeconds),
  });
}

type BodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

/**
 * Reads a size-capped JSON body, rejecting wrong content types, oversized and malformed payloads.
 * @param request - Incoming request.
 * @param maxBytes - Largest accepted body length.
 * @returns The parsed body, or the error response to return.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyResult> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {
      ok: false,
      response: errorResponse(
        415,
        "unsupported_media_type",
        "Send the request as application/json.",
      ),
    };
  }
  const raw = await request.text();
  if (raw.length > maxBytes) {
    return {
      ok: false,
      response: errorResponse(413, "payload_too_large", "The request is too large."),
    };
  }
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "invalid_json", "The request body is not valid JSON."),
    };
  }
}
