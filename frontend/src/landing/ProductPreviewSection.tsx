import React from "react";

export default function ProductPreviewSection(): JSX.Element {
  return (
    <section className="demo-section" style={{ background: "var(--surface-2)" }} aria-label="Product Preview">
      <div className="landing-container">
        {/* Section Header */}
        <div className="section-head">
          <div className="eyebrow-pill">WORKSPACE EXPERIENCE</div>
          <h2 className="section-title">A unified cockpit for active triage</h2>
          <p className="section-subtext">
            No tab gymnastics between telemetry, GitHub commits, on-call schedules, and wikis.
            Déjà brings graph memory directly into the engineer's active workflow.
          </p>
        </div>

        {/* Realistic High-Fidelity Workspace Preview */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 24px 60px -12px rgba(0, 0, 0, 0.55)",
          }}
        >
          {/* Top Bar Preview */}
          <div
            style={{
              height: 48,
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 18px",
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>Déjà</span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>incident copilot</span>
              <span
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: 9999,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                Neo4j Live Connected
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-muted)" }}>
              <span style={{ fontFamily: "var(--mono)" }}>Session #7499b8d</span>
              <span style={{ padding: "4px 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}>
                Wipe session
              </span>
            </div>
          </div>

          {/* 3-Column Cockpit Workspace Mockup */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 2fr 1.4fr",
              minHeight: 460,
              borderBottom: "1px solid var(--border)",
            }}
          >
            {/* Col 1: Chat Pane Preview */}
            <div
              style={{
                borderRight: "1px solid var(--border)",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                background: "var(--surface)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, color: "var(--text)" }}>
                  Incident chat
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div
                    style={{
                      alignSelf: "flex-end",
                      background: "var(--primary)",
                      color: "#fff",
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      maxWidth: "85%",
                    }}
                  >
                    checkout latency is spiking
                  </div>

                  <div
                    style={{
                      alignSelf: "flex-start",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.5,
                      maxWidth: "95%",
                    }}
                  >
                    Identified <strong>INC-042</strong> on checkout. Upstream path points to{" "}
                    <span style={{ color: "#38bdf8", fontWeight: 600 }}>payments-api</span> (risk #1). Deploy{" "}
                    <strong>v2.3.1</strong> occurred 2h prior.
                    <div style={{ marginTop: 6, fontSize: 11, color: "#10b981" }}>
                      Recommendation: Rollback to v2.3.0 (worked 4/4 times). Avoid restart (failed 4/4).
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Input Placeholder */}
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  background: "var(--surface-2)",
                }}
              >
                Describe an alert or ask about an incident...
              </div>
            </div>

            {/* Col 2: Graph Visualization Center Preview */}
            <div
              style={{
                position: "relative",
                background: "var(--bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                padding: 20,
              }}
            >
              {/* Central Graph Mini Mockup SVG */}
              <svg width="340" height="260" viewBox="0 0 340 260" fill="none">
                {/* Edges */}
                <line x1="170" y1="80" x2="80" y2="170" stroke="#38bdf8" strokeWidth="2.5" />
                <line x1="170" y1="80" x2="260" y2="170" stroke="#38bdf8" strokeWidth="2" />
                <line x1="170" y1="80" x2="170" y2="210" stroke="#ef4444" strokeWidth="2.5" strokeDasharray="5 4" />
                <line x1="170" y1="80" x2="270" y2="60" stroke="#22c55e" strokeWidth="2" />

                {/* Nodes */}
                {/* Center Node: payments-api */}
                <circle cx="170" cy="80" r="28" fill="#0284c7" stroke="#38bdf8" strokeWidth="3" />
                <text x="170" y="85" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                  33.0
                </text>
                <text x="170" y="122" fill="#38bdf8" fontSize="11" fontWeight="bold" textAnchor="middle">
                  payments-api
                </text>

                {/* Left Node: checkout */}
                <circle cx="80" cy="170" r="20" fill="#be123c" stroke="#f43f5e" strokeWidth="2" />
                <text x="80" y="174" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">
                  ! SEV1
                </text>
                <text x="80" y="204" fill="var(--text)" fontSize="10" textAnchor="middle">
                  checkout
                </text>

                {/* Right Node: inventory */}
                <circle cx="260" cy="170" r="18" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" />
                <text x="260" y="174" fill="#fff" fontSize="10" textAnchor="middle">
                  21.0
                </text>
                <text x="260" y="202" fill="var(--text-muted)" fontSize="10" textAnchor="middle">
                  inventory
                </text>

                {/* Deploy Node */}
                <rect x="245" y="45" width="46" height="24" rx="4" fill="#d97706" stroke="#fbbf24" strokeWidth="2" />
                <text x="268" y="61" fill="#fff" fontSize="9" fontWeight="bold" textAnchor="middle">
                  v2.3.1
                </text>

                {/* Failed fix Attempt badge */}
                <rect x="135" y="140" width="70" height="18" rx="4" fill="#090d16" stroke="#ef4444" strokeWidth="1" />
                <text x="170" y="153" fill="#f87171" fontSize="9" fontWeight="bold" textAnchor="middle">
                  ✕ RESTART
                </text>
              </svg>

              {/* Float badge */}
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  right: 12,
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  color: "var(--text-muted)",
                }}
              >
                Nodes: 16 • Edges: 24
              </div>
            </div>

            {/* Col 3: Side Panel (Risk, Incident, Stress Test) Preview */}
            <div
              style={{
                borderLeft: "1px solid var(--border)",
                padding: "16px",
                background: "var(--surface)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                fontSize: 12,
              }}
            >
              {/* Tab Pills Mockup */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  background: "var(--surface-2)",
                  padding: 3,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ flex: 1, textAlign: "center", padding: "4px 0", borderRadius: 4, color: "var(--text-muted)" }}>
                  Risk
                </span>
                <span style={{ flex: 1, textAlign: "center", padding: "4px 0", borderRadius: 4, background: "var(--primary)", color: "#fff", fontWeight: 600 }}>
                  Stress Test
                </span>
                <span style={{ flex: 1, textAlign: "center", padding: "4px 0", borderRadius: 4, color: "var(--text-muted)" }}>
                  Owners
                </span>
              </div>

              {/* Stress Test Shock Mockup */}
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: "var(--text)" }}>
                  Evidence Shock Lab
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 10 }}>
                  Simulate evidence perturbation to verify hypothesis margin.
                </div>

                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ color: "#ef4444", fontWeight: 700 }}>VERDICT: INCONCLUSIVE</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    payments-api tied with inventory (4.5 vs 4.5)
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "var(--text-muted)" }}>Critical Channel:</span>
                  <span style={{ fontFamily: "var(--mono)", color: "#38bdf8" }}>cicd-deploy-log</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
