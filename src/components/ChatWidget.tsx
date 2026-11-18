"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

/** The reading currently on screen, sent along so answers can refer to it. */
export interface ChatContext {
  placeName: string;
  usAqi: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
  /** Answered from built-in guidance because Gemini was unavailable. */
  builtIn?: boolean;
}

const SUGGESTIONS = [
  "Which mask should I wear?",
  "Is it safe for kids to play outside today?",
  "How do I cut cooking smoke at home?",
];
const MAX_HISTORY = 8;
const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR = "Network problem. Check your connection and try again.";

type Outcome = { ok: true; reply: string; builtIn: boolean } | { ok: false; message: string };

async function askAssistant(history: Message[], context: ChatContext | null): Promise<Outcome> {
  const recent = history.filter((message) => !message.failed).slice(-MAX_HISTORY);
  // The server requires the conversation to start with a user turn.
  const messages = recent
    .slice(recent.findIndex((message) => message.role === "user"))
    .map(({ role, content }) => ({ role, content }));
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, ...(context && { context }) }),
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

/**
 * Floating assistant in the bottom-right corner. Conversations live in component state only:
 * nothing is stored, and closing the page clears them.
 */
export default function ChatWidget({ context }: { context: ChatContext | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, pending]);

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") close();
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;

    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setPending(true);
    const outcome = await askAssistant(next, context);
    setPending(false);
    setMessages([
      ...next,
      outcome.ok
        ? { role: "assistant", content: outcome.reply, builtIn: outcome.builtIn }
        : { role: "assistant", content: outcome.message, failed: true },
    ]);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <>
      {open && (
        <section
          id="chat-panel"
          role="dialog"
          aria-label="Air quality assistant chat"
          className="chat-panel"
          onKeyDown={onKeyDown}
        >
          <div className="chat-head">
            <div>
              <p className="chat-title">Air quality assistant</p>
              <p className="chat-sub">Ask about masks, purifiers, cooking and more</p>
            </div>
            <button type="button" className="chat-close" onClick={close}>
              Close
            </button>
          </div>

          <div ref={logRef} role="log" aria-label="Conversation" tabIndex={0} className="chat-log">
            <p className="msg msg-bot">
              Hi! I can answer questions about air quality and how to protect your family.
              {context ? ` I can see today's reading for ${context.placeName}.` : ""}
            </p>
            {messages.length === 0 && (
              <div className="chat-chips">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="chip-button"
                    onClick={() => void send(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message, index) => (
              <p
                key={index}
                className={`msg ${message.role === "user" ? "msg-user" : "msg-bot"}${message.failed ? " msg-error" : ""}`}
              >
                <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
                {message.content}
                {message.builtIn && (
                  <span className="msg-tag">Gemini is busy, so this is built-in guidance.</span>
                )}
              </p>
            ))}
            {pending && (
              <p role="status" className="msg msg-bot">
                Assistant is typing…
              </p>
            )}
          </div>

          <form onSubmit={onSubmit} className="chat-form">
            <label htmlFor="chat-input" className="sr-only">
              Your question
            </label>
            <input
              id="chat-input"
              ref={inputRef}
              type="text"
              value={draft}
              maxLength={500}
              autoComplete="off"
              placeholder="Type your question…"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="primary" aria-disabled={pending}>
              Send
            </button>
          </form>
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        className="chat-launcher"
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        Ask the assistant
      </button>
    </>
  );
}
