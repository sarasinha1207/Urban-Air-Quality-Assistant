import { getAdvice } from "@/lib/advice-service";
import { LocationNotFoundError, UpstreamError } from "@/lib/errors";
import { createRateLimiter } from "@/lib/rate-limit";
import { profileSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gemini (20 s) plus two upstream lookups (5 s each) must fit inside this budget. */
export const maxDuration = 40;

const MAX_BODY_BYTES = 2_048;
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

function errorResponse(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

/** Vercel sets x-forwarded-for from the real connection, so its first hop identifies the client. */
function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * POST /api/advice: validates the household profile and returns a personalised air-quality plan.
 * @param request - JSON body matching `profileSchema`.
 * @returns 200 with an `AdviceResponse`, or an `{ error: { code, message } }` body.
 */
export async function POST(request: Request): Promise<Response> {
  const limit = limiter.check(clientKey(request));
  if (!limit.allowed) {
    return errorResponse(429, "rate_limited", "Too many requests. Please wait a moment.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return errorResponse(415, "unsupported_media_type", "Send the request as application/json.");
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return errorResponse(413, "payload_too_large", "The request is too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse(400, "invalid_json", "The request body is not valid JSON.");
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return errorResponse(400, "invalid_input", message);
  }

  try {
    const result = await getAdvice(parsed.data);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof LocationNotFoundError) {
      return errorResponse(
        404,
        "location_not_found",
        "We could not find that place. Try a nearby city or a ZIP code.",
      );
    }
    if (error instanceof UpstreamError) {
      return errorResponse(
        502,
        "upstream_unavailable",
        "The location service is unavailable. Please try again shortly.",
      );
    }
    console.error("Unexpected error in /api/advice:", error instanceof Error ? error.name : error);
    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }
}
