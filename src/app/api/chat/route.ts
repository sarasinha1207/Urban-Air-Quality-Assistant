import { generateChatReply } from "@/lib/gemini";
import { enforceRateLimit, errorResponse, readJsonBody } from "@/lib/http";
import { createRateLimiter } from "@/lib/rate-limit";
import { chatSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 6_144;
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * POST /api/chat: answers one air-quality question with Gemini.
 * @param request - JSON body matching `chatSchema`.
 * @returns 200 with `{ reply }`, or an `{ error: { code, message } }` body.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceRateLimit(limiter, request);
  if (limited) return limited;

  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;

  const parsed = chatSchema.safeParse(read.body);
  if (!parsed.success) {
    return errorResponse(400, "invalid_input", parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const reply = await generateChatReply(parsed.data);
    return Response.json({ reply }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Chat unavailable:", error instanceof Error ? error.name : error);
    return errorResponse(
      502,
      "assistant_unavailable",
      "The assistant is unavailable right now. Please try again shortly.",
    );
  }
}
