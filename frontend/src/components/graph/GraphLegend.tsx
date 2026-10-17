import React, { useState } from "react";
import { NODE_COLORS } from "./styles";

export default function GraphLegend(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        zIndex: 20,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        border: "1px solid rgba(51, 65, 85, 0.8)",
        borderRadius: 8,
        padding: collapsed ? "6px 10px" : "10px 14px",
        fontSize: 11,
        color: "#cbd5e1",
        backdropFilter: "blur(6px)",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
        maxWidth: 280,
        transition: "all 0.2s ease-in-out",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          fontWeight: 600,
          color: "#f8fafc",
          userSelect: "none",
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>🗺️</span>
          <span>Legend</span>
        </span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>{collapsed ? "Expand ▲" : "Collapse ▼"}</span>
      </div>

      {!collapsed && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "#94a3b8", marginBottom: 4, letterSpacing: 0.5 }}>
              Nodes
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: NODE_COLORS.Service.fill, border: `1.5px solid ${NODE_COLORS.Service.stroke}` }} />
                <span>Service (score)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: NODE_COLORS.Incident.fill, border: "1.5px dashed #ef4444" }} />
                <span>Incident (! open)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: NODE_COLORS.Deploy.fill, border: `1.5px solid ${NODE_COLORS.Deploy.stroke}` }} />
                <span>Deploy</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: NODE_COLORS.Engineer.fill, border: `1.5px solid ${NODE_COLORS.Engineer.stroke}` }} />
                <span>Engineer</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, transform: "rotate(45deg)", backgroundColor: NODE_COLORS.Fix.fill, border: `1.5px solid ${NODE_COLORS.Fix.stroke}` }} />
                <span>Fix</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: NODE_COLORS.Evidence.fill, border: `1.5px solid ${NODE_COLORS.Evidence.stroke}` }} />
                <span>Evidence</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: "rgba(30,41,59,0.5)", border: "1.5px dashed #64748b" }} />
              <span style={{ color: "#94a3b8" }}>Removed Evidence (ghost)</span>
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(51, 65, 85, 0.6)", paddingTop: 6 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "#94a3b8", marginBottom: 4, letterSpacing: 0.5 }}>
              Edges
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 18, height: 2, backgroundColor: "#38bdf8" }} />
                <span>DEPENDS_ON (→)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 18, height: 2, backgroundColor: "#22c55e" }} />
                <span style={{ color: "#4ade80" }}>ATTEMPTED ✓ SUCCESS</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 18, height: 2, borderTop: "2px dashed #ef4444" }} />
                <span style={{ color: "#f87171" }}>ATTEMPTED ✕ FAILED</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 18, height: 3, backgroundColor: "#06b6d4" }} />
                <span>SUPPORTS (thickness ~ weight)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
