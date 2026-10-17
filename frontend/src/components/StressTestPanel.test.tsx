import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { api, type EvidenceShockResponse } from "../api/client";
import { deferred, evidenceGraph, hypBaseline, shockInconclusive, shockProbe, shockRobustNoGraph } from "../test/fixtures";
import { StressTestPanel } from "./StressTestPanel";

vi.mock("../api/client", () => ({ api: { hypotheses: vi.fn(), evidenceShock: vi.fn() } }));
const m = vi.mocked(api);

const NOTE =
  "Heuristic score, not a probability. Synthetic data. Scoring rule: 3*recent deploy + 1 per matching past incident + 1/(hops+1).";

/** Stateful host mirroring how App owns the latest shock result (tagged with its incident). */
function Host({ incidentId = "INC-045", active = true, onGraphChange = vi.fn(), onNotify = vi.fn(), onShockResult = vi.fn() }) {
  const [shock, setShock] = useState<{ incidentId: string; result: EvidenceShockResponse } | null>(null);
  return (
    <StressTestPanel
      incidentId={incidentId}
      active={active}
      shock={shock && shock.incidentId === incidentId ? shock.result : null}
      onShockResult={(id, r) => {
        setShock(r ? { incidentId: id, result: r } : null);
        onShockResult(id, r);
      }}
      onGraphChange={onGraphChange}
      onNotify={onNotify}
    />
  );
}

const box = (name: RegExp | string) => screen.getByRole("checkbox", { name });
const runBtn = () => screen.getByRole("button", { name: /Run shock|Running/ });

beforeEach(() => {
  vi.resetAllMocks();
  m.hypotheses.mockResolvedValue(hypBaseline);
});

describe("A: hypotheses", () => {
  it("loads and shows ranked hypotheses, the evidence inventory grouped by source, and the exact scoring note", async () => {
    render(<Host />);
    expect(screen.getByText("Loading hypotheses…")).toBeInTheDocument();

    const base = within(await screen.findByRole("region", { name: "Baseline hypotheses" }));
    expect(m.hypotheses).toHaveBeenCalledExactlyOnceWith("INC-045");
    const rows = base.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("#1payments-api");
    expect(rows[0]).toContain("owner Asha Menon");
    expect(rows[1]).toContain("#2inventory");
    expect(screen.queryByText("Loading hypotheses…")).not.toBeInTheDocument();

    expect(screen.getByText("Recent deployments")).toBeInTheDocument();
    expect(screen.getByText("Historical incidents")).toBeInTheDocument();
    expect(screen.getByText("Service topology")).toBeInTheDocument();
    expect(screen.getByText("Recent deploy on payments-api: v2.3.1 by Asha Menon")).toBeInTheDocument();
    expect(screen.getByText("ev:history:INC-042")).toBeInTheDocument(); // backend-supplied id shown as is
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("handles an empty hypothesis list", async () => {
    m.hypotheses.mockResolvedValue({ ...hypBaseline, hypotheses: [] });
    render(<Host />);
    expect(await screen.findByText(/returned no hypotheses/)).toBeInTheDocument();
  });

  it("asks for an incident when none is selected, and does not call the API", () => {
    render(<StressTestPanel incidentId={null} active shock={null} onShockResult={vi.fn()} onGraphChange={vi.fn()} onNotify={vi.fn()} />);
    expect(screen.getByText(/Select an incident/)).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(m.hypotheses).not.toHaveBeenCalled();
  });

  it("does not fetch until the tab is viewed", async () => {
    const { rerender } = render(<Host active={false} />);
    expect(screen.getByText("Open this tab to load hypotheses.")).toBeInTheDocument();
    expect(m.hypotheses).not.toHaveBeenCalled();

    rerender(<Host active />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    expect(m.hypotheses).toHaveBeenCalledTimes(1);
  });

  it("shows an honest unavailable state for 501 and 404 Not Found, and never retries by itself", async () => {
    const user = userEvent.setup();
    m.hypotheses.mockRejectedValueOnce(new Error("501 /insights/hypotheses/INC-045: Not implemented yet: hypotheses"));
    render(<Host />);
    expect(await screen.findByText(/isn't available on this backend \(HTTP 501\)/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(m.hypotheses).toHaveBeenCalledTimes(1);

    m.hypotheses.mockRejectedValueOnce(new Error("404 /insights/hypotheses/INC-045: Not Found"));
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText(/isn't available on this backend \(HTTP 404\)/)).toBeInTheDocument();
    expect(m.hypotheses).toHaveBeenCalledTimes(2); // only because the user asked
  });

  it("distinguishes an unknown incident from other errors, with retry", async () => {
    const user = userEvent.setup();
    m.hypotheses.mockRejectedValueOnce(new Error("404 /insights/hypotheses/INC-045: unknown incident 'INC-045'"));
    const { unmount } = render(<Host />);
    expect(await screen.findByText(/doesn't know this incident: unknown incident 'INC-045'/)).toBeInTheDocument();
    unmount();

    m.hypotheses.mockRejectedValueOnce(new Error("500 /insights/hypotheses/INC-045: boom")).mockResolvedValueOnce(hypBaseline);
    render(<Host />);
    expect(await screen.findByText(/Couldn't load hypotheses: 500/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Baseline hypotheses" })).toBeInTheDocument();
  });
});

describe("B: evidence selection", () => {
  it("selects and deselects an item without sending any request", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    const item = box("Past incident INC-042 (payments-api latency)");
    expect(item).not.toBeChecked();
    expect(runBtn()).toBeDisabled();

    await user.click(item);
    expect(item).toBeChecked();
    expect(screen.getByText("Selected for removal")).toBeInTheDocument();
    expect(screen.getByText(/Selected for removal: 0 sources, 1 item\./)).toBeInTheDocument();
    expect(runBtn()).toBeEnabled();

    await user.click(item);
    expect(item).not.toBeChecked();
    expect(screen.queryByText("Selected for removal")).not.toBeInTheDocument();
    expect(runBtn()).toBeDisabled();
    expect(m.evidenceShock).not.toHaveBeenCalled();
  });

  it("selecting a whole source covers its items", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });

    await user.click(box("Remove entire source: Historical incidents"));

    const covered = box("Past incident INC-042 (payments-api latency)");
    expect(covered).toBeChecked();
    expect(covered).toBeDisabled();
    expect(screen.getAllByText("Selected via source")).toHaveLength(3);
    expect(m.evidenceShock).not.toHaveBeenCalled();
  });
});

describe("C: manual shock", () => {
  async function pickAndRun(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());
  }

  it("sends the real request and shows the backend's verdict, margins and recommendation", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    const onShockResult = vi.fn();
    const onNotify = vi.fn();
    render(<Host onShockResult={onShockResult} onNotify={onNotify} />);

    await pickAndRun(user);

    expect(m.evidenceShock).toHaveBeenCalledExactlyOnceWith({ incident_id: "INC-045", remove_sources: ["incident-history"] });
    const result = within(await screen.findByRole("region", { name: "Result (after removal)" }));
    expect(result.getAllByText("INCONCLUSIVE").length).toBeGreaterThan(0);
    expect(result.getByText("The available evidence does not support a confident conclusion under the tested conditions.")).toBeInTheDocument();
    expect(result.getByText(/after · margin 1 → 0/)).toBeInTheDocument();
    expect(result.getAllByText(/Verify incident-history before remediating/).length).toBeGreaterThan(0);
    expect(onShockResult).toHaveBeenCalledWith("INC-045", shockInconclusive);
    expect(onNotify).toHaveBeenCalledWith("info", "Stress test finished: INCONCLUSIVE.");
  });

  it("sends individual evidence ids when items are selected", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockRobustNoGraph);
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Recent deploy on inventory: v4.8.0 by Kiran Rao"));
    await user.click(runBtn());

    expect(m.evidenceShock).toHaveBeenCalledExactlyOnceWith({ incident_id: "INC-045", remove_evidence_ids: ["ev:deploy:inventory"] });
  });

  it("ignores a second click while a request is running", async () => {
    const user = userEvent.setup();
    const pending = deferred<EvidenceShockResponse>();
    m.evidenceShock.mockReturnValue(pending.promise);
    render(<Host />);

    await pickAndRun(user);
    expect(runBtn()).toBeDisabled();
    await user.click(runBtn());
    expect(m.evidenceShock).toHaveBeenCalledTimes(1);

    pending.resolve(shockInconclusive);
    await screen.findByRole("region", { name: "Result (after removal)" });
  });

  it("on failure shows the error, keeps the selection, shows no result, and can be retried", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockRejectedValueOnce(new Error("500 /insights/evidence-shock: engine exploded"));
    const onShockResult = vi.fn();
    render(<Host onShockResult={onShockResult} />);

    await pickAndRun(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("your selection is kept");
    expect(screen.getByRole("alert")).toHaveTextContent("500 /insights/evidence-shock: engine exploded");
    expect(box("Remove entire source: Historical incidents")).toBeChecked();
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
    expect(onShockResult).not.toHaveBeenCalled();
    expect(screen.getByText("No stress tests run for this incident yet.")).toBeInTheDocument();

    m.evidenceShock.mockResolvedValueOnce(shockInconclusive);
    await user.click(runBtn());
    expect(await screen.findByRole("region", { name: "Result (after removal)" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls an unsupported shock endpoint what it is", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockRejectedValueOnce(new Error("501 /insights/evidence-shock: Not implemented yet"));
    render(<Host />);
    await pickAndRun(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Evidence Shock isn't available on this backend");
  });
});

describe("D: auto-shock", () => {
  it("asks the backend for its critical ranking, then removes the source it ranks first", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValueOnce(shockProbe).mockResolvedValueOnce(shockInconclusive);
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });

    await user.click(screen.getByRole("button", { name: "Auto-shock" }));

    expect(await screen.findByRole("region", { name: "Result (after removal)" })).toBeInTheDocument();
    expect(m.evidenceShock).toHaveBeenNthCalledWith(1, { incident_id: "INC-045" });
    expect(m.evidenceShock).toHaveBeenNthCalledWith(2, { incident_id: "INC-045", remove_sources: ["incident-history"] }); // shockProbe ranks it first
    expect(box("Remove entire source: Historical incidents")).toBeChecked(); // the selection is shown
    expect(screen.getByText("Auto")).toBeInTheDocument();
    expect(screen.getByText("Removed: Historical incidents")).toBeInTheDocument();
  });

  it("does nothing further, and shows no result, when the backend offers no critical source", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValueOnce({ ...shockProbe, critical_sources: [] });
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });

    await user.click(screen.getByRole("button", { name: "Auto-shock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no critical sources");
    expect(m.evidenceShock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
  });

  it("shows an error and no result when the removal request fails", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValueOnce(shockProbe).mockRejectedValueOnce(new Error("500 /insights/evidence-shock: nope"));
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });

    await user.click(screen.getByRole("button", { name: "Auto-shock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("500 /insights/evidence-shock: nope");
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
  });
});

describe("E: before / after labelling and honesty", () => {
  it("marks the evidence the backend says was removed and labels baseline vs result", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    expect(screen.getByRole("heading", { name: "Baseline hypotheses" })).toBeInTheDocument();
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());

    expect(await screen.findByRole("heading", { name: "Result (after removal)" })).toBeInTheDocument();
    expect(screen.getAllByText("Removed in latest result")).toHaveLength(3); // exactly the three history items the response flags
    expect(screen.getByText("Top suspect:", { exact: false })).toBeInTheDocument();
  });

  it("states plainly when no recommendation was returned instead of inventing one", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue({ ...shockInconclusive, recommendation: "" });
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());

    const result = within(await screen.findByRole("region", { name: "Result (after removal)" }));
    expect(result.getAllByText("No recommendation was returned by the backend.").length).toBeGreaterThan(0);
  });
});

describe("E2: comparison values come from the response, never invented", () => {
  const host = () => document.querySelector(".shockviz-host");

  it("shows ShockViz's rank change, before/after scores and delta from the response's own fields", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());
    await screen.findByRole("region", { name: "Result (after removal)" });

    const text = host()?.textContent ?? "";
    expect(text).toContain("#1 → #2"); // payments-api: rank_before 1 -> rank_after 2
    expect(text).toContain("#2 → #1"); // inventory
    expect(text).toContain("5.5"); // payments-api score_before
    expect(text).toContain("3.5"); // score_after
    expect(text).toContain("-2.0"); // delta
  });

  it("draws no comparison when the backend omitted before/after values, and says which services lack them", async () => {
    const user = userEvent.setup();
    const [first, ...rest] = shockInconclusive.hypotheses;
    m.evidenceShock.mockResolvedValue({
      ...shockInconclusive,
      hypotheses: [{ ...first, score_before: null, rank_before: null }, ...rest],
    });
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());

    const result = within(await screen.findByRole("region", { name: "Result (after removal)" }));
    expect(result.getByText(/no before\/after values for inventory, so no comparison is drawn/)).toBeInTheDocument();
    expect(host()).toBeNull(); // ShockViz would have shown the post-shock score as the baseline
    expect(result.getByText(/#1/)).toBeInTheDocument(); // only the post-shock ranking, as returned
    expect(result.queryByText(/→ #/)).not.toBeInTheDocument();
    expect(result.getByText("INCONCLUSIVE")).toBeInTheDocument(); // verdict still shown
  });
});

describe("ShockViz chips and result visibility", () => {
  it("a critical-channel chip only selects the source (nothing sent) and tells the user", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    const onNotify = vi.fn();
    render(<Host onNotify={onNotify} />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());
    await screen.findByRole("region", { name: "Result (after removal)" });
    await user.click(box("Remove entire source: Historical incidents")); // deselect
    onNotify.mockClear();
    m.evidenceShock.mockClear();

    const chip = within(document.querySelector(".shockviz-host") as HTMLElement).getByRole("button", { name: /incident-history/ });
    await user.click(chip);

    expect(box("Remove entire source: Historical incidents")).toBeChecked();
    expect(onNotify).toHaveBeenCalledWith("info", "Historical incidents selected for removal. Press Run shock to test it.");
    expect(m.evidenceShock).not.toHaveBeenCalled();
  });

  it("explains Auto-shock in visible text and scrolls a new result into view", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    expect(screen.getByText(/Auto-shock removes the evidence source the backend ranks most critical/)).toBeInTheDocument();

    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());
    await screen.findByRole("region", { name: "Result (after removal)" });
    expect(scroll).toHaveBeenCalled();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("sends both evidence ids and sources when both are selected, and disables Reset while running", async () => {
    const user = userEvent.setup();
    const pending = deferred<EvidenceShockResponse>();
    m.evidenceShock.mockReturnValue(pending.promise);
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(box("Recent deploy on inventory: v4.8.0 by Kiran Rao"));
    await user.click(runBtn());

    expect(m.evidenceShock).toHaveBeenCalledExactlyOnceWith({
      incident_id: "INC-045",
      remove_evidence_ids: ["ev:deploy:inventory"],
      remove_sources: ["incident-history"],
    });
    expect(screen.getByRole("button", { name: "Reset shocks" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Auto-shock" })).toBeDisabled();
    expect(box("Recent deploy on inventory: v4.8.0 by Kiran Rao")).toBeDisabled(); // selection frozen mid-run
    pending.resolve(shockInconclusive);
    await screen.findByRole("region", { name: "Result (after removal)" });
    expect(screen.getByRole("button", { name: "Reset shocks" })).toBeEnabled();
  });

  it("lists history newest first with the backend's recommendation", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValueOnce(shockInconclusive).mockResolvedValueOnce(shockRobustNoGraph);
    render(<Host />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());
    await screen.findByText("Run 1");
    await user.click(runBtn());
    await screen.findByText("Run 2");

    const hist = within(screen.getByRole("region", { name: /Shock history/ })).getAllByRole("listitem");
    expect(hist[0]).toHaveTextContent("Run 2");
    expect(hist[0]).toHaveTextContent("ROBUST");
    expect(hist[1]).toHaveTextContent("Run 1");
    expect(hist[1]).toHaveTextContent("Verify incident-history before remediating");
  });
});

describe("F: reset shocks", () => {
  it("clears the selection and result, reloads the baseline, restores its graph, and keeps history", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    const onShockResult = vi.fn();
    const onGraphChange = vi.fn();
    render(<Host onShockResult={onShockResult} onGraphChange={onGraphChange} />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());
    await screen.findByRole("region", { name: "Result (after removal)" });
    onGraphChange.mockClear();

    await user.click(screen.getByRole("button", { name: "Reset shocks" }));

    await waitFor(() => expect(m.hypotheses).toHaveBeenCalledTimes(2));
    expect(onShockResult).toHaveBeenLastCalledWith("INC-045", null);
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
    expect(box("Remove entire source: Historical incidents")).not.toBeChecked();
    expect(screen.queryByText("Removed in latest result")).not.toBeInTheDocument();
    await waitFor(() => expect(onGraphChange).toHaveBeenCalledExactlyOnceWith(evidenceGraph)); // baseline graph, shown once
    expect(screen.getByText("Run 1")).toBeInTheDocument(); // session-local history is not erased
  });
});

describe("G: graph integration", () => {
  it("hands the response's graph to the app, and keeps the current graph when there is none", async () => {
    const user = userEvent.setup();
    const onGraphChange = vi.fn();
    m.evidenceShock.mockResolvedValueOnce(shockInconclusive).mockResolvedValueOnce(shockRobustNoGraph).mockResolvedValueOnce({ ...shockRobustNoGraph, graph: { nodes: [], edges: [] } });
    render(<Host onGraphChange={onGraphChange} />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });

    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());
    await waitFor(() => expect(onGraphChange).toHaveBeenCalledExactlyOnceWith(shockInconclusive.graph));

    await user.click(runBtn());
    await screen.findByText("Run 2");
    expect(onGraphChange).toHaveBeenCalledTimes(1); // no graph in the response: untouched

    await user.click(runBtn());
    await screen.findByText("Run 3");
    expect(onGraphChange).toHaveBeenCalledTimes(1); // an empty payload must not blank the graph either
    expect(screen.getByRole("region", { name: "Result (after removal)" })).toBeInTheDocument(); // results still render without a graph
  });
});

describe("history and J: incident isolation", () => {
  it("keeps results, selection and history separate per incident", async () => {
    const user = userEvent.setup();
    m.evidenceShock.mockResolvedValue(shockInconclusive);
    const { rerender } = render(<Host incidentId="INC-045" />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());
    await screen.findByText("Run 1");

    m.hypotheses.mockResolvedValue({ ...hypBaseline, incident_id: "INC-046" });
    rerender(<Host incidentId="INC-046" />);

    await waitFor(() => expect(m.hypotheses).toHaveBeenLastCalledWith("INC-046"));
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    expect(screen.queryByRole("region", { name: "Result (after removal)" })).not.toBeInTheDocument();
    expect(screen.queryByText("Removed in latest result")).not.toBeInTheDocument();
    expect(box("Remove entire source: Historical incidents")).not.toBeChecked();
    expect(screen.getByText("No stress tests run for this incident yet.")).toBeInTheDocument();
    expect(screen.queryByText("Run 1")).not.toBeInTheDocument();

    rerender(<Host incidentId="INC-045" />);
    expect(await screen.findByText("Run 1")).toBeInTheDocument(); // INC-045's own history is still its own
  });

  it("drops a response that arrives after the user switched incident", async () => {
    const user = userEvent.setup();
    const pending = deferred<EvidenceShockResponse>();
    m.evidenceShock.mockReturnValue(pending.promise);
    const onShockResult = vi.fn();
    const onGraphChange = vi.fn();
    const { rerender } = render(<Host incidentId="INC-045" onShockResult={onShockResult} onGraphChange={onGraphChange} />);
    await screen.findByRole("region", { name: "Baseline hypotheses" });
    await user.click(box("Remove entire source: Historical incidents"));
    await user.click(runBtn());

    rerender(<Host incidentId="INC-046" onShockResult={onShockResult} onGraphChange={onGraphChange} />);
    pending.resolve(shockInconclusive);
    await new Promise((r) => setTimeout(r, 20));

    expect(onShockResult).not.toHaveBeenCalled();
    expect(onGraphChange).not.toHaveBeenCalled();
    expect(screen.queryByText("Run 1")).not.toBeInTheDocument();
  });
});
