import { buildFallbackReply } from "@/lib/chat-fallback";
import { generateChatReply } from "@/lib/gemini";
import { guardJsonPost } from "@/lib/api-guard";
import { LIMITS, RATE_LIMITS } from "@/lib/limits";
import { createRateLimiter } from "@/lib/rate-limit";
import { chatSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const limiter = createRateLimiter({
  name: "chat",
  limit: RATE_LIMITS.chat,
  windowMs: RATE_LIMITS.windowMs,
});

/**
 * POST /api/chat: answers one air-quality question with Gemini, or with built-in guidance when no
 * Gemini model is available.
 * @param request - JSON body matching `chatSchema`.
 * @returns 200 with `{ reply, source }`, or an `{ error: { code, message } }` body for bad input.
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = await guardJsonPost(request, {
    limiter,
    maxBytes: LIMITS.chat.bodyMaxBytes,
    schema: chatSchema,
  });
  if (!guarded.ok) return guarded.response;

  const headers = { "Cache-Control": "no-store" };
  try {
    const reply = await generateChatReply(guarded.data);
    return Response.json({ reply, source: "ai" }, { headers });
  } catch (error) {
    // Every Gemini model failed: answer from built-in guidance so the chat never goes dark.
    console.error("Chat using built-in guidance:", error instanceof Error ? error.name : error);
    return Response.json(
      { reply: buildFallbackReply(guarded.data), source: "fallback" },
      { headers },
    );
  }
}
