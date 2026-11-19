"use client";

import { useRef, useState, type Ref } from "react";
import { ChatPanel } from "./ChatPanel";
import type { ChatContext } from "./chat-request";
import { useChat } from "./use-chat";

export type { ChatContext } from "./chat-request";

interface LauncherProps {
  open: boolean;
  onClick: () => void;
  ref: Ref<HTMLButtonElement>;
}

function ChatLauncher({ open, onClick, ref }: LauncherProps) {
  return (
    <button
      ref={ref}
      type="button"
      className="chat-launcher"
      aria-expanded={open}
      aria-controls="chat-panel"
      onClick={onClick}
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
  );
}

/**
 * Floating assistant in the bottom-right corner. Conversations live in component state only:
 * nothing is stored, and closing the page clears them.
 */
export default function ChatWidget({ context }: { context: ChatContext | null }) {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const chat = useChat(context);

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  return (
    <>
      {open && <ChatPanel context={context} chat={chat} onClose={close} />}
      <ChatLauncher
        ref={launcherRef}
        open={open}
        onClick={() => (open ? close() : setOpen(true))}
      />
    </>
  );
}
