import { buildFallbackReply } from "@/lib/chat-fallback";
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
 * POST /api/chat: answers one air-quality question with Gemini, or with built-in guidance when no
 * Gemini model is available.
 * @param request - JSON body matching `chatSchema`.
 * @returns 200 with `{ reply, source }`, or an `{ error: { code, message } }` body for bad input.
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

  const headers = { "Cache-Control": "no-store" };
  try {
    const reply = await generateChatReply(parsed.data);
    return Response.json({ reply, source: "ai" }, { headers });
  } catch (error) {
    // Every Gemini model failed: answer from built-in guidance so the chat never goes dark.
    console.error("Chat using built-in guidance:", error instanceof Error ? error.name : error);
    return Response.json(
      { reply: buildFallbackReply(parsed.data), source: "fallback" },
      { headers },
    );
  }
}
