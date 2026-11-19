"use client";

import { useState } from "react";
import {
  askAssistant,
  toAssistantMessage,
  type ChatContext,
  type ChatMessage,
} from "./chat-request";

/**
 * Holds the conversation. It lives in component state only: nothing is stored, and closing the
 * page clears it.
 * @param context - The reading on screen, sent with every question.
 * @returns The messages, whether a reply is pending, and `send`, which reports if it accepted the text.
 */
export function useChat(context: ChatContext | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  async function runTurn(next: ChatMessage[]) {
    setMessages(next);
    setPending(true);
    const outcome = await askAssistant(next, context);
    setPending(false);
    setMessages([...next, toAssistantMessage(outcome)]);
  }

  function send(text: string): boolean {
    const content = text.trim();
    if (!content || pending) return false;
    void runTurn([...messages, { role: "user", content }]);
    return true;
  }

  return { messages, pending, send };
}
