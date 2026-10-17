import type { ChatResponse } from "../api/client";

export type ToolCall = ChatResponse["tool_calls"][number];

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
  status: "sending" | "sent" | "failed";
  error?: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  text: string;
  toolCalls: ToolCall[];
  /** Facts the backend recovered from the graph (not from chat history). */
  recalled: string[];
  incidentId: string | null;
}

export type ChatMessage = UserMessage | AssistantMessage;

export type ChatAction =
  | { type: "user_sent"; id: string; text: string }
  | { type: "user_retry"; id: string }
  | { type: "user_delivered"; id: string }
  | { type: "user_failed"; id: string; error: string }
  | { type: "assistant_received"; id: string; response: ChatResponse }
  | { type: "cleared" };

let counter = 0;
export const newMessageId = (): string => `msg-${++counter}`;

function patchUser(state: ChatMessage[], id: string, patch: Partial<UserMessage>): ChatMessage[] {
  return state.map((m) => (m.role === "user" && m.id === id ? { ...m, ...patch } : m));
}

export function chatReducer(state: ChatMessage[], action: ChatAction): ChatMessage[] {
  switch (action.type) {
    case "user_sent":
      return [...state, { id: action.id, role: "user", text: action.text, status: "sending" }];
    case "user_retry": {
      // A retry is a new send: move it to the end so the transcript keeps the real order of requests.
      const failed = state.find((m): m is UserMessage => m.role === "user" && m.id === action.id);
      if (!failed) return state;
      return [...state.filter((m) => m !== failed), { ...failed, status: "sending", error: undefined }];
    }
    case "user_delivered":
      return patchUser(state, action.id, { status: "sent", error: undefined });
    case "user_failed":
      return patchUser(state, action.id, { status: "failed", error: action.error });
    case "assistant_received": {
      const r = action.response;
      return [
        ...state,
        {
          id: action.id,
          role: "assistant",
          text: r.reply,
          toolCalls: r.tool_calls,
          recalled: r.recalled,
          incidentId: r.incident_id ?? null,
        },
      ];
    }
    case "cleared":
      return [];
  }
}
