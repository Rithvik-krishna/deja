import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import type { ChatResponse } from "../api/client";
import { api } from "../api/client";
import { chatReducer } from "../state/chat";
import { chatAlert, deferred } from "../test/fixtures";
import { Chat } from "./Chat";

vi.mock("../api/client", () => ({ api: { chat: vi.fn() } }));
const chat = vi.mocked(api.chat);

function Harness({ sessionId = "sess-1", onChatResponse = vi.fn(), onOpenIncident = vi.fn() }) {
  const [messages, dispatch] = useReducer(chatReducer, []);
  return <Chat sessionId={sessionId} messages={messages} dispatch={dispatch} onChatResponse={onChatResponse} onOpenIncident={onOpenIncident} />;
}

const input = () => screen.getByRole("textbox", { name: "Message Déjà" });

// Block body on purpose: vitest treats a function returned from beforeEach as a teardown and would call the mock.
beforeEach(() => {
  chat.mockReset();
});

describe("Chat", () => {
  it("sends with the session id on Enter, shows the user message immediately and the reply afterwards", async () => {
    const user = userEvent.setup();
    const reply = deferred<ChatResponse>();
    chat.mockReturnValue(reply.promise);
    const onChatResponse = vi.fn();
    render(<Harness onChatResponse={onChatResponse} />);

    await user.type(input(), "checkout latency is spiking{Enter}");

    expect(chat).toHaveBeenCalledExactlyOnceWith("sess-1", "checkout latency is spiking");
    expect(screen.getByText("checkout latency is spiking")).toBeInTheDocument(); // user bubble, before the reply
    expect(screen.getByText("Checking the graph…")).toBeInTheDocument(); // loading indicator
    expect(input()).toHaveValue("");

    reply.resolve(chatAlert);
    expect(await screen.findByText(chatAlert.reply)).toBeInTheDocument();
    expect(screen.queryByText("Checking the graph…")).not.toBeInTheDocument();
    expect(onChatResponse).toHaveBeenCalledExactlyOnceWith(chatAlert);

    // Tool calls and graph-memory recall are surfaced from the response.
    const tools = screen.getByRole("list", { name: "Tools used" });
    expect(within(tools).getByText("create_alert")).toBeInTheDocument();
    expect(screen.getByText("Recalled from graph memory")).toBeInTheDocument();
    expect(screen.getByText(/INC-042: same symptom/)).toBeInTheDocument();
  });

  it("does not send on Shift+Enter, empty input or whitespace", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    await user.type(input(), "   {Enter}");
    await user.type(input(), "{Shift>}{Enter}{/Shift}");
    expect(chat).not.toHaveBeenCalled();
    expect(send).toBeDisabled();
  });

  it("ignores a second submit while a request is pending", async () => {
    const user = userEvent.setup();
    chat.mockReturnValue(deferred<ChatResponse>().promise);
    render(<Harness />);

    await user.type(input(), "first{Enter}");
    await user.type(input(), "second{Enter}");
    await user.click(screen.getByRole("button", { name: "It's back" }));

    expect(chat).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  });

  it("sends quick actions through the real API call, not canned replies", async () => {
    const user = userEvent.setup();
    chat.mockResolvedValue({ ...chatAlert, reply: "server said this" });
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "The restart failed" }));

    expect(chat).toHaveBeenCalledExactlyOnceWith("sess-1", "The restart failed");
    expect(await screen.findByText("server said this")).toBeInTheDocument();
  });

  it("shows a useful error without any assistant reply, then retries the same message once", async () => {
    const user = userEvent.setup();
    chat.mockRejectedValueOnce(new Error("500 /chat: engine exploded"));
    render(<Harness />);

    await user.type(input(), "it's back{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not sent: 500 /chat: engine exploded");
    expect(screen.queryByText(chatAlert.reply)).not.toBeInTheDocument();
    expect(screen.queryByText("Checking the graph…")).not.toBeInTheDocument();

    chat.mockResolvedValueOnce(chatAlert);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText(chatAlert.reply)).toBeInTheDocument();
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat).toHaveBeenLastCalledWith("sess-1", "it's back");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByText("it's back")).toHaveLength(1); // retried in place, not duplicated
  });

  it("explains an unreachable backend in plain language", async () => {
    const user = userEvent.setup();
    chat.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Harness />);

    await user.type(input(), "hello{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the Déjà API. Check that the backend is running");
  });

  it("drops a reply that arrives after the session changed (e.g. a wipe)", async () => {
    const user = userEvent.setup();
    const reply = deferred<ChatResponse>();
    chat.mockReturnValue(reply.promise);
    const onChatResponse = vi.fn();
    const { rerender } = render(<Harness sessionId="old" onChatResponse={onChatResponse} />);

    await user.type(input(), "hello{Enter}");
    rerender(<Harness sessionId="new" onChatResponse={onChatResponse} />);
    reply.resolve(chatAlert);
    await Promise.resolve();

    expect(screen.queryByText(chatAlert.reply)).not.toBeInTheDocument();
    expect(onChatResponse).not.toHaveBeenCalled();
    // The composer is usable again in the new session.
    chat.mockResolvedValue(chatAlert);
    await user.type(input(), "again{Enter}");
    expect(chat).toHaveBeenLastCalledWith("new", "again");
  });

  it("offers a link to the incident named in the reply", async () => {
    const user = userEvent.setup();
    chat.mockResolvedValue(chatAlert);
    const onOpenIncident = vi.fn();
    render(<Harness onOpenIncident={onOpenIncident} />);

    await user.type(input(), "checkout latency is spiking{Enter}");
    await user.click(await screen.findByRole("button", { name: "View INC-045" }));

    expect(onOpenIncident).toHaveBeenCalledExactlyOnceWith("INC-045");
  });
});
