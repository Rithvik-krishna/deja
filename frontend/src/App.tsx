import { useCallback, useReducer, useRef, useState } from "react";
import { api, type ChatResponse, type EvidenceShockResponse, type GraphPayload, type IncidentSummary } from "./api/client";
import { Chat, type ChatSender } from "./components/Chat";
import { DemoBar } from "./components/DemoBar";
import { IncidentPanel } from "./components/IncidentPanel";
import { OwnersPanel } from "./components/OwnersPanel";
import GraphView from "./components/GraphView";
import RiskPanel from "./components/RiskPanel";
import { StressTestPanel, type StressController } from "./components/StressTestPanel";
import { panelId, tabId, Tabs, type TabDef } from "./components/Tabs";
import { ToastViewport } from "./components/Toast";
import { TopBar, type BusyAction } from "./components/TopBar";
import { DEMO_STEPS } from "./demo/script";
import { useDemoRunner } from "./demo/useDemoRunner";
import { errorMessage } from "./lib/errors";
import { chatReducer } from "./state/chat";
import { STRESS_TEST_INTENT } from "./state/intents";
import { newSessionId } from "./state/session";
import { useAsync } from "./state/useAsync";
import { useToasts } from "./state/useToasts";

type RightTab = "risk" | "incident" | "stress" | "owners";

const TABS: TabDef<RightTab>[] = [
  { id: "risk", label: "Risk" },
  { id: "incident", label: "Incident" },
  { id: "stress", label: "Stress Test" },
  { id: "owners", label: "Owners" },
];

/** Pause between demo steps (docs/TASKS.md T3: "with 2s pauses"). Tests pass 0. */
const DEMO_PAUSE_MS = 2000;

export default function App({ demoPauseMs = DEMO_PAUSE_MS }: { demoPauseMs?: number } = {}) {
  const [sessionId, setSessionId] = useState(newSessionId);
  const [messages, dispatch] = useReducer(chatReducer, []);
  // The graph the centre panel should show. Set by chat replies, picking an incident, and recording an outcome.
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [graphMode, setGraphMode] = useState<"topology" | "evidence">("topology");
  const [topologyGraph, setTopologyGraph] = useState<GraphPayload | null>(null);
  const [evidenceGraph, setEvidenceGraph] = useState<GraphPayload | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  // Node ids GraphView should emphasise (set by the Risk table when a service is picked).
  const [focusIds, setFocusIds] = useState<string[]>([]);
  // Bumped on demo reset so RiskPanel (which owns its own fetch) remounts and re-fetches instead of showing pre-reset data.
  const [riskEpoch, setRiskEpoch] = useState(0);
  const [activeTab, setActiveTab] = useState<RightTab>("incident");
  // Bumped whenever something outside IncidentPanel may have changed incident data.
  const [incidentRefresh, setIncidentRefresh] = useState(0);
  // Latest Evidence Shock result, tagged with its incident so it can never be shown for another one.
  const [shock, setShock] = useState<{ incidentId: string; result: EvidenceShockResponse } | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const { toasts, notify, dismiss } = useToasts();
  // Bumped when ownership changes outside OwnersPanel (a chat reassignment), so its lookup is re-run.
  const [ownersRefresh, setOwnersRefresh] = useState(0);
  // Which service OwnersPanel should show (the one a chat reply just reassigned).
  const [ownersFocus, setOwnersFocus] = useState<{ service: string; seq: number } | null>(null);
  // Handles the scripted demo uses to drive the real Chat and Stress Test panels.
  const chatSender = useRef<ChatSender | null>(null);
  const stressController = useRef<StressController | null>(null);
  const health = useAsync(() => api.health(), "health");
  // One /catalog request shared by the Incident (fix options) and Owners (services, engineers) panels.
  const catalog = useAsync(() => api.catalog(), "catalog");
  const reloadCatalog = catalog.reload;
  // The badge only reflects the last /health check, so re-check when a request fails, and again on the first success after an outage.
  const healthRef = useRef(health);
  healthRef.current = health;

  const updateGraph = useCallback((newGraph: GraphPayload | null) => {
    setGraph(newGraph);
    if (!newGraph) {
      setTopologyGraph(null);
      setEvidenceGraph(null);
      return;
    }
    const isEvidence = newGraph.nodes.some(
      (n) => n.label.toLowerCase().includes("evidence") || n.id.startsWith("ev:")
    );
    if (isEvidence) {
      setEvidenceGraph(newGraph);
    } else {
      setTopologyGraph(newGraph);
    }
  }, []);

  const handleGraphModeChange = useCallback(
    async (mode: "topology" | "evidence") => {
      setGraphMode(mode);
      if (mode === "evidence") {
        if (!evidenceGraph && selectedIncidentId) {
          try {
            const hyp = await api.hypotheses(selectedIncidentId);
            if (hyp.graph && hyp.graph.nodes.length > 0) {
              setEvidenceGraph(hyp.graph);
            }
          } catch {
            // keep current graph if hypotheses fetch fails
          }
        }
      } else {
        if (!topologyGraph && selectedIncidentId) {
          try {
            const inc = await api.incident(selectedIncidentId);
            if (inc.graph && inc.graph.nodes.length > 0) {
              setTopologyGraph(inc.graph);
            }
          } catch {
            // keep current graph if incident fetch fails
          }
        }
      }
    },
    [evidenceGraph, topologyGraph, selectedIncidentId]
  );

  const handleStressTestService = useCallback(
    async (serviceName?: string) => {
      setActiveTab("stress");
      handleGraphModeChange("evidence");

      try {
        let list: IncidentSummary[] = [];
        if (typeof api.incidents === "function") {
          list = await api.incidents();
        }
        if (!list || list.length === 0) return;

        let targetId: string | null = null;
        if (serviceName) {
          const sLower = serviceName.toLowerCase();
          const match =
            list.find((i) => i.origin?.toLowerCase() === sLower) ||
            list.find((i) => i.impacted && i.impacted.some((s) => s.toLowerCase() === sLower)) ||
            list.find((i) => i.title.toLowerCase().includes(sLower));
          if (match) {
            targetId = match.id;
          }
        }

        if (!targetId && !selectedIncidentId) {
          targetId = list[0].id;
        }

        if (targetId) {
          setSelectedIncidentId(targetId);
          try {
            const hyp = await api.hypotheses(targetId);
            if (hyp.graph && hyp.graph.nodes && hyp.graph.nodes.length > 0) {
              setEvidenceGraph(hyp.graph);
              setGraph(hyp.graph);
            }
          } catch {
            // Handled inside StressTestPanel
          }
        }
      } catch {
        // Fallback
      }
    },
    [selectedIncidentId, handleGraphModeChange]
  );

  const handleChatResponse = useCallback((res: ChatResponse) => {
    if (healthRef.current.error) healthRef.current.reload();
    if (res.graph) updateGraph(res.graph);
    if (res.incident_id) setSelectedIncidentId(res.incident_id);
    if (res.incident_id || res.tool_calls.length > 0) setIncidentRefresh((n) => n + 1);
    if (res.intent === STRESS_TEST_INTENT) setActiveTab("stress");
    // Decided from what the backend actually did (its tool calls), not from the user's wording.
    const reassign = res.tool_calls.find((t) => t.name === "reassign");
    if (reassign) {
      setOwnersRefresh((n) => n + 1);
      reloadCatalog();
      const svc = reassign.args.service;
      if (typeof svc === "string") setOwnersFocus((f) => ({ service: svc, seq: (f?.seq ?? 0) + 1 }));
    }
  }, [reloadCatalog, updateGraph]);

  const openIncident = useCallback((id: string) => {
    setSelectedIncidentId(id);
    setActiveTab("incident");
  }, []);

  // Clears only the short-term chat session on the server; the graph (and the incident data derived from it) is untouched.
  // The *Core functions throw on failure so the scripted demo can report it; the buttons wrap them with toasts.
  async function wipeCore() {
    await api.wipeSession(sessionId);
    dispatch({ type: "cleared" });
    setSessionId(newSessionId());
  }

  async function wipeSession() {
    setBusy("wipe");
    try {
      await wipeCore();
      notify("success", "Chat memory wiped. The graph still remembers.");
    } catch (e) {
      notify("error", `Couldn't wipe the session: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  // Destructive: reloads the seed data. The TopBar asks for confirmation before calling this.
  async function resetCore() {
    await api.resetDemo();
    dispatch({ type: "cleared" });
    setSessionId(newSessionId());
    setGraph(null);
    setTopologyGraph(null);
    setEvidenceGraph(null);
    setGraphMode("topology");
    setFocusIds([]);
    setRiskEpoch((n) => n + 1);
    setShock(null);
    setSelectedIncidentId(null);
    setOwnersFocus(null);
    setIncidentRefresh((n) => n + 1);
    setOwnersRefresh((n) => n + 1);
    reloadCatalog();
    health.reload();
  }

  async function resetDemo() {
    setBusy("reset");
    try {
      await resetCore();
      notify("success", "Demo data reset to the seed.");
    } catch (e) {
      notify("error", `Couldn't reset the demo: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const demo = useDemoRunner(
    DEMO_STEPS,
    {
      resetDemo: resetCore,
      wipeSession: wipeCore,
      showTab: setActiveTab,
      sendChat: (text) => {
        const sender = chatSender.current;
        if (!sender) return Promise.reject(new Error("The chat panel is not ready."));
        return sender.send(text);
      },
      stress: () => stressController.current,
    },
    { pauseMs: demoPauseMs },
  );

  const panel = (id: RightTab) => ({
    role: "tabpanel" as const,
    id: panelId(id),
    "aria-labelledby": tabId(id),
    hidden: activeTab !== id,
    className: "tabpanel",
  });

  const activeGraph = graphMode === "evidence" ? (evidenceGraph || graph) : (topologyGraph || graph);

  return (
    <div className="app">
      <TopBar
        health={health}
        onRecheckHealth={health.reload}
        sessionId={sessionId}
        busy={busy}
        onWipeSession={wipeSession}
        onResetDemo={resetDemo}
        demoActive={demo.active}
        onRunDemo={demo.start}
      />
      <DemoBar state={demo.state} onStop={demo.stop} onRetry={demo.retry} onDismiss={demo.dismiss} />

      <main className="workspace">
        <section className="pane pane-chat" aria-label="Chat">
          <Chat
            sessionId={sessionId}
            messages={messages}
            dispatch={dispatch}
            onChatResponse={handleChatResponse}
            onOpenIncident={openIncident}
            onRequestFailed={health.reload}
            senderRef={chatSender}
            locked={demo.active}
          />
        </section>

        <section className="pane pane-graph" aria-label="Graph">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border)",
              paddingRight: 8,
            }}
          >
            <h2 className="pane-title" style={{ borderBottom: "none" }}>Incident graph</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                className={`btn btn-small ${graphMode === "topology" ? "btn-primary" : ""}`}
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => handleGraphModeChange("topology")}
                title="Service architecture & dependencies"
              >
                🌐 Topology
              </button>
              <button
                type="button"
                className={`btn btn-small ${graphMode === "evidence" ? "btn-primary" : ""}`}
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => handleGraphModeChange("evidence")}
                title="Hypotheses & counterfactual evidence perturbation"
              >
                ⚡ Evidence Graph
              </button>
            </div>
          </div>
          <div className="graph-host">
            {activeGraph ? (
              <GraphView
                payload={activeGraph}
                focusIds={focusIds}
                catalogServices={catalog.data?.services}
                graphMode={graphMode}
                onGraphModeChange={handleGraphModeChange}
                onAskChat={(prompt) => {
                  chatSender.current?.send(prompt);
                }}
                onViewOwners={(svc) => {
                  setActiveTab("owners");
                  setOwnersFocus({ service: svc, seq: Date.now() });
                }}
                onStressTest={handleStressTestService}
                onNodeClick={(node) => {
                  if (node.label.toLowerCase().includes("service")) {
                    setFocusIds([node.id]);
                  }
                }}
              />
            ) : (
              <div className="state graph-empty">
                <p>No graph yet.</p>
                <p>Send an alert in chat or pick an incident, and the graph the backend returns will appear here.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="pane pane-side" aria-label="Details">
          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} label="Details" />
          {/* All panels stay mounted (hidden, not unmounted) so switching tabs keeps their state. */}
          <div {...panel("risk")}>
            {/* Rithvik's RiskPanel: fetches /graph/risk itself and pushes the risk graph to the centre via onGraph. */}
            <RiskPanel key={riskEpoch} onGraph={updateGraph} onSelectService={(svc) => setFocusIds([`svc:${svc}`])} />
          </div>
          <div {...panel("incident")}>
            <IncidentPanel
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={setSelectedIncidentId}
              refreshToken={incidentRefresh}
              onGraphChange={updateGraph}
              onNotify={notify}
              catalog={catalog}
            />
          </div>
          <div {...panel("stress")}>
            <StressTestPanel
              incidentId={selectedIncidentId}
              active={activeTab === "stress"}
              shock={shock && shock.incidentId === selectedIncidentId ? shock.result : null}
              onShockResult={(incidentId, result) => setShock(result ? { incidentId, result } : null)}
              onGraphChange={updateGraph}
              onNotify={notify}
              controllerRef={stressController}
              onSelectIncident={(id) => {
                setSelectedIncidentId(id || null);
                if (id) {
                  api
                    .hypotheses(id)
                    .then((hyp) => {
                      if (hyp.graph && hyp.graph.nodes && hyp.graph.nodes.length > 0) {
                        setEvidenceGraph(hyp.graph);
                        setGraph(hyp.graph);
                      }
                    })
                    .catch(() => {});
                }
              }}
            />
          </div>
          <div {...panel("owners")}>
            <OwnersPanel catalog={catalog} refreshToken={ownersRefresh} onNotify={notify} focusService={ownersFocus} />
          </div>
        </aside>
      </main>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
