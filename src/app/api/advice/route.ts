import { getAdvice } from "@/lib/advice-service";
import { LocationNotFoundError, UpstreamError } from "@/lib/errors";
import { enforceRateLimit, errorResponse, readJsonBody } from "@/lib/http";
import { createRateLimiter } from "@/lib/rate-limit";
import { profileSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gemini (20 s) plus two upstream lookups (5 s each) must fit inside this budget. */
export const maxDuration = 40;

const MAX_BODY_BYTES = 2_048;
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * POST /api/advice: validates the household profile and returns a personalised air-quality plan.
 * @param request - JSON body matching `profileSchema`.
 * @returns 200 with an `AdviceResponse`, or an `{ error: { code, message } }` body.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceRateLimit(limiter, request);
  if (limited) return limited;

  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;

  const parsed = profileSchema.safeParse(read.body);
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
