"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { LIMITS } from "@/lib/limits";
import type { ChatContext, ChatMessage } from "./chat-request";

const SUGGESTIONS = [
  "Which mask should I wear?",
  "Is it safe for kids to play outside today?",
  "How do I cut cooking smoke at home?",
];

interface ChatState {
  messages: ChatMessage[];
  pending: boolean;
  send: (text: string) => boolean;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const tone = `${isUser ? "msg-user" : "msg-bot"}${message.failed ? " msg-error" : ""}`;
  return (
    <p className={`msg ${tone}`}>
      <span className="sr-only">{isUser ? "You: " : "Assistant: "}</span>
      {message.content}
      {message.builtIn && (
        <span className="msg-tag">Gemini is busy, so this is built-in guidance.</span>
      )}
    </p>
  );
}

function Greeting({ context }: { context: ChatContext | null }) {
  return (
    <p className="msg msg-bot">
      Hi! I can answer questions about air quality and how to protect your family.
      {context ? ` I can see today's reading for ${context.placeName}.` : ""}
    </p>
  );
}

function SuggestionChips({ send }: { send: ChatState["send"] }) {
  return (
    <div className="chat-chips">
      {SUGGESTIONS.map((text) => (
        <button key={text} type="button" className="chip-button" onClick={() => send(text)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function ChatLog({ context, chat }: { context: ChatContext | null; chat: ChatState }) {
  // Re-run on every render of the log (a new message or the typing indicator): keep the newest in view.
  const keepNewestInView = (element: HTMLDivElement | null) => {
    if (element) element.scrollTop = element.scrollHeight;
  };

  return (
    <div
      ref={keepNewestInView}
      role="log"
      aria-label="Conversation"
      tabIndex={0}
      className="chat-log"
    >
      <Greeting context={context} />
      {chat.messages.length === 0 && <SuggestionChips send={chat.send} />}
      {chat.messages.map((message, index) => (
        <MessageBubble key={index} message={message} />
      ))}
      {chat.pending && (
        <p role="status" className="msg msg-bot">
          Assistant is typing…
        </p>
      )}
    </div>
  );
}

function ChatForm({ chat }: { chat: ChatState }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chat.send(draft)) setDraft("");
  }

  return (
    <form onSubmit={onSubmit} className="chat-form">
      <label htmlFor="chat-input" className="sr-only">
        Your question
      </label>
      <input
        id="chat-input"
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={LIMITS.chat.userMessageMax}
        autoComplete="off"
        placeholder="Type your question…"
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" className="primary" aria-disabled={chat.pending}>
        Send
      </button>
    </form>
  );
}

interface ChatPanelProps {
  context: ChatContext | null;
  chat: ChatState;
  onClose: () => void;
}

/** The open chat dialog: header, conversation log and the question form. Escape closes it. */
export function ChatPanel({ context, chat, onClose }: ChatPanelProps) {
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") onClose();
  }

  return (
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
        <button type="button" className="chat-close" onClick={onClose}>
          Close
        </button>
      </div>
      <ChatLog context={context} chat={chat} />
      <ChatForm chat={chat} />
    </section>
  );
}
