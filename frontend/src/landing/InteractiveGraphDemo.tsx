import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, GraphPayload } from "../api/client";
import GraphView from "../components/GraphView";
import {
  LANDING_DEMO_PAYLOAD,
  LANDING_DEMO_STEPS,
  type DemoStepDefinition,
} from "./demoFixture";
import type { Theme } from "./useTheme";

export interface InteractiveGraphDemoProps {
  theme: Theme;
  onLaunchApp?: () => void;
}

export default function InteractiveGraphDemo({
  theme,
  onLaunchApp,
}: InteractiveGraphDemoProps): JSX.Element {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const activeStep = LANDING_DEMO_STEPS[currentStepIndex];

  // Auto-play timer
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      clearTimer();
      return;
    }

    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= LANDING_DEMO_STEPS.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 4500);

    return clearTimer;
  }, [isPlaying, currentStepIndex]);

  // Derive dynamic payload matching current step (e.g. perturbed evidence for Step 5)
  const currentPayload = useMemo<GraphPayload>(() => {
    const isStep5 = activeStep.stepNumber === 5;
    const perturbedIds = new Set(activeStep.perturbedEvidenceIds || []);

    const updatedNodes = LANDING_DEMO_PAYLOAD.nodes.map((node) => {
      if (isStep5 && perturbedIds.has(node.id)) {
        return {
          ...node,
          props: {
            ...node.props,
            removed: true,
          },
        };
      }
      return node;
    });

    return {
      nodes: updatedNodes,
      edges: LANDING_DEMO_PAYLOAD.edges,
    };
  }, [activeStep]);

  // Node selection details
  const handleNodeClick = (node: GraphNode) => {
    setIsPlaying(false);
    setSelectedNode(node);
  };

  const handleStepSelect = (index: number) => {
    setCurrentStepIndex(index);
    setSelectedNode(null);
  };

  const handlePlayToggle = () => {
    if (currentStepIndex >= LANDING_DEMO_STEPS.length - 1) {
      setCurrentStepIndex(0);
    }
    setSelectedNode(null);
    setIsPlaying(!isPlaying);
  };

  const handleNextStep = () => {
    setIsPlaying(false);
    setSelectedNode(null);
    setCurrentStepIndex((prev) => Math.min(LANDING_DEMO_STEPS.length - 1, prev + 1));
  };

  const handlePrevStep = () => {
    setIsPlaying(false);
    setSelectedNode(null);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleRestart = () => {
    setIsPlaying(false);
    setSelectedNode(null);
    setCurrentStepIndex(0);
  };

  // Connected nodes for the selected node
  const connectedInfo = useMemo(() => {
    if (!selectedNode) return [];
    const edges = currentPayload.edges || [];
    const connectedIds = new Set<string>();

    edges.forEach((edge) => {
      const src = typeof edge.source === "object" ? (edge.source as any).id : edge.source;
      const tgt = typeof edge.target === "object" ? (edge.target as any).id : edge.target;
      if (src === selectedNode.id) connectedIds.add(String(tgt));
      if (tgt === selectedNode.id) connectedIds.add(String(src));
    });

    return currentPayload.nodes.filter((n) => connectedIds.has(n.id));
  }, [selectedNode, currentPayload]);

  return (
    <div className="demo-workspace" id="interactive-demo">
      {/* Top Banner: Product Preview Isolation Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-muted)",
          fontFamily: "var(--mono)",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: isPlaying ? "#10b981" : "#3b82f6",
              boxShadow: isPlaying ? "0 0 8px #10b981" : "none",
            }}
          />
          <strong style={{ color: "var(--text)" }}>AUTOMATED INTERACTIVE DEMO</strong>
          <span>•</span>
          <span>Deterministic Incident Fixture</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#38bdf8", fontWeight: 600 }}>{activeStep.badge}</span>
          {onLaunchApp && (
            <button
              onClick={onLaunchApp}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--primary)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Open in Déjà Copilot →
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Demo Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", position: "relative" }}>
        {/* Interactive Graph Canvas */}
        <div style={{ height: 560, position: "relative", width: "100%" }}>
          <GraphView
            payload={currentPayload}
            focusIds={selectedNode ? [selectedNode.id] : activeStep.focusIds}
            onNodeClick={handleNodeClick}
            height={560}
          />

          {/* Floating Selected Node Drawer / Inspection Card (Phase 7) */}
          {selectedNode && (
            <div
              style={{
                position: "absolute",
                top: 18,
                left: 18,
                zIndex: 35,
                width: 320,
                maxWidth: "calc(100% - 36px)",
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: 12,
                padding: "16px 18px",
                color: "var(--text)",
                boxShadow: "0 16px 36px rgba(0, 0, 0, 0.45)",
                backdropFilter: "blur(12px)",
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 8,
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#38bdf8",
                    }}
                  >
                    {selectedNode.label}
                  </span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                    {selectedNode.name || selectedNode.id}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                  aria-label="Close details"
                >
                  ✕
                </button>
              </div>

              {/* Attributes */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {selectedNode.score !== undefined && selectedNode.score !== null && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Risk Score:</span>
                    <strong style={{ color: "#ef4444" }}>{selectedNode.score.toFixed(1)}</strong>
                  </div>
                )}
                {selectedNode.props &&
                  Object.entries(selectedNode.props).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>
                        {k.replace("_", " ")}:
                      </span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{String(v)}</span>
                    </div>
                  ))}
              </div>

              {/* Connected entities */}
              {connectedInfo.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                    Connected Entities ({connectedInfo.length}):
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {connectedInfo.slice(0, 4).map((cn) => (
                      <span
                        key={cn.id}
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {cn.name || cn.id}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    setSelectedNode(null);
                    setIsPlaying(true);
                  }}
                  className="deja-btn-primary"
                  style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}
                >
                  Resume Demo
                </button>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="deja-btn-secondary"
                  style={{ padding: "6px 10px", fontSize: 12 }}
                >
                  Deselect
                </button>
              </div>
            </div>
          )}

          {/* Evidence Shock floating outcome banner at Step 5 */}
          {activeStep.shockDetails && !selectedNode && (
            <div
              style={{
                position: "absolute",
                top: 16,
                left: 18,
                zIndex: 30,
                background: "rgba(15, 23, 42, 0.95)",
                border: "1px solid #ef4444",
                borderRadius: 10,
                padding: "12px 16px",
                color: "#f8fafc",
                maxWidth: 340,
                boxShadow: "0 8px 24px rgba(239, 68, 68, 0.25)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span
                  style={{
                    background: "rgba(239, 68, 68, 0.2)",
                    color: "#f87171",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  SHOCKED: CI/CD DEPLOY EVIDENCE REMOVED
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>
                Verdict: {activeStep.shockDetails.verdict}
              </div>
              <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.4 }}>
                Score dropped from {activeStep.shockDetails.beforeScore} → {activeStep.shockDetails.afterScore}.
                Leading hypothesis is tied and fragile without this evidence item.
              </div>
            </div>
          )}

          {/* Recovery floating note at Step 6 */}
          {activeStep.recoveryDetails && !selectedNode && (
            <div
              style={{
                position: "absolute",
                top: 16,
                left: 18,
                zIndex: 30,
                background: "rgba(15, 23, 42, 0.95)",
                border: "1px solid #10b981",
                borderRadius: 10,
                padding: "12px 16px",
                color: "#f8fafc",
                maxWidth: 340,
                boxShadow: "0 8px 24px rgba(16, 185, 129, 0.25)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span
                  style={{
                    background: "rgba(16, 185, 129, 0.2)",
                    color: "#4ade80",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  INSTITUTIONAL MEMORY
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>
                {activeStep.recoveryDetails.fixAction}
              </div>
              <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.4 }}>
                {activeStep.recoveryDetails.stats} Owner: {activeStep.recoveryDetails.owner}.
              </div>
            </div>
          )}
        </div>

        {/* Step Controller & Narrative Box */}
        <div
          style={{
            padding: "20px 24px",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Progress bar across 7 steps */}
          <div style={{ display: "flex", gap: 6 }}>
            {LANDING_DEMO_STEPS.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <button
                  key={step.stepNumber}
                  onClick={() => handleStepSelect(idx)}
                  title={`Go to ${step.title}`}
                  aria-label={`Step ${step.stepNumber}: ${step.title}`}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 3,
                    background: isCurrent
                      ? "var(--primary)"
                      : isPast
                      ? "rgba(37, 99, 235, 0.45)"
                      : "var(--border)",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    transition: "all 0.2s ease",
                  }}
                />
              );
            })}
          </div>

          {/* Active Step Content & Controls Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            {/* Step Narrative */}
            <div style={{ flex: 1, minWidth: 280 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--primary)",
                    textTransform: "uppercase",
                  }}
                >
                  Step {activeStep.stepNumber} of 7: {activeStep.title}
                </span>
              </div>
              <h4
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: "var(--text)",
                  margin: "0 0 6px 0",
                  letterSpacing: "-0.015em",
                }}
              >
                "{activeStep.caption}"
              </h4>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {activeStep.explanation}
              </p>
            </div>

            {/* Playback Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Prev */}
              <button
                onClick={handlePrevStep}
                disabled={currentStepIndex <= 0}
                className="deja-btn-secondary"
                style={{ padding: "8px 12px", fontSize: 13 }}
                title="Previous step"
                aria-label="Previous step"
              >
                ← Prev
              </button>

              {/* Play / Pause */}
              <button
                onClick={handlePlayToggle}
                className="deja-btn-primary"
                style={{ padding: "8px 16px", minWidth: 100 }}
                aria-label={isPlaying ? "Pause automated demo" : "Play automated demo"}
              >
                {isPlaying ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>{currentStepIndex >= 6 ? "Replay" : "Play"}</span>
                  </>
                )}
              </button>

              {/* Next */}
              <button
                onClick={handleNextStep}
                disabled={currentStepIndex >= LANDING_DEMO_STEPS.length - 1}
                className="deja-btn-secondary"
                style={{ padding: "8px 12px", fontSize: 13 }}
                title="Next step"
                aria-label="Next step"
              >
                Next →
              </button>

              {/* Restart */}
              <button
                onClick={handleRestart}
                className="theme-toggle-btn"
                style={{ width: 36, height: 36 }}
                title="Restart demo from beginning"
                aria-label="Restart demo"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
