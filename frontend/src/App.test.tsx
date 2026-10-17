import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api } from "./api/client";
import {
  catalog,
  chatAlert,
  detail037,
  detail045,
  inc037,
  blastGraph,
  blastResponse,
  hypBaseline,
  inc045,
  ownerNow,
  riskResponse,
  shockInconclusive,
  outcomeFailed,
  timeline037,
  timeline045,
} from "./test/fixtures";

// GraphView draws on a canvas, which jsdom doesn't have. The stub exposes just the payload it was given.
vi.mock("./components/GraphView", () => ({
  default: ({ payload }: { payload: { nodes: unknown[]; edges: unknown[] } | null }) => (
    <div className="graph-totals">
      {payload ? `${payload.nodes.length} nodes · ${payload.edges.length} edges` : "no payload"}
    </div>
  ),
}));

vi.mock("./api/client", () => ({
  api: {
    health: vi.fn(),
    catalog: vi.fn(),
    incidents: vi.fn(),
    incident: vi.fn(),
    timeline: vi.fn(),
    outcome: vi.fn(),
    chat: vi.fn(),
    wipeSession: vi.fn(),
    resetDemo: vi.fn(),
    owner: vi.fn(),
    reassign: vi.fn(),
    hypotheses: vi.fn(),
    evidenceShock: vi.fn(),
    risk: vi.fn(),
    blast: vi.fn(),
  },
}));
const m = vi.mocked(api);

const sessionCode = () => document.querySelector(".session code")?.textContent;
const incidentsRegion = () => screen.getByRole("region", { name: "Incidents" });
const graphTotals = () => document.querySelector(".graph-totals");

beforeEach(() => {
  vi.resetAllMocks();
  m.health.mockResolvedValue({ status: "ok", mode: "mock", neo4j: false });
  m.catalog.mockResolvedValue(catalog);
  m.incidents.mockResolvedValue([inc045, inc037]);
  m.incident.mockImplementation(async (id) => (id === "INC-045" ? detail045 : detail037));
  m.timeline.mockImplementation(async (id) => (id === "INC-045" ? timeline045 : timeline037));
  m.wipeSession.mockResolvedValue({ session_id: "x", wiped: true });
  m.owner.mockResolvedValue(ownerNow);
  m.hypotheses.mockResolvedValue(hypBaseline);
  m.risk.mockResolvedValue(riskResponse);
  m.blast.mockResolvedValue(blastResponse);
});

describe("startup and layout", () => {
  it("renders the four regions without errors and loads the incident list", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Déjà" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Graph" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Details" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Risk", "Incident", "Stress Test", "Owners"]);
    expect(screen.getByRole("tab", { name: "Incident" })).toHaveAttribute("aria-selected", "true");

    expect(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ })).toBeInTheDocument();
    expect(within(incidentsRegion()).getByRole("button", { name: /INC-037/ })).toBeInTheDocument();
  });

  it("reports the backend mode from /health, not from a request merely succeeding", async () => {
    render(<App />);
    expect(await screen.findByText("MOCK · in-memory data")).toBeInTheDocument();
  });

  it("flags live mode with Neo4j connected, and live mode without it", async () => {
    m.health.mockResolvedValue({ status: "ok", mode: "live", neo4j: true });
    const { unmount } = render(<App />);
    expect(await screen.findByText("LIVE · Neo4j connected")).toBeInTheDocument();
    unmount();

    m.health.mockResolvedValue({ status: "ok", mode: "live", neo4j: false });
    render(<App />);
    expect(await screen.findByText("LIVE · Neo4j NOT connected")).toBeInTheDocument();
  });

  it("says so when the backend is unreachable and re-checks on click", async () => {
    const user = userEvent.setup();
    m.health.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<App />);
    expect(await screen.findByText("Backend unreachable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Backend status/ }));
    expect(await screen.findByText("MOCK · in-memory data")).toBeInTheDocument();
  });

  it("re-checks health when chat fails (no stale 'connected' badge) and again once a message succeeds", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText("MOCK · in-memory data")).toBeInTheDocument();

    m.chat.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    m.health.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: "It's back" }));
    expect(await screen.findByText("Backend unreachable")).toBeInTheDocument();

    m.chat.mockResolvedValueOnce(chatAlert);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(chatAlert.reply)).toBeInTheDocument();
    expect(await screen.findByText("MOCK · in-memory data")).toBeInTheDocument();
  });

  it("uses the real RiskPanel: loads risk from the API, shows its graph, and a row pick loads the blast radius", async () => {
    const user = userEvent.setup();
    render(<App />);

    // RiskPanel fetches on mount and pushes the risk graph to the centre panel.
    await waitFor(() => expect(m.risk).toHaveBeenCalledWith(180, 10));
    await waitFor(() => expect(graphTotals()).toHaveTextContent("2 nodes"));
    expect(m.blast).toHaveBeenCalledWith("payments-api", 3); // top-ranked service is selected by default

    await user.click(screen.getByRole("tab", { name: "Risk" }));
    const panel = within(screen.getByRole("tabpanel", { name: "Risk" }));
    expect(await panel.findByText("Systemic Risk Map")).toBeInTheDocument();
    const row = (await panel.findAllByRole("row")).find((r) => r.textContent?.includes("checkout"));
    expect(row).toBeDefined();

    m.blast.mockResolvedValueOnce({ ...blastResponse, service: "checkout", graph: blastGraph });
    await user.click(row as HTMLElement);

    await waitFor(() => expect(m.blast).toHaveBeenLastCalledWith("checkout", 3));
    await waitFor(() => expect(graphTotals()).toHaveTextContent("4 nodes")); // the blast graph replaced the risk graph
  });

  it("re-fetches the risk map after the demo is reset, instead of keeping pre-reset data", async () => {
    const user = userEvent.setup();
    m.resetDemo.mockResolvedValue({ ok: true, counts: {} });
    render(<App />);
    await waitFor(() => expect(m.risk).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset demo data" }));

    await waitFor(() => expect(m.risk).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(graphTotals()).toHaveTextContent("2 nodes")); // opening state: the risk graph again
  });

  it("a later chat reply replaces the risk graph, so the centre pane always follows the latest action", async () => {
    const user = userEvent.setup();
    m.chat.mockResolvedValue(chatAlert);
    render(<App />);
    await waitFor(() => expect(graphTotals()).toHaveTextContent("2 nodes")); // risk graph first

    await user.click(screen.getByRole("button", { name: "Checkout latency is spiking" }));
    await screen.findByText(chatAlert.reply);
    await waitFor(() => expect(graphTotals()).toHaveTextContent("3 nodes")); // the chat reply's own graph
  });

  it("keeps non-active tab panels mounted so their state survives switching tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await within(incidentsRegion()).findByRole("button", { name: /INC-037/ }));
    await screen.findByRole("heading", { level: 3, name: "order-service latency spiking" });

    await user.click(screen.getByRole("tab", { name: "Owners" }));
    expect(screen.getByRole("tab", { name: "Owners" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Incident" }));

    expect(screen.getByRole("heading", { level: 3, name: "order-service latency spiking" })).toBeInTheDocument();
    expect(m.incident).toHaveBeenCalledTimes(1); // not refetched just because the tab changed
  });
});

describe("incident panel", () => {
  it("shows details and a chronological timeline for the selected incident, and switches between incidents", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ }));

    expect(await screen.findByRole("heading", { level: 3, name: "checkout latency spiking" })).toBeInTheDocument();
    expect(m.incident).toHaveBeenCalledWith("INC-045");
    expect(m.timeline).toHaveBeenCalledWith("INC-045");
    const detail = within(screen.getByRole("region", { name: "checkout latency spiking" }));
    expect(detail.getByText(/payments-api v2\.3\.1 by Asha Menon/)).toBeInTheDocument(); // followed deploy
    const timeline = within(await screen.findByRole("region", { name: "Timeline" }));
    const items = timeline.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Deploy payments-api v2.3.1 by Asha Menon"); // 14 Oct, returned second by the API
    expect(items[1]).toContain("Incident opened: checkout latency spiking");
    expect(graphTotals()).toHaveTextContent("3 nodes"); // picking an incident shows its graph

    await user.click(within(incidentsRegion()).getByRole("button", { name: /INC-037/ }));

    expect(await screen.findByRole("heading", { level: 3, name: "order-service latency spiking" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "checkout latency spiking" })).not.toBeInTheDocument();
    expect(m.incident).toHaveBeenLastCalledWith("INC-037");
    expect(within(screen.getByRole("region", { name: "Timeline" })).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Root cause in redis-cache (latency). Resolved via scale-up-replicas.")).toBeInTheDocument();
    expect(graphTotals()).toHaveTextContent("5 nodes");
  });

  it("filters the loaded incidents by status", async () => {
    const user = userEvent.setup();
    render(<App />);
    await within(incidentsRegion()).findByRole("button", { name: /INC-045/ });

    await user.click(within(incidentsRegion()).getByRole("button", { name: /^Open/ }));
    expect(within(incidentsRegion()).queryByRole("button", { name: /INC-037/ })).not.toBeInTheDocument();
    expect(within(incidentsRegion()).getByRole("button", { name: /INC-045/ })).toBeInTheDocument();

    await user.click(within(incidentsRegion()).getByRole("button", { name: /^Resolved/ }));
    expect(within(incidentsRegion()).queryByRole("button", { name: /INC-045/ })).not.toBeInTheDocument();
    expect(within(incidentsRegion()).getByRole("button", { name: /INC-037/ })).toBeInTheDocument();
  });

  it("shows an empty state, and an error state that can be retried", async () => {
    const user = userEvent.setup();
    m.incidents.mockResolvedValueOnce([]);
    const { unmount } = render(<App />);
    expect(await screen.findByText(/No incidents recorded yet/)).toBeInTheDocument();
    unmount();

    m.incidents.mockRejectedValueOnce(new Error("500 /incidents: db down"));
    render(<App />);
    expect(await screen.findByText(/Couldn't load incidents: 500 \/incidents: db down/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ })).toBeInTheDocument();
  });

  it("shows an error for a failed detail load without showing another incident's data", async () => {
    const user = userEvent.setup();
    m.incident.mockRejectedValueOnce(new Error("404 /incidents/INC-045: unknown incident"));
    render(<App />);

    await user.click(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ }));

    expect(await screen.findByText(/Couldn't load this incident: 404/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "checkout latency spiking" })).not.toBeInTheDocument();
  });

  it("records an outcome through the API, confirms it, and refreshes the timeline", async () => {
    const user = userEvent.setup();
    let timelineCalls = 0;
    m.timeline.mockImplementation(async (id) => {
      if (id !== "INC-045") return timeline037;
      return ++timelineCalls > 1
        ? [...timeline045, { ts: "2026-10-17T07:05:00Z", type: "attempt", text: "Asha Menon tried restart-pods -> FAILED", node_ids: [] }]
        : timeline045;
    });
    m.outcome.mockResolvedValue(outcomeFailed);
    render(<App />);
    await user.click(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ }));

    // Fix options come from the catalog, with each fix's description.
    const fix = await screen.findByLabelText("Fix tried");
    expect(within(fix).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose a fix…", "restart-pods", "rollback-deploy"]);
    expect(screen.getByRole("button", { name: "Record outcome" })).toBeDisabled();

    await user.selectOptions(fix, "restart-pods");
    await user.type(screen.getByLabelText("Notes (optional)"), "still failing");
    await user.click(screen.getByRole("button", { name: "Record outcome" }));

    expect(m.outcome).toHaveBeenCalledExactlyOnceWith("INC-045", "restart-pods", "FAILED", "still failing");
    expect(await screen.findByText("Recorded restart-pods: failed on INC-045.")).toBeInTheDocument();
    expect(await screen.findByText(/Asha Menon tried restart-pods -> FAILED/)).toBeInTheDocument(); // timeline refreshed
    expect(m.timeline).toHaveBeenCalledTimes(2);
    expect(m.incident).toHaveBeenCalledTimes(2);
    expect(m.incidents).toHaveBeenCalledTimes(2);

    const next = within(screen.getByRole("region", { name: "Recommended next" }));
    expect(next.getByText("rollback-deploy")).toBeInTheDocument();
    expect(next.getByText(/Worked in 4\/4 similar incidents/)).toBeInTheDocument();
    expect(screen.getByLabelText("Fix tried")).toHaveValue(""); // form reset after success
  });

  it("keeps the form and shows the API error when recording an outcome fails", async () => {
    const user = userEvent.setup();
    m.outcome.mockRejectedValue(new Error("404 /outcome: unknown fix 'restart-pods'"));
    render(<App />);
    await user.click(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ }));

    await user.selectOptions(await screen.findByLabelText("Fix tried"), "restart-pods");
    await user.click(screen.getByRole("button", { name: "Record outcome" }));

    expect(await screen.findByText(/Couldn't record the outcome: 404 \/outcome: unknown fix/)).toBeInTheDocument();
    expect(screen.queryByText(/^Recorded /)).not.toBeInTheDocument(); // no success toast
    expect(screen.getByLabelText("Fix tried")).toHaveValue("restart-pods"); // input preserved for another try
    expect(m.timeline).toHaveBeenCalledTimes(1); // nothing refreshed, nothing changed
  });
});

describe("chat driving the rest of the app", () => {
  it("applies a chat reply: graph, selected incident, incident details", async () => {
    const user = userEvent.setup();
    m.chat.mockResolvedValue(chatAlert);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Checkout latency is spiking" }));

    expect(await screen.findByText(chatAlert.reply)).toBeInTheDocument();
    expect(graphTotals()).toHaveTextContent("3 nodes");
    expect(await screen.findByRole("heading", { level: 3, name: "checkout latency spiking" })).toBeInTheDocument();
    expect(m.incident).toHaveBeenCalledWith("INC-045");
    expect(within(incidentsRegion()).getByRole("button", { name: /INC-045/ })).toHaveAttribute("aria-current", "true");
  });

  it("opens the Stress Test tab only when the backend reports that intent", async () => {
    const user = userEvent.setup();
    m.chat.mockResolvedValueOnce({ ...chatAlert, intent: "alert" });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "It's back" }));
    await screen.findByText(chatAlert.reply);
    expect(screen.getByRole("tab", { name: "Incident" })).toHaveAttribute("aria-selected", "true");

    m.chat.mockResolvedValueOnce({ ...chatAlert, reply: "stress test reply", intent: "stress_test" });
    await user.click(screen.getByRole("button", { name: "The restart failed" }));
    await screen.findByText("stress test reply");
    expect(screen.getByRole("tab", { name: "Stress Test" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("evidence shock wiring", () => {
  it("sends the shock graph to the centre panel, and never shows one incident's result on another", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    m.hypotheses.mockImplementation(async (id) => ({ ...hypBaseline, incident_id: id }));
    render(<App />);

    await user.click(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ }));
    await screen.findByRole("heading", { level: 3, name: "checkout latency spiking" });
    await user.click(screen.getByRole("tab", { name: "Stress Test" }));
    expect(m.hypotheses).toHaveBeenCalledExactlyOnceWith("INC-045");

    await user.click(await screen.findByRole("checkbox", { name: "Remove entire source: Historical incidents" }));
    await user.click(screen.getByRole("button", { name: "Run shock" }));
    expect(await screen.findByRole("region", { name: "Result (after removal)" })).toBeInTheDocument();
    expect(graphTotals()).toHaveTextContent("1 nodes · 0 edges"); // the response's graph replaced the centre graph

    // Another incident: no result, fresh selection, its own hypotheses request.
    await user.click(screen.getByRole("tab", { name: "Incident" }));
    await user.click(within(incidentsRegion()).getByRole("button", { name: /INC-037/ }));
    await user.click(screen.getByRole("tab", { name: "Stress Test" }));
    await waitFor(() => expect(m.hypotheses).toHaveBeenLastCalledWith("INC-037"));
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
    expect(screen.queryByText("Removed in latest result")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Remove entire source: Historical incidents" })).not.toBeChecked();
  });
});

describe("evidence shock and demo reset", () => {
  it("drops the incident, its result and its graph when the demo is reset", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    m.resetDemo.mockResolvedValue({ ok: true, counts: {} });
    render(<App />);
    await user.click(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ }));
    await user.click(screen.getByRole("tab", { name: "Stress Test" }));
    await user.click(await screen.findByRole("checkbox", { name: "Remove entire source: Historical incidents" }));
    await user.click(screen.getByRole("button", { name: "Run shock" }));
    await screen.findByRole("region", { name: "Result (after removal)" });

    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset demo data" }));

    expect(await screen.findByText(/Select an incident \(in the Incident tab/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
    await waitFor(() => expect(graphTotals()).toHaveTextContent("2 nodes")); // not the shock graph (1 node): back to the risk graph
    // Re-selecting the same incident afterwards must not resurrect the old result.
    await user.click(screen.getByRole("tab", { name: "Incident" }));
    await user.click(await within(incidentsRegion()).findByRole("button", { name: /INC-045/ }));
    await user.click(screen.getByRole("tab", { name: "Stress Test" }));
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
  });
});

describe("ownership", () => {
  it("re-runs the owner lookup and refreshes the catalog when the backend's chat reply made a reassign tool call", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(m.owner).toHaveBeenCalledTimes(1));
    expect(m.catalog).toHaveBeenCalledTimes(1); // one shared catalog request for both panels

    m.chat.mockResolvedValueOnce({
      ...chatAlert,
      intent: "reassign",
      incident_id: null,
      tool_calls: [{ name: "reassign", args: { service: "payments-api", engineer: "Ravi Iyer" }, summary: "Ravi Iyer now owns payments-api" }],
    });
    await user.click(screen.getByRole("button", { name: "It's back" }));

    await waitFor(() => expect(m.owner).toHaveBeenCalledTimes(2));
    expect(m.catalog).toHaveBeenCalledTimes(2);
  });

  it("does not refresh ownership for replies without a reassign tool call, even if the text mentions ownership", async () => {
    const user = userEvent.setup();
    m.chat.mockResolvedValueOnce({ ...chatAlert, reply: "payments-api is now owned by Ravi", tool_calls: [] });
    render(<App />);
    await waitFor(() => expect(m.owner).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "It's back" }));
    await screen.findByText("payments-api is now owned by Ravi");

    expect(m.owner).toHaveBeenCalledTimes(1);
  });
});

describe("session wipe", () => {
  it("wipes via the API, clears the conversation, starts a new session and leaves graph data alone", async () => {
    const user = userEvent.setup();
    m.chat.mockResolvedValue(chatAlert);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Checkout latency is spiking" }));
    await screen.findByText(chatAlert.reply);
    const oldSession = m.chat.mock.calls[0][0];
    const oldShort = sessionCode();
    expect(oldSession.startsWith(oldShort as string)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Wipe session" }));

    expect(m.wipeSession).toHaveBeenCalledExactlyOnceWith(oldSession);
    expect(await screen.findByText("Chat memory wiped. The graph still remembers.")).toBeInTheDocument();
    expect(screen.queryByText(chatAlert.reply)).not.toBeInTheDocument();
    expect(screen.getByText("No messages yet.")).toBeInTheDocument();
    expect(sessionCode()).not.toBe(oldShort);

    // Graph history is untouched: nothing was reset, and the graph and incidents are still there.
    expect(m.resetDemo).not.toHaveBeenCalled();
    expect(graphTotals()).toHaveTextContent("3 nodes");
    expect(within(incidentsRegion()).getByRole("button", { name: /INC-045/ })).toBeInTheDocument();

    // The next message belongs to the new session.
    await user.click(screen.getByRole("button", { name: "It's back" }));
    await waitFor(() => expect(m.chat).toHaveBeenCalledTimes(2));
    expect(m.chat.mock.calls[1][0]).not.toBe(oldSession);
  });

  it("keeps the conversation and session when the wipe request fails", async () => {
    const user = userEvent.setup();
    m.chat.mockResolvedValue(chatAlert);
    m.wipeSession.mockRejectedValue(new Error("500 /sessions/wipe: nope"));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Checkout latency is spiking" }));
    await screen.findByText(chatAlert.reply);
    const before = sessionCode();

    await user.click(screen.getByRole("button", { name: "Wipe session" }));

    expect(await screen.findByText(/Couldn't wipe the session: 500 \/sessions\/wipe: nope/)).toBeInTheDocument();
    expect(screen.getByText(chatAlert.reply)).toBeInTheDocument();
    expect(sessionCode()).toBe(before);
    expect(screen.queryByText("Chat memory wiped. The graph still remembers.")).not.toBeInTheDocument();
  });
});

describe("demo reset", () => {
  it("asks for confirmation and does nothing if cancelled", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    const dialog = screen.getByRole("dialog", { name: "Reset demo data?" });
    expect(dialog).toHaveTextContent("lost");
    expect(m.resetDemo).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.resetDemo).not.toHaveBeenCalled();
  });

  it("resets through the API after confirmation, then clears chat, selection and graph and reloads the incidents", async () => {
    const user = userEvent.setup();
    m.chat.mockResolvedValue(chatAlert);
    m.resetDemo.mockResolvedValue({ ok: true, counts: { services: 12, incidents: 44 } });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Checkout latency is spiking" }));
    await screen.findByText(chatAlert.reply);
    const incidentLoads = m.incidents.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset demo data" }));

    expect(await screen.findByText("Demo data reset to the seed.")).toBeInTheDocument();
    expect(m.resetDemo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(chatAlert.reply)).not.toBeInTheDocument();
    // The chat's 3-node graph is gone; the freshly re-fetched 2-node risk graph is the new opening state.
    await waitFor(() => expect(graphTotals()).toHaveTextContent("2 nodes"));
    await waitFor(() => expect(m.incidents.mock.calls.length).toBeGreaterThan(incidentLoads));
  });

  it("reports a failed reset instead of claiming success", async () => {
    const user = userEvent.setup();
    m.resetDemo.mockRejectedValue(new Error("500 /demo/reset: seed missing"));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset demo data" }));

    expect(await screen.findByText(/Couldn't reset the demo: 500 \/demo\/reset: seed missing/)).toBeInTheDocument();
    expect(screen.queryByText(/^Demo data reset/)).not.toBeInTheDocument();
  });
});

describe("toasts", () => {
  it("can be dismissed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Wipe session" }));
    const toast = await screen.findByText("Chat memory wiped. The graph still remembers.");

    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(toast).not.toBeInTheDocument();
  });
});
