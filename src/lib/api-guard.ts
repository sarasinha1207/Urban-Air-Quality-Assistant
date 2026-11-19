import type { z } from "zod";
import { enforceRateLimit, errorResponse, readJsonBody, rejectCrossSite } from "./http";
import { HTTP_STATUS } from "./http-status";
import type { RateLimiter } from "./rate-limit";

interface GuardOptions<T> {
  limiter: RateLimiter;
  /** Largest accepted request body in bytes. */
  maxBytes: number;
  /** Shape the JSON body must have. */
  schema: z.ZodType<T>;
}

type GuardResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * The checks every JSON API route runs before doing any work, in cost order: same-site only,
 * rate limit, bounded body read, schema validation.
 * @param request - Incoming request.
 * @param options - The route's limiter, body size cap and schema.
 * @returns The validated data, or the error response to return.
 */
export async function guardJsonPost<T>(
  request: Request,
  { limiter, maxBytes, schema }: GuardOptions<T>,
): Promise<GuardResult<T>> {
  const blocked = rejectCrossSite(request) ?? (await enforceRateLimit(limiter, request));
  if (blocked) return { ok: false, response: blocked };

  const read = await readJsonBody(request, maxBytes);
  if (!read.ok) return read;

  const parsed = schema.safeParse(read.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return {
      ok: false,
      response: errorResponse(HTTP_STATUS.BAD_REQUEST, "invalid_input", message),
    };
  }
  return { ok: true, data: parsed.data };
}
