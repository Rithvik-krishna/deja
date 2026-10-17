import { useCallback, useReducer, useRef, useState } from "react";
import { api, type ChatResponse, type EvidenceShockResponse, type GraphPayload } from "./api/client";
import { Chat } from "./components/Chat";
import { IncidentPanel } from "./components/IncidentPanel";
import { OwnersPanel } from "./components/OwnersPanel";
import GraphView from "./components/GraphView";
import { TabPlaceholder } from "./components/placeholders/TabPlaceholder";
import { StressTestPanel } from "./components/StressTestPanel";
import { panelId, tabId, Tabs, type TabDef } from "./components/Tabs";
import { ToastViewport } from "./components/Toast";
import { TopBar, type BusyAction } from "./components/TopBar";
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

export default function App() {
  const [sessionId, setSessionId] = useState(newSessionId);
  const [messages, dispatch] = useReducer(chatReducer, []);
  // The graph the centre panel should show. Set by chat replies, picking an incident, and recording an outcome.
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RightTab>("incident");
  // Bumped whenever something outside IncidentPanel may have changed incident data.
  const [incidentRefresh, setIncidentRefresh] = useState(0);
  // Latest Evidence Shock result, tagged with its incident so it can never be shown for another one.
  const [shock, setShock] = useState<{ incidentId: string; result: EvidenceShockResponse } | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const { toasts, notify, dismiss } = useToasts();
  // Bumped when ownership changes outside OwnersPanel (a chat reassignment), so its lookup is re-run.
  const [ownersRefresh, setOwnersRefresh] = useState(0);
  const health = useAsync(() => api.health(), "health");
  // One /catalog request shared by the Incident (fix options) and Owners (services, engineers) panels.
  const catalog = useAsync(() => api.catalog(), "catalog");
  const reloadCatalog = catalog.reload;
  // The badge only reflects the last /health check, so re-check when a request fails, and again on the first success after an outage.
  const healthRef = useRef(health);
  healthRef.current = health;

  const handleChatResponse = useCallback((res: ChatResponse) => {
    if (healthRef.current.error) healthRef.current.reload();
    if (res.graph) setGraph(res.graph);
    if (res.incident_id) setSelectedIncidentId(res.incident_id);
    if (res.incident_id || res.tool_calls.length > 0) setIncidentRefresh((n) => n + 1);
    if (res.intent === STRESS_TEST_INTENT) setActiveTab("stress");
    // Decided from what the backend actually did (its tool calls), not from the user's wording.
    if (res.tool_calls.some((t) => t.name === "reassign")) {
      setOwnersRefresh((n) => n + 1);
      reloadCatalog();
    }
  }, [reloadCatalog]);

  const openIncident = useCallback((id: string) => {
    setSelectedIncidentId(id);
    setActiveTab("incident");
  }, []);

  // Clears only the short-term chat session on the server; the graph (and the incident data derived from it) is untouched.
  async function wipeSession() {
    setBusy("wipe");
    try {
      await api.wipeSession(sessionId);
      dispatch({ type: "cleared" });
      setSessionId(newSessionId());
      notify("success", "Chat memory wiped. The graph still remembers.");
    } catch (e) {
      notify("error", `Couldn't wipe the session: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  // Destructive: reloads the seed data. The TopBar asks for confirmation before calling this.
  async function resetDemo() {
    setBusy("reset");
    try {
      await api.resetDemo();
      dispatch({ type: "cleared" });
      setSessionId(newSessionId());
      setGraph(null);
      setShock(null);
      setSelectedIncidentId(null);
      setIncidentRefresh((n) => n + 1);
      setOwnersRefresh((n) => n + 1);
      reloadCatalog();
      health.reload();
      notify("success", "Demo data reset to the seed.");
    } catch (e) {
      notify("error", `Couldn't reset the demo: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const panel = (id: RightTab) => ({
    role: "tabpanel" as const,
    id: panelId(id),
    "aria-labelledby": tabId(id),
    hidden: activeTab !== id,
    className: "tabpanel",
  });

  return (
    <div className="app">
      <TopBar
        health={health}
        onRecheckHealth={health.reload}
        sessionId={sessionId}
        busy={busy}
        onWipeSession={wipeSession}
        onResetDemo={resetDemo}
      />

      <main className="workspace">
        <section className="pane pane-chat" aria-label="Chat">
          <Chat
            sessionId={sessionId}
            messages={messages}
            dispatch={dispatch}
            onChatResponse={handleChatResponse}
            onOpenIncident={openIncident}
            onRequestFailed={health.reload}
          />
        </section>

        <section className="pane pane-graph" aria-label="Graph">
          <h2 className="pane-title">Incident graph</h2>
          <div className="graph-host">
            {graph ? (
              <GraphView payload={graph} />
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
            <TabPlaceholder title="Risk map" status="Not available in this build">
              The risk table and blast-radius view aren't included yet. No risk data is shown here.
            </TabPlaceholder>
          </div>
          <div {...panel("incident")}>
            <IncidentPanel
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={setSelectedIncidentId}
              refreshToken={incidentRefresh}
              onGraphChange={setGraph}
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
              onGraphChange={setGraph}
              onNotify={notify}
            />
          </div>
          <div {...panel("owners")}>
            <OwnersPanel catalog={catalog} refreshToken={ownersRefresh} onNotify={notify} />
          </div>
        </aside>
      </main>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
