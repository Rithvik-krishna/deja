import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { api, type ChatResponse } from "../api/client";
import {
  blastResponse, catalog, chatAlert, deferred, detail045, graphA, hypBaseline, inc045, ownerNow, riskResponse,
  shockInconclusive, shockProbe, timeline045,
} from "../test/fixtures";

// GraphView draws on a canvas, which jsdom doesn't have.
vi.mock("../components/GraphView", () => ({
  default: ({ payload }: { payload: { nodes: unknown[]; edges: unknown[] } | null }) => (
    <div className="graph-totals">{payload ? `${payload.nodes.length} nodes · ${payload.edges.length} edges` : "no payload"}</div>
  ),
}));

vi.mock("../api/client", () => ({
  api: {
    health: vi.fn(), catalog: vi.fn(), incidents: vi.fn(), incident: vi.fn(), timeline: vi.fn(), outcome: vi.fn(),
    chat: vi.fn(), wipeSession: vi.fn(), resetDemo: vi.fn(), owner: vi.fn(), reassign: vi.fn(),
    hypotheses: vi.fn(), evidenceShock: vi.fn(), risk: vi.fn(), blast: vi.fn(),
  },
}));
const m = vi.mocked(api);

const reply = (over: Partial<ChatResponse>): ChatResponse => ({ ...chatAlert, ...over });
const BACKEND_REPLIES: Record<string, ChatResponse> = {
  "checkout latency is spiking": chatAlert,
  "I restarted, still failing": reply({ intent: "outcome", reply: "Logged: restart-pods FAILED on INC-045.", recalled: [], tool_calls: [{ name: "record_outcome", args: {}, summary: "restart-pods -> FAILED" }] }),
  "it's back": reply({ intent: "recall", reply: "Yes - this is INC-045. Already tried: restart-pods.", recalled: ["restart-pods -> FAILED"], tool_calls: [] }),
  "payments-api is now owned by Ravi": reply({ intent: "reassign", reply: "Done. Ravi Iyer now owns payments-api.", recalled: [], tool_calls: [{ name: "reassign", args: { service: "payments-api", engineer: "Ravi Iyer" }, summary: "Ravi Iyer now owns payments-api" }] }),
  "who owned payments-api in July?": reply({ intent: "owner", reply: "payments-api was owned by Asha Menon in July.", recalled: [], tool_calls: [{ name: "owner", args: {}, summary: "Asha Menon" }] }),
};

const twoServices = { ...catalog, services: [
  { name: "admin-portal", tier: "tier-3", team: "platform", owner: "Dev Patel" },
  { name: "payments-api", tier: "tier-2", team: "payments-platform", owner: "Asha Menon" },
] };

beforeEach(() => {
  vi.resetAllMocks();
  m.health.mockResolvedValue({ status: "ok", mode: "mock", neo4j: false });
  m.catalog.mockResolvedValue(twoServices);
  m.incidents.mockResolvedValue([inc045]);
  m.incident.mockResolvedValue(detail045);
  m.timeline.mockResolvedValue(timeline045);
  m.owner.mockResolvedValue(ownerNow);
  m.risk.mockResolvedValue(riskResponse);
  m.blast.mockResolvedValue(blastResponse);
  m.hypotheses.mockResolvedValue(hypBaseline);
  m.evidenceShock.mockImplementation(async (req) => (req.remove_sources ? shockInconclusive : shockProbe));
  m.resetDemo.mockResolvedValue({ ok: true, counts: {} });
  m.wipeSession.mockResolvedValue({ session_id: "x", wiped: true });
  m.chat.mockImplementation(async (_sid, message) => {
    const r = BACKEND_REPLIES[message];
    if (!r) throw new Error(`500 /chat: unexpected message ${message}`);
    return r;
  });
});

const runButton = () => screen.getByRole("button", { name: /Run demo|Demo running/ });
const bar = () => screen.getByRole("region", { name: "Scripted demo" });

async function startDemo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(runButton());
  const dialog = screen.getByRole("dialog", { name: "Run the scripted demo?" });
  await user.click(within(dialog).getByRole("button", { name: "Reset data and run demo" }));
}

const dots = () => within(bar()).getByRole("list", { name: "Demo steps" }).querySelectorAll("li");
/** Every call to the APIs the demo drives, merged into the order they actually happened. */
const sequence = () =>
  Object.entries({ reset: m.resetDemo, risk: m.risk, chat: m.chat, shock: m.evidenceShock, hypotheses: m.hypotheses, wipe: m.wipeSession })
    .flatMap(([name, fn]) => fn.mock.invocationCallOrder.map((o) => [o, name] as const))
    .sort((a, b) => a[0] - b[0])
    .map(([, name]) => name);

describe("DemoRunner in the app", () => {
  it("asks before it resets anything, and does nothing if cancelled", async () => {
    const user = userEvent.setup();
    render(<App demoPauseMs={0} />);
    await user.click(runButton());
    const dialog = screen.getByRole("dialog", { name: "Run the scripted demo?" });
    expect(dialog).toHaveTextContent("resets the demo data to the seed");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Scripted demo" })).not.toBeInTheDocument();
    expect(m.resetDemo).not.toHaveBeenCalled();
    expect(m.chat).not.toHaveBeenCalled();
  });

  it("runs the whole documented story through the real APIs, in order, and ends in a predictable state", async () => {
    const user = userEvent.setup();
    render(<App demoPauseMs={0} />);
    await startDemo(user);

    await waitFor(() => expect(within(bar()).getByText("Finished")).toBeInTheDocument(), { timeout: 15000 });

    // Every step is done, and the bar says so.
    expect([...dots()].every((d) => d.className.includes("is-done"))).toBe(true);
    expect(within(bar()).getByText("Step 12 of 12")).toBeInTheDocument();
    expect(within(bar()).getByText(/Demo complete\. The backend now holds the demo's changes \(INC-045/)).toBeInTheDocument();

    // The chat messages are the documented ones, in order. The wipe clears the earlier ones, so the session after it has 3.
    expect(m.chat.mock.calls.map((c) => c[1])).toEqual([
      "checkout latency is spiking", "I restarted, still failing", "it's back", "payments-api is now owned by Ravi", "who owned payments-api in July?",
    ]);

    // The whole run, in the order the backend saw it. The first "risk" is RiskPanel's own load at page start, the second
    // is its re-fetch after the demo's reset, and the third is the demo's own Risk step.
    expect(sequence()).toEqual([
      "risk", "reset", "risk", "risk", "chat", "hypotheses", "shock", "shock", "hypotheses", "chat", "wipe", "chat", "chat", "chat",
    ]);
    expect(m.resetDemo).toHaveBeenCalledTimes(1);

    // Auto-shock asked the backend for its ranking, then removed the source it ranked first.
    expect(m.evidenceShock).toHaveBeenCalledTimes(2);
    expect(m.evidenceShock).toHaveBeenNthCalledWith(1, { incident_id: "INC-045" });
    expect(m.evidenceShock).toHaveBeenNthCalledWith(2, { incident_id: "INC-045", remove_sources: ["incident-history"] });

    // Baseline restored: hypotheses were re-fetched after the shock.
    expect(m.hypotheses.mock.calls.length).toBeGreaterThanOrEqual(2);

    // The wipe really happened for the old session, and the next message used a new one.
    const sids = m.chat.mock.calls.map((c) => c[0]);
    expect(sids[0]).toBe(sids[1]);
    expect(m.wipeSession).toHaveBeenCalledExactlyOnceWith(sids[1]);
    expect(sids[2]).not.toBe(sids[1]);
    expect(sids[2]).toBe(sids[4]);

    // Only the post-wipe conversation remains in the chat, with the backend's own words.
    const log = within(screen.getByRole("log", { name: "Conversation" }));
    expect(log.getByText("Yes - this is INC-045. Already tried: restart-pods.")).toBeInTheDocument();
    expect(log.getByText("payments-api was owned by Asha Menon in July.")).toBeInTheDocument();
    expect(log.queryByText("Logged: restart-pods FAILED on INC-045.")).not.toBeInTheDocument();

    // The chat reassignment pointed the Owners panel at payments-api (taken from the backend's tool call).
    await waitFor(() => expect(m.owner).toHaveBeenCalledWith("payments-api", undefined));

    // Final state: Incident tab, INC-045 selected, controls free again.
    expect(screen.getByRole("tab", { name: "Incident" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 3, name: "checkout latency spiking" })).toBeInTheDocument();
    expect(runButton()).toBeEnabled();
    expect(screen.getByLabelText("Message Déjà")).toBeEnabled();
    expect(graphA.nodes.length).toBeGreaterThan(0); // fixture sanity for the graph assertions below
  });

  it("shows the Stress Test baseline restored (no result, no removal marks) after the shock segment", async () => {
    const user = userEvent.setup();
    render(<App demoPauseMs={0} />);
    await startDemo(user);
    await waitFor(() => expect(within(bar()).getByText("Finished")).toBeInTheDocument(), { timeout: 15000 });

    await user.click(screen.getByRole("tab", { name: "Stress Test" }));
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
    expect(screen.queryByText("Removed in latest result")).not.toBeInTheDocument();
    expect(screen.getByText("Run 1")).toBeInTheDocument(); // the session-local history of the demo's shock is kept
  });

  it("prevents a second run and locks the controls that would interfere while it runs", async () => {
    const user = userEvent.setup();
    const held = deferred<ChatResponse>();
    m.chat.mockReturnValueOnce(held.promise);
    render(<App demoPauseMs={0} />);
    await startDemo(user);

    await waitFor(() => expect(m.chat).toHaveBeenCalledTimes(1));
    expect(runButton()).toBeDisabled();
    expect(runButton()).toHaveTextContent("Demo running…");
    expect(screen.getByRole("button", { name: "Wipe session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset demo" })).toBeDisabled();
    expect(screen.getByLabelText("Message Déjà")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Checkout latency is spiking" })).toBeDisabled();
    await user.click(runButton());
    expect(m.resetDemo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    held.resolve(chatAlert);
    await waitFor(() => expect(within(bar()).getByText("Finished")).toBeInTheDocument(), { timeout: 15000 });
  });

  it("Stop ends the run after the step in flight, skips the rest, and leaves later steps unrun", async () => {
    const user = userEvent.setup();
    const held = deferred<ChatResponse>();
    m.chat.mockReturnValueOnce(held.promise);
    render(<App demoPauseMs={0} />);
    await startDemo(user);
    await waitFor(() => expect(m.chat).toHaveBeenCalledTimes(1));

    await user.click(within(bar()).getByRole("button", { name: "Stop" }));
    expect(within(bar()).getByText("Stopping after this step…")).toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: "Stop" })).toBeDisabled();

    held.resolve(chatAlert);
    await waitFor(() => expect(within(bar()).getByText("Stopped")).toBeInTheDocument());
    expect(m.evidenceShock).not.toHaveBeenCalled();
    expect(m.chat).toHaveBeenCalledTimes(1);
    expect(m.wipeSession).not.toHaveBeenCalled();
    const states = [...dots()].map((d) => d.getAttribute("aria-label") ?? "");
    expect(states[2]).toContain("done"); // the in-flight chat step completed
    expect(states.slice(3).every((s) => s.includes("skipped"))).toBe(true);
    expect(runButton()).toBeEnabled(); // free to run again
    expect(screen.getByLabelText("Message Déjà")).toBeEnabled();

    await user.click(within(bar()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Scripted demo" })).not.toBeInTheDocument();
  });

  it("a failed step stops the run with the real error; nothing after it runs; Retry continues without resetting again", async () => {
    const user = userEvent.setup();
    m.chat.mockRejectedValueOnce(new Error("500 /chat: engine exploded"));
    render(<App demoPauseMs={0} />);
    await startDemo(user);

    await waitFor(() => expect(within(bar()).getByText("Failed")).toBeInTheDocument(), { timeout: 15000 });
    expect(within(bar()).getByRole("alert")).toHaveTextContent("Step failed: 500 /chat: engine exploded");
    expect(within(bar()).getByText("Step 3 of 12")).toBeInTheDocument();
    expect(m.evidenceShock).not.toHaveBeenCalled();
    expect([...dots()][2].getAttribute("aria-label")).toContain("failed");
    expect(runButton()).toBeEnabled();

    await user.click(within(bar()).getByRole("button", { name: "Retry step" }));
    await waitFor(() => expect(within(bar()).getByText("Finished")).toBeInTheDocument(), { timeout: 15000 });
    expect(m.resetDemo).toHaveBeenCalledTimes(1); // the retry did not wipe the data again
    expect(m.chat.mock.calls.map((c) => c[1])[0]).toBe("checkout latency is spiking");
    expect(m.chat.mock.calls.map((c) => c[1])[1]).toBe("checkout latency is spiking"); // the retried message
    expect(m.evidenceShock).toHaveBeenCalledTimes(2);
  });

  it("fails at the first step, touching nothing else, if the reset fails", async () => {
    const user = userEvent.setup();
    m.resetDemo.mockRejectedValue(new Error("500 /demo/reset: seed missing"));
    render(<App demoPauseMs={0} />);
    await startDemo(user);

    await waitFor(() => expect(within(bar()).getByText("Failed")).toBeInTheDocument());
    expect(within(bar()).getByRole("alert")).toHaveTextContent("Step failed: 500 /demo/reset: seed missing");
    expect(within(bar()).getByText("Step 1 of 12")).toBeInTheDocument();
    expect(m.risk).toHaveBeenCalledTimes(1); // only RiskPanel's own load; the demo's risk step never ran
    expect(m.chat).not.toHaveBeenCalled();
  });

  it("reports a failed Evidence Shock instead of showing a result, and does not continue the story", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockRejectedValue(new Error("500 /insights/evidence-shock: nope"));
    render(<App demoPauseMs={0} />);
    await startDemo(user);

    await waitFor(() => expect(within(bar()).getByText("Failed")).toBeInTheDocument(), { timeout: 15000 });
    expect(within(bar()).getByRole("alert")).toHaveTextContent("500 /insights/evidence-shock: nope");
    expect(within(bar()).getByText("Step 5 of 12")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
    expect(m.chat).toHaveBeenCalledTimes(1); // "I restarted…" was never sent
  });

  it("fails clearly when the backend has no Evidence Shock support", async () => {
    const user = userEvent.setup();
    m.hypotheses.mockRejectedValue(new Error("501 /insights/hypotheses/INC-045: Not implemented yet"));
    render(<App demoPauseMs={0} />);
    await startDemo(user);

    await waitFor(() => expect(within(bar()).getByText("Failed")).toBeInTheDocument(), { timeout: 15000 });
    expect(within(bar()).getByRole("alert")).toHaveTextContent("501 /insights/hypotheses/INC-045");
    expect(m.evidenceShock).not.toHaveBeenCalled();
  });
});
