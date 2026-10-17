import React, { useEffect, useState } from "react";
import { api, type GraphNode, type GraphPayload } from "./api/client";
import type { EvidenceShockResponse } from "./components/graph/shockTypes";
import GraphView from "./components/GraphView";
import RiskPanel from "./components/RiskPanel";
import ShockViz from "./components/ShockViz";

export default function App(): JSX.Element {
  const [currentGraph, setCurrentGraph] = useState<GraphPayload | null>(null);
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"risk" | "shock">("risk");

  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [shockData, setShockData] = useState<EvidenceShockResponse | null>(null);
  const [actionNotice, setActionNotice] = useState<string>("Ready. Select a mode or click a service.");
  const [loading, setLoading] = useState<boolean>(false);

  // Load initial health and alert
  useEffect(() => {
    api.health().catch(() => {});
  }, []);

  // Handle graph update from subcomponents
  const handleGraphUpdate = (g: GraphPayload) => {
    setCurrentGraph(g);
  };

  // Node click in GraphView
  const handleNodeClick = (node: GraphNode) => {
    setFocusIds([node.id]);
    setActionNotice(`Focused on ${node.label}: ${node.name || node.id}`);
  };

  // Trigger alert demo scenario: "checkout latency is spiking"
  const handleTriggerAlert = async () => {
    setLoading(true);
    setActionNotice("Triggering alert on checkout-service (latency spike)...");
    try {
      const resp = await api.alert("checkout", "latency");
      setActiveIncidentId(resp.incident.id);
      setCurrentGraph(resp.graph);
      setFocusIds([resp.likely_origin ? `svc:${resp.likely_origin}` : "svc:checkout"]);
      setActionNotice(
        `Alert opened: ${resp.incident.id}. Upstream root cause: ${resp.likely_origin}. Recent deploy: ${
          resp.suspects[0]?.recent_deploys[0]?.version || "none"
        }`
      );

      // Fetch baseline shock for this incident
      runShockAnalysis(resp.incident.id, undefined, undefined, resp.graph);
    } catch (e: any) {
      setActionNotice(`Alert error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Run evidence shock analysis
  const runShockAnalysis = async (
    incidentId: string,
    removeSources?: string[],
    removeEvidenceIds?: string[],
    existingGraph?: GraphPayload
  ) => {
    setLoading(true);
    try {
      const data = await api.evidenceShock({
        incident_id: incidentId,
        remove_sources: removeSources,
        remove_evidence_ids: removeEvidenceIds,
      });
      setShockData(data);
      if (data.graph && (!existingGraph || removeSources || removeEvidenceIds)) {
        setCurrentGraph(data.graph);
      }
      const marginStr = data.margin_after != null ? data.margin_after.toFixed(2) : "N/A";
      setActionNotice(
        `Shock analysis complete: Verdict is ${data.verdict.toUpperCase()} (margin: ${marginStr})`
      );
    } catch (err: any) {
      console.error("Shock error", err);
      setActionNotice(`Shock analysis error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle clicking a critical source chip in ShockViz
  const handleSelectShockSource = (source: string) => {
    if (!activeIncidentId) {
      handleTriggerAlert().then(() => {
        // Run with source removed once incident exists
      });
      return;
    }
    setActionNotice(`Perturbing channel: removing '${source}' to stress-test diagnosis...`);
    runShockAnalysis(activeIncidentId, [source]);
  };

  // Reset demo
  const handleReset = async () => {
    setLoading(true);
    try {
      await api.resetDemo();
      setShockData(null);
      setActiveIncidentId(null);
      setFocusIds([]);
      setActionNotice("Demo reset to clean seed state.");
      // Trigger risk reload
      const r = await api.risk(180, 10);
      setCurrentGraph(r.graph);
    } catch (e: any) {
      setActionNotice(`Reset error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        backgroundColor: "#090d16",
        color: "#f8fafc",
        overflow: "hidden",
      }}
    >
      {/* Top Navbar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px",
          backgroundColor: "#0f172a",
          borderBottom: "1px solid #1e293b",
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>🧠</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5, color: "#f8fafc" }}>
              Déjà <span style={{ fontSize: 11, fontWeight: 500, color: "#38bdf8" }}>ProofOps v1.1</span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              On-Call Incident Copilot with Graph Memory & Evidence Shock Lab
            </div>
          </div>
          <span
            style={{
              marginLeft: 12,
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              color: "#4ade80",
              border: "1px solid #22c55e",
            }}
          >
            ● GRAPH ENGINE CONNECTED
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setActiveTab("risk")}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: activeTab === "risk" ? "#0284c7" : "#1e293b",
              color: activeTab === "risk" ? "#ffffff" : "#cbd5e1",
              border: `1px solid ${activeTab === "risk" ? "#38bdf8" : "#334155"}`,
              cursor: "pointer",
            }}
          >
            ⚠️ Risk Map
          </button>

          <button
            onClick={handleTriggerAlert}
            disabled={loading}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: "#be123c",
              color: "#ffffff",
              border: "1px solid #f43f5e",
              cursor: "pointer",
            }}
          >
            🚨 Trigger Checkout Alert
          </button>

          <button
            onClick={() => {
              setActiveTab("shock");
              if (activeIncidentId) {
                runShockAnalysis(activeIncidentId);
              } else {
                handleTriggerAlert();
              }
            }}
            disabled={loading}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: activeTab === "shock" ? "#7e22ce" : "#1e293b",
              color: activeTab === "shock" ? "#ffffff" : "#cbd5e1",
              border: `1px solid ${activeTab === "shock" ? "#c084fc" : "#334155"}`,
              cursor: "pointer",
            }}
          >
            ⚡ Evidence Shock Lab
          </button>

          <button
            onClick={handleReset}
            disabled={loading}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              backgroundColor: "#1e293b",
              color: "#94a3b8",
              border: "1px solid #334155",
              cursor: "pointer",
            }}
            title="Reset to clean seed state"
          >
            ↺ Reset
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left / Center: Interactive Force Graph */}
        <div style={{ flex: 1, position: "relative", height: "100%", overflow: "hidden" }}>
          <GraphView
            payload={currentGraph}
            onNodeClick={handleNodeClick}
            focusIds={focusIds}
            height="100%"
          />
        </div>

        {/* Right Side: Tabbed Panel (Risk vs Shock) */}
        <div
          style={{
            width: 460,
            borderLeft: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#0b0f19",
            height: "100%",
          }}
        >
          {/* Panel Tab Switcher */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #1e293b",
              backgroundColor: "#0f172a",
            }}
          >
            <button
              onClick={() => setActiveTab("risk")}
              style={{
                flex: 1,
                padding: "10px",
                border: "none",
                borderBottom: activeTab === "risk" ? "2px solid #38bdf8" : "2px solid transparent",
                backgroundColor: activeTab === "risk" ? "#090d16" : "transparent",
                color: activeTab === "risk" ? "#f8fafc" : "#94a3b8",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              📊 System Risk & Blast
            </button>
            <button
              onClick={() => setActiveTab("shock")}
              style={{
                flex: 1,
                padding: "10px",
                border: "none",
                borderBottom: activeTab === "shock" ? "2px solid #c084fc" : "2px solid transparent",
                backgroundColor: activeTab === "shock" ? "#090d16" : "transparent",
                color: activeTab === "shock" ? "#f8fafc" : "#94a3b8",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ⚡ Shock Lab (ProofOps)
            </button>
          </div>

          {/* Active Tab Component */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {activeTab === "risk" ? (
              <RiskPanel
                onGraph={handleGraphUpdate}
                onSelectService={(svc) => setFocusIds([`svc:${svc}`])}
              />
            ) : (
              <ShockViz shock={shockData} onSelectSource={handleSelectShockSource} />
            )}
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 16px",
          backgroundColor: "#090d16",
          borderTop: "1px solid #1e293b",
          fontSize: 11,
          color: "#94a3b8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#38bdf8" }}>▶</span>
          <span>{actionNotice}</span>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {activeIncidentId && <span>Active Incident: <strong style={{ color: "#f8fafc" }}>{activeIncidentId}</strong></span>}
          <span>Nodes: <strong style={{ color: "#f8fafc" }}>{currentGraph?.nodes?.length || 0}</strong></span>
          <span>Edges: <strong style={{ color: "#f8fafc" }}>{currentGraph?.edges?.length || 0}</strong></span>
        </div>
      </footer>
    </div>
  );
}
