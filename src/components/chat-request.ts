import { LIMITS } from "@/lib/limits";

/** The reading currently on screen, sent along so answers can refer to it. */
export interface ChatContext {
  placeName: string;
  usAqi: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** The request for this turn failed, so the message is an error and is not sent back as history. */
  failed?: boolean;
  /** Answered from built-in guidance because Gemini was unavailable. */
  builtIn?: boolean;
}

type Outcome = { ok: true; reply: string; builtIn: boolean } | { ok: false; message: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR = "Network problem. Check your connection and try again.";

/** The last few turns that were answered, starting with a user turn as the server requires. */
function recentHistory(history: ChatMessage[]) {
  const recent = history.filter((message) => !message.failed).slice(-LIMITS.chat.historyMax);
  return recent
    .slice(recent.findIndex((message) => message.role === "user"))
    .map(({ role, content }) => ({ role, content }));
}

/**
 * Sends the conversation to the chat API and turns every failure into a readable message.
 * @param history - Everything said so far, ending with the user's new question.
 * @param context - The reading on screen, if any.
 */
export async function askAssistant(
  history: ChatMessage[],
  context: ChatContext | null,
): Promise<Outcome> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: recentHistory(history), ...(context && { context }) }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.reply) {
      return { ok: false, message: body?.error?.message ?? GENERIC_ERROR };
    }
    return { ok: true, reply: String(body.reply), builtIn: body.source === "fallback" };
  } catch {
    return { ok: false, message: NETWORK_ERROR };
  }
}

/** The assistant's message for a finished request. */
export function toAssistantMessage(outcome: Outcome): ChatMessage {
  return outcome.ok
    ? { role: "assistant", content: outcome.reply, builtIn: outcome.builtIn }
    : { role: "assistant", content: outcome.message, failed: true };
}
