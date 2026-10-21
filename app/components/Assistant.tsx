"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { notifyDataChanged, sendChat, type ScopeStatus } from "@/lib/api";
import { errorMessage } from "./formHelpers";
import Icon from "./Icon";
import { ScopeStatusBadge } from "./ScopeStatus";

export const MESSAGE_MAX = 500;

export const EXAMPLE_PROMPTS = [
  'Create task "Fix login bug" for Alice due tomorrow in sprint Sprint 1 project Auth',
  "What is the status of sprint Sprint 1?",
] as const;

type Entry =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; status: ScopeStatus | null }
  | { id: number; role: "error"; text: string };

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type NewEntry = WithoutId<Entry>;

const SPEAKER: Record<Entry["role"], string> = {
  user: "You",
  assistant: "Assistant",
  error: "Error",
};

interface AssistantProps {
  /** Called when a chat command changed data, after the `tm:data-changed` window event is dispatched. */
  onChanged?: () => void;
  /** Rendered beside the heading, e.g. a close button. */
  headerAction?: ReactNode;
}

export default function Assistant({ onChanged, headerAction }: AssistantProps) {
  const id = useId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const nextId = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  function append(entry: NewEntry) {
    const withId = { ...entry, id: nextId.current++ } as Entry;
    setEntries((prev) => [...prev, withId]);
    // Keep the newest message in view once it renders.
    requestAnimationFrame(() => {
      const el = log.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function applyExample(prompt: string) {
    setMessage(prompt);
    input.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (sending || text === "") return;
    setSending(true);
    append({ role: "user", text });
    setMessage("");
    try {
      const response = await sendChat(text);
      append({ role: "assistant", text: response.reply, status: response.status ?? null });
      if (response.changed) {
        notifyDataChanged();
        onChanged?.();
      }
    } catch (err) {
      append({ role: "error", text: `Could not send message: ${errorMessage(err)}` });
    } finally {
      setSending(false);
    }
  }

  const inputId = `${id}-message`;

  return (
    <section className="assistant" aria-labelledby={`${id}-heading`}>
      <header className="assistant-header">
        <span className="assistant-avatar" aria-hidden="true">
          <Icon name="chat" size={16} />
        </span>
        <h2 id={`${id}-heading`}>Assistant</h2>
        {headerAction}
      </header>

      <div ref={log} role="log" aria-live="polite" aria-labelledby={`${id}-heading`} className="chat-log">
        {entries.length === 0 && (
          <div className="chat-hint" id={`${id}-hint`}>
            <p>Create tasks or ask how a sprint or project is doing. Try an example:</p>
            <ul>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <li key={prompt}>
                  <button type="button" className="example-prompt" onClick={() => applyExample(prompt)} translate="no">
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={`chat-entry chat-${entry.role}`}>
            <p className="chat-speaker">{SPEAKER[entry.role]}</p>
            {entry.role === "assistant" && entry.status && <ScopeStatusBadge status={entry.status.status} />}
            <p className="chat-text">{entry.text}</p>
          </div>
        ))}
      </div>

      <form className="chat-form" onSubmit={(e) => void handleSubmit(e)}>
        <label htmlFor={inputId} className="visually-hidden">
          Message
        </label>
        <input
          ref={input}
          id={inputId}
          name="message"
          type="text"
          autoComplete="off"
          required
          maxLength={MESSAGE_MAX}
          placeholder="Message the assistant…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" className="primary" disabled={sending}>
          <Icon name="send" size={16} />
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
