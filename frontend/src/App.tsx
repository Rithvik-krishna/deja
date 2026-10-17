import { useCallback, useReducer, useRef, useState } from "react";
import { api, type ChatResponse, type GraphPayload } from "./api/client";
import { Chat } from "./components/Chat";
import { IncidentPanel } from "./components/IncidentPanel";
import { GraphPlaceholder } from "./components/placeholders/GraphPlaceholder";
import { TabPlaceholder } from "./components/placeholders/TabPlaceholder";
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
  const [busy, setBusy] = useState<BusyAction>(null);
  const { toasts, notify, dismiss } = useToasts();
  const health = useAsync(() => api.health(), "health");
  // The badge only reflects the last /health check, so re-check when a request fails, and again on the first success after an outage.
  const healthRef = useRef(health);
  healthRef.current = health;

  const handleChatResponse = useCallback((res: ChatResponse) => {
    if (healthRef.current.error) healthRef.current.reload();
    if (res.graph) setGraph(res.graph);
    if (res.incident_id) setSelectedIncidentId(res.incident_id);
    if (res.incident_id || res.tool_calls.length > 0) setIncidentRefresh((n) => n + 1);
    if (res.intent === STRESS_TEST_INTENT) setActiveTab("stress");
  }, []);

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
      setSelectedIncidentId(null);
      setIncidentRefresh((n) => n + 1);
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
          {/* Swap point: replace with Rithvik's GraphView once it exists (see GraphPlaceholder.tsx). */}
          <GraphPlaceholder graph={graph} />
        </section>

        <aside className="pane pane-side" aria-label="Details">
          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} label="Details" />
          {/* All panels stay mounted (hidden, not unmounted) so switching tabs keeps their state. */}
          <div {...panel("risk")}>
            <TabPlaceholder title="Risk map" status="Waiting on RiskPanel (Rithvik)">
              The risk table and blast-radius view are owned by the graph work and are not part of Phase 1.
            </TabPlaceholder>
          </div>
          <div {...panel("incident")}>
            <IncidentPanel
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={setSelectedIncidentId}
              refreshToken={incidentRefresh}
              onGraphChange={setGraph}
              onNotify={notify}
            />
          </div>
          <div {...panel("stress")}>
            <TabPlaceholder title="Stress Test" status="Phase 2">
              The Evidence Shock interaction comes in Phase 2. It also needs client methods that don't exist in{" "}
              <code>api/client.ts</code> yet.
            </TabPlaceholder>
          </div>
          <div {...panel("owners")}>
            <TabPlaceholder title="Owners" status="Phase 2">
              Ownership time travel and reassignment come in Phase 2.
            </TabPlaceholder>
          </div>
        </aside>
      </main>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
