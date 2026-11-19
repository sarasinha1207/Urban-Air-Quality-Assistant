import { getAdvice } from "@/lib/advice-service";
import { LocationNotFoundError, UpstreamError } from "@/lib/errors";
import { guardJsonPost } from "@/lib/api-guard";
import { errorResponse } from "@/lib/http";
import { HTTP_STATUS } from "@/lib/http-status";
import { LIMITS, RATE_LIMITS } from "@/lib/limits";
import { createRateLimiter } from "@/lib/rate-limit";
import { profileSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gemini (20 s) plus two upstream lookups (5 s each) must fit inside this budget. */
export const maxDuration = 40;

const limiter = createRateLimiter({
  name: "advice",
  limit: RATE_LIMITS.advice,
  windowMs: RATE_LIMITS.windowMs,
});

/** Maps a failure of the advice service to a safe response; internals are never exposed. */
function adviceFailure(error: unknown): Response {
  if (error instanceof LocationNotFoundError) {
    return errorResponse(
      HTTP_STATUS.NOT_FOUND,
      "location_not_found",
      "We could not find that place. Check the country you selected, or try a nearby city.",
    );
  }
  if (error instanceof UpstreamError) {
    return errorResponse(
      HTTP_STATUS.BAD_GATEWAY,
      "upstream_unavailable",
      "The location service is unavailable. Please try again shortly.",
    );
  }
  console.error("Unexpected error in /api/advice:", error instanceof Error ? error.name : error);
  return errorResponse(
    HTTP_STATUS.INTERNAL_ERROR,
    "internal_error",
    "Something went wrong. Please try again.",
  );
}

/**
 * POST /api/advice: validates the household profile and returns a personalised air-quality plan.
 * @param request - JSON body matching `profileSchema`.
 * @returns 200 with an `AdviceResponse`, or an `{ error: { code, message } }` body.
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = await guardJsonPost(request, {
    limiter,
    maxBytes: LIMITS.advice.bodyMaxBytes,
    schema: profileSchema,
  });
  if (!guarded.ok) return guarded.response;

  try {
    const result = await getAdvice(guarded.data);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adviceFailure(error);
  }
}
