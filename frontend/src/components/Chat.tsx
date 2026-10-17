import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent, type MutableRefObject } from "react";
import { api, type ChatResponse } from "../api/client";
import { errorMessage } from "../lib/errors";
import { newMessageId, type AssistantMessage, type ChatAction, type ChatMessage, type UserMessage } from "../state/chat";

/** Demo prompts. They go through exactly the same send path as typed text; the replies come from the backend. */
const QUICK_ACTIONS = ["Checkout latency is spiking", "The restart failed", "It's back"];

/** Lets the scripted demo send a message through exactly the same path as typing it. */
export interface ChatSender {
  /** Resolves with the backend's reply; rejects if the request failed or the reply was dropped (e.g. session wiped). */
  send: (text: string) => Promise<ChatResponse>;
}

type SendOutcome = { ok: true; res: ChatResponse } | { ok: false; error: string };

export interface ChatProps {
  sessionId: string;
  messages: ChatMessage[];
  dispatch: Dispatch<ChatAction>;
  /** Called once per successful reply so the app can update the graph, selected incident, and tabs. */
  onChatResponse: (res: ChatResponse) => void;
  onOpenIncident: (incidentId: string) => void;
  /** Called when a request fails, so the app can re-check backend health instead of showing a stale "connected" badge. */
  onRequestFailed?: () => void;
  /** Filled with a sender for the scripted demo. */
  senderRef?: MutableRefObject<ChatSender | null>;
  /** While the scripted demo runs, manual input is disabled so it cannot interleave with the script. */
  locked?: boolean;
}

export function Chat({ sessionId, messages, dispatch, onChatResponse, onOpenIncident, onRequestFailed, senderRef, locked = false }: ChatProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);
  const sessionRef = useRef(sessionId);
  const logRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);

  // A wipe swaps the session id. Any reply still in flight belongs to the old session and must be dropped.
  useLayoutEffect(() => {
    sessionRef.current = sessionId;
    inflight.current = false;
    setPending(false);
  }, [sessionId]);

  const send = useCallback(
    async (raw: string, retryId?: string): Promise<SendOutcome> => {
      const text = raw.trim();
      if (!text) return { ok: false, error: "The message is empty." };
      if (inflight.current) return { ok: false, error: "Another message is still being sent." };
      inflight.current = true;
      setPending(true);

      const sid = sessionRef.current;
      const dropped: SendOutcome = { ok: false, error: "The chat session changed before the reply arrived." };
      const id = retryId ?? newMessageId();
      dispatch(retryId ? { type: "user_retry", id } : { type: "user_sent", id, text });
      try {
        const res = await api.chat(sid, text);
        if (sessionRef.current !== sid) return dropped;
        dispatch({ type: "user_delivered", id });
        dispatch({ type: "assistant_received", id: newMessageId(), response: res });
        onChatResponse(res);
        return { ok: true, res };
      } catch (e) {
        if (sessionRef.current !== sid) return dropped;
        const error = errorMessage(e);
        dispatch({ type: "user_failed", id, error });
        onRequestFailed?.();
        return { ok: false, error };
      } finally {
        if (sessionRef.current === sid) {
          inflight.current = false;
          setPending(false);
        }
      }
    },
    [dispatch, onChatResponse, onRequestFailed],
  );

  useEffect(() => {
    if (!senderRef) return;
    const sender: ChatSender = {
      send: async (text) => {
        const outcome = await send(text);
        if (!outcome.ok) throw new Error(outcome.error);
        return outcome.res;
      },
    };
    senderRef.current = sender;
    return () => {
      if (senderRef.current === sender) senderRef.current = null;
    };
  }, [senderRef, send]);

  function submit() {
    const text = draft;
    if (!text.trim() || inflight.current || locked) return;
    setDraft("");
    void send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  // Follow the conversation, but don't yank the view away from someone who scrolled up to read.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (stickToBottom.current || last?.role === "user") el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  function onScroll() {
    const el = logRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  return (
    <div className="chat">
      <h2 className="pane-title">Incident chat</h2>

      <ol className="chat-log" ref={logRef} onScroll={onScroll} role="log" aria-label="Conversation" aria-live="polite">
        {messages.length === 0 && !pending && (
          <li className="chat-empty">
            <p>No messages yet.</p>
            <p>Describe what's alerting, report how a fix went, or ask who owns a service. Déjà answers from the graph.</p>
          </li>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <UserBubble key={m.id} message={m} retryDisabled={pending || locked} onRetry={() => void send(m.text, m.id)} />
          ) : (
            <AssistantBubble key={m.id} message={m} onOpenIncident={onOpenIncident} />
          ),
        )}
        {pending && (
          <li className="typing" aria-label="Déjà is working on a reply">
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Checking the graph…
          </li>
        )}
      </ol>

      <div className="quick-actions" role="group" aria-label="Demo prompts">
        {QUICK_ACTIONS.map((q) => (
          <button key={q} type="button" className="chip-btn" disabled={pending || locked} onClick={() => void send(q)}>
            {q}
          </button>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="visually-hidden">
          Message Déjà
        </label>
        <textarea
          id="chat-input"
          value={draft}
          rows={2}
          placeholder={locked ? "The scripted demo is running…" : "Describe an alert or ask about an incident…"}
          disabled={locked}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="btn btn-primary" disabled={pending || locked || !draft.trim()}>
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function UserBubble({ message, retryDisabled, onRetry }: { message: UserMessage; retryDisabled: boolean; onRetry: () => void }) {
  return (
    <li className="msg msg-user">
      <div className="bubble">{message.text}</div>
      {message.status === "failed" && (
        <div className="msg-error" role="alert">
          <span>Not sent: {message.error}</span>
          <button type="button" className="btn btn-small" disabled={retryDisabled} onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </li>
  );
}

function AssistantBubble({ message, onOpenIncident }: { message: AssistantMessage; onOpenIncident: (id: string) => void }) {
  return (
    <li className="msg msg-assistant">
      <div className="bubble">{message.text}</div>

      {message.recalled.length > 0 && (
        <div className="recalled">
          <strong>Recalled from graph memory</strong>
          <ul>
            {message.recalled.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </div>
      )}

      {message.toolCalls.length > 0 && (
        <ul className="tool-calls" aria-label="Tools used">
          {message.toolCalls.map((t, i) => (
            <li key={i} title={JSON.stringify(t.args)}>
              <code>{t.name}</code>
              {t.summary && <span> {t.summary}</span>}
            </li>
          ))}
        </ul>
      )}

      {message.incidentId && (
        <button type="button" className="link-btn" onClick={() => onOpenIncident(message.incidentId!)}>
          View {message.incidentId}
        </button>
      )}
    </li>
  );
}
