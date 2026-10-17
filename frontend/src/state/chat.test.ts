import { chatReducer, type ChatMessage } from "./chat";
import { chatAlert } from "../test/fixtures";

describe("chatReducer", () => {
  it("adds the user message immediately in the sending state", () => {
    const s = chatReducer([], { type: "user_sent", id: "u1", text: "hello" });
    expect(s).toEqual([{ id: "u1", role: "user", text: "hello", status: "sending" }]);
  });

  it("marks delivery and failure on the right message only", () => {
    let s: ChatMessage[] = chatReducer([], { type: "user_sent", id: "u1", text: "a" });
    s = chatReducer(s, { type: "user_sent", id: "u2", text: "b" });
    s = chatReducer(s, { type: "user_failed", id: "u1", error: "boom" });
    s = chatReducer(s, { type: "user_delivered", id: "u2" });
    expect(s[0]).toMatchObject({ id: "u1", status: "failed", error: "boom" });
    expect(s[1]).toMatchObject({ id: "u2", status: "sent" });
  });

  it("moves a retried message to the end and clears its error instead of duplicating it", () => {
    let s: ChatMessage[] = chatReducer([], { type: "user_sent", id: "u1", text: "a" });
    s = chatReducer(s, { type: "user_failed", id: "u1", error: "boom" });
    s = chatReducer(s, { type: "user_sent", id: "u2", text: "b" });
    s = chatReducer(s, { type: "user_retry", id: "u1" });
    expect(s.map((m) => m.id)).toEqual(["u2", "u1"]);
    expect(s[1]).toMatchObject({ status: "sending", error: undefined });
  });

  it("stores the assistant reply with tool calls, recalled facts and incident id from the response", () => {
    const s = chatReducer([], { type: "assistant_received", id: "a1", response: chatAlert });
    expect(s[0]).toMatchObject({
      role: "assistant",
      text: chatAlert.reply,
      toolCalls: chatAlert.tool_calls,
      recalled: chatAlert.recalled,
      incidentId: "INC-045",
    });
  });

  it("clears everything", () => {
    const s = chatReducer([{ id: "u1", role: "user", text: "a", status: "sent" }], { type: "cleared" });
    expect(s).toEqual([]);
  });
});
