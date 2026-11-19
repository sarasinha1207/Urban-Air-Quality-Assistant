import { HTTP_STATUS } from "./http-status";
import type { RateLimiter } from "./rate-limit";

/**
 * Builds the JSON error body every API route uses. Errors are never cached.
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
  const merged = new Headers(headers);
  merged.set("Cache-Control", "no-store");
  return Response.json({ error: { code, message } }, { status, headers: merged });
}

/**
 * Identifies the caller. Vercel sets these headers from the real connection and replaces any value
 * the client sent, so the first address is trustworthy there; elsewhere it is only a best effort.
 */
function clientKey(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * Rejects requests a browser marks as coming from another site, so other websites cannot spend this
 * app's Gemini quota from their visitors' browsers. Same-origin and non-browser callers pass.
 * @param request - Incoming request.
 * @returns A 403 response, or `null` when the request may proceed.
 */
export function rejectCrossSite(request: Request): Response | null {
  if (request.headers.get("sec-fetch-site") !== "cross-site") return null;
  return errorResponse(HTTP_STATUS.FORBIDDEN, "forbidden", "Cross-site requests are not allowed.");
}

/**
 * Records a hit for the caller and returns a 429 response when they are over the limit.
 * @param limiter - The route's rate limiter.
 * @param request - Incoming request.
 * @returns A 429 response, or `null` when the request may proceed.
 */
export async function enforceRateLimit(
  limiter: RateLimiter,
  request: Request,
): Promise<Response | null> {
  const result = await limiter.check(clientKey(request));
  if (result.allowed) return null;
  return errorResponse(
    HTTP_STATUS.TOO_MANY_REQUESTS,
    "rate_limited",
    "Too many requests. Please wait a moment.",
    {
      "Retry-After": String(result.retryAfterSeconds),
    },
  );
}

/**
 * Reads the body as text but stops as soon as it exceeds `maxBytes`, so an oversized or endless
 * upload cannot fill memory.
 * @returns The text, or `null` when the body is too large.
 */
async function readCappedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) return null;

  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

type BodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

const bodyError = (status: number, code: string, message: string): BodyResult => ({
  ok: false,
  response: errorResponse(status, code, message),
});

/**
 * Reads a size-capped JSON body, rejecting wrong content types, oversized and malformed payloads.
 * @param request - Incoming request.
 * @param maxBytes - Largest accepted body length in bytes.
 * @returns The parsed body, or the error response to return.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyResult> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return bodyError(
      HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
      "unsupported_media_type",
      "Send the request as application/json.",
    );
  }
  const raw = await readCappedText(request, maxBytes);
  if (raw === null) {
    return bodyError(
      HTTP_STATUS.PAYLOAD_TOO_LARGE,
      "payload_too_large",
      "The request is too large.",
    );
  }
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return bodyError(
      HTTP_STATUS.BAD_REQUEST,
      "invalid_json",
      "The request body is not valid JSON.",
    );
  }
}
